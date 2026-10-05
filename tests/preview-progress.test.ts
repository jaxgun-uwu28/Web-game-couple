import {test} from 'node:test';
import assert from 'node:assert/strict';
import {extraGame, startExtraPreview, updateExtraPreview, resetExtraPreviews} from '../src/lib/extra-games';
import {recordPreview, previewProgress, resetPreviewProgress} from '../src/lib/preview-progress';
test('Returning to a preview keeps the match; rewards count each finish once and clear at sign-out',()=>{
  resetExtraPreviews(); resetPreviewProgress();
  const original=startExtraPreview('trivia');
  assert.equal(startExtraPreview('trivia').game.id, original.game.id);
  recordPreview(original.game); assert.equal(previewProgress(0).played,0);
  const done=extraGame('trivia'); done.state.status='won';done.state.winner=0;
  updateExtraPreview('trivia',{game:done});recordPreview(done);recordPreview(done);
  assert.equal(previewProgress(0).xp,15);assert.equal(previewProgress(1).xp,10);
  assert.equal(previewProgress(0).played,1);
  assert.notEqual(startExtraPreview('trivia').game.id,done.id);
  resetExtraPreviews();resetPreviewProgress();assert.equal(previewProgress(0).coins,0);
});
