// Preview build required. All API/provider traffic is intercepted with isolated fixtures.
// PLAYWRIGHT_MODULE and CHROMIUM_PATH can point to an existing test runtime.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { legacySubtitleTrack, validateAuthoredEvents } from "../app/subtitle-track.ts";
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
const root = fileURLToPath(new URL("..", import.meta.url));
const fixture = JSON.parse(fs.readFileSync(new URL("./fixtures/sarah-word-review.json", import.meta.url), "utf8"));
const { source, translation, review } = fixture;
const origin = "http://127.0.0.1:3018";
const screenshotDir = process.env.UI_SCREENSHOT_DIR;
if (screenshotDir) fs.mkdirSync(screenshotDir, { recursive: true });
let log = "";
const server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", "3018"], {
  cwd: root, env: { ...process.env, VERCEL_ENV: "preview" }, stdio: ["ignore", "pipe", "pipe"],
});
let browser;
try {
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(Error(`Preview did not start: ${log.slice(-600)}`)), 15_000);
    const read = data => { log += data; if (log.includes("Ready")) { clearTimeout(timer); resolve(); } };
    server.stdout.on("data", read); server.stderr.on("data", read);
    server.once("exit", code => { clearTimeout(timer); reject(Error(`Preview exited ${code}: ${log.slice(-600)}`)); });
  });
  const results = [];
  for (const [width, language, theme, mode] of [[390, "el", "dark", "pause"], [768, "en", "light", "complete"], [1280, "el", "dark", "blocked"], [390, "en", "dark", "rate"], [390,"el","dark","prepare"], [768,"en","light","prepare"], [1280,"el","dark","prepare"]]) {
    if (process.env.UI_WIDTHS && !process.env.UI_WIDTHS.split(",").includes(String(width))) continue;
    browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, headless: true,
      args: ["--no-sandbox", "--disable-gpu", "--disable-software-rasterizer", "--use-gl=disabled", "--single-process", "--no-zygote"] });
    const blockedMode = mode === "blocked", rateMode = mode === "rate";
    const context = await browser.newContext({ viewport: { width, height: 1000 } });
    await context.addInitScript(lang => { try { localStorage.setItem("greektube-app-language:v1", lang); } catch { /* Initial opaque page has no storage. */ } }, language);
    const page = await context.newPage(), errors = [];
    page.on("pageerror", error => errors.push(error.message));
    let advances = 0, plans = 0, prepared = 0, assembled = false, release;
    const gate = new Promise(resolve => { release = resolve; });
    const key = "1".repeat(64), range = blockedMode ? [0, 0] : [0, 3];
    const track = validateAuthoredEvents(review.events, translation, { source, evidence: review.audioEvidence });
    const report = () => ({ videoId: review.videoId, sourceHash: review.sourceHash, translationHash: review.translationHash,
      source, translation, track: assembled ? track : legacySubtitleTrack(translation) });
    await page.route("**/*", async route => {
      const request = route.request(), url = new URL(request.url());
      if (url.origin !== origin) return route.abort();
      if (url.pathname === "/api/subtitle-review") return route.fulfill({ json: report() });
      if (url.pathname === "/api/subtitle-authoring") {
        const body = request.postDataJSON();
        assert.equal(body.sourceHash, review.sourceHash); if(body.action==="prepare"){assert.equal(body.audioEvidence,undefined);prepared++;return route.fulfill({json:{status:prepared===1?"analysis_progress":"analysis_ready",stage:prepared===1?"sections":"complete",completed:1,total:prepared===1?2:1,providerCalls:1}});} if(body.action==="plan")assert.deepEqual(body.audioEvidence.words,review.audioEvidence.words);else{assert.equal(body.evidenceKey,"e".repeat(64));assert.equal(body.audioEvidence,undefined);}
        if (body.action === "plan") { plans++; if(mode==="prepare"&&prepared<2)return route.fulfill({status:409,json:{code:"understanding_required",error:"analysis needed"}}); return route.fulfill({ json: { status: "planned", sourceHash: review.sourceHash,
          translationHash: review.translationHash, evidenceKey:"e".repeat(64), scopes: [{ range, status: "ready", key }, ...(blockedMode ? [{ range: [1, 3], status: "alignment_review_required" }] : [])] } }); }
        if (body.action === "advance") {
          assert.equal(body.key,key); advances++; if (mode === "pause" && advances === 1) await gate;
          if (rateMode && advances === 2) return route.fulfill({status:429,headers:{"Retry-After":"90"},json:{error:"test rate limit"}});
          return route.fulfill({ json: { status: advances % 2 ? "translation_ready" : "draft_ready", key, sourceCueRange: range } });
        }
        if (body.action === "assemble") { assert.equal(advances, 2); assert.equal(blockedMode, false); assembled = true; return route.fulfill({ json: { status: "draft_ready" } }); }
        throw Error(`Unexpected authoring action: ${body.action}`);
      }
      if (url.pathname.startsWith("/api/")) return route.fulfill({ json: {} });
      return route.continue();
    });
    await page.goto(`${origin}/qa?page=review-panel`);
    await page.evaluate(value => document.documentElement.setAttribute("data-theme", value), theme);
    let panel = page.locator(".subtitle-word-authoring"); await panel.waitFor();
    await panel.locator(":scope > summary").click();
    const choose = page.waitForEvent("filechooser");
    await panel.getByRole("button", { name: /Εισαγωγή χρονισμού|Import timing/ }).click();
    await (await choose).setFiles({ name: "actual-opening-isolated-timing.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(review)) });
    if(mode==="prepare"){
      await panel.getByRole("alert").waitFor();assert.equal(prepared,0);assert.equal(advances,0);
      const prepare=panel.getByRole("button",{name:/Προετοιμασία ανάλυσης|Prepare analysis/});await prepare.click();
      await panel.getByText(/Ανάλυση τμημάτων: 1\/2|Section analysis: 1\/2/).waitFor();
      assert.equal(prepared,1);assert.equal(advances,0);
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
      const heights=await panel.getByRole("button").evaluateAll(nodes=>nodes.filter(n=>n.getClientRects().length).map(n=>n.getBoundingClientRect().height));assert.ok(heights.every(h=>h>=44));
      if(screenshotDir)await panel.screenshot({path:path.join(screenshotDir,`analysis-${width}-${theme}.png`)});
      await panel.getByRole("button",{name:/Συνέχεια ανάλυσης|Continue analysis/}).click();
      await panel.getByText(/Ο χρονισμός φορτώθηκε|Timing loaded/).waitFor();
      assert.equal(prepared,2);assert.equal(plans,2);assert.equal(advances,0,"completed analysis replans retained timing without translating");assert.deepEqual(errors,[]);
      results.push({width,language,theme,analysisStages:prepared,retainedFileReplanned:true,runtimeErrors:errors.length});console.log(JSON.stringify(results.at(-1)));await context.close();await browser.close();browser=undefined;continue;
    }
    await panel.getByText(/Ο χρονισμός φορτώθηκε|Timing loaded/).waitFor();
    assert.equal(plans, 1); assert.equal(advances, 0, "import makes no paid translation call");
    assert.equal(await panel.getByRole("button", { name: /Σύνθεση προσχεδίου|Assemble draft/ }).isDisabled(), true);
    await panel.getByRole("button", { name: /Επεξεργασία τμημάτων|Process sections/ }).click();
    if (rateMode) {
      await panel.getByRole("alert").waitFor();
      assert.equal(advances,2); assert.match(await panel.getByRole("alert").innerText(),/provider limit/);
      assert.equal(await panel.getByRole("button",{name:"Process sections"}).isDisabled(),true);
      await page.evaluate(()=>{localStorage.setItem("greektube-app-language:v1","el");window.dispatchEvent(new StorageEvent("storage",{key:"greektube-app-language:v1"}));});
      await panel.getByText(/Η επεξεργασία σταμάτησε στο όριο του παρόχου/).waitFor();
      if(screenshotDir)await panel.screenshot({path:path.join(screenshotDir,"authoring-390-rate.png")});
      await page.reload();panel=page.locator(".subtitle-word-authoring");await panel.locator(":scope > summary").click();
      await panel.getByText(/Saved progress is available/).waitFor();
      assert.equal(await panel.getByRole("button",{name:"Process sections"}).isDisabled(),true);
      assert.equal(advances,2);assert.deepEqual(errors,[]);
      results.push({width,mode,rateStopped:true,reloadKeepsCooldown:true,runtimeErrors:errors.length});
      console.log(JSON.stringify(results.at(-1)));await context.close();await browser.close();browser=undefined;continue;
    }
    if (mode === "pause") {
      await panel.getByRole("button", { name: "Παύση", exact: true }).click(); release();
      await panel.getByText("Η επεξεργασία τέθηκε σε παύση. Η πρόοδος αποθηκεύτηκε.", { exact: true }).waitFor();
      assert.equal(advances, 1);
      await page.reload(); panel = page.locator(".subtitle-word-authoring");
      await panel.locator(":scope > summary").click();
      await panel.getByText(/Η αποθηκευμένη πρόοδος είναι διαθέσιμη/).waitFor();
      assert.equal(advances, 1, "reload does not automatically resume model requests");
      const storage = await page.evaluate(() => new Promise(resolve => {
        const open = indexedDB.open("greektube-subtitle-authoring", 2);
        open.onsuccess = () => { const db = open.result, tx = db.transaction(["jobs", "timings"]), r = tx.objectStore("jobs").getAll(), keys = tx.objectStore("timings").getAllKeys();
          tx.oncomplete = () => { resolve({ jobs: r.result.length, evidenceInline: Boolean(r.result[0]?.audioEvidence), timingRows: keys.result.length, serverReference:r.result[0]?.evidenceKey }); db.close(); }; };
      }));
      assert.deepEqual(storage, { jobs: 1, evidenceInline: false, timingRows: 1, serverReference:"e".repeat(64) });
      await panel.getByRole("button", { name: "Επεξεργασία τμημάτων" }).click();
    }
    await page.waitForFunction(() => document.querySelector(".subtitle-authoring-stats dd")?.textContent === "1/1");
    assert.equal(advances, 2);
    const select = panel.locator("select"); await select.focus();
    assert.ok(await select.evaluate(node => parseFloat(getComputedStyle(node).fontSize)) >= 16);
    await select.blur();
    assert.equal(await page.evaluate(()=>visualViewport.scale),1);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    const heights = await panel.getByRole("button").evaluateAll(nodes => nodes.filter(n => n.getClientRects().length).map(n => n.getBoundingClientRect().height));
    assert.ok(heights.every(h => h >= 44));
    if (screenshotDir) await panel.screenshot({ path: path.join(screenshotDir, `authoring-${width}-${theme}.png`) });
    if (blockedMode) {
      assert.equal(await panel.getByRole("button", { name: "Σύνθεση προσχεδίου" }).isDisabled(), true);
      await panel.getByText(/Τμήματα που χρειάζονται διόρθωση/).click();
      await panel.getByText("Τμήμα 2", { exact: true }).waitFor();
    } else {
      const stale=structuredClone(review);stale.audioEvidence.sourceHash="0".repeat(64);
      await panel.locator("input[type=file]").setInputFiles({name:"stale.json",mimeType:"application/json",buffer:Buffer.from(JSON.stringify(stale))});
      await panel.getByRole("alert").waitFor();
      assert.match(await panel.getByRole("alert").innerText(),/διαφορετική πηγή|different source/);assert.equal(plans,1);assert.equal(advances,2);
      await panel.getByRole("button", { name: /Σύνθεση προσχεδίου|Assemble draft/ }).click();
      await panel.waitFor({ state: "detached" });
      await page.getByRole("button", { name: /Επιμέλεια με τον ήχο|Review against audio/ }).click();
      await page.locator(".subtitle-event-editor").waitFor();
      assert.equal(await page.getByRole("button", { name: /Έγκριση timeline|Approve timeline/ }).isDisabled(), true, "model-reviewed draft still requires human audio review");
    }
    assert.deepEqual(errors, []);
    results.push({ width, language, theme, plans, advances, blockedAssembly: blockedMode, overflow: false, runtimeErrors: errors.length });
    console.log(JSON.stringify(results.at(-1)));
    await context.close(); await browser.close(); browser = undefined;
  }
  console.log(JSON.stringify(results));
} finally { if (browser) await browser.close(); server.kill("SIGTERM"); }
