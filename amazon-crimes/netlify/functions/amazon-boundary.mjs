const RAISG_ENDPOINTS = [
  {
    query: 'https://services2.arcgis.com/dJOijx2lWTlGQBDJ/arcgis/rest/services/RAISG_Limits/FeatureServer/24/query?where=1%3D1&outFields=*&returnGeometry=true&outSR=4326&f=geojson',
    layer: 'https://services2.arcgis.com/dJOijx2lWTlGQBDJ/arcgis/rest/services/RAISG_Limits/FeatureServer/24',
    label: 'RAISG ArcGIS FeatureServer/24'
  },
  {
    query: 'https://geo2.socioambiental.org/raisg/rest/services/raisg/raisg_base_N/MapServer/7/query?where=1%3D1&outFields=*&returnGeometry=true&outSR=4326&f=geojson',
    layer: 'https://geo2.socioambiental.org/raisg/rest/services/raisg/raisg_base_N/MapServer/7',
    label: 'RAISG raisg_base_N/7'
  },
  {
    query: 'https://geo2.socioambiental.org/raisg/rest/services/raisg/raisg_base/MapServer/8/query?where=1%3D1&outFields=*&returnGeometry=true&outSR=4326&f=geojson',
    layer: 'https://geo2.socioambiental.org/raisg/rest/services/raisg/raisg_base/MapServer/8',
    label: 'RAISG raisg_base/8'
  }
];

const json = (status, body) => new Response(JSON.stringify(body), {
  status,
  headers: {
    'content-type': 'application/geo+json; charset=utf-8',
    'cache-control': 'public, max-age=86400, stale-while-revalidate=604800'
  }
});

async function fetchEndpoint(endpoint) {
  const response = await fetch(endpoint.query, {
    headers: {
      accept: 'application/geo+json, application/json',
      'user-agent': 'Amazon-Environmental-Crime-Observatory/0.7.0'
    },
    signal: AbortSignal.timeout(12000)
  });
  if (!response.ok) throw new Error(`${endpoint.label} HTTP ${response.status}`);
  const data = await response.json();
  if (data?.type !== 'FeatureCollection' || !Array.isArray(data.features) || data.features.length === 0) {
    throw new Error(`${endpoint.label}: empty or unexpected GeoJSON`);
  }
  data.source = 'RAISG - Rede Amazônica de Informação Socioambiental Georreferenciada';
  data.source_url = endpoint.layer;
  data.layer_name = 'Amazonía: límite utilizado por RAISG';
  data.generated_at = new Date().toISOString();
  data.endpoint_used = endpoint.label;
  return data;
}

export default async () => {
  const failures = [];
  for (const endpoint of RAISG_ENDPOINTS) {
    try {
      return json(200, await fetchEndpoint(endpoint));
    } catch (error) {
      failures.push(error.message);
    }
  }
  return json(502, {
    type: 'FeatureCollection',
    features: [],
    error: 'amazon_boundary_unavailable',
    message: failures.join(' | '),
    source_url: RAISG_ENDPOINTS[0].layer
  });
};

export const config = { path: '/api/amazon-boundary' };
