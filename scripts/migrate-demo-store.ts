import {loadEnvConfig} from '@next/env';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {readDataset} from '../packages/core/src/index';
import {withStore,closeStore} from '../src/server/store';
import {publishedVersion} from '../src/server/workflow';
async function main(){
 loadEnvConfig(process.cwd());
 const legacy=JSON.parse(await readFile('tests/fixtures/legacy-v1.json','utf8'));
 const dataset=readDataset(JSON.parse(await readFile('public/islamic-history.json','utf8')));
 await withStore(store=>{
  const current=publishedVersion(store);
  if(isDeepStrictEqual(current.dataset,dataset)){console.log('Le jeu v2 est déjà publié.');return;}
  if(!isDeepStrictEqual(current.dataset,legacy))throw new Error('Le jeu publié contient des changements locaux. Importez le fichier v2 dans l’atelier et comparez les versions avant publication. Aucun instantané modifié.');
  const date=new Date().toISOString(),id=randomUUID();
  store.versions.push({id,version:String(store.versions.length+1),author:'Migration du jeu de démonstration v2',authorId:'system',date,changes:'Schéma v2 : capitales et noms datés, relations normalisées, corpus enrichi et côtes Natural Earth.',status:'published',dataset,baseVersionId:current.id,history:[{action:'migrate-demo-v2',actor:'system',date}]});
  store.publishedVersionId=id;
  console.log(`Version ${store.versions.length} publiée ; instantané ${current.version} conservé intégralement.`);
 });
}
main().catch(error=>{console.error(error.message);process.exitCode=1;}).finally(closeStore);
