// Bridge between the GreekTube admin page and the extension. Only same-window messages from GreekTube pages.
(() => {
  const VERSION = chrome.runtime.getManifest().version;
  const announce = () => window.postMessage({ source: "greektube-capture", type: "ready", version: VERSION }, window.location.origin);
  window.addEventListener("message", event => {
    if (event.source !== window || event.origin !== window.location.origin) return;
    const data = event.data;
    if (!data || data.source !== "greektube") return;
    if (data.type === "ping") { announce(); return; }
    if (data.type !== "capture-request" || typeof data.videoId !== "string" || !/^[A-Za-z0-9_-]{11}$/.test(data.videoId)) return;
    chrome.runtime.sendMessage({ type: "capture", videoId: data.videoId }, response => {
      const failure = chrome.runtime.lastError ? chrome.runtime.lastError.message : null;
      window.postMessage({ source: "greektube-capture", type: "capture-result", requestId: data.requestId, videoId: data.videoId,
        ...(failure ? { error: failure } : response || { error: "Η επέκταση δεν απάντησε." }) }, window.location.origin);
    });
  });
  announce();
})();
