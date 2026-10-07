import {test} from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {renderToString} from 'react-dom/server';
import PluginGame from '../src/components/PluginGame';
for(const id of ['ledger','blackjack','lostfound'] as const) test(`${id} opens its setup screen`,()=>{
 const html=renderToString(React.createElement(PluginGame,{id,db:null,user:'preview-0',couple:null,preview:true,close:()=>{}}));
 assert.match(html,/Create or join room/);
 assert.doesNotMatch(html,/>Accept</);
});
