(() => {
  'use strict';

  // Apply before styles load to avoid flashing the wrong theme on reload.
  const systemTheme = window.matchMedia('(prefers-color-scheme: dark)');
  let preference = 'system';
  try {
    preference = JSON.parse(localStorage.getItem('packingPlanner.v2'))?.preferences?.theme || 'system';
  } catch { /* Storage may be unavailable; use the system preference. */ }

  function apply(value) {
    preference = ['light', 'dark', 'system'].includes(value) ? value : 'system';
    const dark = preference === 'dark' || (preference === 'system' && systemTheme.matches);
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    const toggle = document.getElementById('themeToggle');
    if (toggle) {
      toggle.textContent = dark ? '☀ Light' : '☾ Dark';
      toggle.setAttribute('aria-label', `Switch to ${dark ? 'light' : 'dark'} mode`);
      toggle.title = `Switch to ${dark ? 'light' : 'dark'} mode`;
    }
  }

  systemTheme.addEventListener('change', () => {
    if (preference === 'system') apply(preference);
  });
  window.packingTheme = { apply };
  apply(preference);
})();
