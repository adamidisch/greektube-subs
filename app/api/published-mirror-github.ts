import type { Mirror } from "./published-store.ts";

/**
 * Private GitHub repository used as the second copy of every publication (GREEKTUBE_DATA_REPO,
 * default adamidisch/greektube-data). The token (GREEKTUBE_DATA_TOKEN) is a fine-grained token with
 * Contents read/write on that repository only.
 */
export function githubMirror(options: { token?: string; repo?: string; fetcher?: typeof fetch } = {}): Mirror | null {
  const token = options.token ?? process.env.GREEKTUBE_DATA_TOKEN;
  const repo = options.repo ?? process.env.GREEKTUBE_DATA_REPO ?? "adamidisch/greektube-data";
  if (!token || !/^[\w.-]+\/[\w.-]+$/u.test(repo)) return null;
  const fetcher = options.fetcher ?? fetch;
  const url = (path: string) => `https://api.github.com/repos/${repo}/contents/${path.split("/").map(encodeURIComponent).join("/")}`;
  const headers = (accept: string) => ({ Authorization: `Bearer ${token}`, Accept: accept, "X-GitHub-Api-Version": "2022-11-28", "User-Agent": "greektube-subs" });

  async function request(path: string, init: RequestInit & { accept: string }) {
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 15_000);
    try { return await fetcher(url(path), { ...init, headers: { ...headers(init.accept), ...(init.body ? { "Content-Type": "application/json" } : {}) }, signal: controller.signal, cache: "no-store" }); }
    finally { clearTimeout(timer); }
  }

  async function sha(path: string) {
    const response = await request(path, { method: "GET", accept: "application/vnd.github+json" });
    if (response.status === 404) return null;
    if (!response.ok) throw Error(`GitHub ${response.status}`);
    return String((await response.json() as { sha?: unknown }).sha || "") || null;
  }

  return {
    async get(path) {
      const response = await request(path, { method: "GET", accept: "application/vnd.github.raw" });
      if (response.status === 404) return null;
      if (!response.ok) throw Error(`GitHub ${response.status}`);
      return await response.text();
    },
    async put(path, text, message) {
      const existing = await sha(path);
      const response = await request(path, { method: "PUT", accept: "application/vnd.github+json",
        body: JSON.stringify({ message, content: Buffer.from(text, "utf8").toString("base64"), ...(existing ? { sha: existing } : {}) }) });
      if (!response.ok) throw Error(`GitHub ${response.status}`);
    },
  };
}
