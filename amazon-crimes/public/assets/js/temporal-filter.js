/* Shared temporal filter for Amazon Environmental Crime Observatory.
   Dates are interpreted as inclusive calendar days in America/Manaus (UTC-04).
   Occurrence and publication are never silently substituted for each other. */
const PRESETS = ['all','today','yesterday','week','lastWeek','last7','last28','last30','last90','month','lastMonth','year','custom'];
const BASES = ['occurrence_or_publication','occurrence','publication','incorporation'];
const TEXT = {
  pt: {period:'Período',all:'Todo o período',today:'Hoje',yesterday:'Ontem',week:'Esta semana',lastWeek:'Semana anterior',last7:'Últimos 7 dias',last28:'Últimos 28 dias',last30:'Últimos 30 dias',last90:'Últimos 90 dias',month:'Este mês',lastMonth:'Mês anterior',year:'Este ano',custom:'Personalizado',basis:'Data utilizada',occurrence_or_publication:'Ocorridos ou publicados',occurrence:'Somente ocorridos',publication:'Somente publicados',incorporation:'Incorporação validada',start:'Data inicial',end:'Data final',compare:'Comparar períodos',previous:'Período anterior de mesma duração',a:'Período A',b:'Período B',apply:'Aplicar',cancel:'Cancelar',reset:'Remover filtro temporal',invalid:'Informe um intervalo válido (início não posterior ao fim).',method:'Datas de ocorrência e publicação são combinadas por OU, sem duplicar registros. Datas desconhecidas não são presumidas; publicação não substitui ocorrência.',zone:'America/Manaus (UTC−4) · dias inclusivos · semanas a partir de segunda-feira',mapPeriod:'Período exibido',events:'Eventos',countries:'Países e territórios',protected:'Em áreas protegidas',difference:'Diferença A − B',notAvailable:'Não há eventos no período selecionado.',publicationLabel:'Publicado',occurrenceLabel:'Ocorrido',incorporationLabel:'Incorporado'},
  en: {period:'Period',all:'All time',today:'Today',yesterday:'Yesterday',week:'This week',lastWeek:'Previous week',last7:'Last 7 days',last28:'Last 28 days',last30:'Last 30 days',last90:'Last 90 days',month:'This month',lastMonth:'Previous month',year:'This year',custom:'Custom',basis:'Date basis',occurrence_or_publication:'Occurred or published',occurrence:'Occurred only',publication:'Published only',incorporation:'Validated incorporation',start:'Start date',end:'End date',compare:'Compare periods',previous:'Previous period of equal length',a:'Period A',b:'Period B',apply:'Apply',cancel:'Cancel',reset:'Remove temporal filter',invalid:'Enter valid dates (start must not follow end).',method:'Occurrence and publication dates are combined with OR, without duplicate records. Unknown dates are not inferred; publication never replaces occurrence.',zone:'America/Manaus (UTC−4) · inclusive days · weeks begin on Monday',mapPeriod:'Period shown',events:'Events',countries:'Countries and territories',protected:'In protected areas',difference:'Difference A − B',notAvailable:'No events in the selected period.',publicationLabel:'Published',occurrenceLabel:'Occurred',incorporationLabel:'Incorporated'},
  es: {period:'Período',all:'Todo el período',today:'Hoy',yesterday:'Ayer',week:'Esta semana',lastWeek:'Semana anterior',last7:'Últimos 7 días',last28:'Últimos 28 días',last30:'Últimos 30 días',last90:'Últimos 90 días',month:'Este mes',lastMonth:'Mes anterior',year:'Este año',custom:'Personalizado',basis:'Fecha utilizada',occurrence_or_publication:'Ocurridos o publicados',occurrence:'Solo ocurridos',publication:'Solo publicados',incorporation:'Incorporación validada',start:'Fecha inicial',end:'Fecha final',compare:'Comparar períodos',previous:'Período anterior de igual duración',a:'Período A',b:'Período B',apply:'Aplicar',cancel:'Cancelar',reset:'Quitar filtro temporal',invalid:'Indique fechas válidas (el inicio no puede ser posterior al fin).',method:'Las fechas de ocurrencia y publicación se combinan con O, sin duplicar registros. Las fechas desconocidas no se infieren; la publicación nunca sustituye a la ocurrencia.',zone:'America/Manaus (UTC−4) · días inclusivos · semanas desde el lunes',mapPeriod:'Período mostrado',events:'Eventos',countries:'Países y territorios',protected:'En áreas protegidas',difference:'Diferencia A − B',notAvailable:'No hay eventos en el período seleccionado.',publicationLabel:'Publicado',occurrenceLabel:'Ocurrido',incorporationLabel:'Incorporado'}
};
const $ = (id) => document.getElementById(id);
const utcDay = (ms) => new Date(ms - 4 * 3600000).toISOString().slice(0,10);
const today = () => utcDay(Date.now());
const dayMove = (day,n) => {
  const d=new Date(day+'T12:00:00Z');
  d.setUTCDate(d.getUTCDate()+n);
  return d.toISOString().slice(0,10);
};
const dayOrdinal = (day) => Math.floor(Date.parse(day+'T00:00:00Z')/86400000);
const validDay = (day) => typeof day==='string' && /^\d{4}-\d\d-\d\d$/.test(day) && new Date(day+'T00:00:00Z').toISOString().slice(0,10)===day;
const validRange = (range) => !!range && validDay(range.start) && validDay(range.end) && range.start<=range.end;
const localDay = (value) => {
  const n=Date.parse(value||'');
  return Number.isFinite(n) ? utcDay(n) : null;
};
const previousRange = (range) => {
  const n=dayOrdinal(range.end)-dayOrdinal(range.start)+1;
  return {start:dayMove(range.start,-n),end:dayMove(range.start,-1)};
};
function presetRange(key){
  const t=today(),dow=(new Date(t+'T12:00:00Z').getUTCDay()+6)%7;
  const monday=dayMove(t,-dow),year=t.slice(0,4),month=t.slice(0,7);
  switch(key){
    case 'all': return null;
    case 'today': return {start:t,end:t};
    case 'yesterday': {const d=dayMove(t,-1);return {start:d,end:d};}
    case 'week':return {start:monday,end:t};
    case 'lastWeek':return {start:dayMove(monday,-7),end:dayMove(monday,-1)};
    case 'last7':return {start:dayMove(t,-6),end:t};
    case 'last28':return {start:dayMove(t,-27),end:t};
    case 'last30':return {start:dayMove(t,-29),end:t};
    case 'last90':return {start:dayMove(t,-89),end:t};
    case 'month':return {start:month+'-01',end:t};
    case 'lastMonth': {const end=dayMove(month+'-01',-1);return {start:end.slice(0,7)+'-01',end};}
    case 'year':return {start:year+'-01-01',end:t};
    default:return null;
  }
}
function occurrenceDay(event){
  if(event?.date_basis==='publication')return null;
  const precision=String(event?.occurred_at_precision||'').toLowerCase();
  if(/unknown|surrogate|publication_date_reference|imprecise|month.only|year.only|not.verified|unconfirmed.day/.test(precision))return null;
  return localDay(event?.occurred_at);
}
function publicationDay(event){return localDay(event?.published_at);}
function incorporationDay(event){
  if(!['VALIDATED','CONFIRMED'].includes(event?.validation_status))return null;
  return localDay(event?.added_at);
}
function eventDays(event,basis){
  if(basis==='occurrence')return [occurrenceDay(event)].filter(Boolean);
  if(basis==='publication')return [publicationDay(event)].filter(Boolean);
  if(basis==='incorporation')return [incorporationDay(event)].filter(Boolean);
  return [...new Set([occurrenceDay(event),publicationDay(event)].filter(Boolean))];
}
function matchesRange(event,basis,range){
  if(!range)return true;
  return eventDays(event,basis).some(d=>d>=range.start && d<=range.end);
}
export function createTemporalFilter({getLanguage,onChange,getBaseEvents}){
  const initial=()=>({basis:'occurrence_or_publication',preset:'last7',range:presetRange('last7'),compare:false,mode:'previous',compareRange:null,visible:'a'});
  let state=initial(),lastDay=today();
  const w=()=>TEXT[getLanguage()]||TEXT.pt;
  const active=()=>state.compare&&state.visible==='b'?state.compareRange:state.range;
  const description=(r)=>r?r.start+' — '+r.end:w().all;
  const filteredFor=(range)=>getBaseEvents().filter(e=>matchesRange(e,state.basis,range));
  function info(event){
    const range=active();
    const potential=[];
    if(state.basis==='occurrence_or_publication'||state.basis==='occurrence'){
      const day=occurrenceDay(event);if(day&&(!range||(day>=range.start&&day<=range.end)))potential.push({date:new Date(event.occurred_at),label:w().occurrenceLabel,day});
    }
    if(state.basis==='occurrence_or_publication'||state.basis==='publication'){
      const day=publicationDay(event);if(day&&(!range||(day>=range.start&&day<=range.end)))potential.push({date:new Date(event.published_at),label:w().publicationLabel,day});
    }
    if(state.basis==='incorporation'){
      const day=incorporationDay(event);if(day&&(!range||(day>=range.start&&day<=range.end)))potential.push({date:new Date(event.added_at),label:w().incorporationLabel,day});
    }
    potential.sort((a,b)=>b.day.localeCompare(a.day));
    return potential[0]||{date:new Date(event.occurred_at||event.published_at||0),label:w().occurrenceLabel};
  }
  function compareMetrics(records){
    return {events:records.length,countries:new Set(records.map(e=>e.location?.country).filter(Boolean)).size,protected:records.filter(e=>e.protected_area?.is_protected_area).length};
  }
  function render(){
    if(!$('time-open'))return;
    if(!state.compare&&state.preset!=='custom'&&lastDay!==today()){
      state.range=presetRange(state.preset);
      lastDay=today();
    }
    const words=w(),curRange=active();
    $('time-open').textContent=words.period+' · '+(state.preset==='all'?words.all:description(curRange));
    $('time-open').setAttribute('aria-label',words.period+': '+description(curRange)+'. '+words[state.basis]);
    $('time-reset').textContent=words.reset;
    $('time-reset').hidden=state.preset==='all'&&!state.compare;
    $('time-summary').textContent=words[state.basis]+' · '+words.zone;
    const panel=$('time-comparison');panel.hidden=!state.compare;
    if(state.compare){
      const a=compareMetrics(filteredFor(state.range)),b=compareMetrics(filteredFor(state.compareRange));
      const fmt=(n)=>n.toLocaleString(({pt:'pt-BR',en:'en-US',es:'es-ES'})[getLanguage()]||'pt-BR');
      panel.innerHTML='<div class="time-comparison-head"><strong>'+words.compare+'</strong><span>'+words.mapPeriod+': </span><button type="button" data-time-visible="a" aria-pressed="'+(state.visible==='a')+'">'+words.a+'</button><button type="button" data-time-visible="b" aria-pressed="'+(state.visible==='b')+'">'+words.b+'</button></div><div class="time-comparison-dates">'+words.a+': '+description(state.range)+' · '+words.b+': '+description(state.compareRange)+'</div><div class="time-comparison-table"><table><thead><tr><th></th><th>'+words.a+'</th><th>'+words.b+'</th><th>'+words.difference+'</th></tr></thead><tbody>'+['events','countries','protected'].map(k=>'<tr><th>'+words[k]+'</th><td>'+fmt(a[k])+'</td><td>'+fmt(b[k])+'</td><td>'+fmt(a[k]-b[k])+'</td></tr>').join('')+'</tbody></table></div>';
      panel.querySelectorAll('[data-time-visible]').forEach(button=>button.addEventListener('click',()=>{
        state.visible=button.dataset.timeVisible;onChange();
      }));
    }
  }
  function open(){
    const words=w(),dialog=$('time-dialog');
    const option=(key)=>'<option value="'+key+'">'+words[key]+'</option>';
    dialog.lang=getLanguage();
    dialog.innerHTML='<form id="time-form"><header><h2>'+words.period+'</h2><button type="button" id="time-close" aria-label="'+words.cancel+'">×</button></header><div class="time-dialog-body"><label>'+words.period+'<select id="time-preset">'+PRESETS.map(option).join('')+'</select></label><label>'+words.basis+'<select id="time-basis">'+BASES.map(option).join('')+'</select></label><fieldset><legend>'+words.a+'</legend><div class="time-date-row"><label>'+words.start+'<input id="time-start" type="date" required></label><label>'+words.end+'<input id="time-end" type="date" required></label></div></fieldset><label class="time-compare-check"><input id="time-compare" type="checkbox"><span>'+words.compare+'</span></label><fieldset id="time-compare-fields"><legend>'+words.b+'</legend><label>'+words.compare+'<select id="time-compare-mode"><option value="previous">'+words.previous+'</option><option value="custom">'+words.custom+'</option></select></label><div class="time-date-row"><label>'+words.start+'<input id="time-compare-start" type="date" required></label><label>'+words.end+'<input id="time-compare-end" type="date" required></label></div></fieldset><p class="time-method">'+words.method+'</p><p class="time-method">'+words.zone+'</p><p id="time-error" role="alert"></p></div><footer><button type="button" id="time-cancel">'+words.cancel+'</button><button type="submit" class="time-apply">'+words.apply+'</button></footer></form>';
    const preset=$('time-preset'),basis=$('time-basis'),start=$('time-start'),end=$('time-end'),compare=$('time-compare'),mode=$('time-compare-mode'),bStart=$('time-compare-start'),bEnd=$('time-compare-end');
    preset.value=state.preset;basis.value=state.basis;
    const current=state.range||presetRange('last30'),previous=state.compareRange||previousRange(current);
    start.value=current.start;end.value=current.end;compare.checked=state.compare;mode.value=state.mode;bStart.value=previous.start;bEnd.value=previous.end;
    function sync(){
      if(preset.value!=='custom'){
        const range=presetRange(preset.value);
        if(range){start.value=range.start;end.value=range.end;}
      }
      const all=preset.value==='all';
      start.disabled=all;end.disabled=all;
      if(all)compare.checked=false;
      $('time-compare-fields').hidden=!compare.checked;
      const auto=mode.value==='previous';
      bStart.disabled=!compare.checked||auto;bEnd.disabled=!compare.checked||auto;
      const range={start:start.value,end:end.value};
      if(auto&&validRange(range)){
        const prev=previousRange(range);bStart.value=prev.start;bEnd.value=prev.end;
      }
    }
    preset.addEventListener('change',sync);
    [start,end].forEach(x=>x.addEventListener('change',()=>{preset.value='custom';sync();}));
    compare.addEventListener('change',sync);
    mode.addEventListener('change',sync);
    const close=()=>dialog.close();
    $('time-close').addEventListener('click',close);
    $('time-cancel').addEventListener('click',close);
    $('time-form').addEventListener('submit',(e)=>{
      e.preventDefault();
      const range=preset.value==='all'?null:{start:start.value,end:end.value};
      const b={start:bStart.value,end:bEnd.value};
      if((range&&!validRange(range))||(compare.checked&&!validRange(b))){$('time-error').textContent=words.invalid;return;}
      state={basis:basis.value,preset:preset.value,range,compare:compare.checked,mode:mode.value,compareRange:compare.checked?b:null,visible:'a'};
      lastDay=today();close();onChange();
    });
    sync();dialog.showModal();preset.focus();
  }
  function bind(){
    $('time-open').addEventListener('click',open);
    $('time-reset').addEventListener('click',()=>{state={basis:'occurrence_or_publication',preset:'all',range:null,compare:false,mode:'previous',compareRange:null,visible:'a'};onChange();});
  }
  return {bind,render,matches:(e)=>matchesRange(e,state.basis,active()),hasOccurrence:(e)=>!!occurrenceDay(e),info,resetDefault:()=>{state=initial();onChange();},getState:()=>({...state})};
}
