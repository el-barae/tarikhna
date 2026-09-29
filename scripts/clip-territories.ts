import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {formatDataset,readDataset,validateDataset} from '../packages/core/src/index';
import {clipTerritories} from './geography';
async function main(){
 const [input,output]=process.argv.slice(2);
 if(!input||!output||resolve(input)===resolve(output))throw new Error('Usage : npm run data:clip -- input.json output.json (fichiers distincts).');
 const dataset=readDataset(JSON.parse(await readFile(input,'utf8')));
 const result=clipTerritories(dataset,JSON.parse(await readFile('public/geography/land.geojson','utf8')));
 const check=validateDataset(result);if(!check.valid)throw new Error(JSON.stringify(check.errors));
 await writeFile(output,formatDataset(result),{flag:'wx'});console.log(`Territoires découpés et orientés RFC 7946 : ${output}`);
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
