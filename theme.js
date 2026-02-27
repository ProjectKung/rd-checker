// theme.js (สำหรับ Uiverse checkbox toggle)
document.addEventListener('DOMContentLoaded', () => {
  const cb = document.getElementById('themeToggleCheckbox');
  if (!cb) {
    console.error('theme.js: not found #themeToggleCheckbox');
    return;
  }

  const THEME_KEY = 'rd_checker_theme';

  function applyTheme(isDark) {
    document.body.classList.toggle('dark', isDark);
    cb.checked = isDark;

    // tooltip/aria
    const label = isDark
      ? 'โหมดมืด (คลิกสลับเป็นโหมดสว่าง)'
      : 'โหมดสว่าง (คลิกสลับเป็นโหมดมืด)';
    cb.setAttribute('aria-label', label);
    cb.closest('.theme-switch')?.setAttribute('title', label);
  }

  function animateOnce() {
    document.body.classList.remove('theme-animate');
    void document.body.offsetWidth; // force reflow
    document.body.classList.add('theme-animate');
    setTimeout(() => document.body.classList.remove('theme-animate'), 650);
  }

  // init theme (ถ้าไม่มีค่าที่เคย save ให้ยึดตามระบบ)
  const saved = localStorage.getItem(THEME_KEY);
  const prefersDark = window.matchMedia?.('(prefers-color-scheme: dark)')?.matches;
  const initialDark =
    saved === 'dark' ? true :
    saved === 'light' ? false :
    !!prefersDark;

  applyTheme(initialDark);

  // เปลี่ยนโหมดเมื่อ checkbox ถูกติ๊ก/เอาติ๊กออก
  cb.addEventListener('change', () => {
    const isDark = cb.checked;
    localStorage.setItem(THEME_KEY, isDark ? 'dark' : 'light');
    animateOnce();
    applyTheme(isDark);
  });
});
