// Run after npm run build. Exercises the compiled route's gates without a server or real credentials.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { adminSessionToken } from "../lib/admin-auth.ts";

const require = createRequire(import.meta.url);
const originalPassword = process.env.ADMIN_EDIT_PASSWORD, originalEnvironment = process.env.VERCEL_ENV;
const originalFetch = globalThis.fetch;
let networkRequests = 0;
globalThis.fetch = async () => { networkRequests++; throw Error("No network request is permitted in gate tests"); };
const { POST } = require("../.next/server/app/api/subtitle-authoring/route.js").routeModule.userland;
try {
  process.env.ADMIN_EDIT_PASSWORD = "isolated-route-test-password";
  delete process.env.VERCEL_ENV;
  const cookie = `greektube-admin=${await adminSessionToken(process.env.ADMIN_EDIT_PASSWORD)}`;
  const request = (body = "{}", headers = {}) => new Request("https://example.test/api/subtitle-authoring", {
    method: "POST", headers: { "Content-Type": "application/json", ...headers }, body,
  });
  assert.equal((await POST(request())).status, 401);
  assert.equal((await POST(request("{}", { origin: "https://other.example" }))).status, 403);
  process.env.VERCEL_ENV = "preview";
  assert.equal((await POST(request("{}", { cookie }))).status, 409);
  delete process.env.VERCEL_ENV;
  assert.equal((await POST(request(" ".repeat(4_000_001), { cookie }))).status, 413);
  assert.equal((await POST(request('{"action":"unknown","videoId":"xYB6uYyRjCA"}', { cookie }))).status, 400);
  assert.equal((await POST(request("null", { cookie }))).status, 400);
  assert.equal((await POST(request('{"action":"advance","videoId":"xYB6uYyRjCA"}', { cookie }))).status, 400);
  const invalidRange={action:"advance",videoId:"xYB6uYyRjCA",sourceHash:"0".repeat(64),translationHash:"0".repeat(64),audioEvidence:{},sourceCueRange:[2,1]};
  assert.equal((await POST(request(JSON.stringify(invalidRange), { cookie }))).status, 400);
  assert.equal(networkRequests, 0, "unauthorized, preview, oversized and malformed actions never call a provider or database");
  console.log("compiled subtitle authoring route: admin, origin, preview, payload and invalid-action gates passed without network access");
} finally {
  if (originalPassword === undefined) delete process.env.ADMIN_EDIT_PASSWORD; else process.env.ADMIN_EDIT_PASSWORD = originalPassword;
  if (originalEnvironment === undefined) delete process.env.VERCEL_ENV; else process.env.VERCEL_ENV = originalEnvironment;
  globalThis.fetch = originalFetch;
}
