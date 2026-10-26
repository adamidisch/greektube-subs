import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read=(path)=>readFileSync(new URL("../"+path,import.meta.url),"utf8");
const jsx=read("app/GreekTubePlayer.tsx");
const css=read("app/player-controls-gts31-v7-12-2.css");
const layout=read("app/layout.tsx");
const pkg=JSON.parse(read("package.json"));

assert.match(jsx,/className="gts31-controls"/,"current controls wrapper must exist");
for(const name of ["gts31-play","gts31-skip","gts31-speed","gts31-segment","gts31-volume-toggle"]){
  assert.match(jsx,new RegExp("gts31-"+name.replace(/^gts31-/,"")),"target "+name+" must be in player markup");
  assert.ok(css.includes("."+name),"override must target rendered "+name);
}
assert.match(css,/\.gts31-play\s*\{[^}]*width:43px!important/s,"play button: 54 -> 43px");
assert.match(css,/\.gts31-skip\s*\{[^}]*width:35px!important/s,"skip button: 44 -> 35px");
assert.match(css,/\.gts31-segment\s*\{[^}]*min-height:45px!important/s,"action buttons: 56 -> 45px");
assert.match(css,/\.gts31-controls-row-1\s*\{[^}]*height:69px!important/s,"transport row: 86 -> 69px");
assert.match(layout,/import "\.\/player-controls-gts31-v7-12-2\.css";/,"correct stylesheet must be imported");
assert.doesNotMatch(layout,/import "\.\/player-controls-compact-v7-12-1\.css";/,"obsolete mismatched rules must not load");
assert.match(jsx,/<h1 className="player-greek-title">\{appTitle\(selected\)\}<\/h1>/,"preserve main video title");
assert.doesNotMatch(jsx,/className="paused-video-title"/,"do not show duplicate title over video");
assert.ok(pkg.version.split(".").slice(0,2).join(".")==="7.12" && Number(pkg.version.split(".")[2])>=2,"keep v7.12.2 player control fix in newer releases");
console.log("player gts31 compact controls, correct selectors and single title checks passed");
