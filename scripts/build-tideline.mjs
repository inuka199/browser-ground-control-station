import {createHash} from 'node:crypto';
import {readFile,writeFile,readdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';

const root=fileURLToPath(new URL('../client/public/tideline/',import.meta.url));
const files=(await readdir(root,{withFileTypes:true})).filter(f=>f.isFile() && f.name!=='sw.js').map(f=>f.name).sort();
const hashes={};
for(const name of files) hashes[name]=createHash('sha256').update(await readFile(join(root,name))).digest('base64');
const template=await readFile(new URL('./tideline-worker.template.js',import.meta.url),'utf8');
const release=createHash('sha256').update(JSON.stringify(hashes)+template).digest('hex').slice(0,16);
const source=template.replace('__RELEASE__',release).replace('/* ASSET_HASHES */ {}',JSON.stringify(hashes,null,2));
if(process.argv.includes('--check')){
  if((await readFile(join(root,'sw.js'),'utf8')).replaceAll('\r\n','\n')!==source.replaceAll('\r\n','\n'))throw Error('Run node scripts/build-tideline.mjs to refresh the offline release.');
}else await writeFile(join(root,'sw.js'),source);
console.log('Tideline '+release+' · '+files.length+' offline files');
