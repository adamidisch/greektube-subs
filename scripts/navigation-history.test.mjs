import assert from "node:assert/strict";
import {
  parseAppRoute,
  readNavigationMarker,
  routeWithoutView,
  shouldBackOnVideoClose,
  shouldPromoteVideoReplaceToPush,
  withNavigationMarker,
} from "../app/navigation-history.ts";

const home = parseAppRoute("https://greektubesubs.com/");
const videoA = parseAppRoute("https://greektubesubs.com/?video=KkBy__7d9Fs");
const videoB = parseAppRoute("https://greektubesubs.com/?video=D2RjneeG_xA&t=42");
const settingsA = parseAppRoute("https://greektubesubs.com/?video=KkBy__7d9Fs&view=settings");
const editorA = parseAppRoute("https://greektubesubs.com/?video=KkBy__7d9Fs&view=editor");

assert.deepEqual(home, { kind: "home", videoId: "" });
assert.deepEqual(videoA, { kind: "video", videoId: "KkBy__7d9Fs" });
assert.deepEqual(settingsA, { kind: "settings", videoId: "KkBy__7d9Fs" });
assert.deepEqual(editorA, { kind: "editor", videoId: "KkBy__7d9Fs" });

assert.equal(shouldPromoteVideoReplaceToPush(home, videoA), true, "Home → video must push");
assert.equal(shouldPromoteVideoReplaceToPush(videoA, videoB), true, "Video A → B must push");
assert.equal(shouldPromoteVideoReplaceToPush(videoA, parseAppRoute("/?video=KkBy__7d9Fs&t=90")), false, "Same video time changes must replace");
assert.equal(shouldPromoteVideoReplaceToPush(settingsA, videoA), false, "Overlay cleanup must not create a video entry");

const marker = readNavigationMarker(withNavigationMarker(null, {
  kind: "video",
  videoId: "KkBy__7d9Fs",
  inApp: true,
  direct: false,
}));
assert.ok(marker);
assert.equal(shouldBackOnVideoClose(videoA, home, marker), true, "In-app video close must return through history");
assert.equal(shouldBackOnVideoClose(videoA, home, { ...marker, direct: true }), false, "Direct video close must not leave the site");

assert.equal(routeWithoutView("https://greektubesubs.com/?video=KkBy__7d9Fs&view=editor&t=18").toString(), "https://greektubesubs.com/?video=KkBy__7d9Fs&t=18");
assert.equal(parseAppRoute("/?video=bad").kind, "home", "Invalid video IDs must not become video routes");

console.log("navigation-history tests passed");
