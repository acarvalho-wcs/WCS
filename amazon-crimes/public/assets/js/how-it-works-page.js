import { howItWorksContent } from './how-it-works.js';

const ui = {
  pt: {
    subtitle: 'Metodologia, validação e limites de interpretação',
    back: '← Voltar ao Observatório',
    summaryKicker: 'METODOLOGIA',
    summaryTitle: 'Fontes abertas, validação e rastreabilidade',
    summaryText: 'A plataforma organiza informações públicas e mantém distinção entre fatos documentados, alegações atribuídas e contexto analítico.',
    tocKicker: 'NAVEGAÇÃO',
    tocTitle: 'Nesta página'
  },
  en: {
    subtitle: 'Methodology, validation and interpretation limits',
    back: '← Back to the Observatory',
    summaryKicker: 'METHODOLOGY',
    summaryTitle: 'Open sources, validation and traceability',
    summaryText: 'The platform organizes public information while preserving the distinction between documented facts, attributed allegations and analytical context.',
    tocKicker: 'NAVIGATION',
    tocTitle: 'On this page'
  },
  es: {
    subtitle: 'Metodología, validación y límites de interpretación',
    back: '← Volver al Observatorio',
    summaryKicker: 'METODOLOGÍA',
    summaryTitle: 'Fuentes abiertas, validación y trazabilidad',
    summaryText: 'La plataforma organiza información pública y mantiene la distinción entre hechos documentados, alegaciones atribuidas y contexto analítico.',
    tocKicker: 'NAVEGACIÓN',
    tocTitle: 'En esta página'
  }
};

function escapeHtml(value = '') {
  return String(value).replace(/[&<>'"]/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    "'": '&#039;',
    '"': '&quot;'
  }[char]));
}

function queryLanguage() {
  const param = new URLSearchParams(window.location.search).get('lang');
  if (['pt', 'en', 'es'].includes(param)) return param;

  const stored = localStorage.getItem('amazon-observatory-language');
  if (['pt', 'en', 'es'].includes(stored)) return stored;

  return 'pt';
}

let language = queryLanguage();

function render() {
  const content = howItWorksContent[language] || howItWorksContent.pt;
  const labels = ui[language] || ui.pt;

  document.documentElement.lang = language === 'pt' ? 'pt-BR' : language;
  document.documentElement.dataset.theme = localStorage.getItem('amazon-observatory-theme') || 'dark';
  document.title = `${content.eyebrow} | ${content.title}`;

  document.querySelectorAll('.lang').forEach((button) => {
    button.classList.toggle('active', button.dataset.lang === language);
  });

  document.querySelector('#how-page-kicker').textContent = content.eyebrow;
  document.querySelector('#how-page-title').textContent = content.title;
  document.querySelector('#how-page-subtitle').textContent = labels.subtitle;
  document.querySelector('#how-page-back').textContent = labels.back;

  document.querySelector('#how-summary-kicker').textContent = labels.summaryKicker;
  document.querySelector('#how-summary-title').textContent = labels.summaryTitle;
  document.querySelector('#how-summary-text').textContent = labels.summaryText;
  document.querySelector('#how-toc-kicker').textContent = labels.tocKicker;
  document.querySelector('#how-toc-title').textContent = labels.tocTitle;

  document.querySelector('#how-page-intro').innerHTML = (content.intro || [])
    .map((paragraph, index) => index === 0
      ? `<p class="how-page-lead">${escapeHtml(paragraph)}</p>`
      : `<p>${escapeHtml(paragraph)}</p>`)
    .join('');

  document.querySelector('#how-page-toc').innerHTML = (content.sections || [])
    .map((section) => {
      const id = `section-${section.number}`;
      return `<a href="#${id}"><span>${escapeHtml(section.number)}</span><span>${escapeHtml(section.title)}</span></a>`;
    })
    .join('');

  document.querySelector('#how-page-sections').innerHTML = (content.sections || [])
    .map((section) => {
      const id = `section-${section.number}`;
      return `
        <section id="${id}" class="how-page-section">
          <div class="how-page-section-meta">
            <span class="how-page-section-number">${escapeHtml(section.number)}</span>
          </div>
          <div class="how-page-section-copy">
            <h2>${escapeHtml(section.title)}</h2>
            ${(section.paragraphs || []).map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`).join('')}
          </div>
        </section>
      `;
    })
    .join('');

  document.querySelector('#how-page-footer-title').textContent = content.footerTitle || '';
  document.querySelector('#how-page-footer-text').textContent = content.footerText || '';

  const url = new URL(window.location.href);
  url.searchParams.set('lang', language);
  history.replaceState(null, '', url);
  localStorage.setItem('amazon-observatory-language', language);
}

document.querySelectorAll('.lang').forEach((button) => {
  button.addEventListener('click', () => {
    language = button.dataset.lang;
    render();
  });
});

render();
