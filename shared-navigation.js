// Shared navigation for both sites. No dependencies or map/gallery interactions.
(() => {
  const init = () => {
    const button = document.querySelector('.shared-menu-button');
    const menu = document.querySelector('.shared-mobile-menu');
    if (!button || !menu) return;
    const close = (returnFocus = false) => {
      if (menu.hidden) return;
      menu.hidden = true;
      button.setAttribute('aria-expanded', 'false');
      button.setAttribute('aria-label', 'Open navigation');
      if (returnFocus) button.focus();
    };
    button.addEventListener('click', () => {
      const opening = menu.hidden;
      menu.hidden = !opening;
      button.setAttribute('aria-expanded', String(opening));
      button.setAttribute('aria-label', opening ? 'Close navigation' : 'Open navigation');
    });
    menu.addEventListener('click', (e) => { if (e.target.closest('a')) close(); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(true); });
    document.addEventListener('click', (e) => { if (!menu.hidden && !menu.contains(e.target) && !button.contains(e.target)) close(); });
    window.matchMedia('(min-width: 1101px)').addEventListener('change', (e) => { if(e.matches) close(); });
  };
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
