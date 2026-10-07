import {test} from 'node:test';
import assert from 'node:assert/strict';
import {normalizePeaks,supportedVoiceMime} from '../src/lib/voice';
import 'fake-indexeddb/auto';
import {queueMedia,queuedMedia,flushMedia} from '../src/lib/media-outbox';
test('voice waveform always has 64 finite normalized peaks and MIME selection respects device support',()=>{
 for(const values of [[],[NaN,Infinity,-1,2],Array.from({length:10001},(_,i)=>Math.sin(i))]){const p=normalizePeaks(values);assert.equal(p.length,64);assert.ok(p.every(x=>Number.isFinite(x)&&x>=0&&x<=1));}
 assert.equal(supportedVoiceMime(x=>x==='audio/mp4'),'audio/mp4');assert.equal(supportedVoiceMime(()=>false),null);
});
test('offline sends are isolated by author, deduplicated by ID and serialized across concurrent flushes',async()=>{
 const item={id:'voice-one',user:'a',couple:'pair',kind:'voice' as const,created:Date.now(),payload:{blob:new Blob(['voice'])}};
 await queueMedia(item);await queueMedia(item);let calls=0;
 await flushMedia('b','voice',async()=>{calls++;});assert.equal(calls,0);
 await Promise.all([flushMedia('a','voice',async()=>{calls++;}),flushMedia('a','voice',async()=>{calls++;})]);assert.equal(calls,1);assert.equal((await queuedMedia()).length,0);
 await queueMedia({...item,id:'retry'});await assert.rejects(flushMedia('a','voice',async()=>{throw new Error('offline');}));assert.equal((await queuedMedia()).length,1);await flushMedia('a','voice',async()=>{});assert.equal((await queuedMedia()).length,0);
});
