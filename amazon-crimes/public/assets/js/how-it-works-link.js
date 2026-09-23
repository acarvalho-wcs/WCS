const labels = {
  pt: 'Como funciona',
  en: 'How it works',
  es: 'Cómo funciona'
};

function currentLanguage() {
  const stored = localStorage.getItem('amazon-observatory-language');
  if (stored && labels[stored]) return stored;
  const active = document.querySelector('.lang.active')?.dataset?.lang;
  return labels[active] ? active : 'pt';
}

function syncHowItWorksLink() {
  const lang = currentLanguage();
  const link = document.querySelector('#how-it-works-link');
  const label = document.querySelector('#how-it-works-label');
  if (label) label.textContent = labels[lang];
  if (link) link.href = `./how-it-works.html?lang=${lang}`;
}

document.querySelectorAll('.lang').forEach((button) => {
  button.addEventListener('click', () => window.setTimeout(syncHowItWorksLink, 0));
});

const switcher = document.querySelector('.language-switcher');
if (switcher) {
  new MutationObserver(syncHowItWorksLink).observe(switcher, {
    subtree: true,
    attributes: true,
    attributeFilter: ['class']
  });
}

syncHowItWorksLink();
