import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const css=readFileSync("src/app/block-battle.css","utf8");
function luminance(hex:string){const channels=hex.slice(1).match(/../g)!.map(c=>parseInt(c,16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);return channels[0]*.2126+channels[1]*.7152+channels[2]*.0722}
function ratio(a:string,b:string){const x=luminance(a),y=luminance(b);return(Math.max(x,y)+.05)/(Math.min(x,y)+.05)}
test("all six Heartblast tile tokens contrast at least 4.5:1 with both empty wells in each theme",()=>{
 const definitions=[...css.matchAll(/--hb-board-bg:[\s\S]*?--hb-emblem:/g)];assert.equal(definitions.length,2);
 for(const [theme,match] of definitions.entries()){
  const tokens=Object.fromEntries([...match[0].matchAll(/(--hb-[\w-]+):\s*(#[0-9a-f]{6})/gi)].map(m=>[m[1],m[2]]));
  for(let i=1;i<=6;i++)for(const empty of ["--hb-cell-empty","--hb-cell-empty-alt"]){const value=ratio(tokens[`--hb-block-${i}`],tokens[empty]);assert.ok(value>=4.5,`Theme ${theme}, block ${i}, ${empty}: ${value.toFixed(2)}:1`)}
 }
});
