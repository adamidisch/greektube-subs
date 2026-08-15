import fs from "node:fs";
import path from "node:path";
import postcss from "postcss";

const rootDir = process.cwd();
const appDir = path.join(rootDir, "app");
const canonicalCss = path.join(appDir, "brand.css");

function walk(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

const cssFiles = walk(appDir).filter(
  file => file.endsWith(".css") && path.resolve(file) !== path.resolve(canonicalCss),
);

let changedCssFiles = 0;
let removedSelectors = 0;

for (const file of cssFiles) {
  const source = fs.readFileSync(file, "utf8");
  if (!source.includes(".brand-mark")) continue;

  const tree = postcss.parse(source, { from: file });
  let changed = false;

  tree.walkRules(rule => {
    if (!rule.selector?.includes(".brand-mark")) return;

    const keep = rule.selectors.filter(selector => !selector.includes(".brand-mark"));
    removedSelectors += rule.selectors.length - keep.length;
    changed = true;

    if (keep.length === 0) rule.remove();
    else rule.selectors = keep;
  });

  if (changed) {
    fs.writeFileSync(file, tree.toString(), "utf8");
    changedCssFiles += 1;
  }
}

// Remove the historical inline <i> + literal play glyph construction from source.
const componentPath = path.join(appDir, "GreekTubePlayer.tsx");
let component = fs.readFileSync(componentPath, "utf8");
const oldMarkup = /<span className="brand-mark">\s*<i aria-hidden="true"\s*\/>\s*▶\s*<\/span>/g;
const matches = component.match(oldMarkup)?.length ?? 0;
component = component.replace(oldMarkup, '<span className="brand-mark" aria-hidden="true" />');
if (matches > 0) fs.writeFileSync(componentPath, component, "utf8");

// Safety gate: outside canonical brand.css there must be no legacy brand-mark CSS selectors.
const remainingCss = [];
for (const file of cssFiles) {
  const source = fs.readFileSync(file, "utf8");
  if (source.includes(".brand-mark")) remainingCss.push(path.relative(rootDir, file));
}
if (remainingCss.length) {
  throw new Error(`Legacy .brand-mark CSS remains in: ${remainingCss.join(", ")}`);
}

// Safety gate: the old literal logo construction must be gone from TSX.
if (fs.readFileSync(componentPath, "utf8").includes('<i aria-hidden="true"/>▶')) {
  throw new Error("Legacy inline brand glyph still exists in GreekTubePlayer.tsx");
}

console.log(`Brand cleanup complete: ${removedSelectors} legacy selectors removed across ${changedCssFiles} CSS files.`);
console.log(`Legacy TSX logo instances replaced: ${matches}.`);
