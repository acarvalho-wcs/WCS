// Verified public ArcGIS REST map services. Raster overlays are references, not crime evidence.
// Every visible image is requested for the current map tile; no fabricated polygons are stored.
const raisg = 'https://geo2.socioambiental.org/raisg/rest/services/raisg/';
const anm = 'https://geo.anm.gov.br/arcgis/rest/services/SIGMINE/protecao_conservacao_natureza/MapServer';
const exportTile = (service, layers, defs = '') =>
  service + '/export?f=image&format=png32&transparent=true&bbox={bbox-epsg-3857}' +
  '&bboxSR=3857&imageSR=3857&size=256%2C256&dpi=96' +
  '&layers=' + encodeURIComponent(layers) +
  (defs ? '&layerDefs=' + encodeURIComponent(JSON.stringify({ 0: defs })) : '');

export const territorialOverlays = [
  {
    id: 'protected_areas', color: '#36ad83', opacity: 0.76,
    tiles: [exportTile(raisg + 'raisg_anps/MapServer', 'show:2,3,4,5,6,7')],
    attribution: 'RAISG — Áreas Naturais Protegidas',
    info: 'https://www.raisg.org/pt-br/mapas/'
  },
  {
    id: 'indigenous_lands', color: '#e6bd65', opacity: 0.68,
    tiles: [exportTile(raisg + 'raisg_tis/MapServer', 'show:1')],
    attribution: 'RAISG — Territórios Indígenas',
    info: 'https://www.raisg.org/pt-br/mapas/'
  },
  {
    id: 'brazil_conservation_units', color: '#4d96d6', opacity: 0.72,
    tiles: [exportTile(anm, 'show:0')],
    attribution: 'ANM / ICMBio — Unidades de conservação brasileiras',
    info: 'https://geo.anm.gov.br/arcgis/rest/services/SIGMINE/protecao_conservacao_natureza/MapServer'
  },
  {
    id: 'strict_protection', color: '#8774d8', opacity: 0.73,
    tiles: [exportTile(anm, 'show:0', 'CDRestricao=1')],
    attribution: 'ANM / ICMBio — Proteção integral (CDRestricao=1)',
    info: 'https://geo.anm.gov.br/arcgis/rest/services/SIGMINE/protecao_conservacao_natureza/MapServer/0'
  },
  {
    id: 'sustainable_use', color: '#51b9bc', opacity: 0.73,
    tiles: [exportTile(anm, 'show:0', 'CDRestricao=2')],
    attribution: 'ANM / ICMBio — Uso sustentável (CDRestricao=2)',
    info: 'https://geo.anm.gov.br/arcgis/rest/services/SIGMINE/protecao_conservacao_natureza/MapServer/0'
  }
];

export const territorialOverlayIds = new Set(territorialOverlays.map((item) => item.id));

export function installTerritorialOverlays(map, active, theme) {
  if (!map || !map.isStyleLoaded()) return;
  const firstCrime = map.getLayer('crime-events') ? 'crime-events' : undefined;
  for (const spec of territorialOverlays) {
    const sourceId = 'territory-source-' + spec.id;
    const layerId = 'territory-' + spec.id;
    if (!map.getSource(sourceId)) {
      map.addSource(sourceId, {
        type: 'raster', tiles: spec.tiles, tileSize: 256,
        minzoom: 0, maxzoom: 15, attribution: spec.attribution
      });
    }
    if (!map.getLayer(layerId)) {
      map.addLayer({
        id: layerId, type: 'raster', source: sourceId,
        layout: { visibility: active.has(spec.id) ? 'visible' : 'none' },
        paint: {
          'raster-opacity': spec.opacity * (theme === 'dark' ? 0.92 : 1),
          'raster-fade-duration': 0
        }
      }, firstCrime);
    }
  }
}

export function setTerritorialVisibility(map, active) {
  if (!map || !map.isStyleLoaded()) return;
  for (const spec of territorialOverlays) {
    const layerId = 'territory-' + spec.id;
    if (map.getLayer(layerId)) {
      map.setLayoutProperty(layerId, 'visibility', active.has(spec.id) ? 'visible' : 'none');
    }
  }
}
