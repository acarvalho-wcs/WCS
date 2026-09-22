const RAISG_QUERY = 'https://geo2.socioambiental.org/raisg/rest/services/raisg/raisg_base/MapServer/8/query?where=1%3D1&outFields=*&returnGeometry=true&outSR=4326&f=geojson';
const RAISG_LAYER = 'https://geo2.socioambiental.org/raisg/rest/services/raisg/raisg_base/MapServer/8';

const json = (status, body) => new Response(JSON.stringify(body), {
  status,
  headers: {
    'content-type': 'application/geo+json; charset=utf-8',
    'cache-control': 'public, max-age=86400, stale-while-revalidate=604800'
  }
});

export default async () => {
  try {
    const response = await fetch(RAISG_QUERY, {
      headers: { accept: 'application/geo+json, application/json', 'user-agent': 'Amazon-Environmental-Crime-Observatory/0.6.4' }
    });
    if (!response.ok) throw new Error(`RAISG HTTP ${response.status}`);
    const data = await response.json();
    if (data?.type !== 'FeatureCollection' || !Array.isArray(data.features)) throw new Error('Unexpected RAISG response');
    data.source = 'RAISG - Rede Amazônica de Informação Socioambiental Georreferenciada';
    data.source_url = RAISG_LAYER;
    data.layer_name = 'Amazonía: límite utilizado por RAISG';
    data.generated_at = new Date().toISOString();
    return json(200, data);
  } catch (error) {
    return json(502, { type: 'FeatureCollection', features: [], error: 'amazon_boundary_unavailable', message: error.message, source_url: RAISG_LAYER });
  }
};

export const config = { path: '/api/amazon-boundary' };
