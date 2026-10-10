import {test} from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {readFile} from 'node:fs/promises';
import {notificationChime,notificationChimes} from '../src/lib/notification-chimes';
test('unknown chimes fall back and bundled sounds are valid PCM WAVs',async()=>{
 assert.equal(notificationChime('../bad').id,'sweet_bell');
 for(const chime of notificationChimes){
  assert.equal(notificationChime(chime.id).id,chime.id);
  const web=await readFile(`public/audio/notifications/${chime.id}.wav`);
  const native=await readFile(`android/app/src/main/res/raw/${chime.id}.wav`);
  assert.deepEqual(web,native);assert.equal(web.toString('ascii',0,4),'RIFF');assert.equal(web.readUInt32LE(24),22050);
 }
});
test('chime preference migration reruns safely and rejects unknown sound names',async()=>{
 const db=new PGlite();try{
  await db.exec('create table notification_preferences(user_id int);insert into notification_preferences values(1)');
  const sql=await readFile('supabase/migrations/035_notification_chimes.sql','utf8');await db.exec(sql);await db.exec(sql);
  assert.equal((await db.query<{chime:string}>('select chime from notification_preferences')).rows[0].chime,'sweet_bell');
  await assert.rejects(db.exec("update notification_preferences set chime='../bad'"));
 }finally{await db.close();}
});
