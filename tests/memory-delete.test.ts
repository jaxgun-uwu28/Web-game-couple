import {test} from 'node:test';
import assert from 'node:assert/strict';
import {POST} from '../src/app/api/memory/delete/route';
test('photo deletion rejects logged-out requests before mutation',async()=>{
 const response=await POST(new Request('https://example.com/api/memory/delete',{method:'POST',body:JSON.stringify({id:'00000000-0000-4000-8000-000000000001'})}));
 assert.equal(response.status,401);
});
