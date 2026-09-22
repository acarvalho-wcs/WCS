
## v0.6 — Globe + fullscreen

- Replaced the former pitched-terrain “3D” mode with a true MapLibre globe projection.
- Added fullscreen mode for the entire operational map module, preserving toolbar, layers, popups and legends.
- Globe mode reuses all current crime and OSINT layers and works with light/dark styles.


## v0.6.9.8 — ícones cartográficos e popups das novas camadas

- Estações meteorológicas, réguas/estações fluviométricas e camadas de segurança usam no mapa o mesmo SVG exibido na legenda.
- Ícones cartográficos são clicáveis e escalam suavemente com o zoom.
- Popups exibem operador/rede, variáveis, rio, status, nível de evidência, modalidade, precisão e notas de cautela, conforme a camada.
- Rotas ilícitas permanecem como linhas generalizadas e recebem também um ícone de rota clicável no corredor.

# Observatório OSINT de Crimes Ambientais na Amazônia — v0.6.9.8

Base dinâmica para Netlify com mapa 2D/Globo, claro/escuro, crimes ambientais, rádios e câmeras ao vivo, focos de calor, alertas DETER e limite pan-amazônico.

## O que muda na v0.5

A fonte primária dos casos deixa de ser `data/events.json` e passa a ser **Netlify Database (Postgres)**. O JSON permanece em `public/data/events.json` apenas como fallback de emergência e seed documental.

Fluxo de produção:

`fontes OSINT -> validação -> normalização -> POST /api/events/bulk -> Postgres -> GET /api/events -> mapa`

Novos casos não exigem deploy. Deploy é necessário apenas para mudanças de código, interface, schema ou novas funções/layers.

## Estrutura

- `public/` — frontend estático
- `netlify/functions/` — APIs e feeds operacionais
- `netlify/database/migrations/` — schema e seed inicial
- `scripts/import-events.mjs` — importador de lotes
- `examples/bulk-import.example.json` — exemplo de payload

## Banco

A migration inicial cria:

- `events` — registro canônico + payload JSONB completo
- `event_sources` — fontes normalizadas
- `event_media` — imagens/mídia das fontes
- `ingest_runs` — auditoria dos lotes de ingestão

O banco é indexado por tipo de crime, status, datas, UF/estado, país e arrays de categorias. Também mantém `canonical_url` e `fingerprint` únicos para deduplicação.

## API

### Leitura pública

- `GET /api/events`
- `GET /api/events/:id`
- filtros opcionais: `status`, `crime_type`, `country`, `admin1`, `since`, `limit` (máx. 5000)

### Escrita protegida

- `POST /api/events` — inserir/atualizar um caso
- `PUT /api/events/:id` — atualizar um caso específico
- `POST /api/events/bulk` — inserir até 100 casos por lote

As escritas exigem:

`Authorization: Bearer <OBSERVATORY_ADMIN_TOKEN>`

Nunca coloque esse token no frontend.

## Primeiro deploy no Netlify

1. Coloque esta pasta em um repositório Git (GitHub recomendado).
2. Importe/conecte o repositório ao Netlify.
3. O Netlify detectará `package.json`, `netlify.toml`, Functions e migrations.
4. Configure `OBSERVATORY_ADMIN_TOKEN` em **Project configuration -> Environment variables**.
5. Faça o deploy de produção.
6. A migration será aplicada no deploy e os 10 casos atuais serão inseridos no Postgres.
7. Teste `/api/health` e `/api/events`.

## Inserindo o próximo lote sem deploy

Primeiro faça um dry-run:

```bash
curl -X POST "https://SEU-SITE.netlify.app/api/events/bulk" \
  -H "Authorization: Bearer $OBSERVATORY_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  --data-binary @novo-lote.json
```

No payload, use `"dry_run": true` para verificar duplicatas/erros. Depois mude para `false` e envie novamente.

Também pode usar:

```bash
OBSERVATORY_ADMIN_TOKEN="..." node scripts/import-events.mjs novo-lote.json https://SEU-SITE.netlify.app
```

O mapa consulta `/api/events` e exibirá os novos casos sem republicar o site.

## Deduplicação

Cada ingestão verifica:

1. `id` canônico;
2. URL canônica da fonte principal;
3. fingerprint SHA-256 baseada em tipo de crime, operação, local, unidade administrativa, país e data.

Uma colisão com outro ID é marcada como `duplicate` e não sobrescreve silenciosamente o evento existente.

## Segurança

- leitura do banco: pública via API;
- escrita: somente com `OBSERVATORY_ADMIN_TOKEN` no servidor;
- token nunca é servido ao navegador;
- queries são parametrizadas;
- lotes têm limite de 100 eventos;
- `ingest_runs` registra a execução e seus resultados.

## Camadas ambientais

Focos de calor e DETER continuam separados dos crimes confirmados. Eles representam sinais/detecções e não inferem crime por si só.

## Próxima etapa

Após o primeiro deploy v0.5, a rotina de coleta/validação pode chamar `/api/events/bulk` diretamente. Em seguida podemos criar coletores agendados e ampliar o schema para apreensões, garimpos, pistas, grupos armados, estações de rádio, câmeras e outros layers OSINT.


## v0.6.2 — 10 validated cases added
Second database migration `20260916020500_add_10_validated_cases` adds 10 official-source cases without altering the original 10. Fallback JSON now contains 20 events.


## v0.6.3 — imagens das fontes

Ao abrir um evento, `/api/event-media` consulta as URLs oficiais cadastradas, descobre imagens publicadas pela fonte e as exibe no popup. `/api/event-image` faz proxy controlado das imagens para reduzir falhas de hotlink; a função só aceita o ID de um evento já cadastrado e restringe os hosts aos domínios das próprias fontes.


## v0.6.4 — rádios embutidas, focos de calor auditados e limite pan-amazônico

- **Rádios no próprio site:** ao clicar em uma estação, o popup resolve o stream do Radio Garden e reproduz o áudio em um player HTML5 dentro do observatório. O link externo permanece somente como referência/fallback. O endpoint de reprodução do Radio Garden é interno/não documentado e pode mudar; o frontend trata indisponibilidade por estação.
- **Focos de calor:** a fonte continua sendo o diretório oficial de CSVs de 10 minutos do Programa Queimadas/INPE. A função prioriza os arquivos mais recentes em caso de alto volume, converte valores inválidos `-999` em nulos e retorna metadados de diagnóstico (`last_detected_at`, `newest_source_file`, `truncated`).
- **Limite internacional da Amazônia:** camada fixa obtida do serviço público RAISG, usando a camada “Amazonía: límite utilizado por RAISG”. É exibida continuamente em 2D e Globo, com atribuição RAISG, e não deve ser interpretada como limite político oficial.



## v0.6.9.8 — pan-Amazon case backfill

- Adds **36 recent validated environmental-crime/enforcement events**.
- Coverage: **Brazil, Bolivia, Peru, Colombia, Ecuador, Guyana, Suriname and Venezuela** (4 each), plus **4 additional French Guiana** events.
- Database total after migration: **56 events**.
- All 36 additions use `backfill: true`, so they do not inflate the “new in the last 24 hours” indicator.
- Official-source cases use `CONFIRMED`; media/civil-society records with corroboration are marked `VALIDATED`.
- Coordinates are explicitly marked approximate where the public source does not provide an exact operational location.
- Migration: `20260916041000_add_36_pan_amazon_cases`.

## v0.6.8 — map stability and compact markers
- Replaced pictogram-style point markers on the map with compact colored circles that scale smoothly with zoom.
- Crime categories, live radios, cameras and fire hotspots now use circle markers; DETER remains polygonal.
- Crime-layer visibility is persisted locally alongside auxiliary-layer visibility.
- Added map-state resynchronization after projection/style transitions so sources and layer visibility are re-applied automatically.
- Switching 2D ↔ Globe preserves the previous camera for each mode and no longer requires clearing filters to restore markers.


## v0.6.8

- Replaced the temporary “A” badge with the official WCS Brasil logo asset used in the project library.
- Footer is now trilingual and links directly to https://brasil.wcs.org.
- Environmental-crime points now use a single resilient MapLibre circle layer with category-based colors and category filtering.
- Crime-layer visibility is session-scoped rather than persisted in localStorage, preventing stale hidden-layer states after reloads.
- Added an idle watchdog and initial event-extent fit so valid cases remain visible after 2D/Globe and style changes.


## v0.6.8 map-point hotfix
- Fixes MapLibre circle layer creation by keeping `zoom` as the direct input of the top-level `interpolate` expression.
- Uses an explicit `in` + `literal` category filter for crime points.
- Normalizes latitude/longitude values from the API before building GeoJSON.


## v0.6.9.8 hotfix

- Fixes a database migration conflict caused by two French Guiana records sharing the same `canonical_url`.
- Uses event-specific canonical URLs while retaining the official Guyane press-room URL in `sources`.
- No events are removed; the target remains 56 total events after migration.


### v0.6.9.8 camera-link hotfix
Camera links now use exact provider canonical URLs with no ChatGPT/UTM tracking parameters. Inline playback uses only standard YouTube embed URLs and retains the original provider URL as the primary clickable source.


## v0.6.9.8 — webcams SkylineWebcams

Replaced previous unstable Manaus video links with the three Amazon-relevant live webcam pages currently listed by SkylineWebcams: Ponta Negra, Amazon Theatre and Vieiralves. Links are canonical provider URLs, without tracking parameters or ChatGPT redirects. Inline embeds are intentionally disabled because no stable public embed endpoint is exposed on the provider pages.


## v0.6.9.8 — webcams pan-amazônicas

- Mantém as três webcams SkylineWebcams de Manaus.
- Restaura pontos de câmera pública para Peru, Colômbia, Equador, Guiana, Suriname, Venezuela e Guiana Francesa.
- Todos os links são URLs originais dos provedores/diretórios, sem parâmetros ChatGPT.
- Nenhum iframe instável é forçado; o popup abre a página pública original da câmera.
- Bolívia permanece como lacuna de cobertura até ser localizada uma webcam pública ativa e verificável na Amazônia boliviana.


## v0.6.9.8 — SkylineWebcams country-catalog expansion
- Camera catalog expanded to 79 SkylineWebcams entries across Amazonian countries that have a Skyline country catalog.
- Counts: {'Brasil': 42, 'Bolívia': 2, 'Peru': 23, 'Equador': 9, 'Colômbia': 1, 'Venezuela': 2}.
- Guyana, Suriname and French Guiana remain without SkylineWebcams country-catalog entries; no synthetic camera points were added.
- Original SkylineWebcams URLs only; no tracking parameters or ChatGPT redirect URLs.
- `amazon_scope` distinguishes Amazon-region cameras from country-reference cameras outside the biome.
