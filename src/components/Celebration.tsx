"use client";
export default function Celebration(){return <div className="expansion-confetti" aria-hidden="true">{Array.from({length:26},(_,i)=><i key={i} style={{left:`${i*37%100}%`,background:['#F8C9D8','#F8DCC4','#EAE1F5','#F7E6A6'][i%4],animationDelay:`${i%6*.08}s`}}/>)}</div>;}
