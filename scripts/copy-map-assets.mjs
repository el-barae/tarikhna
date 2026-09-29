import {copyFile, mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const destination=path.join(root,'public','vendor','maplibre');
await mkdir(destination,{recursive:true});
for(const name of ['maplibre-gl-worker.mjs','maplibre-gl-shared.mjs']){
  await copyFile(path.join(root,'node_modules','maplibre-gl','dist',name),path.join(destination,name));
}
await copyFile(path.join(root,'node_modules','maplibre-gl','LICENSE.txt'),path.join(destination,'LICENSE.txt'));
console.log('MapLibre worker assets prepared.');
