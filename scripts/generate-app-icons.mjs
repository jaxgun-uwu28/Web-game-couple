import sharp from 'sharp';import {mkdir,writeFile,readFile} from 'node:fs/promises';import path from 'node:path';
await mkdir('public/icons',{recursive:true});
const svg=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><path d="M256 354 144 242c-75-83 46-175 112-79 66-96 187-4 112 79Z" fill="#fff8f3" stroke="#9d304f" stroke-width="22" stroke-linejoin="round"/><path d="M185 218h45m-22-22v44m86-18h1m27-24h1" stroke="#9d304f" stroke-width="17" stroke-linecap="round"/></svg>`;
let assets={};try{assets=JSON.parse(await readFile('src/generated/art-manifest.json','utf8')).assets||{};}catch{}
async function dropIn(name){const src=assets[name]?.src;if(!src)return null;const absolute=path.resolve('public',src.split('?')[0].replace(/^\//,''));if(!absolute.startsWith(path.resolve('public')+path.sep))throw new Error('Invalid icon source');return readFile(absolute);}
const foreground=await dropIn('icon-foreground'),background=await dropIn('icon-background');
const fg=await sharp(foreground||Buffer.from(svg)).resize(foreground?360:512,foreground?360:512,{fit:'contain',background:'#00000000'}).png().toBuffer();
const base=background?await sharp(background).resize(512,512,{fit:'cover'}).png().toBuffer():await sharp({create:{width:512,height:512,channels:4,background:'#f8c9d8'}}).png().toBuffer();
const icon=await sharp(base).composite([{input:fg,gravity:'centre'}]).png().toBuffer();
for(const n of [192,512])await sharp(icon).resize(n,n).png().toFile(`public/icons/icon-${n}.png`);
await writeFile('public/icons/maskable-512.png',icon);
await sharp({create:{width:512,height:512,channels:4,background:'#00000000'}}).composite([{input:fg,gravity:'centre'}]).png().toFile('public/icons/adaptive-foreground.png');
await writeFile('public/icons/PROVENANCE.md',`Original geometric heart/gamepad SVG in scripts/generate-app-icons.mjs. Drop-in icon-foreground and icon-background override it at build time. No external image or personal photograph is used by the fallback.\n${svg}\n`);
