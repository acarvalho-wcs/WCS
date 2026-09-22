export const crimeTypes = [
  'ILLEGAL_MINING',
  'ILLEGAL_LOGGING',
  'ILLEGAL_DEFORESTATION',
  'LAND_GRABBING',
  'ILLEGAL_HUNTING',
  'WILDLIFE_TRAFFICKING',
  'WILDLIFE_CRIME',
  'ILLEGAL_FISHING',
  'ENVIRONMENTAL_CONTAMINATION',
  'ARSON_ILLEGAL_FIRE',
  'PROTECTED_AREA_INVASION',
  'MULTIPLE_ENVIRONMENTAL_CRIMES',
  'OTHER_ENVIRONMENTAL_CRIME'
];

export const crimeTypeMeta = {
  ILLEGAL_MINING: { label: { pt: 'Garimpo/mineração ilegal', en: 'Illegal mining', es: 'Minería ilegal' }, color: '#d5a93b' },
  ILLEGAL_LOGGING: { label: { pt: 'Extração ilegal de madeira', en: 'Illegal logging', es: 'Tala ilegal' }, color: '#8e6b46' },
  ILLEGAL_DEFORESTATION: { label: { pt: 'Desmatamento ilegal', en: 'Illegal deforestation', es: 'Deforestación ilegal' }, color: '#d86a4b' },
  LAND_GRABBING: { label: { pt: 'Grilagem/ocupação irregular', en: 'Land grabbing / illegal occupation', es: 'Apropiación/ocupación irregular' }, color: '#a85e8e' },
  ILLEGAL_HUNTING: { label: { pt: 'Caça ilegal', en: 'Illegal hunting', es: 'Caza ilegal' }, color: '#628b55' },
  WILDLIFE_TRAFFICKING: { label: { pt: 'Tráfico de fauna', en: 'Wildlife trafficking', es: 'Tráfico de fauna' }, color: '#52a873' },
  WILDLIFE_CRIME: { label: { pt: 'Outro crime contra fauna', en: 'Other wildlife crime', es: 'Otro delito contra fauna' }, color: '#6aa65c' },
  ILLEGAL_FISHING: { label: { pt: 'Pesca ilegal', en: 'Illegal fishing', es: 'Pesca ilegal' }, color: '#4a9fb7' },
  ENVIRONMENTAL_CONTAMINATION: { label: { pt: 'Contaminação ambiental', en: 'Environmental contamination', es: 'Contaminación ambiental' }, color: '#8f7cc8' },
  ARSON_ILLEGAL_FIRE: { label: { pt: 'Incêndio criminoso/fogo ilegal', en: 'Arson / illegal fire', es: 'Incendio criminal/fuego ilegal' }, color: '#ef7e36' },
  PROTECTED_AREA_INVASION: { label: { pt: 'Invasão de área protegida', en: 'Protected-area invasion', es: 'Invasión de área protegida' }, color: '#3f8b72' },
  MULTIPLE_ENVIRONMENTAL_CRIMES: { label: { pt: 'Múltiplos crimes ambientais', en: 'Multiple environmental crimes', es: 'Múltiples delitos ambientales' }, color: '#c35d74' },
  OTHER_ENVIRONMENTAL_CRIME: { label: { pt: 'Outro crime ambiental', en: 'Other environmental crime', es: 'Otro delito ambiental' }, color: '#7f8c8d' }
};

export const mapConfig = {
  center: [-62.0, -5.0],
  zoom: 3.7,
  minZoom: 1.2,
  maxZoom: 16,
  styles: {
    light: 'https://tiles.openfreemap.org/styles/positron',
    dark: 'https://tiles.openfreemap.org/styles/dark'
  },
  terrainSource: {
    type: 'raster-dem',
    url: 'https://tiles.mapterhorn.com/tilejson.json',
    tileSize: 256
  }
};

export const futureLayerGroups = [
  {
    id: 'environment_realtime',
    label: { pt: 'Ambiente em tempo real', en: 'Real-time environment', es: 'Ambiente en tiempo real' },
    layers: [
      { id: 'fire_hotspots', label: { pt: 'Focos de calor', en: 'Fire hotspots', es: 'Focos de calor' }, status: 'active', data: './data/fire-hotspots.json', icon: 'fire', cadence: { pt: '~10 min', en: '~10 min', es: '~10 min' }, source: 'INPE Programa Queimadas / BDQueimadas' },
      ['drought_alerts', 'Alertas de seca', 'Drought alerts', 'Alertas de sequía'],
      ['severe_weather', 'Mau tempo e tempestades', 'Severe weather & storms', 'Mal tiempo y tormentas'],
      ['floods', 'Cheias e inundações', 'Floods', 'Crecidas e inundaciones'],
      ['smoke_air_quality', 'Fumaça/qualidade do ar', 'Smoke / air quality', 'Humo / calidad del aire']
    ]
  },
  {
    id: 'seizures',
    label: { pt: 'Apreensões', en: 'Seizures', es: 'Incautaciones' },
    layers: [
      ['wildlife_seizures', 'Fauna', 'Wildlife', 'Fauna'],
      ['flora_seizures', 'Flora/madeira', 'Flora / timber', 'Flora / madera'],
      ['mineral_seizures', 'Minerais/ouro', 'Minerals / gold', 'Minerales / oro'],
      ['mercury_fuel_equipment', 'Mercúrio, combustível e equipamentos', 'Mercury, fuel & equipment', 'Mercurio, combustible y equipos']
    ]
  },
  {
    id: 'extractive_pressure',
    label: { pt: 'Pressão extrativa', en: 'Extractive pressure', es: 'Presión extractiva' },
    layers: [
      ['mining_zones', 'Zonas de garimpo', 'Mining zones', 'Zonas de minería'],
      { id: 'deforestation_alerts', label: { pt: 'Alertas de desmatamento (DETER)', en: 'Deforestation alerts (DETER)', es: 'Alertas de deforestación (DETER)' }, status: 'active', data: './data/deforestation-alerts.json', icon: 'deforestation', cadence: { pt: 'diária', en: 'daily', es: 'diaria' }, source: 'INPE DETER / TerraBrasilis' },
      ['logging_roads', 'Ramais e estradas de exploração', 'Logging roads & tracks', 'Caminos y ramales de explotación'],
      ['dredge_signatures', 'Assinaturas/pontos de dragas', 'Dredge signatures / locations', 'Firmas/puntos de dragas']
    ]
  },
  {
    id: 'security_osint',
    label: { pt: 'Segurança e crime organizado', en: 'Security & organized crime', es: 'Seguridad y crimen organizado' },
    layers: [
      ['armed_groups', 'Presença pública reportada de grupos armados', 'Publicly reported armed-group presence', 'Presencia reportada públicamente de grupos armados'],
      ['clandestine_airstrips', 'Pistas clandestinas reportadas', 'Reported clandestine airstrips', 'Pistas clandestinas reportadas'],
      ['public_routes', 'Rotas ilícitas documentadas publicamente', 'Publicly documented illicit routes', 'Rutas ilícitas documentadas públicamente']
    ]
  },
  {
    id: 'sensors_media',
    label: { pt: 'Sensores e mídia OSINT', en: 'OSINT sensors & media', es: 'Sensores y medios OSINT' },
    layers: [
      { id: 'radio_stations', label: { pt: 'Rádios ao vivo', en: 'Live radio', es: 'Radios en vivo' }, status: 'active', data: './data/radios-pages.json', icon: 'radio' },
      { id: 'public_cameras', label: { pt: 'Câmeras públicas ao vivo', en: 'Public live cameras', es: 'Cámaras públicas en vivo' }, status: 'active', data: './data/cameras.json', icon: 'camera' },
      ['weather_stations', 'Estações meteorológicas', 'Weather stations', 'Estaciones meteorológicas'],
      ['river_gauges', 'Réguas/estações fluviométricas', 'River gauges', 'Estaciones fluviométricas']
    ]
  },
  {
    id: 'territories',
    label: { pt: 'Territórios e proteção', en: 'Territories & protection', es: 'Territorios y protección' },
    layers: [
      { id: 'amazon_boundary', label: { pt: 'Limite internacional da Amazônia (RAISG)', en: 'International Amazon boundary (RAISG)', es: 'Límite internacional de la Amazonía (RAISG)' }, status: 'fixed', data: './data/amazon-boundary.json', icon: 'protected', source: 'RAISG' },
      ['indigenous_lands', 'Terras indígenas', 'Indigenous lands', 'Tierras indígenas'],
      ['protected_areas', 'Unidades de conservação', 'Protected areas', 'Áreas protegidas'],
      ['traditional_communities', 'Comunidades tradicionais', 'Traditional communities', 'Comunidades tradicionales']
    ]
  }
];
