// Cache official RAISG/ANM ArcGIS MapServer imagery during GitHub Pages deployment.
// The official services do not return Access-Control-Allow-Origin to browsers.
// These files are served only from GitHub Pages, with source credits preserved.
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const appRoot=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const destination=path.join(appRoot,'public/assets/territory-tiles');
const sources=[
  {id:'protected_areas',service:'https://geo2.socioambiental.org/raisg/rest/services/raisg/raisg_anps/MapServer',layers:'show:2,3,4,5,6,7'},
  {id:'indigenous_lands',service:'https://geo2.socioambiental.org/raisg/rest/services/raisg/raisg_tis/MapServer',layers:'show:1'},
  {id:'brazil_conservation_units',service:'https://geo.anm.gov.br/arcgis/rest/services/SIGMINE/protecao_conservacao_natureza/MapServer',layers:'show:0'},
  {id:'strict_protection',service:'https://geo.anm.gov.br/arcgis/rest/services/SIGMINE/protecao_conservacao_natureza/MapServer',layers:'show:0',definition:'CDRestricao=1'},
  {id:'sustainable_use',service:'https://geo.anm.gov.br/arcgis/rest/services/SIGMINE/protecao_conservacao_natureza/MapServer',layers:'show:0',definition:'CDRestricao=2'}
];
const b={west:-84,south:-21,east:-42,north:16};
const maxZoom=5; // Regional map coverage; MapLibre overscales raster above this level.
const lonX=(v,z)=>Math.floor((v+180)/360*2**z);
const latY=(v,z)=>Math.floor((1-Math.log(Math.tan(v*Math.PI/180)+1/Math.cos(v*Math.PI/180))/Math.PI)/2*2**z);
const E=20037508.342789244;
function exportUrl(spec,z,x,y){
  const n=2**z,side=2*E/n;
  const bbox=[-E+x*side,E-(y+1)*side,-E+(x+1)*side,E-y*side].join(',');
  const u=new URL(spec.service+'/export');
  for(const [k,v] of Object.entries({f:'image',format:'png32',transparent:'true',bbox,bboxSR:'3857',imageSR:'3857',size:'256,256',dpi:'96',layers:spec.layers}))u.searchParams.set(k,v);
  if(spec.definition)u.searchParams.set('layerDefs',JSON.stringify({0:spec.definition}));
  return u.toString();
}
async function requestImage(url){
  let last;
  for(let attempt=1;attempt<=3;attempt++){
    try{
      const res=await fetch(url,{signal:AbortSignal.timeout(18000),headers:{'User-Agent':'AmazonCrimes-GitHubPages-TileBuilder/1.0','Accept':'image/png,image/*'}});
      if(!res.ok)throw new Error('HTTP '+res.status);
      const bytes=Buffer.from(await res.arrayBuffer());
      const sig=Buffer.from([137,80,78,71,13,10,26,10]);
      if(bytes.length<75||!bytes.subarray(0,8).equals(sig))throw new Error('Not a PNG: '+res.headers.get('content-type')+' '+bytes.subarray(0,110).toString());
      return bytes;
    }catch(err){last=err; if(attempt<3)await new Promise(ok=>setTimeout(ok,attempt*350));}
  }
  throw last;
}
const tasks=[];
for(const spec of sources)for(let z=0;z<=maxZoom;z++){
 const x1=lonX(b.west,z),x2=lonX(b.east,z),y1=latY(b.north,z),y2=latY(b.south,z);
 for(let x=x1;x<=x2;x++)for(let y=y1;y<=y2;y++)tasks.push({spec,z,x,y});
}
let finished=0;const failed=[];
const bySource=Object.fromEntries(sources.map(x=>[x.id,0]));
async function worker(){
 while(tasks.length){
   const item=tasks.shift();
   const {spec,z,x,y}=item,output=path.join(destination,spec.id,String(z),String(x),y+'.png');
   try{
     const bytes=await requestImage(exportUrl(spec,z,x,y));
     await mkdir(path.dirname(output),{recursive:true});
     await writeFile(output,bytes);
     finished++;bySource[spec.id]++;
   }catch(error){
     failed.push({id:spec.id,z,x,y,error:String(error?.message||error)});
   }
 }
}
await Promise.all(Array.from({length:6},()=>worker()));
console.log('TERRITORY CACHE',JSON.stringify({finished,total:finished+failed.length,bySource,failed:failed.slice(0,12),minZoom:0,maxZoom}));
if(failed.length)throw new Error('Cannot publish incomplete GIS overlay tile cache ('+failed.length+' failures); preserving previous deployed site.');
