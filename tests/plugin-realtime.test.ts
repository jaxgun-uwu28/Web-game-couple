import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createClient} from '@supabase/supabase-js';
import {pluginRealtimeClient} from '../src/lib/plugin-realtime';
test('game callbacks do not reuse the already joined arcade channel',()=>{
 process.env.NEXT_PUBLIC_SUPABASE_URL='https://fixture.supabase.co';
 process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY='fixture-key';
 const db=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,'fixture-key',{auth:{persistSession:false}});
 const parent=db.channel('couple:fixture',{config:{private:true}});
 const adapter=(parent as unknown as {channelAdapter:{isJoined:()=>boolean}}).channelAdapter;
 adapter.isJoined=()=>true;
 assert.throws(()=>parent.on('postgres_changes',{event:'*',schema:'public',table:'arcade_matches'},()=>{}),/after `subscribe/);
 for(const game of ['ledger','lostfound','blackjack']){
  const live=pluginRealtimeClient(db);
  const channel=live.channel('couple:fixture',{config:{private:true}});
  assert.notEqual(channel,parent,game);
  assert.doesNotThrow(()=>channel.on('postgres_changes',{event:'*',schema:'public',table:'arcade_matches'},()=>{}));
  live.realtime.disconnect();
 }
 db.realtime.disconnect();
});
