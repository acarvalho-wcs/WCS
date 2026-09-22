const SOURCE_PAGE = 'https://terrabrasilis.dpi.inpe.br/';
const WFS_BASE = 'https://terrabrasilis.dpi.inpe.br/geoserver/deter-amz/wfs';
const DAYS = 30;
const MAX_FEATURES = 3000;

const json = (statusCode, body) => new Response(JSON.stringify(body), {
  status: statusCode,
  headers: {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'public, max-age=900, stale-while-revalidate=3600'
  }
});

function isoDateDaysAgo(days) {
  const d = new Date(Date.now() - days * 86400000);
  return d.toISOString().slice(0, 10);
}

function normalizeProperties(properties = {}) {
  return {
    ...properties,
    source_kind: 'deforestation_alert',
    alert_class: properties.classname || properties.class_name || properties.classe || '',
    alert_date: properties.date || properties.view_date || properties.publish_date || '',
    municipality: properties.municipality || properties.municipali || '',
    state: properties.uf || properties.state || '',
    area_km2: Number(properties.areamunkm ?? properties.areatotalkm ?? properties.areatotkm ?? properties.area_km2) || null,
    satellite: properties.satellite || '',
    sensor: properties.sensor || '',
    protected_area: properties.uc || '',
    source_name: 'INPE DETER / TerraBrasilis',
    source_url: SOURCE_PAGE
  };
}

export default async () => {
  try {
    const start = isoDateDaysAgo(DAYS);
    const end = new Date().toISOString().slice(0, 10);
    const params = new URLSearchParams({
      service: 'WFS',
      version: '2.0.0',
      request: 'GetFeature',
      typeName: 'deter_public',
      srsName: 'EPSG:4674',
      outputFormat: 'application/json',
      count: String(MAX_FEATURES),
      sortBy: 'date D,gid D',
      CQL_FILTER: `date BETWEEN '${start}' AND '${end}'`
    });
    const response = await fetch(`${WFS_BASE}?${params.toString()}`, { headers: { 'user-agent': 'Amazon-Environmental-Crime-Observatory/0.5' } });
    if (!response.ok) throw new Error(`TerraBrasilis WFS HTTP ${response.status}`);
    const payload = await response.json();
    const features = (payload.features || []).slice(0, MAX_FEATURES).map((feature) => ({
      type: 'Feature',
      id: feature.id,
      geometry: feature.geometry,
      properties: normalizeProperties(feature.properties)
    }));
    return json(200, {
      type: 'FeatureCollection',
      source: 'INPE DETER / TerraBrasilis',
      source_url: SOURCE_PAGE,
      cadence: 'daily public alerts',
      period: { start, end },
      generated_at: new Date().toISOString(),
      feature_count: features.length,
      features
    });
  } catch (error) {
    return json(502, { error: 'deforestation_alerts_unavailable', message: error.message, source_url: SOURCE_PAGE });
  }
};

export const config = { path: '/api/deforestation-alerts' };
