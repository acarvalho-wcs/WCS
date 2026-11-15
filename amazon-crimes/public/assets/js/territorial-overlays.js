// Amazon territorial data are served by GitHub Pages to avoid GIS CORS failures.
// RAISG WMS tiles and a generalized INFRASA/ICMBio federal conservation dataset
// are prepared during the GitHub Actions deployment; sources credited below.
const localTiles=(id)=>[new URL('./assets/territory-tiles/'+id+'/',document.baseURI).toString()+'{z}/{x}/{y}.png'];
const brazilData=()=>new URL('./data/uc-federal.geojson',document.baseURI).toString();
export const territorialOverlays=[
 {id:'protected_areas',kind:'raster',color:'#36ad83',opacity:0.76,
  tiles:localTiles('protected_areas'),attribution:'RAISG — Áreas Naturais Protegidas',info:'https://www.raisg.org/pt-br/mapas/'},
 {id:'indigenous_lands',kind:'raster',color:'#e6bd65',opacity:0.68,
  tiles:localTiles('indigenous_lands'),attribution:'RAISG — Territórios Indígenas',info:'https://www.raisg.org/pt-br/mapas/'},
 {id:'brazil_conservation_units',kind:'geojson',color:'#4d96d6',opacity:0.48,
  source:'territory-source-brazil-federal-uc',attribution:'INFRASA / ICMBio / MMA — Unidades de conservação federais (visualização generalizada)',
  info:'https://geo.infrasa.gov.br/server/rest/services/Hosted/Unidades_de_Conserva%C3%A7%C3%A3o_no_Brasil/FeatureServer/0'},
 {id:'strict_protection',kind:'geojson',color:'#8774d8',opacity:0.53,group:'PI',
  source:'territory-source-brazil-federal-uc',attribution:'INFRASA / ICMBio / MMA — Proteção integral federal',
  info:'https://geo.infrasa.gov.br/server/rest/services/Hosted/Unidades_de_Conserva%C3%A7%C3%A3o_no_Brasil/FeatureServer/0'},
 {id:'sustainable_use',kind:'geojson',color:'#51b9bc',opacity:0.53,group:'US',
  source:'territory-source-brazil-federal-uc',attribution:'INFRASA / ICMBio / MMA — Uso sustentável federal',
  info:'https://geo.infrasa.gov.br/server/rest/services/Hosted/Unidades_de_Conserva%C3%A7%C3%A3o_no_Brasil/FeatureServer/0'}
];
export const territorialOverlayIds=new Set(territorialOverlays.map(x=>x.id));
export function installTerritorialOverlays(map,active,theme){
 if(!map||!map.getStyle?.())return;
 const before=map.getLayer('crime-events')?'crime-events':undefined;
 for(const spec of territorialOverlays){
   // Do not download a large federal polygon file unless the user chooses it.
   if(spec.kind==='geojson'&&!active.has(spec.id))continue;
   const sourceId=spec.kind==='raster'?'territory-source-'+spec.id:spec.source;
   const layerId='territory-'+spec.id;
   if(!map.getSource(sourceId)){
     if(spec.kind==='raster')map.addSource(sourceId,{
       type:'raster',tiles:spec.tiles,tileSize:256,minzoom:0,maxzoom:5,attribution:spec.attribution
     });
     else map.addSource(sourceId,{type:'geojson',data:brazilData(),attribution:spec.attribution});
   }
   if(!map.getLayer(layerId)){
     const layer=spec.kind==='raster'?{
       id:layerId,type:'raster',source:sourceId,
       layout:{visibility:active.has(spec.id)?'visible':'none'},
       paint:{'raster-opacity':spec.opacity*(theme==='dark'?0.92:1),'raster-fade-duration':0}
     }:{
       id:layerId,type:'fill',source:sourceId,
       layout:{visibility:active.has(spec.id)?'visible':'none'},
       ...(spec.group?{filter:['==',['get','grupo'],spec.group]}:{}),
       paint:{'fill-color':spec.color,'fill-opacity':spec.opacity,'fill-outline-color':spec.color}
     };
     map.addLayer(layer,before);
   }
 }
}
export function setTerritorialVisibility(map,active){
 if(!map||!map.getStyle?.())return;
 for(const spec of territorialOverlays){
   const id='territory-'+spec.id;
   if(map.getLayer(id))map.setLayoutProperty(id,'visibility',active.has(spec.id)?'visible':'none');
 }
}
