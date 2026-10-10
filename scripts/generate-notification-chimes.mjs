import {mkdir,writeFile} from 'node:fs/promises';
const chimes={sweet_bell:[784,1047,1319],little_sparkle:[1047,1319,1568,2093],soft_hearts:[523,659,784]};
for(const [name,notes] of Object.entries(chimes)) {
 const rate=22050,duration=1.6,count=Math.floor(rate*duration),wav=Buffer.alloc(44+count*2);
 wav.write('RIFF');wav.writeUInt32LE(wav.length-8,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(rate,24);wav.writeUInt32LE(rate*2,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(count*2,40);
 for(let i=0;i<count;i++){const t=i/rate;let sample=0;notes.forEach((f,n)=>{const x=t-n*.17;if(x>=0)sample+=Math.sin(2*Math.PI*f*x)*Math.min(1,x/.012)*Math.exp(-x*6)*.22;});wav.writeInt16LE(Math.round(Math.max(-1,Math.min(1,sample))*32767),44+i*2);}
 for(const dir of ['public/audio/notifications','android/app/src/main/res/raw']){await mkdir(dir,{recursive:true});await writeFile(`${dir}/${name}.wav`,wav);}
}
