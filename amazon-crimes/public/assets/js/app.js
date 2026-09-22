import { translations } from './i18n.js';
import { crimeTypes, crimeTypeMeta, mapConfig, futureLayerGroups } from './config.js';

let language = localStorage.getItem('amazon-observatory-language') || 'pt';
let mapTheme = localStorage.getItem('amazon-observatory-theme') || 'dark';
let mapMode = localStorage.getItem('amazon-observatory-map-mode') || '2d';
if (mapMode === '3d') mapMode = 'globe';
let events = [];
let filteredEvents = [];
let radios = [];
let cameras = [];
let weatherStations = { type: 'FeatureCollection', features: [] };
let riverGauges = { type: 'FeatureCollection', features: [] };
let armedGroups = { type: 'FeatureCollection', features: [] };
let clandestineAirstrips = { type: 'FeatureCollection', features: [] };
let publicRoutes = { type: 'FeatureCollection', features: [] };
let fireHotspots = { type: 'FeatureCollection', features: [] };
let deforestationAlerts = { type: 'FeatureCollection', features: [] };
let amazonBoundary = { type: 'FeatureCollection', features: [] };
const dynamicLayerState = new Map();
let maplibregl = null;
let map;
let activePopup = null;
let layerRegistry = futureLayerGroups;
let mapResyncTimer = null;
let mapResyncNonce = 0;
let camera2d = null;
let cameraGlobe = null;
const htmlLayerMarkers = new Map();
const htmlMarkerLayerIds = new Set(['weather_stations', 'river_gauges', 'armed_groups', 'clandestine_airstrips', 'public_routes']);

// Layer state is intentionally session-scoped. Persisting visibility caused stale/empty
// layer selections to survive reloads and make valid events disappear from the map.
const activeCrimeLayers = new Set(crimeTypes);
const activeAuxLayers = new Set();
const state = { search: '', crimeType: 'all', status: 'all', timeWindow: 'all' };
let initialEventFitDone = false;

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const t = (key) => translations[language]?.[key] ?? translations.pt[key] ?? key;
const crimeLabel = (id) => crimeTypeMeta[id]?.label?.[language] || crimeTypeMeta[id]?.label?.pt || id;
const layerIdFor = (id) => `crime-${id.toLowerCase().replaceAll('_', '-')}`;
const iconNameFor = (id) => `pictogram-${id.toLowerCase().replaceAll('_', '-')}`;

const auxMeta = {
  fire_hotspots: { color: '#e85c2a', icon: 'fire', source: 'fire-hotspots', endpoint: './data/fire-hotspots.json', refreshMs: 10 * 60 * 1000, geometry: 'point' },
  deforestation_alerts: { color: '#e05a47', icon: 'deforestation', source: 'deforestation-alerts', endpoint: './data/deforestation-alerts.json', refreshMs: 60 * 60 * 1000, geometry: 'polygon' },
  radio_stations: { color: '#42a5d9', icon: 'radio', source: 'radios', geometry: 'point' },
  public_cameras: { color: '#816bd9', icon: 'camera', source: 'cameras', geometry: 'point' },
  weather_stations: { color: '#35b9c5', icon: 'weather', source: 'weather-stations', geometry: 'point' },
  river_gauges: { color: '#3f84f8', icon: 'gauge', source: 'river-gauges', geometry: 'point' },
  armed_groups: { color: '#cf5a5a', icon: 'security', source: 'armed-groups', geometry: 'point' },
  clandestine_airstrips: { color: '#d4a14e', icon: 'airstrip', source: 'clandestine-airstrips', geometry: 'point' },
  public_routes: { color: '#9d73df', icon: 'route', source: 'public-routes', geometry: 'line' },
  amazon_boundary: { color: '#8fd8b0', icon: 'protected', source: 'amazon-boundary', geometry: 'polygon', fixed: true }
};

const iconKindByCrime = {
  ILLEGAL_MINING: 'mining',
  ILLEGAL_LOGGING: 'logging',
  ILLEGAL_DEFORESTATION: 'deforestation',
  LAND_GRABBING: 'land',
  ILLEGAL_HUNTING: 'hunting',
  WILDLIFE_TRAFFICKING: 'wildlife',
  WILDLIFE_CRIME: 'wildlife',
  ILLEGAL_FISHING: 'fishing',
  ENVIRONMENTAL_CONTAMINATION: 'contamination',
  ARSON_ILLEGAL_FIRE: 'fire',
  PROTECTED_AREA_INVASION: 'protected',
  MULTIPLE_ENVIRONMENTAL_CRIMES: 'multiple',
  OTHER_ENVIRONMENTAL_CRIME: 'other'
};


async function loadMapLibrary() {
  const candidates = [
    'https://cdn.jsdelivr.net/npm/maplibre-gl@6.9.0/dist/maplibre-gl.mjs',
    'https://unpkg.com/maplibre-gl@6.9.0/dist/maplibre-gl.mjs'
  ];
  let lastError = null;
  for (const url of candidates) {
    try {
      return await import(url);
    } catch (error) {
      console.warn(`MapLibre load failed from ${url}`, error);
      lastError = error;
    }
  }
  throw lastError || new Error('map_library_unavailable');
}

function showMapUnavailable(error) {
  const container = $('#map');
  if (!container) return;
  container.innerHTML = `<div class="map-unavailable"><strong>${escapeHtml(t('mapUnavailable') || 'Mapa indisponível')}</strong><span>${escapeHtml(t('mapUnavailableHint') || 'Os dados continuam disponíveis no painel. Recarregue a página para tentar novamente.')}</span></div>`;
  console.error('Map initialization failed', error);
}

function initMap() {
  if (!maplibregl?.Map) throw new Error('map_library_unavailable');
  document.documentElement.dataset.theme = mapTheme;
  map = new maplibregl.Map({
    container: 'map',
    style: mapConfig.styles[mapTheme],
    center: mapConfig.center,
    zoom: mapMode === 'globe' ? 1.6 : mapConfig.zoom,
    minZoom: mapConfig.minZoom,
    maxZoom: mapConfig.maxZoom,
    pitch: 0,
    bearing: 0,
    antialias: true,
    attributionControl: true
  });
  map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'bottom-right');
  map.addControl(new maplibregl.ScaleControl({ maxWidth: 120, unit: 'metric' }), 'bottom-left');
  map.on('load', () => {
    rebuildMapData();
    applyMapMode(false);
    fitInitialEventsOnce();
    scheduleMapResync('initial-load', 60);
  });
  map.on('style.load', () => {
    rebuildMapData();
    applyMapMode(false);
    scheduleMapResync('style-load', 90);
  });
  map.on('click', handleMapClick);
  map.on('mousemove', handleMapHover);
  map.on('zoom', updateHtmlMarkerScale);
  // Projection/style changes should never be able to orphan the event source/layer.
  map.on('idle', () => {
    if (!map?.isStyleLoaded()) return;
    if (!map.getSource('events') || !map.getLayer('crime-events')) scheduleMapResync('idle-watchdog', 0);
  });
}


async function fetchJson(url) {
  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  return response.json();
}

async function fetchEvents() {
  const payload = await fetchJson('./data/events.json');
  return { ...payload, source: 'github_pages', data_updated_at: payload.generated_at };
}

async function loadData() {
  const [eventsResult, layersResult, radiosResult, camerasResult, weatherResult, gaugesResult, armedResult, airstripsResult, routesResult, boundaryResult] = await Promise.allSettled([
    fetchEvents(), fetchJson('./data/layers.json'), fetchJson('./data/radios-pages.json'), fetchJson('./data/cameras.json'), fetchJson('./data/weather-stations.json'), fetchJson('./data/river-gauges.json'), fetchJson('./data/armed-groups.json'), fetchJson('./data/clandestine-airstrips.json'), fetchJson('./data/public-routes.json'), fetchJson('./data/amazon-boundary.json')
  ]);

  if (eventsResult.status === 'fulfilled') {
    events = Array.isArray(eventsResult.value.events) ? eventsResult.value.events : [];
    const updatedAt = eventsResult.value.data_updated_at || eventsResult.value.generated_at;
    $('#last-updated').textContent = updatedAt ? new Date(updatedAt).toLocaleString(locale()) : '—';
  } else console.error(eventsResult.reason);

  if (layersResult.status === 'fulfilled' && Array.isArray(layersResult.value.groups)) layerRegistry = layersResult.value.groups;
  if (radiosResult.status === 'fulfilled') radios = Array.isArray(radiosResult.value.stations) ? radiosResult.value.stations : [];
  if (camerasResult.status === 'fulfilled') cameras = Array.isArray(camerasResult.value.cameras) ? camerasResult.value.cameras : [];
  if (weatherResult.status === 'fulfilled' && weatherResult.value?.type === 'FeatureCollection') weatherStations = weatherResult.value;
  if (gaugesResult.status === 'fulfilled' && gaugesResult.value?.type === 'FeatureCollection') riverGauges = gaugesResult.value;
  if (armedResult.status === 'fulfilled' && armedResult.value?.type === 'FeatureCollection') armedGroups = armedResult.value;
  if (airstripsResult.status === 'fulfilled' && airstripsResult.value?.type === 'FeatureCollection') clandestineAirstrips = airstripsResult.value;
  if (routesResult.status === 'fulfilled' && routesResult.value?.type === 'FeatureCollection') publicRoutes = routesResult.value;
  if (boundaryResult.status === 'fulfilled' && boundaryResult.value?.type === 'FeatureCollection') amazonBoundary = boundaryResult.value;

  renderLayerPanel();
  applyFilters();
  rebuildMapData();
  syncActiveDynamicLayers();
}

function locale() {
  return language === 'pt' ? 'pt-BR' : language === 'es' ? 'es-ES' : 'en-US';
}

function setLanguage(next) {
  language = next;
  localStorage.setItem('amazon-observatory-language', language);
  document.documentElement.lang = language === 'pt' ? 'pt-BR' : language;
  $$('[data-i18n]').forEach((el) => { el.textContent = t(el.dataset.i18n); });
  $$('[data-i18n-placeholder]').forEach((el) => { el.placeholder = t(el.dataset.i18nPlaceholder); });
  $$('.lang').forEach((button) => button.classList.toggle('active', button.dataset.lang === language));
  populateFilters();
  renderLayerPanel();
  render();
}

function populateFilters() {
  const crimeSelect = $('#crime-type');
  const currentCrime = state.crimeType;
  crimeSelect.innerHTML = `<option value="all">${escapeHtml(t('all'))}</option>` + crimeTypes.map((type) => `<option value="${type}">${escapeHtml(crimeLabel(type))}</option>`).join('');
  crimeSelect.value = currentCrime;

  const statuses = [['all', t('all')], ['CONFIRMED', t('confirmed')], ['VALIDATED', t('validatedStatus')], ['UNDER_REVIEW', t('underReview')], ['REJECTED', t('rejected')]];
  $('#validation-status').innerHTML = statuses.map(([value, label]) => `<option value="${value}">${escapeHtml(label)}</option>`).join('');
  $('#validation-status').value = state.status;

  const times = [['all', t('entireBase')], ['24h', t('last24')], ['7d', t('last7')], ['30d', t('last30')], ['year', t('currentYear')]];
  $('#time-window').innerHTML = times.map(([value, label]) => `<option value="${value}">${escapeHtml(label)}</option>`).join('');
  $('#time-window').value = state.timeWindow;
}

function eventDate(event) {
  return new Date(event.occurred_at || event.published_at || event.added_at || 0);
}

function isRecent(event, hours = 24) {
  if (event.backfill === true) return false;
  const date = new Date(event.added_at || event.published_at || event.occurred_at || 0);
  return !Number.isNaN(date.getTime()) && (Date.now() - date.getTime()) <= hours * 3600 * 1000;
}

function inTimeWindow(event, window) {
  if (window === 'all') return true;
  const date = eventDate(event);
  if (Number.isNaN(date.getTime())) return false;
  const ageMs = Date.now() - date.getTime();
  if (window === '24h') return ageMs <= 24 * 3600 * 1000;
  if (window === '7d') return ageMs <= 7 * 24 * 3600 * 1000;
  if (window === '30d') return ageMs <= 30 * 24 * 3600 * 1000;
  if (window === 'year') return date.getFullYear() === new Date().getFullYear();
  return true;
}

function applyFilters() {
  const q = state.search.trim().toLowerCase();
  filteredEvents = events.filter((event) => {
    const searchable = [
      localized(event.title), localized(event.summary), localized(event.case_context),
      event.location?.name, event.location?.admin1, event.location?.country,
      event.operation_name, ...(event.agencies || []), ...(event.species || []), ...(event.keywords || [])
    ].filter(Boolean).join(' ').toLowerCase();
    return (!q || searchable.includes(q)) &&
      (state.crimeType === 'all' || (event.crime_types || []).includes(state.crimeType)) &&
      (state.status === 'all' || event.validation_status === state.status) &&
      inTimeWindow(event, state.timeWindow);
  });
  render();
}

function render() {
  renderStats();
  renderFeed();
  renderCrimeBars();
  renderSignals();
  updateMapData();
  updateLayerVisibility();
}

function renderStats() {
  const validated = events.filter((e) => ['VALIDATED', 'CONFIRMED'].includes(e.validation_status)).length;
  const recent = events.filter((e) => isRecent(e)).length;
  const areas = new Set(events.map((e) => e.location?.admin1 || e.location?.country).filter(Boolean)).size;
  $('#stat-total').textContent = events.length.toLocaleString(locale());
  $('#stat-24h').textContent = recent.toLocaleString(locale());
  $('#stat-validated').textContent = validated.toLocaleString(locale());
  $('#stat-areas').textContent = areas.toLocaleString(locale());
}

function eventsGeoJson() {
  const features = filteredEvents.flatMap((event) => {
    const lat = Number(event.location?.lat);
    const lon = Number(event.location?.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return [];
    return [{
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [lon, lat] },
      properties: { id: event.id, source_kind: 'crime', primary_crime_type: event.primary_crime_type || 'OTHER_ENVIRONMENTAL_CRIME', recent: isRecent(event) ? 1 : 0, priority: event.priority || 'MEDIUM' }
    }];
  });
  return { type: 'FeatureCollection', features };
}

function radiosGeoJson() {
  return { type: 'FeatureCollection', features: radios.filter(validPoint).map((radio) => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [radio.lon, radio.lat] }, properties: { id: radio.id, source_kind: 'radio' } })) };
}

function camerasGeoJson() {
  return { type: 'FeatureCollection', features: cameras.filter(validPoint).map((camera) => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [camera.lon, camera.lat] }, properties: { id: camera.id, source_kind: 'camera' } })) };
}

function emptyFeatureCollection() { return { type: 'FeatureCollection', features: [] }; }

async function loadDynamicLayer(id, force = false) {
  const meta = auxMeta[id];
  if (!meta?.endpoint) return;
  const previous = dynamicLayerState.get(id) || {};
  if (previous.loading) return;
  if (!force && previous.loadedAt && Date.now() - previous.loadedAt < meta.refreshMs) return;
  dynamicLayerState.set(id, { ...previous, loading: true, error: null });
  renderLayerPanel();
  try {
    const payload = await fetchJson(meta.endpoint);
    const data = payload?.type === 'FeatureCollection' ? payload : emptyFeatureCollection();
    if (id === 'fire_hotspots') fireHotspots = data;
    if (id === 'deforestation_alerts') deforestationAlerts = data;
    dynamicLayerState.set(id, { loading: false, loadedAt: Date.now(), count: data.features?.length || 0, generatedAt: payload.generated_at || null, lastDetectedAt: payload.last_detected_at || null, newestSourceFile: payload.newest_source_file || null, truncated: Boolean(payload.truncated), error: null });
    updateDynamicMapSource(id);
  } catch (error) {
    console.error(`${id} unavailable`, error);
    dynamicLayerState.set(id, { ...previous, loading: false, loadedAt: previous.loadedAt || 0, count: previous.count || 0, error: error.message });
  }
  renderLayerPanel();
  updateLayerVisibility();
}

function syncActiveDynamicLayers() {
  ['fire_hotspots', 'deforestation_alerts'].forEach((id) => { if (activeAuxLayers.has(id)) loadDynamicLayer(id); });
}

function updateDynamicMapSource(id) {
  if (!map || !map.isStyleLoaded()) return;
  if (id === 'fire_hotspots') {
    const source = map.getSource('fire-hotspots');
    if (source) source.setData(fireHotspots); else rebuildMapData();
  }
  if (id === 'deforestation_alerts') {
    const source = map.getSource('deforestation-alerts');
    if (source) source.setData(deforestationAlerts); else rebuildMapData();
  }
}

function validPoint(item) { return Number.isFinite(item?.lat) && Number.isFinite(item?.lon); }

function cameraSnapshot() {
  if (!map) return null;
  const center = map.getCenter();
  return { center: [center.lng, center.lat], zoom: map.getZoom(), pitch: 0, bearing: 0 };
}

function fitInitialEventsOnce() {
  if (initialEventFitDone || !map || mapMode !== '2d' || !maplibregl?.LngLatBounds) return;
  const points = filteredEvents
    .map((e) => [Number(e.location?.lon), Number(e.location?.lat)])
    .filter(([lon, lat]) => Number.isFinite(lon) && Number.isFinite(lat));
  if (!points.length) return;
  const bounds = new maplibregl.LngLatBounds(points[0], points[0]);
  points.slice(1).forEach((point) => bounds.extend(point));
  initialEventFitDone = true;
  try { map.fitBounds(bounds, { padding: 54, maxZoom: 5.0, duration: 0 }); } catch (error) { console.warn('Initial event extent fit failed', error); }
}

function scheduleMapResync(reason = 'state-change', delay = 40, bumpNonce = true) {
  if (!map) return;
  if (bumpNonce) mapResyncNonce += 1;
  const nonce = mapResyncNonce;
  if (mapResyncTimer) clearTimeout(mapResyncTimer);
  const run = () => {
    if (!map || nonce !== mapResyncNonce) return;
    if (!map.isStyleLoaded()) {
      mapResyncTimer = setTimeout(run, 80);
      return;
    }
    try {
      rebuildMapData();
      updateMapData();
      updateLayerVisibility();
      map.triggerRepaint();
    } catch (error) {
      console.warn(`Map state resync failed (${reason})`, error);
    }
  };
  mapResyncTimer = setTimeout(run, delay);
}

function zoomScaledRadius(minRadius = 3.4, maxRadius = 8.2) {
  return ['interpolate', ['linear'], ['zoom'], 1, minRadius, 3, minRadius + 0.8, 6, minRadius + 1.9, 9, minRadius + 3.1, 12, maxRadius - 0.6, 16, maxRadius];
}

function ensureSource(id, data) {
  const source = map.getSource(id);
  if (source) source.setData(data);
  else map.addSource(id, { type: 'geojson', data, cluster: false });
}

function rebuildMapData() {
  if (!map || !map.isStyleLoaded()) return;
  ensureSource('events', eventsGeoJson());
  ensureSource('radios', radiosGeoJson());
  ensureSource('cameras', camerasGeoJson());
  ensureSource('weather-stations', weatherStations);
  ensureSource('river-gauges', riverGauges);
  ensureSource('armed-groups', armedGroups);
  ensureSource('clandestine-airstrips', clandestineAirstrips);
  ensureSource('public-routes', publicRoutes);
  ensureSource('fire-hotspots', fireHotspots);
  ensureSource('deforestation-alerts', deforestationAlerts);
  ensureSource('amazon-boundary', amazonBoundary);
  addAmazonBoundaryLayer();

  // One resilient event layer is more stable across Mercator <-> Globe projection changes
  // than a separate MapLibre layer for every crime category. Category toggles are
  // applied through a filter and colors remain category-specific.
  if (!map.getLayer('crime-events')) {
    const colorMatch = ['match', ['get', 'primary_crime_type']];
    crimeTypes.forEach((type) => { colorMatch.push(type, crimeTypeMeta[type]?.color || '#77b8ff'); });
    colorMatch.push('#7f8c8d');
    map.addLayer({
      id: 'crime-events', type: 'circle', source: 'events',
      layout: { visibility: activeCrimeLayers.size ? 'visible' : 'none' },
      paint: {
        // MapLibre requires the `zoom` expression to be the direct input of a
        // top-level interpolate/step expression. Nesting zoom interpolations inside
        // a `case` causes the layer creation to fail silently in some browsers.
        'circle-radius': [
          'interpolate', ['linear'], ['zoom'],
          1,  ['case', ['==', ['get', 'recent'], 1], 4.0, 3.4],
          3,  ['case', ['==', ['get', 'recent'], 1], 4.8, 4.2],
          6,  ['case', ['==', ['get', 'recent'], 1], 5.9, 5.3],
          9,  ['case', ['==', ['get', 'recent'], 1], 7.1, 6.5],
          12, ['case', ['==', ['get', 'recent'], 1], 8.2, 7.4],
          16, ['case', ['==', ['get', 'recent'], 1], 8.8, 8.0]
        ],
        'circle-color': ['case', ['==', ['get', 'recent'], 1], '#ff4f64', colorMatch],
        'circle-stroke-color': mapTheme === 'dark' ? '#0a0f0d' : '#ffffff',
        'circle-stroke-width': ['interpolate', ['linear'], ['zoom'], 1, 1.1, 8, 1.55, 16, 1.9],
        'circle-opacity': 0.96,
        'circle-blur': 0.01
      }
    });
  }

  if (!map.getLayer('crime-events')) {
    console.error('crime-events layer was not created');
  }

  addAuxCircleLayer('fire_hotspots', 'fire-hotspots', auxMeta.fire_hotspots.color, 2.2, 5.2);
  addDeforestationLayer();
  addAuxCircleLayer('radio_stations', 'radios', auxMeta.radio_stations.color, 3.4, 7.2);
  addAuxCircleLayer('public_cameras', 'cameras', auxMeta.public_cameras.color, 3.4, 7.2);
  addAuxLineLayer('public_routes', 'public-routes', auxMeta.public_routes.color);
  syncHtmlLayerMarkers();
  updateLayerVisibility();
}

function addAuxCircleLayer(id, source, color, minRadius = 3.2, maxRadius = 7.4) {
  const circleId = `aux-${id}`;
  if (!map.getLayer(circleId)) {
    map.addLayer({
      id: circleId, type: 'circle', source,
      layout: { visibility: activeAuxLayers.has(id) ? 'visible' : 'none' },
      paint: {
        'circle-radius': zoomScaledRadius(minRadius, maxRadius),
        'circle-color': color,
        'circle-stroke-color': mapTheme === 'dark' ? '#0a0f0d' : '#ffffff',
        'circle-stroke-width': ['interpolate', ['linear'], ['zoom'], 1, 1.0, 8, 1.45, 16, 1.8],
        'circle-opacity': id === 'fire_hotspots' ? 0.82 : 0.94,
        'circle-blur': id === 'fire_hotspots' ? 0.08 : 0.02
      }
    });
  }
}


function addAuxLineLayer(id, source, color) {
  const lineId = `aux-${id}`;
  if (!map.getLayer(lineId)) {
    map.addLayer({
      id: lineId, type: 'line', source,
      layout: { visibility: activeAuxLayers.has(id) ? 'visible' : 'none', 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': color,
        'line-width': ['interpolate', ['linear'], ['zoom'], 1, 1.4, 5, 2.1, 9, 3.0, 14, 4.2],
        'line-opacity': 0.88,
        'line-dasharray': [1.3, 1.0]
      }
    });
  }
}


function dataForHtmlMarkerLayer(id) {
  if (id === 'weather_stations') return weatherStations;
  if (id === 'river_gauges') return riverGauges;
  if (id === 'armed_groups') return armedGroups;
  if (id === 'clandestine_airstrips') return clandestineAirstrips;
  if (id === 'public_routes') return publicRoutes;
  return emptyFeatureCollection();
}

function featureAnchorCoordinates(feature) {
  const geometry = feature?.geometry;
  if (!geometry) return null;
  if (geometry.type === 'Point') return geometry.coordinates;
  if (geometry.type === 'LineString' && geometry.coordinates?.length) {
    const coords = geometry.coordinates;
    return coords[Math.floor(coords.length / 2)];
  }
  return null;
}

function markerScaleForZoom() {
  if (!map) return 1;
  const z = map.getZoom();
  return Math.max(0.84, Math.min(1.22, 0.84 + (z / 16) * 0.38));
}

function updateHtmlMarkerScale() {
  const scale = markerScaleForZoom();
  htmlLayerMarkers.forEach((markers) => {
    markers.forEach(({ element }) => element.style.setProperty('--marker-scale', scale.toFixed(3)));
  });
}

function clearHtmlLayerMarkers(id) {
  const markers = htmlLayerMarkers.get(id) || [];
  markers.forEach(({ marker }) => marker.remove());
  htmlLayerMarkers.delete(id);
}

function syncHtmlLayerMarkers() {
  if (!map || !maplibregl?.Marker) return;
  htmlMarkerLayerIds.forEach((id) => {
    clearHtmlLayerMarkers(id);
    if (!activeAuxLayers.has(id)) return;
    const meta = auxMeta[id];
    const collection = dataForHtmlMarkerLayer(id);
    const created = [];
    for (const feature of collection?.features || []) {
      const coordinates = featureAnchorCoordinates(feature);
      if (!Array.isArray(coordinates) || coordinates.length < 2) continue;
      const [lon, lat] = coordinates.map(Number);
      if (!Number.isFinite(lon) || !Number.isFinite(lat)) continue;
      const element = document.createElement('button');
      element.type = 'button';
      element.className = 'map-layer-icon-marker';
      element.style.setProperty('--swatch', meta?.color || '#7f8c8d');
      element.style.setProperty('--marker-scale', markerScaleForZoom().toFixed(3));
      element.setAttribute('aria-label', localizedProp(feature.properties || {}, 'name') || id);
      element.title = localizedProp(feature.properties || {}, 'name') || id;
      element.innerHTML = `<span class="layer-icon-marker">${iconSvg(meta?.icon || 'other')}</span>`;
      element.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        openReferenceLayerPopup(feature.properties || {}, { lng: lon, lat });
      });
      const marker = new maplibregl.Marker({ element, anchor: 'center' }).setLngLat([lon, lat]).addTo(map);
      created.push({ marker, element });
    }
    htmlLayerMarkers.set(id, created);
  });
}

function addAmazonBoundaryLayer() {
  if (!map.getLayer('amazon-boundary-fill')) {
    map.addLayer({
      id: 'amazon-boundary-fill', type: 'fill', source: 'amazon-boundary',
      paint: { 'fill-color': '#65b987', 'fill-opacity': mapTheme === 'dark' ? 0.055 : 0.045 }
    });
  }
  if (!map.getLayer('amazon-boundary-line')) {
    map.addLayer({
      id: 'amazon-boundary-line', type: 'line', source: 'amazon-boundary',
      paint: {
        'line-color': mapTheme === 'dark' ? '#d9f5e4' : '#23714a',
        'line-width': ['interpolate', ['linear'], ['zoom'], 1, 1.15, 5, 1.7, 9, 2.2],
        'line-opacity': 0.9,
        'line-dasharray': [2.5, 1.6]
      }
    });
  }
}

function addDeforestationLayer() {
  const visible = activeAuxLayers.has('deforestation_alerts') ? 'visible' : 'none';
  if (!map.getLayer('aux-deforestation_alerts')) {
    map.addLayer({
      id: 'aux-deforestation_alerts', type: 'fill', source: 'deforestation-alerts',
      layout: { visibility: visible },
      paint: {
        'fill-color': ['match', ['get', 'alert_class'],
          'MINERACAO', '#a56cc1',
          'CICATRIZ_DE_QUEIMADA', '#ea7c3f',
          'CS_DESORDENADO', '#c69c45',
          'CS_GEOMETRICO', '#d5b66b',
          'DEGRADACAO', '#e6b94e',
          'DESMATAMENTO_CR', '#e05243',
          'DESMATAMENTO_VEG', '#d95f4a',
          '#e05a47'
        ],
        'fill-opacity': mapTheme === 'dark' ? 0.30 : 0.24
      }
    });
  }
  if (!map.getLayer('aux-outline-deforestation_alerts')) {
    map.addLayer({
      id: 'aux-outline-deforestation_alerts', type: 'line', source: 'deforestation-alerts',
      layout: { visibility: visible },
      paint: { 'line-color': '#ffffff', 'line-width': ['interpolate', ['linear'], ['zoom'], 3, 0.6, 9, 1.5], 'line-opacity': 0.82 }
    });
  }
}

function updateMapData() {
  if (!map || !map.isStyleLoaded()) return;
  if (map.getSource('events')) map.getSource('events').setData(eventsGeoJson()); else rebuildMapData();
  if (map.getSource('radios')) map.getSource('radios').setData(radiosGeoJson());
  if (map.getSource('cameras')) map.getSource('cameras').setData(camerasGeoJson());
  if (map.getSource('weather-stations')) map.getSource('weather-stations').setData(weatherStations);
  if (map.getSource('river-gauges')) map.getSource('river-gauges').setData(riverGauges);
  if (map.getSource('armed-groups')) map.getSource('armed-groups').setData(armedGroups);
  if (map.getSource('clandestine-airstrips')) map.getSource('clandestine-airstrips').setData(clandestineAirstrips);
  if (map.getSource('public-routes')) map.getSource('public-routes').setData(publicRoutes);
  if (map.getSource('fire-hotspots')) map.getSource('fire-hotspots').setData(fireHotspots);
  if (map.getSource('deforestation-alerts')) map.getSource('deforestation-alerts').setData(deforestationAlerts);
  if (map.getSource('amazon-boundary')) map.getSource('amazon-boundary').setData(amazonBoundary);
}

function updateLayerVisibility() {
  $('#active-layer-count').textContent = String(activeCrimeLayers.size + activeAuxLayers.size + 1);
  $$('.crime-layer-toggle').forEach((input) => { input.checked = activeCrimeLayers.has(input.value); });
  $$('.aux-layer-toggle').forEach((input) => { input.checked = activeAuxLayers.has(input.value); });
  if (!map || !map.isStyleLoaded()) return;

  const crimeLayer = 'crime-events';
  if (map.getLayer(crimeLayer)) {
    map.setLayoutProperty(crimeLayer, 'visibility', activeCrimeLayers.size ? 'visible' : 'none');
    const enabled = [...activeCrimeLayers];
    map.setFilter(crimeLayer, enabled.length
      ? ['in', ['get', 'primary_crime_type'], ['literal', enabled]]
      : ['==', 1, 0]);
  }

  ['fire_hotspots', 'radio_stations', 'public_cameras', 'public_routes'].forEach((id) => {
    const layerId = `aux-${id}`;
    if (map.getLayer(layerId)) map.setLayoutProperty(layerId, 'visibility', activeAuxLayers.has(id) ? 'visible' : 'none');
  });
  ['aux-deforestation_alerts', 'aux-outline-deforestation_alerts'].forEach((layerId) => { if (map.getLayer(layerId)) map.setLayoutProperty(layerId, 'visibility', activeAuxLayers.has('deforestation_alerts') ? 'visible' : 'none'); });
  syncHtmlLayerMarkers();
}

function interactiveLayerIds() {
  const ids = map.getLayer('crime-events') && activeCrimeLayers.size ? ['crime-events'] : [];
  if (activeAuxLayers.has('radio_stations') && map.getLayer('aux-radio_stations')) ids.push('aux-radio_stations');
  if (activeAuxLayers.has('public_cameras') && map.getLayer('aux-public_cameras')) ids.push('aux-public_cameras');
  if (activeAuxLayers.has('fire_hotspots') && map.getLayer('aux-fire_hotspots')) ids.push('aux-fire_hotspots');
  if (activeAuxLayers.has('public_routes') && map.getLayer('aux-public_routes')) ids.push('aux-public_routes');
  if (activeAuxLayers.has('deforestation_alerts') && map.getLayer('aux-deforestation_alerts')) ids.push('aux-deforestation_alerts');
  return ids;
}

function handleMapClick(e) {
  const candidateLayers = interactiveLayerIds();
  if (!candidateLayers.length) return;
  const feature = map.queryRenderedFeatures(e.point, { layers: candidateLayers })[0];
  if (!feature) return;
  const kind = feature.properties.source_kind;
  if (kind === 'crime') {
    const event = events.find((item) => item.id === feature.properties.id);
    if (event) openEventPopup(event, e.lngLat);
  } else if (kind === 'radio') {
    const radio = radios.find((item) => item.id === feature.properties.id);
    if (radio) openRadioPopup(radio, e.lngLat);
  } else if (kind === 'camera') {
    const camera = cameras.find((item) => item.id === feature.properties.id);
    if (camera) openCameraPopup(camera, e.lngLat);
  } else if (kind === 'fire_hotspot') {
    openFireHotspotPopup(feature.properties, e.lngLat);
  } else if (kind === 'deforestation_alert') {
    openDeforestationPopup(feature.properties, e.lngLat);
  } else if (['weather_station', 'river_gauge', 'armed_group', 'clandestine_airstrip', 'public_route'].includes(kind)) {
    openReferenceLayerPopup(feature.properties, e.lngLat);
  }
}

function handleMapHover(e) {
  const candidateLayers = interactiveLayerIds();
  if (!candidateLayers.length) return;
  const feature = map.queryRenderedFeatures(e.point, { layers: candidateLayers })[0];
  map.getCanvas().style.cursor = feature ? 'pointer' : '';
}

function openEventPopup(event, lngLat = null) {
  closePopup();
  const coordinates = lngLat || { lng: event.location.lon, lat: event.location.lat };
  activePopup = new maplibregl.Popup({ closeButton: true, maxWidth: '440px', offset: 14 })
    .setLngLat(coordinates)
    .setHTML(eventPopupHtml(event))
    .addTo(map);
  hydrateEventMedia(event, activePopup.getElement());
}

function eventPopupHtml(event) {
  const source = event.sources?.[0];
  const media = (event.source_media || []).filter((m) => m.type === 'image' && m.url);
  const location = [event.location?.name, event.location?.admin1, event.location?.country].filter(Boolean).join(' • ');
  const fallbackImages = media.map((m) => `<a class="source-image" href="${escapeAttr(m.url)}" target="_blank" rel="noopener noreferrer"><img src="${escapeAttr(m.url)}" alt="${escapeAttr(localized(m.caption) || t('sourceImages'))}" loading="lazy" decoding="async" referrerpolicy="no-referrer" onerror="this.closest('a').classList.add('image-load-failed')" /><span>${escapeHtml(m.credit || source?.publisher || '')}</span></a>`).join('');
  const images = `<div class="popup-section"><span class="popup-label">${escapeHtml(t('sourceImages'))}</span><div class="source-gallery source-gallery-auto" data-event-media-id="${escapeAttr(event.id)}">${fallbackImages || `<div class="media-loading">${escapeHtml(t('loading'))}…</div>`}</div></div>`;
  const tags = (event.crime_types || []).map((type) => `<span class="popup-tag" style="--tag-color:${escapeAttr(crimeTypeMeta[type]?.color || '#777')}">${escapeHtml(crimeLabel(type))}</span>`).join('');
  return `<article class="event-popup">
    <div class="popup-topline"><span class="popup-status">${escapeHtml(event.validation_status || '')}</span>${event.backfill ? `<span class="popup-backfill">${escapeHtml(t('backfill'))}</span>` : ''}</div>
    <h3>${escapeHtml(localized(event.title))}</h3>
    <div class="popup-location">${escapeHtml(location)}</div>
    <div class="popup-tags">${tags}</div>
    <p>${escapeHtml(localized(event.summary))}</p>
    ${images}
    <div class="popup-section"><span class="popup-label">${escapeHtml(t('caseContext'))}</span><p>${escapeHtml(localized(event.case_context))}</p></div>
    <dl class="popup-facts">
      <div><dt>${escapeHtml(t('eventDate'))}</dt><dd>${escapeHtml(formatDateTime(event.occurred_at))}</dd></div>
      <div><dt>${escapeHtml(t('publishedDate'))}</dt><dd>${escapeHtml(formatDateTime(event.published_at))}</dd></div>
      <div><dt>${escapeHtml(t('mapPrecision'))}</dt><dd>${escapeHtml(event.location?.precision || '—')}</dd></div>
    </dl>
    ${event.legal_status_note ? `<div class="legal-note"><strong>${escapeHtml(t('legalNote'))}:</strong> ${escapeHtml(event.legal_status_note)}</div>` : ''}
    ${source?.url ? `<a class="source-button" href="${escapeAttr(source.url)}" target="_blank" rel="noopener noreferrer">↗ ${escapeHtml(t('viewSource'))} · ${escapeHtml(source.publisher || '')}</a>` : ''}
  </article>`;
}


async function hydrateEventMedia(event, popupEl) {
  const holder = popupEl?.querySelector('.source-gallery-auto');
  if (!holder) return;
  const media = (event.source_media || []).filter((m) => m.type === 'image' && m.url);
  if (media.length) return;
  holder.innerHTML = `<div class="popup-empty-media">${escapeHtml(t('noSourceImages'))}</div>`;
}

function openRadioPopup(radio, lngLat) {
  closePopup();
  const html = `<article class="sensor-popup radio-popup">
    <div class="sensor-title-row">${iconSvg('radio')}<div><span class="sensor-kicker">${escapeHtml(t('liveRadio'))}</span><h3>${escapeHtml(radio.name)}</h3></div></div>
    <p>${escapeHtml([radio.city, radio.state, radio.country].filter(Boolean).join(' • '))}</p>
    <div class="radio-player">
      <button class="radio-play-button" type="button">${escapeHtml(t('playHere'))}</button>
      <div class="radio-player-status">${escapeHtml(t('radioInlineHint'))}</div>
      <audio class="radio-audio" controls preload="none" hidden></audio>
    </div>
    <dl class="sensor-facts"><div><dt>${escapeHtml(t('provider'))}</dt><dd>${escapeHtml(radio.provider || '—')}</dd></div><div><dt>${escapeHtml(t('mapPrecision'))}</dt><dd>${escapeHtml(radio.location_precision || '—')}</dd></div></dl>
    <a class="source-button secondary-source-button" href="${escapeAttr(radio.url)}" target="_blank" rel="noopener noreferrer">↗ ${escapeHtml(t('openRadioDirectory'))}</a>
  </article>`;
  activePopup = new maplibregl.Popup({ closeButton: true, maxWidth: '420px', offset: 14 }).setLngLat(lngLat).setHTML(html).addTo(map);
  hydrateRadioPlayer(radio, activePopup.getElement());
}

function hydrateRadioPlayer(radio, popupEl) {
  const button = popupEl?.querySelector('.radio-play-button');
  const status = popupEl?.querySelector('.radio-player-status');
  const audio = popupEl?.querySelector('.radio-audio');
  if (!button || !status || !audio) return;
  const streams = Array.isArray(radio.streams) && radio.streams.length
    ? radio.streams
    : (radio.stream_url ? [{ stream_url: radio.stream_url, provider: radio.stream_provider || radio.provider }] : []);
  let streamIndex = -1;

  const playStream = async (index) => {
    if (!streams[index]) return false;
    streamIndex = index;
    const candidate = streams[index];
    audio.src = candidate.stream_url || candidate.url || '';
    audio.hidden = false;
    status.textContent = `${t('radioTryingStream')} ${index + 1}/${streams.length} · ${candidate.provider || ''}`;
    try {
      await audio.play();
      status.textContent = `${t('radioPlayingHere')} ${candidate.provider ? `· ${candidate.provider}` : ''}`;
      return true;
    } catch (error) {
      if (error?.name === 'NotAllowedError') {
        status.textContent = t('pressAudioPlay');
        return true;
      }
      return false;
    }
  };

  const tryNext = async () => {
    const next = streamIndex + 1;
    if (next >= streams.length) {
      status.textContent = t('radioUnavailable');
      button.textContent = t('retry');
      button.disabled = false;
      return;
    }
    const ok = await playStream(next);
    if (!ok) tryNext();
  };

  audio.addEventListener('error', () => { tryNext(); });
  button.addEventListener('click', async () => {
    button.disabled = true;
    status.textContent = `${t('loading')}…`;
    if (!streams.length) {
      status.textContent = t('radioUnavailable');
      button.textContent = t('retry');
      button.disabled = false;
      return;
    }
    streamIndex = -1;
    button.textContent = t('reconnectRadio');
    button.disabled = false;
    await tryNext();
  });
}

function openCameraPopup(camera, lngLat) {
  closePopup();
  const canEmbed = Boolean(camera.embed_url);
  const html = `<article class="sensor-popup camera-popup">
    <div class="sensor-title-row">${iconSvg('camera')}<div><span class="sensor-kicker">${escapeHtml(t('liveCamera'))}</span><h3>${escapeHtml(localized(camera.name))}</h3></div></div>
    <p>${escapeHtml([camera.city, camera.state, camera.country].filter(Boolean).join(' • '))}</p>
    <div class="camera-lazy" data-camera-id="${escapeAttr(camera.id)}">${canEmbed ? `<button class="camera-load-button" type="button">${escapeHtml(t('loadLiveCamera'))}</button><small>${escapeHtml(t('cameraPrivacyHint'))}</small>` : `<div class="legal-note">${escapeHtml(t('cameraExternalOnly'))}</div>`}</div>
    <dl class="sensor-facts"><div><dt>${escapeHtml(t('provider'))}</dt><dd>${escapeHtml(camera.provider || '—')}</dd></div><div><dt>${escapeHtml(t('mapPrecision'))}</dt><dd>${escapeHtml(camera.location_precision || '—')}</dd></div></dl>
    <a class="source-button" href="${escapeAttr(camera.original_url || camera.public_url)}" target="_blank" rel="noopener noreferrer">↗ ${escapeHtml(t('openOriginalStream'))}</a>
    ${camera.fallback_url ? `<a class="source-button secondary-source-button" href="${escapeAttr(camera.fallback_url)}" target="_blank" rel="noopener noreferrer">↗ ${escapeHtml(t('openAlternativeCamera'))}</a>` : ''}
  </article>`;
  activePopup = new maplibregl.Popup({ closeButton: true, maxWidth: '470px', offset: 14 }).setLngLat(lngLat).setHTML(html).addTo(map);
  const popupEl = activePopup.getElement();
  const button = popupEl?.querySelector('.camera-load-button');
  button?.addEventListener('click', () => {
    const holder = popupEl.querySelector('.camera-lazy');
    if (!holder || !camera.embed_url) return;
    holder.innerHTML = `<div class="camera-frame"><iframe src="${escapeAttr(camera.embed_url)}" title="${escapeAttr(localized(camera.name))}" loading="lazy" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe></div><small>${escapeHtml(t('cameraEmbedFallbackHint'))}</small>`;
  }, { once: true });
}


function genericLayerKicker(kind) {
  if (kind === 'weather_station') return t('weatherStation');
  if (kind === 'river_gauge') return t('riverGauge');
  if (kind === 'armed_group') return t('securitySignal');
  if (kind === 'clandestine_airstrip') return t('clandestineAirstrip');
  if (kind === 'public_route') return t('publicRoute');
  return t('layers');
}

function iconKindForReference(kind) {
  if (kind === 'weather_station') return 'weather';
  if (kind === 'river_gauge') return 'gauge';
  if (kind === 'armed_group') return 'security';
  if (kind === 'clandestine_airstrip') return 'airstrip';
  if (kind === 'public_route') return 'route';
  return 'other';
}

function localizedProp(properties, baseKey) {
  return properties?.[`${baseKey}_${language}`] || properties?.[baseKey] || properties?.[`${baseKey}_pt`] || properties?.[`${baseKey}_en`] || properties?.[`${baseKey}_es`] || '';
}

function referenceLayerFacts(properties) {
  const kind = properties?.source_kind;
  if (kind === 'weather_station') return [
    [t('operatorNetwork'), properties.network || properties.agency],
    [t('stationType'), properties.station_type],
    [t('variables'), properties.variables],
    [t('mapPrecision'), properties.precision]
  ];
  if (kind === 'river_gauge') return [
    [t('river'), properties.river],
    [t('operatorNetwork'), properties.network || properties.agency],
    [t('variables'), properties.variables],
    [t('mapPrecision'), properties.precision]
  ];
  if (['armed_group', 'clandestine_airstrip', 'public_route'].includes(kind)) return [
    [t('signalType'), properties.signal_type],
    [t('status'), properties.status],
    [t('evidenceLevel'), properties.evidence_level],
    [t('modality'), properties.modality],
    [t('mapPrecision'), properties.precision]
  ];
  return [
    [t('provider'), properties.agency],
    [t('mapPrecision'), properties.precision],
    [t('status'), properties.status]
  ];
}

function openReferenceLayerPopup(properties, lngLat) {
  closePopup();
  const title = localizedProp(properties, 'name') || properties?.id || t('layers');
  const location = properties?.location || '—';
  const kind = properties?.source_kind;
  const facts = referenceLayerFacts(properties).filter(([, value]) => value);
  const securityLike = ['armed_group', 'clandestine_airstrip', 'public_route'].includes(kind);
  const note = properties?.data_note || properties?.caution || properties?.summary;
  const html = `<article class="sensor-popup generic-layer-popup">
    <div class="sensor-title-row">${iconSvg(iconKindForReference(kind))}<div><span class="sensor-kicker">${escapeHtml(genericLayerKicker(kind))}</span><h3>${escapeHtml(title)}</h3></div></div>
    <p>${escapeHtml(location)}</p>
    ${securityLike && properties?.caution ? `<div class="legal-note">${escapeHtml(properties.caution)}</div>` : ''}
    <dl class="sensor-facts reference-facts">${facts.map(([label, value]) => `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`).join('')}</dl>
    ${note && !(securityLike && note === properties.caution) ? `<div class="popup-section"><span class="popup-label">${escapeHtml(t('note'))}</span><p>${escapeHtml(note)}</p></div>` : ''}
    ${properties?.source_url ? `<a class="source-button" href="${escapeAttr(properties.source_url)}" target="_blank" rel="noopener noreferrer">↗ ${escapeHtml(t('openReference'))}</a>` : ''}
  </article>`;
  activePopup = new maplibregl.Popup({ closeButton: true, maxWidth: '450px', offset: 14 }).setLngLat(lngLat).setHTML(html).addTo(map);
}

function openFireHotspotPopup(properties, lngLat) {
  closePopup();
  const location = [properties.municipality, properties.state, properties.country].filter(Boolean).join(' • ');
  const html = `<article class="sensor-popup">
    <div class="sensor-title-row">${iconSvg('fire')}<div><span class="sensor-kicker">${escapeHtml(t('fireHotspot'))}</span><h3>${escapeHtml(location || t('satelliteDetection'))}</h3></div></div>
    <div class="legal-note">${escapeHtml(t('fireHotspotDisclaimer'))}</div>
    <dl class="sensor-facts">
      <div><dt>${escapeHtml(t('detectedAt'))}</dt><dd>${escapeHtml(formatDateTime(properties.detected_at))}</dd></div>
      <div><dt>${escapeHtml(t('satellite'))}</dt><dd>${escapeHtml(properties.satellite || '—')}</dd></div>
      <div><dt>FRP</dt><dd>${properties.frp_mw ? `${escapeHtml(properties.frp_mw)} MW` : '—'}</dd></div>
      <div><dt>${escapeHtml(t('fireRisk'))}</dt><dd>${properties.fire_risk === null || properties.fire_risk === undefined ? '—' : escapeHtml(Number(properties.fire_risk).toFixed(2))}</dd></div>
    </dl>
    <a class="source-button" href="${escapeAttr(properties.source_url || 'https://terrabrasilis.dpi.inpe.br/queimadas/portal/dados-abertos/')}" target="_blank" rel="noopener noreferrer">↗ ${escapeHtml(t('viewSource'))} · INPE</a>
  </article>`;
  activePopup = new maplibregl.Popup({ closeButton: true, maxWidth: '420px', offset: 12 }).setLngLat(lngLat).setHTML(html).addTo(map);
}

function openDeforestationPopup(properties, lngLat) {
  closePopup();
  const location = [properties.municipality, properties.state].filter(Boolean).join(' • ');
  const area = Number(properties.area_km2);
  const html = `<article class="sensor-popup">
    <div class="sensor-title-row">${iconSvg('deforestation')}<div><span class="sensor-kicker">${escapeHtml(t('deterAlert'))}</span><h3>${escapeHtml(location || properties.alert_class || t('deforestationAlert'))}</h3></div></div>
    <div class="legal-note">${escapeHtml(t('deterDisclaimer'))}</div>
    <dl class="sensor-facts">
      <div><dt>${escapeHtml(t('alertClass'))}</dt><dd>${escapeHtml(properties.alert_class || '—')}</dd></div>
      <div><dt>${escapeHtml(t('alertDate'))}</dt><dd>${escapeHtml(formatDateTime(properties.alert_date))}</dd></div>
      <div><dt>${escapeHtml(t('area'))}</dt><dd>${Number.isFinite(area) && area > 0 ? `${area.toLocaleString(locale(), { maximumFractionDigits: 3 })} km²` : '—'}</dd></div>
      <div><dt>${escapeHtml(t('satellite'))}</dt><dd>${escapeHtml([properties.satellite, properties.sensor].filter(Boolean).join(' / ') || '—')}</dd></div>
    </dl>
    ${properties.protected_area ? `<p><strong>${escapeHtml(t('protectedArea'))}:</strong> ${escapeHtml(properties.protected_area)}</p>` : ''}
    <a class="source-button" href="${escapeAttr(properties.source_url || 'https://terrabrasilis.dpi.inpe.br/')}" target="_blank" rel="noopener noreferrer">↗ ${escapeHtml(t('viewSource'))} · TerraBrasilis</a>
  </article>`;
  activePopup = new maplibregl.Popup({ closeButton: true, maxWidth: '440px', offset: 10 }).setLngLat(lngLat).setHTML(html).addTo(map);
}

function closePopup() {
  if (activePopup) {
    const audio = activePopup.getElement()?.querySelector?.('audio');
    try { audio?.pause(); if (audio) audio.src = ''; } catch {}
    activePopup.remove();
    activePopup = null;
  }
}

function localized(value) {
  if (!value) return '';
  if (typeof value === 'string') return value;
  return value[language] || value.pt || value.en || value.es || '';
}

function renderFeed() {
  const container = $('#event-feed');
  $('#feed-count').textContent = filteredEvents.length;
  if (!filteredEvents.length) {
    container.innerHTML = `<div class="empty-state"><strong>${escapeHtml(t('noEvents'))}</strong><span>${escapeHtml(t('emptyHint'))}</span></div>`;
    return;
  }
  const sorted = [...filteredEvents].sort((a, b) => eventDate(b) - eventDate(a));
  container.innerHTML = sorted.slice(0, 100).map((event) => {
    const recent = isRecent(event);
    const location = [event.location?.name, event.location?.admin1, event.location?.country].filter(Boolean).join(' • ');
    const primary = event.primary_crime_type || 'OTHER_ENVIRONMENTAL_CRIME';
    const hasMedia = (event.source_media || []).some((m) => m.type === 'image' && m.url);
    return `<article class="event-item" data-event-id="${escapeAttr(event.id)}" tabindex="0" role="button">
      <div class="event-meta"><span>${escapeHtml(location)}</span><span>${escapeHtml(formatDate(eventDate(event)))}</span></div>
      <div class="event-title-row"><span class="event-dot-marker" style="--icon-bg:${escapeAttr(crimeTypeMeta[primary]?.color || '#777')}"></span><h3>${escapeHtml(localized(event.title))}</h3></div>
      <p>${escapeHtml(localized(event.summary))}</p>
      <div class="event-tags">${recent ? `<span class="tag recent">${escapeHtml(t('recent'))}</span>` : ''}<span class="tag crime" style="--tag-color:${escapeAttr(crimeTypeMeta[primary]?.color || '#777')}">${escapeHtml(crimeLabel(primary))}</span>${hasMedia ? `<span class="tag">▧ ${escapeHtml(t('sourceImages'))}</span>` : ''}</div>
    </article>`;
  }).join('');
  $$('.event-item').forEach((el) => {
    const activate = () => focusEvent(el.dataset.eventId);
    el.addEventListener('click', activate);
    el.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') activate(); });
  });
}

function focusEvent(eventId) {
  if (!map) return;
  const event = events.find((item) => item.id === eventId);
  if (!event || !Number.isFinite(event.location?.lon) || !Number.isFinite(event.location?.lat)) return;
  const targetZoom = Math.max(map.getZoom(), 6.2);
  map.flyTo({ center: [event.location.lon, event.location.lat], zoom: targetZoom, pitch: 0, speed: 1.4 });
  map.once('moveend', () => openEventPopup(event));
}

function renderCrimeBars() {
  const counts = new Map(crimeTypes.map((type) => [type, 0]));
  filteredEvents.forEach((event) => (event.crime_types || []).forEach((type) => counts.set(type, (counts.get(type) || 0) + 1)));
  const visible = [...counts.entries()].filter(([, count]) => count > 0).sort((a, b) => b[1] - a[1]);
  const max = Math.max(1, ...visible.map(([, count]) => count));
  $('#crime-bars').innerHTML = visible.map(([type, count]) => `<div class="bar-row"><div class="bar-label"><span>${escapeHtml(crimeLabel(type))}</span><strong>${count}</strong></div><div class="bar-track"><div class="bar-fill" style="width:${(count / max) * 100}%;--bar-color:${escapeAttr(crimeTypeMeta[type]?.color || '#62d68d')}"></div></div></div>`).join('');
}

function renderSignals() {
  $('#signal-urgent').textContent = filteredEvents.filter((e) => e.priority === 'URGENT').length;
  $('#signal-community').textContent = filteredEvents.filter((e) => e.impacts?.indigenous_or_local_communities).length;
  $('#signal-protected').textContent = filteredEvents.filter((e) => e.protected_area?.is_protected_area).length;
  $('#signal-crossborder').textContent = filteredEvents.filter((e) => e.cross_border === true).length;
}

function renderLayerPanel() {
  const crimeList = $('#crime-layer-list');
  if (!crimeList) return;
  crimeList.innerHTML = crimeTypes.map((type) => {
    const kind = iconKindByCrime[type] || 'other';
    return `<label class="layer-row"><input class="crime-layer-toggle" type="checkbox" value="${type}" ${activeCrimeLayers.has(type) ? 'checked' : ''}><span class="layer-dot-marker" style="--swatch:${escapeAttr(crimeTypeMeta[type]?.color || '#777')}"></span><span>${escapeHtml(crimeLabel(type))}</span></label>`;
  }).join('');
  $$('.crime-layer-toggle').forEach((input) => input.addEventListener('change', () => {
    if (input.checked) activeCrimeLayers.add(input.value); else activeCrimeLayers.delete(input.value);
    updateLayerVisibility();
  }));

  $('#future-layer-list').innerHTML = layerRegistry.map((group) => {
    const groupLabel = localized(group.label) || group.id;
    const layers = (group.layers || []).map((raw) => {
      const layer = Array.isArray(raw) ? { id: raw[0], label: { pt: raw[1], en: raw[2], es: raw[3] }, status: 'planned' } : raw;
      if (layer.status === 'fixed' && auxMeta[layer.id]) {
        return `<div class="future-layer-row active-layer-row fixed-layer-row"><span class="aux-toggle-wrap"><span class="fixed-layer-lock">◆</span>${layerIconHtml(layer.id)}<span>${escapeHtml(localized(layer.label) || layer.id)}</span></span><small>${escapeHtml(t('fixed'))}</small></div>`;
      }
      if (layer.status === 'active' && auxMeta[layer.id]) {
        const dynamic = dynamicLayerState.get(layer.id);
        const statusText = dynamic?.loading ? t('loading') : dynamic?.error ? t('unavailable') : localized(layer.cadence) || t('live');
        const countText = dynamic && !dynamic.loading && !dynamic.error && Number.isFinite(dynamic.count) ? ` · ${dynamic.count.toLocaleString(locale())}` : '';
        const freshness = layer.id === 'fire_hotspots' && dynamic?.lastDetectedAt ? ` · ${formatDateTime(dynamic.lastDetectedAt)}` : '';
        return `<label class="future-layer-row active-layer-row"><span class="aux-toggle-wrap"><input class="aux-layer-toggle" type="checkbox" value="${escapeAttr(layer.id)}" ${activeAuxLayers.has(layer.id) ? 'checked' : ''}>${layerIconHtml(layer.id)}<span>${escapeHtml(localized(layer.label) || layer.id)}</span></span><small>${escapeHtml(statusText)}${escapeHtml(countText)}${escapeHtml(freshness)}</small></label>`;
      }
      return `<div class="future-layer-row"><span>${escapeHtml(localized(layer.label) || layer.id)}</span><small>${escapeHtml(t('comingSoon'))}</small></div>`;
    }).join('');
    return `<details class="future-group" ${['environment_realtime', 'extractive_pressure', 'sensors_media'].includes(group.id) ? 'open' : ''}><summary>${escapeHtml(groupLabel)}</summary>${layers}</details>`;
  }).join('');

  $$('.aux-layer-toggle').forEach((input) => input.addEventListener('change', () => {
    if (input.checked) { activeAuxLayers.add(input.value); loadDynamicLayer(input.value); } else activeAuxLayers.delete(input.value);
    updateLayerVisibility();
  }));
}

function setTheme(next) {
  if (!mapConfig.styles[next]) return;
  mapTheme = next;
  localStorage.setItem('amazon-observatory-theme', mapTheme);
  document.documentElement.dataset.theme = mapTheme;
  $$('[data-theme-choice]').forEach((button) => button.classList.toggle('active', button.dataset.themeChoice === mapTheme));
  closePopup();
  mapResyncNonce += 1;
  if (map) map.setStyle(mapConfig.styles[mapTheme]);
}

function setMapMode(next) {
  const targetMode = next === 'globe' ? 'globe' : '2d';
  if (targetMode === mapMode) {
    scheduleMapResync('mode-reaffirm', 20);
    return;
  }
  if (map) {
    if (mapMode === 'globe') cameraGlobe = cameraSnapshot();
    else camera2d = cameraSnapshot();
  }
  mapMode = targetMode;
  localStorage.setItem('amazon-observatory-map-mode', mapMode);
  $$('[data-mode]').forEach((button) => button.classList.toggle('active', button.dataset.mode === mapMode));
  closePopup();
  applyMapMode(true);
}

function applyMapMode(animate = true) {
  if (!map || !map.isStyleLoaded()) return;
  mapResyncNonce += 1;
  try {
    map.setTerrain(null);
    if (mapMode === 'globe') {
      map.setProjection({ type: 'globe' });
      const fallback = { center: mapConfig.center, pitch: 0, bearing: 0, zoom: 1.65 };
      const remembered = cameraGlobe ? { ...cameraGlobe, zoom: Math.min(cameraGlobe.zoom, 3.2) } : fallback;
      const camera = { ...remembered, duration: animate ? 850 : 0 };
      if (animate) map.easeTo(camera); else map.jumpTo(camera);
    } else {
      map.setProjection({ type: 'mercator' });
      const fallback = { center: mapConfig.center, pitch: 0, bearing: 0, zoom: mapConfig.zoom };
      const camera = { ...(camera2d || fallback), duration: animate ? 650 : 0 };
      if (animate) map.easeTo(camera); else map.jumpTo(camera);
    }

    // Re-apply all custom sources/layers both immediately and after the projection camera settles.
    scheduleMapResync('projection-immediate', 40, false);
    map.once('moveend', () => scheduleMapResync('projection-moveend', 0));
    map.once('idle', () => scheduleMapResync('projection-idle', 0));
  } catch (error) {
    console.warn('Map projection unavailable:', error);
    scheduleMapResync('projection-error-recovery', 80);
  }
}

async function toggleMapFullscreen() {
  const card = document.querySelector('.map-card');
  if (!card) return;
  try {
    if (!document.fullscreenElement) await card.requestFullscreen();
    else await document.exitFullscreen();
  } catch (error) { console.warn('Fullscreen unavailable:', error); }
}

function syncFullscreenButton() {
  const button = $('#map-fullscreen');
  if (!button) return;
  const isFullscreen = document.fullscreenElement?.classList?.contains('map-card');
  button.classList.toggle('active', Boolean(isFullscreen));
  const label = button.querySelector('[data-i18n]');
  if (label) {
    label.dataset.i18n = isFullscreen ? 'exitFullscreen' : 'fullscreen';
    label.textContent = t(label.dataset.i18n);
  }
  setTimeout(() => map?.resize(), 80);
}

function formatDate(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat(locale(), { day: '2-digit', month: 'short', year: 'numeric' }).format(date);
}

function formatDateTime(value) {
  const date = new Date(value || 0);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat(locale(), { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(date);
}

function escapeHtml(value = '') {
  return String(value).replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#039;', '"': '&quot;' }[char]));
}
function escapeAttr(value = '') { return escapeHtml(value); }

function bindControls() {
  $$('.lang').forEach((button) => button.addEventListener('click', () => setLanguage(button.dataset.lang)));
  $('#search').addEventListener('input', (event) => { state.search = event.target.value; applyFilters(); });
  $('#crime-type').addEventListener('change', (event) => { state.crimeType = event.target.value; applyFilters(); });
  $('#validation-status').addEventListener('change', (event) => { state.status = event.target.value; applyFilters(); });
  $('#time-window').addEventListener('change', (event) => { state.timeWindow = event.target.value; applyFilters(); });
  $('#clear-filters').addEventListener('click', () => {
    state.search = ''; state.crimeType = 'all'; state.status = 'all'; state.timeWindow = 'all';
    $('#search').value = ''; populateFilters(); applyFilters();
  });
  $$('[data-theme-choice]').forEach((button) => button.addEventListener('click', () => setTheme(button.dataset.themeChoice)));
  $$('[data-mode]').forEach((button) => button.addEventListener('click', () => setMapMode(button.dataset.mode)));
  $('#layers-toggle').addEventListener('click', () => toggleLayersPanel(true));
  $('#map-fullscreen')?.addEventListener('click', toggleMapFullscreen);
  document.addEventListener('fullscreenchange', syncFullscreenButton);
  $('#layers-close').addEventListener('click', () => toggleLayersPanel(false));
  $('#layers-all').addEventListener('click', () => { crimeTypes.forEach((type) => activeCrimeLayers.add(type)); updateLayerVisibility(); });
  $('#layers-none').addEventListener('click', () => { activeCrimeLayers.clear(); updateLayerVisibility(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') toggleLayersPanel(false); });
  $$('[data-theme-choice]').forEach((button) => button.classList.toggle('active', button.dataset.themeChoice === mapTheme));
  $$('[data-mode]').forEach((button) => button.classList.toggle('active', button.dataset.mode === mapMode));
}

function toggleLayersPanel(open) {
  const panel = $('#layers-panel');
  panel.classList.toggle('open', open);
  panel.setAttribute('aria-hidden', open ? 'false' : 'true');
}

function layerIconHtml(id) {
  const meta = auxMeta[id];
  const color = meta?.color || '#7f8c8d';
  const icon = meta?.icon || 'other';
  return `<span class="layer-icon-marker" style="--swatch:${escapeAttr(color)}">${iconSvg(icon)}</span>`;
}

function iconSvg(kind) {
  const common = 'viewBox="0 0 64 64" aria-hidden="true" focusable="false"';
  const stroke = 'fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"';
  const filled = 'fill="currentColor"';
  const map = {
    mining: `<svg ${common} ${stroke}><path d="M19 48 44 18"/><path d="M19 29c9-10 22-14 34-8"/></svg>`,
    logging: `<svg ${common} ${stroke}><rect x="14" y="24" width="36" height="18"/><circle cx="18" cy="33" r="8"/><path d="M28 25v16M37 25v16"/></svg>`,
    deforestation: `<svg ${common} ${stroke}><path d="M32 15v34M32 20 21 32M32 23l11 11M18 49h28M14 14l36 36"/></svg>`,
    land: `<svg ${common} ${stroke}><path d="M22 50V14M23 16l24 5-24 10M14 50h20"/></svg>`,
    wildlife: `<svg ${common} ${filled}><circle cx="32" cy="39" r="11"/><circle cx="18" cy="26" r="5"/><circle cx="29" cy="20" r="5"/><circle cx="41" cy="21" r="5"/><circle cx="49" cy="31" r="5"/></svg>`,
    hunting: `<svg ${common} ${stroke}><circle cx="32" cy="32" r="16"/><circle cx="32" cy="32" r="7"/><path d="M32 10v10M32 44v10M10 32h10M44 32h10"/></svg>`,
    fishing: `<svg ${common} ${stroke}><path d="M15 32q15-15 30-1-15 16-30 1Z"/><path d="m45 31 9-9v19Z"/><circle cx="25" cy="29" r="2" fill="currentColor" stroke="none"/></svg>`,
    contamination: `<svg ${common} ${stroke}><path d="M32 12C23 25 18 32 18 41a14 14 0 0 0 28 0c0-9-5-16-14-29Z"/><path d="M26 39h12"/></svg>`,
    fire: `<svg ${common} ${stroke}><path d="M33 12c10 13 15 19 12 30-3 10-22 12-27 0-4-10 5-16 9-24 1 12 10 12 6-6Z"/></svg>`,
    protected: `<svg ${common} ${stroke}><path d="m32 12 16 6-2 18q-3 12-14 17-11-5-14-17l-2-18Z"/><path d="m25 37 7-12 8 12"/></svg>`,
    multiple: `<svg ${common} ${stroke}><rect x="18" y="18" width="10" height="10"/><rect x="36" y="18" width="10" height="10"/><rect x="18" y="36" width="10" height="10"/><rect x="36" y="36" width="10" height="10"/></svg>`,
    radio: `<svg ${common} ${stroke}><path d="M32 26v24M24 50h16"/><circle cx="32" cy="22" r="3" fill="currentColor" stroke="none"/><path d="M40 14a12 12 0 0 1 0 16M48 8a20 20 0 0 1 0 28"/></svg>`,
    camera: `<svg ${common} ${stroke}><rect x="13" y="22" width="38" height="27"/><circle cx="32" cy="36" r="8"/><path d="m20 22 5-6h14l5 6"/></svg>`,
    weather: `<svg ${common} ${stroke}><path d="M18 41h28a8 8 0 1 0-3-15 11 11 0 0 0-21 4 7 7 0 0 0-4 11Z"/><path d="M24 48v4M32 46v6M40 48v4"/></svg>`,
    gauge: `<svg ${common} ${stroke}><path d="M14 46h36"/><path d="M22 46V18"/><path d="M42 46V12"/><path d="M32 46V24"/><path d="M24 24h4M24 30h4M24 36h4"/></svg>`,
    security: `<svg ${common} ${stroke}><circle cx="32" cy="22" r="7"/><path d="M18 49c2-9 9-14 14-14s12 5 14 14"/><path d="M48 17l5 5-5 5"/></svg>`,
    airstrip: `<svg ${common} ${stroke}><path d="M14 46h36"/><path d="M22 14l8 13-5 5-11-5 8-13Z"/><path d="M34 19h16M34 29h10M34 39h16"/></svg>`,
    route: `<svg ${common} ${stroke}><circle cx="18" cy="44" r="4"/><circle cx="46" cy="18" r="4"/><path d="M21 42c10-2 14-11 22-20"/></svg>`,
    other: `<svg ${common} ${stroke}><path d="m32 12 20 38H12Z"/><path d="M32 25v13"/><circle cx="32" cy="44" r="2" fill="currentColor" stroke="none"/></svg>`
  };
  return map[kind] || map.other;
}

async function boot() {
  bindControls();
  setLanguage(language);

  // Data must never depend on successful map initialization.
  await loadData();

  try {
    maplibregl = await loadMapLibrary();
    initMap();
  } catch (error) {
    showMapUnavailable(error);
  }

  setInterval(() => { if (activeAuxLayers.has('fire_hotspots')) loadDynamicLayer('fire_hotspots', true); }, auxMeta.fire_hotspots.refreshMs);
  setInterval(() => { if (activeAuxLayers.has('deforestation_alerts')) loadDynamicLayer('deforestation_alerts', true); }, auxMeta.deforestation_alerts.refreshMs);
}

boot().catch((error) => {
  console.error('Application boot failed', error);
  showMapUnavailable(error);
});
