// Technical source probe. No data is altered or published.
const bbox='-7514065,-1252344,-6261721,0';
const wms=(root,layers)=>root+'?SERVICE=WMS&VERSION=1.1.1&REQUEST=GetMap&LAYERS='+encodeURIComponent(layers)+'&STYLES=&SRS=EPSG%3A3857&BBOX='+bbox+'&WIDTH=256&HEIGHT=256&FORMAT=image%2Fpng&TRANSPARENT=TRUE';
const urls=[
['RAISG WMS protected','https://geo.socioambiental.org/raisg/services/raisg/rg_srv_mapas_anps/MapServer/WMSServer?SERVICE=WMS&VERSION=1.1.1&REQUEST=GetCapabilities'],
['RAISG protected TILE',wms('https://geo.socioambiental.org/raisg/services/raisg/rg_srv_mapas_anps/MapServer/WMSServer','1,2,3,4,5,6')],
['RAISG WMS indigenous','https://geo.socioambiental.org/raisg/services/raisg/rg_srv_mapas_tis/MapServer/WMSServer?SERVICE=WMS&VERSION=1.1.1&REQUEST=GetCapabilities'],
['RAISG indigenous TILE',wms('https://geo.socioambiental.org/raisg/services/raisg/rg_srv_mapas_tis/MapServer/WMSServer','1')],
['RAISG REST layer query','https://geo2.socioambiental.org/raisg/rest/services/raisg/raisg_anps/MapServer/3/query?where=1%3D1&outFields=objectid%2Cnombre&resultRecordCount=1&returnGeometry=false&f=json'],
['ANM REST layer query','https://geo.anm.gov.br/arcgis/rest/services/SIGMINE/protecao_conservacao_natureza/MapServer/0/query?where=1%3D1&outFields=OBJECTID%2CNMUnidadeConservacao&resultRecordCount=1&returnGeometry=false&f=json'],
['ANM WMS','https://geo.anm.gov.br/arcgis/services/SIGMINE/protecao_conservacao_natureza/MapServer/WMSServer?SERVICE=WMS&VERSION=1.1.1&REQUEST=GetCapabilities'],
['ICMBio WMS','https://geoservicos.inde.gov.br/geoserver/ICMBio/ows?service=WMS&version=1.1.1&request=GetCapabilities'],
['ICMBio federal UCs TILE',wms('https://geoservicos.inde.gov.br/geoserver/ICMBio/ows','ICMBio:Limite de UC')],
['INFRASA UC FeatureServer','https://geo.infrasa.gov.br/server/rest/services/Hosted/Unidades_de_Conserva%C3%A7%C3%A3o_no_Brasil/FeatureServer/0/query?where=1%3D1&outFields=nomeuc%2Cgrupo&resultRecordCount=1&returnGeometry=false&f=json'],
['INFRASA UC geoJSON','https://geo.infrasa.gov.br/server/rest/services/Hosted/Unidades_de_Conserva%C3%A7%C3%A3o_no_Brasil/FeatureServer/0/query?where=1%3D1&outFields=nomeuc%2Cgrupo&resultRecordCount=1&returnGeometry=true&outSR=4326&f=geojson']
];
const results=[];
for(const [name,url] of urls){
  try {
    const res=await fetch(url,{signal:AbortSignal.timeout(15000),headers:{'Accept':'*/*'}});
    const bytes=Buffer.from(await res.arrayBuffer());
    const full=(res.headers.get('content-type')||'').includes('image/')?'binary image:'+bytes.subarray(0,8).toString('hex'):bytes.toString('utf8');
    const body=full.slice(0,1200);
    const names=[...full.matchAll(/<Name>\s*([^<]+)\s*<\/Name>/g)].map(x=>x[1]);
    results.push({name,status:res.status,type:res.headers.get('content-type'),length:bytes.length,bytePreview:body.slice(0,260),epsg3857:full.includes('EPSG:3857'),names:names.slice(0,35)});
  }catch(err){results.push({name,error:String(err?.message||err)})}
}
console.log('GIS SOURCE PROBE '+JSON.stringify(results));
