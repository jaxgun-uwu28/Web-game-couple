import {test} from 'node:test';import assert from 'node:assert/strict';import {ledger,createLedger,ledgerMove} from '../src/lib/plugin-games/ledger';import {createLost,lostMove,lostfound,distance} from '../src/lib/plugin-games/lostfound';import {createMaze,mazeMove,syncsteps,levels,solveJoint,jointMove} from '../src/lib/plugin-games/syncsteps';
import {heartblast} from '../src/lib/plugin-games/heartblast';
import {heartStep} from '../src/lib/heartblast';
test('Heartblast registry adapter uses the canonical placement and scoring engine',()=>{
 let s=heartblast.createMatch({mode:'endless'},771);
 assert.throws(()=>heartblast.applyMove(s,{type:'place',piece:0,row:0,col:0},0));
 s=heartblast.applyMove(s,{type:'ready'},0);s=heartblast.applyMove(s,{type:'ready'},1);
 const expected=heartStep(s.engine,s.seed,0,0,0,0);
 s=heartblast.applyMove(s,{type:'place',piece:0,row:0,col:0},0);
 assert.deepEqual(s.engine,expected);
});
test('Turn timers cannot expire early and power-up hints remain private',()=>{
 let s=createLost({size:5,mode:'turns',timer:30},12);
 s=lostMove(s,{type:'hide',cell:0,serverNow:1000},0);
 s=lostMove(s,{type:'hide',cell:24,serverNow:1000},1);
 assert.equal(Date.parse(s.turnExpiresAt!),31000);
 assert.throws(()=>lostMove(s,{type:'timeout',serverNow:30000},1));
 s=lostMove(s,{type:'powerup',kind:'sonar',axis:'row',serverNow:2000},0);
 assert.deepEqual(s.powerHints[0],['Row 5']);
 assert.deepEqual((lostfound.getPublicState(s,1) as typeof s).powerHints[0],[]);
 assert.throws(()=>lostMove(s,{type:'powerup',kind:'sonar'},0));
 s=lostMove(s,{type:'powerup',kind:'skip',serverNow:4000},0);
 assert.equal(s.turn,1);assert.equal(Date.parse(s.turnExpiresAt!),34000);
 s=lostMove(s,{type:'timeout',serverNow:34000},0);assert.equal(s.winner,0);
});
test('Infinite joint mazes remain solvable across seeds and undo restores the complete state',()=>{
 for(let seed=1;seed<=100;seed++){
  const s=createMaze({infinite:true,difficulty:1+seed%5},seed);
  assert.ok(solveJoint(s.maps),`Seed ${seed}`);
  const next=mazeMove(s,{type:'move',direction:'right'},0);
  const undone=mazeMove(next,{type:'undo'},1);
  assert.deepEqual(undone.joint,s.joint);assert.deepEqual(undone.falls,s.falls);assert.equal(undone.turn,s.turn);assert.equal(undone.moves,0);
 }
});
test('Ledger ties carry coins and sealed notes, double the next ante, conserve wallets, and reveal only loser promises',()=>{let s=createLedger({wallet:10,rounds:1,entry:1});s=ledgerMove(s,{type:'lock',coins:1,note:'A snack'},0);s=ledgerMove(s,{type:'lock',coins:1,note:'A hug',serverValues:[4,4]},1);assert.equal(s.pot,2);assert.equal(s.ties,1);assert.equal(s.status,'betting');assert.deepEqual((ledger.getPublicState(s,1) as typeof s).notes[0],[]);assert.throws(()=>ledgerMove(s,{type:'lock',coins:1,note:''},0));s=ledgerMove(s,{type:'lock',coins:2,note:'A date'},0);s=ledgerMove(s,{type:'lock',coins:2,note:'A walk',serverValues:[6,3]},1);assert.equal(s.wallets[0],13);assert.equal(s.wallets[1],7);assert.equal(s.pot,0);assert.deepEqual(s.revealed[1],['A hug','A walk']);assert.deepEqual((ledger.getPublicState(s,1) as typeof s).notes[0],[]);assert.equal(s.wallets.reduce((a,b)=>a+b),20);assert.equal(ledger.getResult(s).winner,0);});
test('Lost & Found immutable treasures are never exposed to guesser until the reveal; hints are computed from server state',()=>{let s=createLost({size:5,mode:'race'},77);s=lostMove(s,{type:'hide',cell:6},0);s=lostMove(s,{type:'hide',cell:24},1);assert.throws(()=>lostMove(s,{type:'hide',cell:8},0));assert.equal((lostfound.getPublicState(s,0) as typeof s).treasures[1],null);s=lostMove(s,{type:'guess',cell:18},0);assert.equal(s.guesses[0][0].distance,1);assert.equal((lostfound.getPublicState(s,1) as typeof s).guesses[0].length,0);s=lostMove(s,{type:'guess',cell:24},0);assert.equal(s.winner,0);assert.deepEqual((lostfound.getPublicState(s,0) as typeof s).treasures,[6,24]);assert.equal(distance(0,24,5,'manhattan'),8);});
test('All 30 shipped maze configurations are jointly solvable and hidden views omit partner maps, keys, blocks and history',()=>{for(const level of levels){let s=createMaze({level:level.id},0);const solved=solveJoint(s.maps);assert.ok(solved,`Level ${level.id}`);assert.equal(s.optimal,solved.moves);for(const direction of solved.solution)s=mazeMove(s,{type:'move',direction},0);assert.equal(s.status,'done',`Level ${level.id}`);assert.ok(s.joint.positions.every((p,i)=>p===s.maps[i].exit));}const s=createMaze({level:5},1321),view=syncsteps.getPublicState(s,0) as {maps:unknown[];history?:unknown;joint:{positions:unknown[]}};assert.equal(view.maps[1],null);assert.equal(view.joint.positions[1],null);assert.equal(view.history,undefined);});
test('Walls block independently and standing on one flag does not freeze that avatar',()=>{const maps=[{size:2,tiles:['floor','wall','floor','floor'],start:0,exit:2},{size:2,tiles:['floor','floor','floor','floor'],start:0,exit:3}],j={positions:[0,0],keys:[0,0],blocks:[[],[]],sticky:[false,false]};assert.deepEqual(jointMove(maps,j,'right').joint.positions,[0,1]);const down=jointMove(maps,j,'down').joint;assert.deepEqual(down.positions,[2,2]);assert.deepEqual(jointMove(maps,down,'up').joint.positions,[0,0]);});
