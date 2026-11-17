// Seven Amazonian mosaics reconstructed from the 2026 REMAP WCS geospatial PDF.
// These polygons are cartographic reconstructions, not authoritative GIS boundaries.
export const mosaicDefinitions = [
  { id: 'mosaic-01', name: 'Mosaico Lago de Tucuruí', number: 1, color: '#5AC8A3' },
  { id: 'mosaic-12', name: 'Mosaico Apuí', number: 12, color: '#DAA36A' },
  { id: 'mosaic-16', name: 'Mosaico Baixo Rio Negro', number: 16, color: '#48B1C8' },
  { id: 'mosaic-20', name: 'Mosaico da Amazônia Meridional', number: 20, color: '#B895DA' },
  { id: 'mosaic-22', name: 'Mosaico da Amazônia Oriental', number: 22, color: '#D8BD65' },
  { id: 'mosaic-28', name: 'Mosaico do Baixo Rio Madeira', number: 28, color: '#77C68A' },
  { id: 'mosaic-30', name: 'Mosaico do Gurupi', number: 30, color: '#DE8AAB' }
];

const cache = new Map();
const fetching = new Map();
const empty = () => ({ type: 'FeatureCollection', features: [] });
const sourceId = id => 'remap-source-' + id;
const fillId = id => 'remap-fill-' + id;
const lineId = id => 'remap-outline-' + id;

export function mosaicStatus(id) {
  if (cache.has(id)) return 'ready';
  if (fetching.has(id)) return 'loading';
  return 'idle';
}

export async function fetchMosaic(id) {
  if (!mosaicDefinitions.some(m => m.id === id)) throw new Error('Unknown mosaic ' + id);
  if (cache.has(id)) return cache.get(id);
  if (fetching.has(id)) return fetching.get(id);
  const url = new URL('./data/mosaics/' + id + '.geojson', document.baseURI);
  const promise = fetch(url, { cache: 'no-store' }).then(response => {
    if (!response.ok) throw new Error('Mosaic HTTP ' + response.status);
    return response.json();
  }).then(data => {
    if (data?.type !== 'FeatureCollection' || !Array.isArray(data.features) ||
        data.features.length !== 1 || data.features[0]?.properties?.id !== id) {
      throw new Error('Invalid REMAP geometry ' + id);
    }
    cache.set(id, data);
    return data;
  }).finally(() => fetching.delete(id));
  fetching.set(id, promise);
  return promise;
}

export function installMosaicLayers(map, active, theme) {
  if (!map?.isStyleLoaded()) return;
  const before = map.getLayer('crime-events') ? 'crime-events' : undefined;
  for (const item of mosaicDefinitions) {
    const sid = sourceId(item.id);
    const cached = cache.get(item.id) || empty();
    if (!map.getSource(sid)) {
      map.addSource(sid, { type: 'geojson', data: cached });
    }
    // No setData on every map resync: avoids repeated large data transfers.
    if (!map.getLayer(fillId(item.id))) {
      map.addLayer({
        id: fillId(item.id), type: 'fill', source: sid,
        layout: { visibility: active.has(item.id) ? 'visible' : 'none' },
        paint: { 'fill-color': item.color, 'fill-opacity': theme === 'dark' ? 0.22 : 0.16 }
      }, before);
    }
    if (!map.getLayer(lineId(item.id))) {
      map.addLayer({
        id: lineId(item.id), type: 'line', source: sid,
        layout: { visibility: active.has(item.id) ? 'visible' : 'none' },
        paint: { 'line-color': item.color, 'line-width': ['interpolate', ['linear'], ['zoom'], 2, 1.4, 7, 2.4, 12, 3.2], 'line-opacity': 0.96 }
      }, before);
    }
  }
}

export function syncMosaicLayers(map, active, theme) {
  if (!map?.isStyleLoaded()) return;
  installMosaicLayers(map, active, theme);
  for (const item of mosaicDefinitions) {
    const visible = active.has(item.id) ? 'visible' : 'none';
    for (const id of [fillId(item.id), lineId(item.id)]) {
      if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', visible);
    }
  }
}

export function refreshMosaicData(map, id) {
  if (!map?.isStyleLoaded() || !cache.has(id)) return;
  const source = map.getSource(sourceId(id));
  if (source) source.setData(cache.get(id));
}

export function interactiveMosaicLayerIds(map, active) {
  return mosaicDefinitions
    .filter(item => active.has(item.id) && map.getLayer(fillId(item.id)))
    .map(item => fillId(item.id));
}

export function mosaicByLayer(layerId) {
  return mosaicDefinitions.find(item => fillId(item.id) === layerId) || null;
}

export function mosaicExtent(id) {
  const geometry = cache.get(id)?.features?.[0]?.geometry;
  if (!geometry) return null;
  const polys = geometry.type === 'MultiPolygon' ? geometry.coordinates : [geometry.coordinates];
  const extent = [Infinity, Infinity, -Infinity, -Infinity];
  for (const poly of polys) for (const ring of poly) for (const [lon, lat] of ring) {
    extent[0] = Math.min(extent[0], lon);
    extent[1] = Math.min(extent[1], lat);
    extent[2] = Math.max(extent[2], lon);
    extent[3] = Math.max(extent[3], lat);
  }
  return extent.every(Number.isFinite) ? [[extent[0], extent[1]], [extent[2], extent[3]]] : null;
}
