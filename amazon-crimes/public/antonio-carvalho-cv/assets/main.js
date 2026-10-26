(() => {
  'use strict';
  const menuButton = document.querySelector('#menu-toggle');
  const mobileNav = document.querySelector('#mobile-nav');
  if (menuButton && mobileNav) {
    const setMenu = (open) => {
      menuButton.setAttribute('aria-expanded', String(open));
      mobileNav.hidden = !open;
      document.body.classList.toggle('menu-open', open);
    };
    menuButton.addEventListener('click', () => setMenu(menuButton.getAttribute('aria-expanded') !== 'true'));
    mobileNav.querySelectorAll('a').forEach(a => a.addEventListener('click', () => setMenu(false)));
    window.addEventListener('resize', () => { if (window.innerWidth > 950) setMenu(false); });
  }
  const search = document.querySelector('#pub-search');
  const toggle = document.querySelector('#pub-toggle');
  const noResults = document.querySelector('#pub-no-results');
  const items = [...document.querySelectorAll('#paper-list .paper-item')];
  if (search && toggle && items.length) {
    let expanded = false;
    const normalize = s => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    const render = () => {
      const query = normalize(search.value.trim());
      let shown = 0;
      items.forEach((item, i) => {
        const match = !query || normalize(item.dataset.query || '').includes(query);
        const visible = match && (Boolean(query) || expanded || i < 5);
        item.hidden = !visible;
        if (visible) shown++;
      });
      noResults.hidden = shown !== 0;
      toggle.hidden = Boolean(query);
      toggle.setAttribute('aria-expanded', String(expanded));
      toggle.innerHTML = (expanded ? toggle.dataset.showLess + ' <span aria-hidden="true">↑</span>' : toggle.dataset.showAll + ' <span aria-hidden="true">↓</span>');
    };
    toggle.addEventListener('click', () => { expanded = !expanded; render(); });
    search.addEventListener('input', render);
    render();
  }
})();