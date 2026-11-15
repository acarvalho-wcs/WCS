import process from 'node:process';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright-core');

const base = new URL(process.env.PAGE_URL || 'https://acarvalho-wcs.github.io/WCS/');
const root = new URL(base.pathname.endsWith('/') ? base.pathname : base.pathname+'/',base);
const diag = [];
const tileResponses=[];
const tileFailures=[];
const isTerritoryUrl=url=>/uc-federal\.geojson|territory-tiles|geo2\.socioambiental\.org|geo\.anm\.gov\.br|territory-source/i.test(url);

const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH,
  headless: true,
  args: ['--no-sandbox','--disable-dev-shm-usage','--enable-webgl','--use-gl=swiftshader']
});
const context = await browser.newContext({serviceWorkers:'block', viewport:{width:1440,height:900}});
const page = await context.newPage();
page.on('pageerror',e=>diag.push('PAGE ERROR: '+e.stack));
page.on('console',message=>{if(message.type()==='error')diag.push('CONSOLE: '+message.text())});
page.on('requestfailed',r=>{if(/\/(events\.json|app\.js|temporal-filter\.js|language-preference\.js)/.test(r.url()))diag.push('REQUEST: '+r.url()+' '+r.failure()?.errorText)});
page.on('requestfailed',r=>{if(isTerritoryUrl(r.url()))tileFailures.push({url:r.url().slice(0,260),error:r.failure()?.errorText})});
page.on('response',r=>{if(isTerritoryUrl(r.url()))tileResponses.push({status:r.status(),url:r.url().slice(0,310),contentType:r.headers()['content-type']||''})});
page.on('response',r=>{if(/\/(events\.json|app\.js|temporal-filter\.js|language-preference\.js)/.test(r.url()))console.log('RESOURCE',r.status(),r.url())});
const assert = (condition,message)=>{if(!condition)throw new Error(message)};
async function load(){
  await page.goto(root.toString()+'?smoke='+Date.now(), { waitUntil:'domcontentloaded',timeout:60000 });
  try {
    await page.waitForFunction(()=>{
      const total=Number(document.querySelector('#stat-total')?.textContent.replace(/[^0-9]/g,''));
      const shown=Number(document.querySelector('#feed-count')?.textContent.replace(/[^0-9]/g,''));
      return total>=147 && shown>0;
    },null,{timeout:55000});
  }catch(e){
    console.error('DIAGNOSTICS:',diag.join('\n')||'(none)');
    console.error('PAGE STATE:',await page.evaluate(()=>({
      title:document.title,lang:document.documentElement.lang,
      total:document.querySelector('#stat-total')?.textContent,
      shown:document.querySelector('#feed-count')?.textContent,
      items:document.querySelectorAll('.event-item').length,
      message:document.querySelector('#event-feed')?.textContent?.slice(0,350),
      period:document.querySelector('#time-open')?.textContent
    })));
    throw e;
  }
}
try {
  await load();
  const state=await page.evaluate(()=>({
    total:Number(document.querySelector('#stat-total')?.textContent.replace(/[^0-9]/g,'')),
    filtered:Number(document.querySelector('#feed-count')?.textContent.replace(/[^0-9]/g,'')),
    rows:document.querySelectorAll('.event-item').length,
    lang:document.documentElement.lang,
    period:document.querySelector('#time-open')?.textContent,
    firstCardVisible:!!document.querySelector('.event-item')?.getBoundingClientRect().height
  }));
  console.log('DEFAULT:',JSON.stringify(state));
  await page.waitForTimeout(7000);
  const mapState=await page.evaluate(()=>({
    diagnostics:window.__amazonMapHealth?.(),
    mapUnavailable:document.querySelector('.map-unavailable')?.textContent?.slice(0,400),
    mapCanvas:!!document.querySelector('.maplibregl-canvas'),
    markerElements:document.querySelectorAll('.maplibregl-marker').length
  }));
  console.log('MAP HEALTH:',JSON.stringify(mapState));
  assert(mapState.diagnostics?.mapConstructed,'MapLibre map instance was not initialized');
  assert(mapState.diagnostics?.styleLoaded,'Map style did not load');
  assert(mapState.diagnostics?.layer,'Map crime-events layer missing');
  assert(mapState.diagnostics?.source,'Map event GeoJSON source missing');
  assert(mapState.diagnostics?.rendered>0,'Crime-event circles not visibly rendered on the map');
  // Diagnose real geographical overlay controls and remote raster sources.
  await page.locator('#layers-toggle').click();
  const territoryControlNames=await page.locator('input.aux-layer-toggle').evaluateAll(items=>items.map(i=>i.value));
  console.log('OVERLAY_CONTROLS',JSON.stringify(territoryControlNames));
  for(const key of ['protected_areas','brazil_conservation_units','indigenous_lands','strict_protection','sustainable_use']){
    const loc=page.locator('input.aux-layer-toggle[value="'+key+'"]');
    console.log('OVERLAY_UI',key,await loc.count());
    if(await loc.count())await loc.check({force:true});
  }
  await page.waitForTimeout(12000);
  console.log('OVERLAY_RESPONSE_SUMMARY',JSON.stringify(tileResponses.slice(0,40)));
  console.log('OVERLAY_FAILURES',JSON.stringify(tileFailures.slice(0,30)));
  console.log('OVERLAY_DIAG',JSON.stringify(diag.slice(-35)));
  const overlays=await page.evaluate(()=>window.__amazonMapHealth?.().territorial);
  console.log('OVERLAY_FULL_STATE',JSON.stringify(overlays));
  const selected=['protected_areas','brazil_conservation_units','indigenous_lands','strict_protection','sustainable_use'];
  for(const id of selected){
    const item=overlays?.find(x=>x.id===id);
    assert(item?.layer&&item?.source&&item?.visibility==='visible',id+' not visible');
  }
  const localOk=tileResponses.filter(r=>r.url.includes('/assets/territory-tiles/') && r.status===200&&r.contentType.includes('image/'));
  assert(localOk.length>0,'No locally hosted GIS imagery successfully loaded');
  assert(!tileResponses.some(r=>r.url.includes('/assets/territory-tiles/')&&r.status>=400),'Territory raster tile HTTP error');
  assert(!tileFailures.some(r=>r.url.includes('/assets/territory-tiles/')),'Territory raster requests failed');
  console.log('OVERLAY_AFTER_TOGGLE',JSON.stringify(await page.evaluate(()=>({
    active:[...document.querySelectorAll('input.aux-layer-toggle:checked')].map(x=>x.value),
    map:window.__amazonMapHealth?.()
  }))));

  assert(state.total===147,'Canonical total must be 147');
  assert(state.filtered>0,'Default 12-month filter has no visible events');
  assert(state.rows>0&&state.firstCardVisible,'Event feed cards are not rendered visibly');
  assert(state.lang==='en','English must be default in a new browser');
  await page.locator('#time-open').click();
  await page.locator('#time-preset').selectOption('all');
  await page.locator('button.time-apply').click();
  await page.waitForFunction(()=>Number(document.querySelector('#feed-count')?.textContent.replace(/[^0-9]/g,''))===147);
  console.log('ALL TIME: 147 events displayed in count');
  await page.locator('button[data-lang="pt"]').first().click();
  assert(await page.locator('html').getAttribute('lang')==='pt-BR','Switch to PT failed in main view');
  await page.goto(new URL('news.html',root).toString(),{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>document.documentElement.lang==='pt-BR');
  assert(await page.locator('button[data-lang="pt"]').first().getAttribute('aria-pressed')==='true','PT not selected in news');
  await page.goto(new URL('how-it-works.html?lang=en',root).toString(),{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>document.documentElement.lang==='pt-BR');
  console.log('CROSS-PAGE: PT persisted across news and stale ?lang=en link');
  console.log('SMOKE PASSED');
} catch (error) {
  console.error('SMOKE FAILED:',error.stack||error);
  console.error('BROWSER DIAGNOSTICS:',diag.join('\n')||'(none)');
  process.exitCode=1;
}finally{await browser.close()}
