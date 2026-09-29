import { readFile } from 'node:fs/promises';
import { validateDataset } from '../packages/core/src/index';
async function main(){
 const filename=process.argv[2]??'public/islamic-history.json';
 const result=validateDataset(JSON.parse(await readFile(filename,'utf8')));
 for(const issue of result.errors)console.error(`${issue.path}: ${issue.message}`);
 for(const issue of result.warnings??[])console.warn(`${issue.path}: ${issue.message}`);
 if(!result.data){process.exitCode=1;return;}
 const d=result.data;console.log(`${filename}: schéma v${d.metadata.schemaVersion} valide — ${d.states.length} États, ${d.cities.length} villes, ${d.events.length} événements, ${d.people.length} personnages.`);
 console.log(`Sources : ${d.sources.filter(s=>s.verification==='consulted').length} consultées, ${d.sources.filter(s=>s.verification==='bibliography').length} bibliographiques, ${d.sources.filter(s=>s.verification==='unverified').length} à consulter. Validation technique ; statut éditorial : ${d.metadata.status}.`);
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
