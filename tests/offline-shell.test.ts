import {test} from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {runInNewContext} from 'node:vm';
test('Offline shell never intercepts private media, API, Supabase or RSC responses',async()=>{
 const handlers:Record<string,(event:unknown)=>void>={},puts:string[]=[],cache={put:async(r:{url:string}|string)=>{puts.push(typeof r==='string'?r:r.url);},match:async()=>null,addAll:async()=>{}};
 runInNewContext(await readFile('public/sw.js','utf8'),{self:{location:{origin:'https://arcade.example'},addEventListener:(k:string,f:(event:unknown)=>void)=>{handlers[k]=f;},clients:{claim:async()=>{}},skipWaiting:async()=>{}},caches:{open:async()=>cache,match:async()=>null,keys:async()=>[],delete:async()=>true},URL,Response,fetch:async()=>new Response('<html>Public shell</html>',{status:200})});
 for(const url of ['https://arcade.example/api/game','https://arcade.example/api/push','https://arcade.example/?_rsc=secret','https://ohjeloskpjsynhbddgch.supabase.co/storage/v1/object/sign/keepsakes/private.jpg?token=secret','https://arcade.example/_next/image?url=private']){let intercepted=false;handlers.fetch({request:{url,method:'GET',mode:'cors',destination:'image',headers:new Headers({'RSC':'1'})},respondWith:()=>{intercepted=true;},waitUntil:()=>{}});assert.equal(intercepted,false,url);}
 assert.deepEqual(puts,[]);
});
