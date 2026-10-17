/** Reproducible editorial migration of the bundled demo. Does not modify stored versions. */
import { readFile, writeFile } from 'node:fs/promises';
import { migrateLegacyDataset, formatDataset, validateDataset, type Dataset, type AreaGeometry, type Position, type PolityType, type HistoricalState, type HistoricalCity } from '../packages/core/src/index';
import type { Dataset as LegacyDataset } from '../packages/core/src/legacy-types';
import { clipTerritories } from './geography';

async function main() {
const L = (fr:string,en:string,ar:string) => ({fr,en,ar});
const ref = (id:string,locator?:string) => ({id,...(locator?{locator}:{})});
const data:Dataset = migrateLegacyDataset(JSON.parse(await readFile('tests/fixtures/legacy-v1.json','utf8')) as LegacyDataset);
const state=(id:string)=>data.states.find(s=>s.id===id)!;
const city=(id:string)=>data.cities.find(c=>c.id===id)!;
const event=(id:string)=>data.events.find(e=>e.id===id)!;
const wiki=(id:string,title:string)=>{
 if(!data.sources.some(s=>s.id===id))data.sources.push({id,title:title.replaceAll('_',' '),author:'Wikipedia contributors',publicationYear:null,type:'encyclopedia',url:`https://en.wikipedia.org/wiki/${encodeURIComponent(title)}`,permanentUrl:null,accessedDate:null,license:'CC-BY-SA-4.0 (text; media have separate licences)',verification:'unverified',notes:L('Repère documentaire ; notice à confronter aux travaux académiques.','Reference lead; cross-check the entry against academic work.','مرجع أولي للمراجعة مع الدراسات الأكاديمية.')});
 return ref(id,'Introduction / History');
};
for(const collection of ['periods','states','cities','events','people','routes'] as const)for(const item of data[collection]){
 if(typeof item.description==='object')for(const lang of ['fr','en','ar'] as const)item.description[lang]=item.description[lang].replace(/ Données DEMO : notice indicative à vérifier\.| DEMO DATA: illustrative entry requiring verification\.| بيانات تجريبية: مادة توضيحية تحتاج إلى التحقق\./g,'');
}
Object.assign(data.metadata,{schemaVersion:2,version:'2.0.0',status:'demo',title:'Atlas de l’histoire islamique',figurePolicy:{foundingFigures:'no-images',honorifics:'optional'},description:L(
 'Jeu de démonstration, sans validation scientifique. Les contours symboliques montrent des régions de référence, pas une souveraineté continue ni une extension maximale. Les côtes modernes Natural Earth sont un support visuel. Années grégoriennes inclusives, dates circa approximatives. Les capitales listées sont des sièges documentés et peuvent être partielles. Les coordonnées urbaines sont des repères approximatifs. La couverture d’une ville ne date pas sa fondation. Voir docs/DATA-V2.md pour les sources, limites et conventions.',
 'Demo dataset without scholarly validation. Symbolic outlines show reference regions, not continuous sovereignty or maximum extent. Modern Natural Earth coastlines are a visual aid. Gregorian years are inclusive; circa dates are approximate. Capital lists may be partial. City coordinates are approximate anchors. Coverage does not date a city’s foundation. See docs/DATA-V2.md for sources and conventions.',
 'بيانات تجريبية دون مراجعة علمية. الحدود الرمزية تمثل مناطق مرجعية ولا تعني سيادة مستمرة أو أقصى امتداد. سواحل Natural Earth الحديثة مرجع بصري. السنوات ميلادية وشاملة والتواريخ التقريبية غير قطعية. قوائم العواصم قد تكون جزئية وإحداثيات المدن تقريبية. بداية التغطية لا تعني تأسيس المدينة. راجع docs/DATA-V2.md.')});
for(const s of data.sources){s.notes=L('Point de départ documentaire à vérifier dans les travaux spécialisés.','Reference lead to check against specialist scholarship.','مرجع أولي يحتاج إلى مراجعة الدراسات المتخصصة.');s.license='CC-BY-SA-4.0 (text; media have separate licences)';}
const bibliography:[string,string,string,number|null,string][]=[
 ['source-bosworth','The New Islamic Dynasties: A Chronological and Genealogical Manual','C. E. Bosworth',1996,'https://www.jstor.org/stable/10.3366/j.ctvxcrv5f'],
 ['source-kennedy','An Historical Atlas of Islam, second revised edition','Hugh Kennedy (ed.)',2002,'https://catalogue.bnf.fr/ark:/12148/cb40719856w'],
 ['source-hourani','A History of the Arab Peoples (2010 edition; first published 1991)','Albert Hourani',2010,'https://www.hup.harvard.edu/books/9780674058194'],
 ['source-ei','Encyclopaedia of Islam, Second Edition Online','Brill; collective work',null,'https://referenceworks.brill.com/display/db/eieo']
];
for(const [id,title,author,publicationYear,url] of bibliography)data.sources.push({id,title,author,publicationYear,type:'academic',url,permanentUrl:url,accessedDate:null,license:'Copyright — bibliographic reference only; no text or maps reproduced',verification:'bibliography',notes:L('Bibliographie de travail. Le contenu intégral n’a pas été consulté ; aucune page ni frontière ne lui est attribuée.','Working bibliography. Full text was not consulted; no page or boundary is attributed to this work.','مرجع ببليوغرافي لم يراجع نصه الكامل؛ لا تنسب إليه صفحات أو حدود.')});
function addSource(id:string,title:string,author:string,url:string,locator:string){data.sources.push({id,title,author,publicationYear:null,type:'academic',url,permanentUrl:url,accessedDate:'2026-09-29',license:'Copyright — reference only',verification:'consulted',notes:L('Passage consulté pour les repères cités ; aucune carte reproduite.','Passage consulted for the cited milestones; no map reproduced.','تمت مراجعة المقطع للمحطات المذكورة دون نسخ خرائط.')});return ref(id,locator);}
const fatimidSource=addSource('source-met-fatimid','The Art of the Fatimid Period (909–1171)','Suzan Yalman / Metropolitan Museum of Art','https://www.metmuseum.org/essays/the-art-of-the-fatimid-period-909-1171','Opening paragraph: al-Mansuriya 947, Cairo 969 / capital 973');
const almoravidSource=addSource('source-met-almoravid','The Art of the Almoravid and Almohad Periods (ca. 1062–1269)','Suzan Yalman / Metropolitan Museum of Art','https://www.metmuseum.org/essays/the-art-of-the-almoravid-and-almohad-periods-ca-1062-1269','Almoravid and Almohad chronology');
const rumSource=addSource('source-iranica-rum','SALJUQS iii. SALJUQS OF RUM','Encyclopaedia Iranica','https://www.iranicaonline.org/articles/saljuqs-iii/','Three phases; Nicaea and Mongol suzerainty');
const bursaSource=addSource('source-unesco-bursa','Bursa and Cumalıkızık: the Birth of the Ottoman Empire','UNESCO World Heritage Centre','https://whc.unesco.org/en/list/1452/','Brief synthesis');
function addCity(id:string,fr:string,en:string,ar:string,lon:number,lat:number,founded:number|null=null,precision:HistoricalCity['foundedPrecision']='unknown'){
 if(data.cities.some(c=>c.id===id))return;
 const citation=wiki(`source-city-${id}`,en.replaceAll(' ','_'));
 data.cities.push({id,name:L(fr,en,ar),names:[],aliases:[],latitude:lat,longitude:lon,activeFrom:founded===null?610:Math.max(610,founded),activeUntil:null,foundedYear:founded,foundedPrecision:precision,importance:'cultural',description:L(`${fr} : repère urbain de l’atlas. La position désigne approximativement le site historique.`,`${en}: an urban reference in the atlas. The point approximates the historical site.`,`${ar}: موضع حضري مرجعي في الأثر وإحداثياته تقريبية.`),sources:[citation]});
}
const cities:[string,string,string,string,number,number,number?][]=[
 ['kufa','Koufa','Kufa','الكوفة',44.4,32.03,638],['basra','Bassora','Basra','البصرة',47.69,30.4,636],['aleppo','Alep','Aleppo','حلب',37.16,36.2],['nishapur','Nishapur','Nishapur','نيسابور',58.82,36.21],['merv','Merv','Merv','مرو',62.19,37.66],['seville','Séville','Seville','إشبيلية',-5.99,37.39],['granada','Grenade','Granada','غرناطة',-3.6,37.18],['toledo','Tolède','Toledo','طليطلة',-4.03,39.86],['palermo','Palerme','Palermo','باليرمو',13.36,38.12],['mahdia','Mahdia','Mahdia','المهدية',11.06,35.5,916],['sijilmassa','Sijilmassa','Sijilmasa','سجلماسة',-4.28,31.28,757],['edirne','Édirne','Edirne','أدرنة',26.56,41.68],['konya','Konya','Konya','قونية',32.48,37.87],['ankara','Ankara','Ankara','أنقرة',32.86,39.93],['anbar','Al-Anbar','Anbar (town)','الأنبار',43.7,33.38],['raqqada','Raqqada','Raqqada','رقادة',10.06,35.6,876],['mansuriyya','Al-Mansûriyya','Mansuriya','المنصورية',10.1,35.66,947],['tinmal','Tinmel','Tinmel','تينمل',-8.23,30.98],['tlemcen','Tlemcen','Tlemcen','تلمسان',-1.32,34.88],['ghazni','Ghazni','Ghazni','غزنة',68.42,33.55],['lahore','Lahore','Lahore','لاهور',74.34,31.55],['gurganj','Gurganj','Konye-Urgench','جرجانية',59.16,42.32],['tabriz','Tabriz','Tabriz','تبريز',46.29,38.08],['herat','Hérat','Herat','هراة',62.2,34.35],['delhi','Delhi','Delhi','دلهي',77.23,28.65],['agra','Agra','Agra','أغرة',78.01,27.18],['gao','Gao','Gao','غاو',-0.05,16.27],['timbuktu','Tombouctou','Timbuktu','تمبكتو',-3.0,16.77],['tikrit','Tikrit','Tikrit','تكريت',43.68,34.61],['afshana','Afshana','Afshona','أفشنة',64.22,39.95],['hamadan','Hamadan','Hamadan','همدان',48.52,34.8],['tangier','Tanger','Tangier','طنجة',-5.81,35.76],['tus','Tus','Tus','طوس',59.5,36.48],['tustar','Tustar','Shushtar','تستر',48.86,32.05]
];
for(const [id,fr,en,ar,lon,lat,founded] of cities)addCity(id,fr,en,ar,lon,lat,founded??null,founded===undefined?'unknown':'circa');
// Correct page identities; Afshana is documented in the scholarly biography.
Object.assign(data.sources.find(s=>s.id==='source-city-mansuriyya')!,{title:'Mansouria, Tunisia',url:'https://en.wikipedia.org/wiki/Mansouria,_Tunisia'});
Object.assign(data.sources.find(s=>s.id==='source-city-afshana')!,{title:'AVICENNA ii. Biography',author:'Encyclopaedia Iranica',type:'academic',url:'https://www.iranicaonline.org/articles/avicenna-ii/',permanentUrl:'https://www.iranicaonline.org/articles/avicenna-ii/',accessedDate:'2026-09-29',license:'Copyright — reference only',verification:'consulted',notes:L('Lieu de naissance mentionné dans la biographie ; cette référence ne valide pas les coordonnées.','Birthplace mentioned in the biography; this reference does not validate the coordinates.','يذكر المرجع مكان الميلاد دون أن يثبت صحة الإحداثيات.')});
city('afshana').sources=[ref('source-city-afshana','Biography: birthplace at Afšana, near Bukhara')];
for(const [id,founded,precision] of [['baghdad',762,'exact'],['cairo',969,'exact'],['kairouan',670,'exact'],['fustat',641,'circa'],['samarra',836,'circa'],['fez',789,'circa'],['marrakesh',1070,'circa']] as const){city(id).foundedYear=founded;city(id).foundedPrecision=precision;city(id).activeFrom=founded;}
city('marrakesh').description=L('La fondation almoravide est datée selon les sources de 1062 à 1070 environ ; 1070 sert ici de borne conventionnelle.','Sources place the Almoravid foundation around 1062–1070; 1070 is the conventional bound used here.','تؤرخ المصادر التأسيس المرابطي بين نحو 1062 و1070؛ يعتمد الأثر 1070 حداً اصطلاحياً.');city('marrakesh').sources.push(almoravidSource);
city('medina').names=[{name:L('Yathrib','Yathrib','يثرب'),from:610,to:621,precision:'circa'},{name:L('Médine','Medina','المدينة المنورة'),from:622,to:null,precision:'circa'}];
city('medina').aliases=['Al-Madinah'];
city('istanbul').name=L('Istanbul','Istanbul','إسطنبول');city('istanbul').aliases=['İstanbul','Kostantiniyye'];
city('istanbul').names=[{name:L('Constantinople','Constantinople','القسطنطينية'),from:610,to:1929,precision:'circa'},{name:city('istanbul').name,from:1930,to:null,precision:'circa'}];
city('istanbul').description=L('Capitale byzantine puis ottomane à partir de 1453. Constantinople et Istanbul ont longtemps coexisté ; 1930 est une convention de libellé moderne, pas une date d’apparition du nom.','Byzantine then Ottoman capital from 1453. Constantinople and Istanbul coexisted for centuries; 1930 is a modern label convention, not the origin of the name.','عاصمة بيزنطية ثم عثمانية منذ 1453. تعايش الاسمان القسطنطينية وإسطنبول قروناً؛ 1930 اصطلاح للعرض الحديث لا تاريخ ظهور الاسم.');
for(const c of data.cities){const names=typeof c.name==='string'?[c.name]:Object.values(c.name);c.aliases=c.aliases.filter(a=>!names.some(n=>n.toLowerCase()===a.toLowerCase())&&!c.names.some(n=>Object.values(n.name).includes(a)));}
function capitals(id:string,rows:[string,number,number,('exact'|'circa'|'unknown')?,('capital'|'residence')?][],sources=state(id).sources){state(id).capitals=rows.map(([city,from,to,precision='circa',role='capital'])=>({city,from,to,precision,role,sources:structuredClone(sources)}));}
capitals('rashidun-caliphate',[['medina',632,655],['kufa',656,660]]);
capitals('abbasid-caliphate',[['kufa',750,751],['anbar',752,761],['baghdad',762,835],['samarra',836,891,'circa','residence'],['baghdad',892,1258]]);
state('abbasid-caliphate').description=L('Les premiers sièges, regroupés sous le nom de Hachimiyya, se situent autour de Koufa puis d’Anbar. Bagdad est fondée en 762 ; Samarra accueille la cour de 836 à environ 892. Les tranches ci-dessous simplifient les retours temporaires et les résidences multiples.','Early seats known as Hashimiyya were near Kufa and Anbar. Baghdad was founded in 762; Samarra housed the court from 836 to around 892. Intervals simplify temporary returns and multiple residences.','كانت المقرات الأولى المسماة الهاشمية قرب الكوفة ثم الأنبار. تأسست بغداد عام 762 وأقامت الخلافة في سامراء من 836 إلى نحو 892. الفترات تبسيط للمقار المتعددة والتنقلات المؤقتة.');
capitals('fatimid-caliphate',[['raqqada',909,920],['mahdia',921,947],['mansuriyya',948,972],['cairo',973,1171]], [ref('source-fatimid','History — capitals'),fatimidSource]);
capitals('almoravid-dynasty',[['marrakesh',1070,1147]], [almoravidSource]);
capitals('almohad-dynasty',[['tinmal',1121,1146],['marrakesh',1147,1269]], [almoravidSource]);
capitals('seljuk-empire',[['nishapur',1037,1042],['rayy',1043,1050],['isfahan',1051,1118],['merv',1119,1157]], [wiki('source-seljuk','Seljuk_Empire')]);
capitals('idrisid-dynasty',[['fez',809,974]]);
state('ottoman-empire').endYear=1922;
capitals('ottoman-empire',[['bursa',1326,1364],['edirne',1365,1452],['istanbul',1453,1922]], [ref('source-ottoman','History — capitals'),bursaSource]);
state('ottoman-empire').description=L('Les sièges successifs sont Bursa, Édirne puis Constantinople. Le sultanat est aboli en 1922. Le califat sans souveraineté territoriale subsiste jusqu’en 1924, représenté par des événements séparés.','Successive seats include Bursa, Edirne and Constantinople. The sultanate ends in 1922; the non-territorial caliphate survives to 1924 and is shown through separate events.','تعاقبت بورصة وأدرنة والقسطنطينية كمقار للحكم. انتهت السلطنة عام 1922 واستمرت الخلافة دون سيادة إقليمية إلى 1924، وتمثل بأحداث مستقلة.');
state('cordoba-umayyads').polityPeriods=[{polityType:'emirate',from:756,to:928},{polityType:'caliphate',from:929,to:1031}];
for(const s of data.states){s.dynasty=s.id==='medina-polity'||s.id==='rashidun-caliphate'?null:s.id==='cordoba-umayyads'?'umayyad':s.id.split('-')[0];if(s.id==='almohad-dynasty')s.polityType='caliphate';if(['idrisid-dynasty','almoravid-dynasty'].includes(s.id))s.polityType='emirate';s.startPrecision='circa';s.endPrecision='exact';for(const feature of s.territories.features){feature.properties.endYear=Math.min(s.endYear,feature.properties.endYear);feature.properties.sources=[];feature.properties.certainty='symbolic';feature.properties.control='influence';}}
const polygon=(ring:Position[]):AreaGeometry=>({type:'Polygon',coordinates:[[...ring,ring[0]]]});
const region=(west:number,south:number,east:number,north:number):AreaGeometry=>polygon([[west,south],[east,south],[east,north],[west,north]]);
function slices(id:string,rows:[number,number,AreaGeometry][],control:'direct'|'nominal'|'influence'='influence'){
 state(id).territories={type:'FeatureCollection',features:rows.map(([startYear,endYear,geometry],i)=>({type:'Feature',id:`${id}-territory-${i}`,geometry,properties:{stateId:id,startYear,endYear,certainty:'symbolic',control,sources:[]}}))};
}
const u=state('umayyad-caliphate').territories.features;const east=structuredClone(u[0].geometry);
const transoxiana=region(61,37,69,41.5);
const multi=(...geometries:AreaGeometry[]):AreaGeometry=>({type:'MultiPolygon',coordinates:geometries.flatMap(g=>g.type==='Polygon'?[g.coordinates]:g.coordinates)});
const northAfrica=polygon([[-9,28],[-9,36],[7,38],[12,37],[22,33],[22,29],[2,28]]);
const iberia=region(-9,36,1,42);
// Small dated additions: Kairouan from 670; Transoxiana only in the later slice.
slices('umayyad-caliphate',[[661,669,east],[670,710,multi(east,region(8.5,34,12,37))],[711,711,multi(east,northAfrica,iberia)],[712,749,multi(east,northAfrica,iberia,transoxiana)]]);
const a=state('abbasid-caliphate').territories.features;a[0].geometry=multi(a[0].geometry,transoxiana);
const maghreb=polygon([[-10,24],[-10,33],[-6,36],[-1,35],[0,31],[-5,24]]);
slices('almoravid-dynasty',[[1040,1069,region(-12,20,-4,29)],[1070,1085,maghreb],[1086,1089,multi(maghreb,region(-7,36,-3,39))],[1090,1147,multi(maghreb,region(-9,36,-1,40))]]);
slices('almohad-dynasty',[[1121,1146,region(-9,30,-6,32.5)],[1147,1159,multi(maghreb,region(-8,36,-1,39))],[1160,1228,multi(northAfrica,region(-8,36,-1,39))],[1229,1269,region(-9,29,-1,36)]]);
for(const f of state('aghlabid-dynasty').territories.features){f.properties.control='direct';f.properties.suzerainId='abbasid-caliphate';}
// Nominal Abbasid overlordship after local dynasties emerge is distinct from direct control.
for(const f of state('abbasid-caliphate').territories.features)f.properties.control=f.properties.startYear<861?'influence':'nominal';
data.routes[0].startYear=762;data.routes[0].cityIds=['baghdad','rayy','bukhara','samarkand'];data.routes[1].cityIds=['cordoba','ceuta','tunis','fustat'];data.routes[2].cityIds=['damascus','medina','mecca'];
for(const e of data.events){e.startPrecision='exact';e.endPrecision='exact';e.location.type=['event-revelation','event-abbasids','event-translations','event-harun'].includes(e.id)?'symbolic':'actual';}
event('event-abbasids').location={cityId:'kufa',type:'symbolic'};event('event-abbasids').description=L('Avènement des Abbassides. Koufa sert ici de repère pour un processus politique qui se déroule dans plusieurs régions.','Rise of the Abbasids. Kufa is a symbolic anchor for a political process spanning several regions.','قيام الدولة العباسية. الكوفة علامة رمزية لعملية سياسية جرت في مناطق متعددة.');
event('event-caliphate-end').location={cityId:'ankara',type:'actual'};event('event-caliphate-end').description=L('La Grande Assemblée nationale, réunie à Ankara, abolit le califat le 3 mars 1924.','The Grand National Assembly in Ankara abolishes the caliphate on 3 March 1924.','ألغى المجلس الوطني الكبير في أنقرة الخلافة في 3 مارس 1924.');event('event-caliphate-end').relatedStates=[];
function newEvent(id:string,name:ReturnType<typeof L>,year:number,location:Dataset['events'][number]['location'],relatedStates:string[],description:ReturnType<typeof L>,page:string,people:string[]=[]){data.events.push({id,title:name,startYear:year,endYear:year,startPrecision:'exact',endPrecision:'exact',location,type:'battle',description,relatedStates,relatedPeople:people,sources:[wiki(`source-${id}`,page)]});}
newEvent('event-sultanate-end',L('Abolition du sultanat ottoman','Abolition of the Ottoman sultanate','إلغاء السلطنة العثمانية'),1922,{cityId:'ankara',type:'actual'},['ottoman-empire'],L('L’Assemblée abolit le sultanat ; le califat reste une institution distincte.','The Assembly abolishes the sultanate; the caliphate remains a separate institution.','ألغى المجلس السلطنة وبقيت الخلافة مؤسسة منفصلة.'),'Abolition_of_the_Ottoman_sultanate');event('event-sultanate-end').type='political-change';
newEvent('event-caliphate-ceremonial',L('Le califat sans sultanat','The caliphate without the sultanate','الخلافة دون السلطنة'),1922,{cityId:'istanbul',type:'actual'},[],L('Abdülmecid II porte le titre de calife de 1922 à 1924, sans souveraineté territoriale.','Abdülmecid II holds the title of caliph from 1922 to 1924 without territorial sovereignty.','حمل عبد المجيد الثاني لقب الخليفة من 1922 إلى 1924 دون سيادة إقليمية.'),'Abdülmecid_II');event('event-caliphate-ceremonial').type='political-change';event('event-caliphate-ceremonial').endYear=1924;
function addState(id:string,name:ReturnType<typeof L>,from:number,to:number,polityType:PolityType,dynasty:string|null,capitalRows:[string,number,number][],geometry:AreaGeometry,page:string){
 const sources=[wiki(`source-${id}`,page)];
 data.states.push({id,name,polityType,dynasty,polityPeriods:[],startYear:from,endYear:to,startPrecision:'circa',endPrecision:'circa',capitals:[],color:'#397D86',territories:{type:'FeatureCollection',features:[]},description:L(`${name.fr} : repère pour étudier les pouvoirs régionaux et leurs transformations. La zone schématique représente un foyer géographique ; elle ne décrit pas toutes les possessions ni leur durée.`,`${name.en}: a reference for studying regional powers and their transformations. The schematic region marks a geographic focus, not all possessions or their duration.`,`${name.ar}: موضع لدراسة القوى الإقليمية وتحولاتها. المنطقة التخطيطية مركز جغرافي ولا تمثل جميع الممتلكات أو مدة السيطرة عليها.`),sources});
 capitals(id,capitalRows,sources);slices(id,[[from,to,geometry]]);
}
addState('marinid-sultanate',L('Sultanat mérinide','Marinid Sultanate','الدولة المرينية'),1244,1465,'sultanate','marinid',[['fez',1248,1465]],region(-7,32,-2,35.7),'Marinid_dynasty');
addState('hafsid-sultanate',L('Sultanat hafside','Hafsid Sultanate','الدولة الحفصية'),1229,1574,'sultanate','hafsid',[['tunis',1229,1574]],region(6,33,11,37),'Hafsid_dynasty');
addState('zayyanid-sultanate',L('Sultanat zianide de Tlemcen','Zayyanid Sultanate of Tlemcen','الدولة الزيانية'),1235,1556,'sultanate','zayyanid',[['tlemcen',1235,1556]],region(-2,33,3,36.5),'Kingdom_of_Tlemcen');
addState('wattasid-sultanate',L('Sultanat wattasside','Wattasid Sultanate','الدولة الوطاسية'),1472,1554,'sultanate','wattasid',[['fez',1472,1554]],region(-7,33,-2,35.8),'Wattasid_dynasty');
addState('saadi-sultanate',L('Sultanat saadien','Saadi Sultanate','الدولة السعدية'),1510,1659,'sultanate','saadi',[['marrakesh',1525,1659]],region(-10,29,-6,33),'Saadi_Sultanate');
addState('taifa-seville',L('Taïfa de Séville','Taifa of Seville','طائفة إشبيلية'),1023,1091,'emirate','abbadid',[['seville',1023,1091]],region(-7,36.4,-4.7,38.2),'Taifa_of_Seville');
addState('taifa-toledo',L('Taïfa de Tolède','Taifa of Toledo','طائفة طليطلة'),1010,1085,'emirate','dhu-l-nun',[['toledo',1010,1085]],region(-5.5,38.5,-3,40.8),'Taifa_of_Toledo');
addState('nasrid-emirate',L('Émirat nasride de Grenade','Nasrid Emirate of Granada','إمارة غرناطة'),1232,1492,'emirate','nasrid',[['granada',1238,1492]],region(-5,36,-1.5,37.6),'Emirate_of_Granada');
addState('tulunid-emirate',L('Émirat toulounide','Tulunid Emirate','الإمارة الطولونية'),868,905,'emirate','tulunid',[],region(29,27,32,31.5),'Tulunids');
addState('samanid-emirate',L('Émirat samanide','Samanid Emirate','الدولة السامانية'),819,999,'emirate','samanid',[['samarkand',819,891],['bukhara',892,999]],region(62,37,69,41),'Samanid_Empire');
addState('buyid-confederation',L('Pouvoirs bouyides','Buyid confederation','الدولة البويهية'),934,1062,'confederation','buyid',[],region(48,28,54,33),'Buyid_dynasty');
addState('ghaznavid-sultanate',L('Sultanat ghaznévide','Ghaznavid Sultanate','الدولة الغزنوية'),977,1186,'sultanate','ghaznavid',[['ghazni',977,1162],['lahore',1163,1186]],region(66,31,70,35),'Ghaznavid_Empire');
slices('ghaznavid-sultanate',[[977,1162,region(66,31,70,35)],[1163,1186,region(72,30,75,33)]]);
addState('khwarazmian-empire',L('Empire khwarezmien','Khwarazmian Empire','الدولة الخوارزمية'),1077,1231,'empire','anushteginid',[['gurganj',1097,1219]],region(57,40,61,43),'Khwarazmian_Empire');
addState('ilkhanate',L('Ilkhanat','Ilkhanate','الدولة الإيلخانية'),1256,1335,'state','hulagu',[],region(45,34,50,39),'Ilkhanate');
addState('timurid-empire',L('Empire timouride','Timurid Empire','الدولة التيمورية'),1370,1507,'empire','timurid',[['samarkand',1370,1404],['herat',1405,1507]],region(62,37,68,41),'Timurid_Empire');
slices('timurid-empire',[[1370,1404,region(62,37,68,41)],[1405,1507,region(60,33,65,37)]]);
addState('safavid-empire',L('Empire séfévide','Safavid Iran','الدولة الصفوية'),1501,1736,'empire','safavid',[['tabriz',1501,1554],['isfahan',1598,1722]],region(45,35,50,39),'Safavid_Iran');
slices('safavid-empire',[[1501,1597,region(45,35,50,39)],[1598,1736,region(48,30,55,35)]]);
addState('rum-sultanate',L('Sultanat de Rum','Sultanate of Rum','سلطنة سلاجقة الروم'),1077,1308,'sultanate','seljuk',[['konya',1097,1308]],region(29,36,35,40),'Sultanate_of_Rum');state('rum-sultanate').sources.push(rumSource);
addState('delhi-sultanate',L('Sultanat de Delhi','Delhi Sultanate','سلطنة دلهي'),1206,1526,'sultanate',null,[['delhi',1206,1326],['delhi',1335,1526]],region(75,26,80,31),'Delhi_Sultanate');
addState('mughal-empire',L('Empire moghol','Mughal Empire','سلطنة مغول الهند'),1526,1857,'empire','mughal',[['agra',1526,1539],['agra',1555,1570],['lahore',1585,1597],['agra',1598,1647],['delhi',1648,1857]],region(76,25,81,30),'Mughal_Empire');
slices('mughal-empire',[[1526,1539,region(76,25,81,30)],[1555,1857,region(76,25,81,30)]]); // Sur interregnum is intentionally a gap.
addState('mali-empire',L('Empire du Mali','Mali Empire','إمبراطورية مالي'),1235,1670,'empire','keita',[],region(-11,10,-5,15),'Mali_Empire');
addState('songhai-empire',L('Empire songhaï','Songhai Empire','إمبراطورية سونغاي'),1464,1591,'empire',null,[['gao',1464,1591]],region(-5,13,3,18),'Songhai_Empire');
// Display distinct hues for neighbouring contemporaries; text labels remain the primary key.
const colors=['#8C6D31','#2B8CBE','#3B8A52','#75489A','#CB6B36','#A73C65','#519DA7','#C39025','#4E62AA','#B94E38','#758633','#D078A8','#437CB0','#8F6748','#3AA277','#B76A91','#887AC1','#CC9145','#3B869D','#A45545','#949543','#AD4A7B','#496DB1','#C17548','#388F82','#8E58B4','#B69424','#608FB5','#C45665','#688C3D','#A77956','#517080','#9A654C','#7561A7','#BA8A56','#46988B'];
data.states.forEach((s,i)=>s.color=colors[i%colors.length]);
const battles:[string,ReturnType<typeof L>,number,Position,string[],string,string[]?][]=[
 ['badr',L('Bataille de Badr','Battle of Badr','غزوة بدر'),624,[38.79,23.78],['medina-polity'],'Battle_of_Badr'],
 ['yarmouk',L('Bataille du Yarmouk','Battle of the Yarmuk','معركة اليرموك'),636,[35.95,32.82],['rashidun-caliphate'],'Battle_of_the_Yarmuk'],
 ['karbala',L('Bataille de Karbala','Battle of Karbala','معركة كربلاء'),680,[44.03,32.61],['umayyad-caliphate'],'Battle_of_Karbala'],
 ['talas',L('Bataille de Talas','Battle of Talas','معركة طلاس'),751,[71.37,42.9],['abbasid-caliphate'],'Battle_of_Talas'],
 ['hattin',L('Bataille de Hattin','Battle of Hattin','معركة حطين'),1187,[35.46,32.8],['ayyubid-sultanate'],'Battle_of_Hattin',['saladin']],
 ['ain-jalut',L('Bataille d’Aïn Jalout','Battle of Ain Jalut','معركة عين جالوت'),1260,[35.36,32.55],['mamluk-sultanate'],'Battle_of_Ain_Jalut'],
 ['las-navas',L('Bataille de Las Navas de Tolosa','Battle of Las Navas de Tolosa','معركة العقاب'),1212,[-3.58,38.29],['almohad-dynasty'],'Battle_of_Las_Navas_de_Tolosa']
];
for(const [id,name,year,coordinates,states,page,people=[]] of battles)newEvent(`event-${id}`,name,year,{coordinates,type:'approximate'},states,L(`${name.fr}, en ${year}. Le point situe la région du champ de bataille, dont le périmètre n’est pas restitué.`,`${name.en}, ${year}. The point locates the battlefield region; its perimeter is not reconstructed.`,`${name.ar} عام ${year}. تشير العلامة إلى منطقة المعركة ولا ترسم حدود ميدانها.`),page,people);
event('event-badr').startHijri=2;
newEvent('event-granada',L('Chute de Grenade','Fall of Granada','سقوط غرناطة'),1492,{cityId:'granada',type:'actual'},['nasrid-emirate'],L('La reddition de Grenade met fin au pouvoir nasride.','The surrender of Granada ends Nasrid rule.','أنهى تسليم غرناطة الحكم النصري.'),'Granada_War');event('event-granada').type='conquest';
function person(id:string,name:ReturnType<typeof L>,birth:number,death:number,birthPlace:string,deathPlace:string|null,roles:string[],states:string[],page:string,description:ReturnType<typeof L>){data.people.push({id,name,birthYear:birth,deathYear:death,birthPrecision:'circa',deathPrecision:'circa',birthPlace,deathPlace,roles,relatedStates:states,description,sources:[wiki(`source-${id}`,page)]});}
person('saladin',L('Saladin','Saladin','صلاح الدين الأيوبي'),1137,1193,'tikrit','damascus',['ruler'],['ayyubid-sultanate'],'Saladin',L('Fondateur du pouvoir ayyoubide en Égypte. Sa naissance est placée vers 1137–1138 ; il remporte la bataille de Hattin en 1187.','Founder of Ayyubid rule in Egypt, born around 1137–1138; victor at Hattin in 1187.','مؤسس الحكم الأيوبي في مصر، ولد نحو 1137–1138 وانتصر في حطين عام 1187.'));
person('ibn-sina',L('Ibn Sina · Avicenne','Ibn Sina · Avicenna','ابن سينا'),980,1037,'afshana','hamadan',['physician','philosopher'],['samanid-emirate','buyid-confederation'],'Avicenna',L('Médecin et philosophe, auteur du Canon de la médecine.','Physician and philosopher, author of The Canon of Medicine.','طبيب وفيلسوف وصاحب القانون في الطب.'));
person('al-khwarizmi',L('Al-Khwarizmi','Al-Khwarizmi','الخوارزمي'),780,850,'gurganj',null,['mathematician','astronomer'],['abbasid-caliphate'],'Al-Khwarizmi',L('Mathématicien et astronome lié à Bagdad. Le repère de naissance à Gurganj représente une attribution régionale incertaine au Khwarezm.','Mathematician and astronomer associated with Baghdad. The Gurganj birth marker represents an uncertain regional attribution to Khwarazm.','رياضي وفلكي ارتبط ببغداد. علامة الميلاد في جرجانية تمثل نسبة إقليمية غير مؤكدة إلى خوارزم.'));
person('ibn-battuta',L('Ibn Battuta','Ibn Battuta','ابن بطوطة'),1304,1369,'tangier',null,['traveller','jurist'],['marinid-sultanate'],'Ibn_Battuta',L('Voyageur originaire de Tanger, dont les récits sont rassemblés dans la Rihla. Sa date et son lieu de décès restent incertains.','Traveller from Tangier whose accounts are collected in the Rihla. The date and place of death remain uncertain.','رحالة من طنجة جمعت أخباره في الرحلة. تاريخ ومكان وفاته غير مؤكدين.'));
for(const [id,place] of [['harun-al-rashid','tus'],['ibn-rushd','marrakesh'],['ibn-khaldun','cairo']] as const){const p=data.people.find(p=>p.id===id)!;p.deathPlace=place;p.birthPrecision='circa';p.deathPrecision='exact';}
data.people.find(p=>p.id==='al-idrisi')!.birthPrecision='circa';data.people.find(p=>p.id==='al-idrisi')!.deathPrecision='circa';
data.people.find(p=>p.id==='al-khwarizmi')!.birthPlaceType='symbolic';
event('event-translations').relatedPeople.push('al-khwarizmi');
// Source pins are recorded from pages inspected during the editorial review.
const pins:Record<string,string>=JSON.parse(await readFile('docs/source-pins.json','utf8'));
for(const s of data.sources){if(!s.url.includes('en.wikipedia.org'))continue;const title=decodeURIComponent(s.url.split('/wiki/')[1]??'').replaceAll(' ','_');const pin=pins[title];if(pin){s.permanentUrl=pin;s.accessedDate='2026-09-29';s.verification='consulted';}}
data.sources.push({id:'source-natural-earth',title:'Natural Earth 110m land',author:'Natural Earth contributors',publicationYear:null,type:'other',url:'https://www.naturalearthdata.com/about/terms-of-use/',permanentUrl:'https://www.naturalearthdata.com/about/terms-of-use/',accessedDate:'2026-09-29',license:'Public domain',verification:'consulted',notes:L('Masque de terres modernes utilisé pour le découpage des côtes.','Modern land mask used to clip coastlines.','قناع لليابسة الحديثة لقص السواحل.')});
for(const s of data.states)for(const f of s.territories.features)f.properties.sources.push(ref('source-natural-earth','110m land — coastline mask only'));
const land=JSON.parse(await readFile('public/geography/land.geojson','utf8'));
const clipped=clipTerritories(data,land);
const validation=validateDataset(clipped);
if(!validation.data)throw new Error(JSON.stringify(validation.errors,null,2));
await writeFile('public/islamic-history.json',formatDataset(clipped));
await writeFile('islamic-history.json',formatDataset(clipped));
console.log(JSON.stringify({states:clipped.states.length,cities:clipped.cities.length,events:clipped.events.length,people:clipped.people.length,sources:clipped.sources.length,territories:clipped.states.reduce((n,s)=>n+s.territories.features.length,0)}));

}
main().catch(error=>{console.error(error);process.exitCode=1;});
