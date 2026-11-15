// GitHub Actions builds same-origin Amazon GIS imagery from official WMS sources.
// RAISG and INFRASA original geospatial datasets are credited on the public map.
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const destination=path.join(root,'public/assets/territory-tiles');
const sources=[
 {id:'protected_areas',service:'https://geo.socioambiental.org/raisg/services/raisg/rg_srv_mapas_anps/MapServer/WMSServer',layers:'1,2,3,4,5,6'},
 {id:'indigenous_lands',service:'https://geo.socioambiental.org/raisg/services/raisg/rg_srv_mapas_tis/MapServer/WMSServer',layers:'0'}
];
const limits={west:-84,south:-21,east:-42,north:16};
const maxZoom=5; // Regional overview; details above zoom 5 are raster-overscaled.
const lonX=(lon,z)=>Math.floor((lon+180)/360*2**z);
const latY=(lat,z)=>Math.floor((1-Math.log(Math.tan(lat*Math.PI/180)+1/Math.cos(lat*Math.PI/180))/Math.PI)/2*2**z);
const E=20037508.342789244;
function tileURL(spec,z,x,y){
 const side=2*E/(2**z),bbox=[-E+x*side,E-(y+1)*side,-E+(x+1)*side,E-y*side].join(',');
 const url=new URL(spec.service);
 for(const [key,value] of Object.entries({
   SERVICE:'WMS',VERSION:'1.1.1',REQUEST:'GetMap',LAYERS:spec.layers,STYLES:'',
   SRS:'EPSG:3857',BBOX:bbox,WIDTH:'256',HEIGHT:'256',FORMAT:'image/png',TRANSPARENT:'TRUE'
 }))url.searchParams.set(key,value);
 return url.toString();
}
async function fetchImage(url){
 let error;
 for(let retry=0;retry<3;retry++){
   try{
     const res=await fetch(url,{signal:AbortSignal.timeout(22000),headers:{Accept:'image/png,image/*'}});
     if(!res.ok)throw new Error('HTTP '+res.status);
     const ct=res.headers.get('content-type')||'';
     const data=Buffer.from(await res.arrayBuffer());
     if(!data.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))throw new Error('Not PNG ('+ct+'): '+data.subarray(0,160).toString());
     return data;
   }catch(e){error=e;if(retry<2)await new Promise(r=>setTimeout(r,400*(retry+1)));}
 }
 throw error;
}
const jobs=[];
for(const spec of sources)for(let z=0;z<=maxZoom;z++){
 const x1=lonX(limits.west,z),x2=lonX(limits.east,z),y1=latY(limits.north,z),y2=latY(limits.south,z);
 for(let x=x1;x<=x2;x++)for(let y=y1;y<=y2;y++)jobs.push({spec,z,x,y});
}
let made=0;const failures=[];
async function worker(){
 while(jobs.length){
   const {spec,z,x,y}=jobs.shift();
   try {
     const data=await fetchImage(tileURL(spec,z,x,y));
     const dir=path.join(destination,spec.id,String(z),String(x));
     await mkdir(dir,{recursive:true});
     await writeFile(path.join(dir,y+'.png'),data);
     made++;
   }catch(e){failures.push({layer:spec.id,z,x,y,error:String(e?.message||e)});}
 }
}
await Promise.all(Array.from({length:6},()=>worker()));
console.log('RAISG WMS CACHE',JSON.stringify({made,failed:failures.length,failures:failures.slice(0,12)}));
const indigenousTile=path.join(destination,'indigenous_lands','5','10','16.png');
const indigenousSample=await import('node:fs/promises').then(fs=>fs.stat(indigenousTile));
console.log('RAISG INDIGENOUS MANAUS TILE',JSON.stringify({path:indigenousTile,bytes:indigenousSample.size}));
if(indigenousSample.size<1500)throw new Error('Indigenous reference tile is unexpectedly empty; likely wrong WMS layer number.');
if(failures.length)throw new Error('Incomplete RAISG tile snapshot: '+failures.length+' missing images. Aborting deploy.');

// INFRASA hosted feature service integrates MMA and ICMBio data for federal UCs.
const gis='https://geo.infrasa.gov.br/server/rest/services/Hosted/Unidades_de_Conserva%C3%A7%C3%A3o_no_Brasil/FeatureServer/0/query';
const features=[];
const pointInAmazon=coord=>Array.isArray(coord)&&typeof coord[0]==='number'&&coord[0]>=-84&&coord[0]<=-42&&coord[1]>=-21&&coord[1]<=16;
function intersectsAmazon(value){
 if(!Array.isArray(value))return false;
 if(typeof value[0]==='number')return pointInAmazon(value);
 return value.some(intersectsAmazon);
}
for(let offset=0;offset<10000;offset+=400){
 const url=new URL(gis);
 for(const [key,value] of Object.entries({
  where:'1=1',outFields:'nomeuc,grupo',returnGeometry:'true',
  outSR:'4326',geometryPrecision:'5',maxAllowableOffset:'0.0005',resultRecordCount:'400',
  resultOffset:String(offset),f:'geojson'
 }))url.searchParams.set(key,value);
 const res=await fetch(url,{signal:AbortSignal.timeout(100000)});
 if(!res.ok)throw new Error('INFRASA data HTTP '+res.status);
 const json=await res.json();
 if(!Array.isArray(json.features))throw new Error('INFRASA missing GeoJSON features '+JSON.stringify(json).slice(0,300));
 for(const feature of json.features)if(feature.geometry?.coordinates&&intersectsAmazon(feature.geometry.coordinates))features.push(feature);
 console.log('INFRASA PAGE',offset,'downloaded',json.features.length,'selected',features.length);
 if(json.features.length<400 && !json.exceededTransferLimit)break;
 if(offset>=9600)throw new Error('INFRASA pagination limit');
}
const groups=[...new Set(features.map(x=>x.properties?.grupo).filter(Boolean))];
if(features.length<20||!groups.includes('PI')||!groups.includes('US'))throw new Error('Incomplete federal UC source '+JSON.stringify({count:features.length,groups}));
const file=path.join(root,'public/data/uc-federal.geojson');
await mkdir(path.dirname(file),{recursive:true});
await writeFile(file,JSON.stringify({type:'FeatureCollection',features}));
console.log('INFRASA FEDERAL UCs',JSON.stringify({count:features.length,groups,fileBytes:Buffer.byteLength(JSON.stringify(features))}));
