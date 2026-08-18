import { readdir, readFile, stat } from "node:fs/promises";
import { extname, resolve } from "node:path";

const textExtensions = new Set([
  ".css", ".html", ".js", ".json", ".jsx", ".md", ".mjs", ".svg",
  ".ts", ".tsx", ".txt", ".xml", ".yaml", ".yml",
]);
const greekWord = /[\u0370-\u03ff\u1f00-\u1fff]+/gu;
const greekAccents = /[\u0300\u0301\u0340\u0341\u0342]/gu;

function stripAccentsKeepDiaeresis(value) {
  return value.normalize("NFD").replace(greekAccents, "").normalize("NFC");
}

function isUppercaseGreek(value) {
  return value !== value.toLocaleLowerCase("el-GR")
    && value === value.toLocaleUpperCase("el-GR");
}

async function* walk(target) {
  const info = await stat(target).catch(() => null);
  if (!info) return;
  if (info.isFile()) {
    if (textExtensions.has(extname(target).toLowerCase())) yield target;
    return;
  }
  for (const entry of await readdir(target, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === ".next" || entry.name === ".git") continue;
    yield* walk(resolve(target, entry.name));
  }
}

const findings = [];
for (const input of process.argv.slice(2)) {
  for await (const file of walk(resolve(input))) {
    const text = await readFile(file, "utf8");
    for (const match of text.matchAll(greekWord)) {
      const original = match[0];
      if (!isUppercaseGreek(original)) continue;
      const fixed = stripAccentsKeepDiaeresis(original);
      if (fixed !== original) findings.push(`${file}: ${original} -> ${fixed}`);
    }
  }
}

if (findings.length) {
  console.error(findings.join("\n"));
  console.error(`Βρέθηκαν ${findings.length} κεφαλαίες ελληνικές λέξεις με τόνο.`);
  process.exit(1);
}

console.log("Greek uppercase check passed.");
