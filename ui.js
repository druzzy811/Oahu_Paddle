/* ==========================================================================
   ui.js — Global UI logic (Drawer, Focus Trapping, etc.)
   ========================================================================== */

document.addEventListener('DOMContentLoaded', () => {
  const hamburger = document.querySelector('.hamburger');
  const drawer = document.querySelector('.drawer'); // Or document.getElementById('drawer') if using ID
  const closeBtn = document.querySelector('.drawer-close');
  const backdrop = document.querySelector('.backdrop');

  // Safety check: if this page doesn't have a menu, don't run the script
  if (!hamburger || !drawer || !closeBtn || !backdrop) return;

  let lastFocused;

  // Optional: If you have a specific inert function for accessibility, define it here
  function setInert(state) {
    const mainContent = document.querySelector('.wrap') || document.querySelector('main');
    if (mainContent) {
      if (state) mainContent.setAttribute('inert', '');
      else mainContent.removeAttribute('inert');
    }
  }

  function openDrawer() {
    lastFocused = document.activeElement;
    drawer.hidden = false;
    backdrop.hidden = false;
    
    // Tiny timeout ensures the display changes before the CSS transform fires
    setTimeout(() => {
        drawer.classList.add('open');
    }, 10);
    
    setInert(true);
    hamburger.setAttribute('aria-expanded', 'true');
    closeBtn.focus();
    document.addEventListener('keydown', trapFocus);
  }

  function closeDrawer() {
    (lastFocused || hamburger).focus();
    drawer.classList.remove('open');
    
    // Wait for the CSS sliding animation (.25s) to finish before hiding elements
    setTimeout(() => {
        drawer.hidden = true;
        backdrop.hidden = true;
    }, 250); 
    
    setInert(false);
    hamburger.setAttribute('aria-expanded', 'false');
    document.removeEventListener('keydown', trapFocus);
  }

  function trapFocus(e) {
    if (e.key !== 'Tab' || drawer.hidden) return;
    const focusables = drawer.querySelectorAll(
      'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])'
    );
    if (!focusables.length) return;
    
    const first = focusables[0];
    const last  = focusables[focusables.length - 1];
    
    if (e.shiftKey && document.activeElement === first) { 
      e.preventDefault(); 
      last.focus(); 
    } else if (!e.shiftKey && document.activeElement === last) { 
      e.preventDefault(); 
      first.focus(); 
    }
  }

  hamburger.addEventListener('click', openDrawer);
  closeBtn.addEventListener('click', closeDrawer);
  backdrop.addEventListener('click', closeDrawer);
  document.addEventListener('keydown', (e) => { 
    if (e.key === 'Escape' && drawer.classList.contains('open')) closeDrawer(); 
  });
});