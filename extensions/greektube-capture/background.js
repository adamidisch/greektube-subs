// Opens the YouTube video in a background tab, reads the automatic English captions with per-word timings
// through the player's own request, closes the tab and returns a compact capture. No audio, no download.
const WAIT_MS = 45_000;

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type !== "capture" || !/^[A-Za-z0-9_-]{11}$/.test(message.videoId || "")) return false;
  if (!sender.url || !/^https:\/\/(www\.)?greektubesubs\.com\//.test(sender.url)) return false;
  captureWithRetry(message.videoId).then(sendResponse, error => sendResponse({ error: String(error?.message || error) }));
  return true;
});

async function captureWithRetry(videoId) {
  const first = await captureOnce(videoId, false);
  if (first.capture) return first;
  // Some machines do not start a hidden tab's player: retry once in a visible tab.
  const second = await captureOnce(videoId, true);
  return second.capture ? second : { error: second.error || first.error };
}

async function captureOnce(videoId, active) {
  const tab = await chrome.tabs.create({ url: `https://www.youtube.com/watch?v=${videoId}`, active });
  try {
    await waitForComplete(tab.id);
    const [result] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, world: "MAIN", func: capturePage, args: [videoId] });
    return result?.result || { error: "Η λήψη δεν ολοκληρώθηκε." };
  } catch (error) {
    return { error: String(error?.message || error) };
  } finally {
    chrome.tabs.remove(tab.id).catch(() => {});
  }
}

function waitForComplete(tabId) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { chrome.tabs.onUpdated.removeListener(listener); reject(new Error("Το YouTube δεν φόρτωσε.")); }, WAIT_MS);
    const listener = (id, info) => {
      if (id !== tabId || info.status !== "complete") return;
      clearTimeout(timer); chrome.tabs.onUpdated.removeListener(listener); resolve();
    };
    chrome.tabs.onUpdated.addListener(listener);
  });
}

// Runs inside the YouTube page (main world). Must be self-contained.
async function capturePage(videoId) {
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  let player = null;
  for (let i = 0; i < 80; i++) {
    player = document.getElementById("movie_player");
    if (player?.getPlayerResponse?.()?.videoDetails?.videoId === videoId) break;
    player = null; await sleep(250);
  }
  if (!player) return { error: "Ο player του YouTube δεν φόρτωσε." };
  const response = player.getPlayerResponse();
  const tracks = response?.captions?.playerCaptionsTracklistRenderer?.captionTracks || [];
  const asr = tracks.find(track => track.kind === "asr" && /^en/i.test(track.languageCode || ""));
  if (!asr) return { error: "Το βίντεο δεν έχει αυτόματους αγγλικούς υπότιτλους στο YouTube." };
  // The page's resource-timing buffer is usually full by now: observe new requests instead of reading the buffer.
  const seen = [];
  try { performance.setResourceTimingBufferSize(10000); } catch { /* optional */ }
  const observer = new PerformanceObserver(list => { for (const entry of list.getEntries()) if (entry.name.includes("/api/timedtext")) seen.push(entry.name); });
  observer.observe({ type: "resource", buffered: true });
  try { player.mute(); player.playVideo(); player.loadModule("captions"); } catch { /* the player API varies */ }
  for (let attempt = 0; attempt < 3 && !seen.length; attempt++) {
    const list = (() => { try { return player.getOption("captions", "tracklist") || []; } catch { return []; } })();
    const choice = list.find(track => track.kind === "asr" && /^en/i.test(track.languageCode || ""))
      || list.find(track => /^en/i.test(track.languageCode || "")) || list[0] || { languageCode: asr.languageCode, kind: "asr" };
    try { player.setOption("captions", "track", {}); } catch { /* ignore */ }
    await sleep(300);
    try { player.setOption("captions", "track", choice); } catch { /* retry */ }
    for (let i = 0; i < 24 && !seen.length; i++) await sleep(250);
  }
  observer.disconnect();
  if (!seen.length) return { error: "Το YouTube δεν έστειλε υπότιτλους." };
  const url = new URL(seen.at(-1));
  url.searchParams.set("lang", asr.languageCode); url.searchParams.set("kind", "asr"); url.searchParams.set("fmt", "json3");
  url.searchParams.delete("name"); url.searchParams.delete("tlang");
  let json = null;
  try { const text = await (await fetch(url.toString(), { credentials: "include" })).text(); json = text ? JSON.parse(text) : { events: [] }; }
  catch { return { error: "Οι υπότιτλοι του YouTube δεν διαβάστηκαν." }; }
  try { player.pauseVideo(); } catch { /* ignore */ }
  const events = (json?.events || []).filter(event => Array.isArray(event.segs) && event.segs.length)
    .map(event => [event.tStartMs || 0, event.dDurationMs || 0, event.segs.filter(seg => String(seg.utf8 || "").trim())
      .map(seg => [seg.tOffsetMs || 0, String(seg.utf8), typeof seg.acAsrConf === "number" ? seg.acAsrConf : null])])
    .filter(event => event[2].length);
  if (!events.length) return { error: "Το YouTube δεν έδωσε αυτόματους αγγλικούς υπότιτλους για αυτό το βίντεο." };
  const details = response.videoDetails || {};
  return { capture: { schema: "youtube-asr-words-v1", videoId, lang: asr.languageCode, kind: "asr", capturedAt: new Date().toISOString(),
    title: details.title || "", channel: details.author || "", durationSeconds: Number(details.lengthSeconds) || 0, events } };
}
