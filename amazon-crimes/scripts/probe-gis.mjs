// Technical source probe. No data is altered or published.
const urls=[
['RAISG WMS protected','https://geo.socioambiental.org/raisg/services/raisg/rg_srv_mapas_anps/MapServer/WMSServer?SERVICE=WMS&VERSION=1.1.1&REQUEST=GetCapabilities'],
['RAISG WMS indigenous','https://geo.socioambiental.org/raisg/services/raisg/rg_srv_mapas_tis/MapServer/WMSServer?SERVICE=WMS&VERSION=1.1.1&REQUEST=GetCapabilities'],
['RAISG REST layer query','https://geo2.socioambiental.org/raisg/rest/services/raisg/raisg_anps/MapServer/3/query?where=1%3D1&outFields=objectid%2Cnombre&resultRecordCount=1&returnGeometry=false&f=json'],
['ANM REST layer query','https://geo.anm.gov.br/arcgis/rest/services/SIGMINE/protecao_conservacao_natureza/MapServer/0/query?where=1%3D1&outFields=OBJECTID%2CNMUnidadeConservacao&resultRecordCount=1&returnGeometry=false&f=json'],
['ANM WMS','https://geo.anm.gov.br/arcgis/services/SIGMINE/protecao_conservacao_natureza/MapServer/WMSServer?SERVICE=WMS&VERSION=1.1.1&REQUEST=GetCapabilities'],
['ICMBio WMS','https://geoservicos.inde.gov.br/geoserver/ICMBio/ows?service=WMS&version=1.1.1&request=GetCapabilities'],
['INFRASA UC FeatureServer','https://geo.infrasa.gov.br/server/rest/services/Hosted/Unidades_de_Conserva%C3%A7%C3%A3o_no_Brasil/FeatureServer/0/query?where=1%3D1&outFields=nomeuc%2Cgrupo&resultRecordCount=1&returnGeometry=false&f=json']
];
const results=[];
for(const [name,url] of urls){
  try {
    const res=await fetch(url,{signal:AbortSignal.timeout(15000),headers:{'Accept':'*/*'}});
    const full=await res.text();
    const body=full.slice(0,1200);
    const names=[...full.matchAll(/<Name>\s*([^<]+)\s*<\/Name>/g)].map(x=>x[1]);
    results.push({name,status:res.status,type:res.headers.get('content-type'),bytePreview:body.slice(0,260),names:names.slice(0,35)});
  }catch(err){results.push({name,error:String(err?.message||err)})}
}
console.log('GIS SOURCE PROBE '+JSON.stringify(results));
