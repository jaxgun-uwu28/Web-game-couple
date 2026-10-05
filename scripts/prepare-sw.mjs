import {readFile,writeFile,readdir} from 'node:fs/promises';import {createHash} from 'node:crypto';
async function files(dir){const result=[];for(const item of await readdir(dir,{withFileTypes:true})){const p=`${dir}/${item.name}`;if(item.isDirectory())result.push(...await files(p));else if(/\.(tsx?|css|json)$/.test(p))result.push(p);}return result;}
const hash=createHash('sha256');for(const p of (await files('src')).sort()){hash.update(p);hash.update(await readFile(p));}
const sw=await readFile('public/sw.js','utf8');await writeFile('public/sw.js',sw.replace(/const VERSION\s*=\s*['"][^'"]+['"]/,'const VERSION='+JSON.stringify('arcade-shell-'+hash.digest('hex').slice(0,12))));
