// Raster tiles are compiled from official RAISG/ANM services during GitHub deployment.
// The originals forbid cross-origin access from browser maps (CORS).
const raisg = 'https://geo2.socioambiental.org/raisg/rest/services/raisg/';
const anm = 'https://geo.anm.gov.br/arcgis/rest/services/SIGMINE/protecao_conservacao_natureza/MapServer';
const localTile=(id)=>[new URL('./assets/territory-tiles/'+id+'/',document.baseURI).toString()+'{z}/{x}/{y}.png'];

export const territorialOverlays = [
  {
    id: 'protected_areas', color: '#36ad83', opacity: 0.76,
    tiles: localTile('protected_areas'),
    attribution: 'RAISG — Áreas Naturais Protegidas',
    info: 'https://www.raisg.org/pt-br/mapas/'
  },
  {
    id: 'indigenous_lands', color: '#e6bd65', opacity: 0.68,
    tiles: localTile('indigenous_lands'),
    attribution: 'RAISG — Territórios Indígenas',
    info: 'https://www.raisg.org/pt-br/mapas/'
  },
  {
    id: 'brazil_conservation_units', color: '#4d96d6', opacity: 0.72,
    tiles: localTile('brazil_conservation_units'),
    attribution: 'ANM / ICMBio — Unidades de conservação brasileiras',
    info: 'https://geo.anm.gov.br/arcgis/rest/services/SIGMINE/protecao_conservacao_natureza/MapServer'
  },
  {
    id: 'strict_protection', color: '#8774d8', opacity: 0.73,
    tiles: localTile('strict_protection'),
    attribution: 'ANM / ICMBio — Proteção integral (CDRestricao=1)',
    info: 'https://geo.anm.gov.br/arcgis/rest/services/SIGMINE/protecao_conservacao_natureza/MapServer/0'
  },
  {
    id: 'sustainable_use', color: '#51b9bc', opacity: 0.73,
    tiles: localTile('sustainable_use'),
    attribution: 'ANM / ICMBio — Uso sustentável (CDRestricao=2)',
    info: 'https://geo.anm.gov.br/arcgis/rest/services/SIGMINE/protecao_conservacao_natureza/MapServer/0'
  }
];

export const territorialOverlayIds = new Set(territorialOverlays.map((item) => item.id));

export function installTerritorialOverlays(map, active, theme) {
  if (!map || !map.getStyle()) return;
  const firstCrime = map.getLayer('crime-events') ? 'crime-events' : undefined;
  for (const spec of territorialOverlays) {
    const sourceId = 'territory-source-' + spec.id;
    const layerId = 'territory-' + spec.id;
    if (!map.getSource(sourceId)) {
      map.addSource(sourceId, {
        type: 'raster', tiles: spec.tiles, tileSize: 256,
        minzoom: 0, maxzoom: 5, attribution: spec.attribution
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
  if (!map || !map.getStyle()) return;
  for (const spec of territorialOverlays) {
    const layerId = 'territory-' + spec.id;
    if (map.getLayer(layerId)) {
      map.setLayoutProperty(layerId, 'visibility', active.has(spec.id) ? 'visible' : 'none');
    }
  }
}
