import test from "node:test";
import assert from "node:assert/strict";
import {groupMemories,memoryDay} from "../src/lib/memory-album";
import type {Memory} from "../src/lib/keepsakes";
test("album groups both authors by Manila day rather than stacking posts",()=>{
 const memory=(id:string,author:string,date:string):Memory=>({id,author,created_at:date,caption:"",image_path:null,swap_day:null});
 const grouped=groupMemories([memory("a","Elaine","2026-10-05T16:00:00Z"),memory("b","Lance","2026-10-06T06:00:00Z"),memory("c","Lance","2026-10-05T15:59:00Z")]);
 assert.equal(memoryDay("2026-10-05T16:00:00Z"),"2026-10-06");assert.deepEqual(grouped.map(g=>[g.day,g.photos.map(p=>p.id)]),[["2026-10-06",["a","b"]],["2026-10-05",["c"]]]);
});
