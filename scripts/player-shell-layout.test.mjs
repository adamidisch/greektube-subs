import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read=(path)=>readFileSync(new URL("../"+path,import.meta.url),"utf8");
const jsx=read("app/GreekTubePlayer.tsx");
const css=read("app/player-design-v7-30-0.css");
const layout=read("app/layout.tsx");
const pkg=JSON.parse(read("package.json"));

assert.match(jsx,/className="gtp-controls"/,"current controls wrapper must exist");
for(const name of ["gtp-play","gtp-skip","gtp-speed","gtp-moment","gtp-pin","gtp-volume-toggle","gtp-transcript","gtp-fullscreen","gtp-cc"]){assert.match(jsx,new RegExp(name),"target "+name+" must be in player markup");}
assert.match(css,/\.gtp-play\{[^}]*width:52px/,"desktop play button 52px");
assert.match(css,/@media \(max-width:720px\)/,"phone layout must exist");
assert.match(css,/grid-template-columns:repeat\(4,minmax\(0,1fr\)\)/,"phone tools are a 4-tile grid");
assert.match(layout,/import "\.\/player-design-v7-30-0\.css";/,"new player design stylesheet must be imported");
assert.doesNotMatch(layout,/import "\.\/player-controls-compact-v7-12-1\.css";/,"obsolete mismatched rules must not load");
assert.match(jsx,/<h1 className="player-greek-title">\{appTitle\(selected\)\}<\/h1>/,"preserve main video title");
assert.doesNotMatch(jsx,/className="paused-video-title"/,"do not show duplicate title over video");
const [major,minor,patch]=pkg.version.split(".").map(Number);
assert.ok(major>7||(major===7&&(minor>12||(minor===12&&patch>=2))),"keep v7.12.2 player control fix in newer releases");
console.log("player gts31 compact controls, correct selectors and single title checks passed");
