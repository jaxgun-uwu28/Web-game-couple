"use client";
import {useCallback,useEffect,useState} from 'react';
import {Flag} from 'lucide-react';
import {useKeepsakes} from './Keepsakes';
import {gameRequest} from '@/lib/game-request';
export default function DailySyncPuzzle(){
 const c=useKeepsakes(),[result,setResult]=useState<{scores:number[];reason:string}|null>(null);
 const load=useCallback(async()=>{
  if(!c.db||c.preview)return;
  const {matches}=await gameRequest(c.db,{action:'list'},fetch,'/api/game/plugin');
  const day=new Date().toISOString().slice(0,10), match=matches.find((x:{game_id:string;status:string;config:{day?:string}})=>x.game_id==='syncsteps'&&x.config.day===day&&x.status==='done');
  if(match){const data=await gameRequest(c.db,{action:'get',id:match.id},fetch,'/api/game/plugin');setResult(data.result);}
 },[c.db,c.preview]);
 useEffect(()=>{const update=()=>{void load().catch(()=>{});};update();window.addEventListener('arcade:couple-update',update);return()=>window.removeEventListener('arcade:couple-update',update);},[load]);
 return <section className="daily-sync-puzzle"><h2><Flag size={22}/>Today’s Sync Steps</h2>{result?<p>{result.reason} · {result.scores[0]} stars together</p>:<p>One little maze to solve together.</p>}<button onClick={()=>window.dispatchEvent(new CustomEvent('arcade-open-plugin',{detail:{id:'syncsteps',config:{daily:true,infinite:true,difficulty:2}}}))}>Play today’s maze</button></section>;
}
