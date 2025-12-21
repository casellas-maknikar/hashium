class HybridRouter {
  constructor() {
    const w = window, d = w.document, l = w.location, h = w.history, t = this;
    t.l = l;
    t.o = l.origin;
    t.rS = h.replaceState.bind(h);
    t.aEL = w.addEventListener.bind(w);
    t.SETTLE_MS = 450;
    t._driving = 0;

    // detected root section id (first Carrd section)
    t._rootId = '';

    (d.readyState === 'loading'
      ? d.addEventListener.bind(d, 'DOMContentLoaded')
      : (f) => f()
    )(() => t.init(), { once: 1 });
  }

  sectionFromHash(h) { return String(h || '').slice(1).replaceAll('--', '/'); }
  sectionFromPath(p) { return decodeURIComponent(String(p || '').replace(/^\/+/, '')); }

  detectRootId() {
    const s =
      document.querySelector('#main section[id]') ||
      document.querySelector('main section[id]') ||
      document.querySelector('section[id]');
    return (s && s.id) ? s.id : 'home';
  }

  // Canonical root is '' (clean URL "/"), but Carrd needs a real id to switch sections.
  hashFor(section) {
    if (!section) return `#${this._rootId}`;
    return `#${section.replaceAll('/', '--')}`;
  }

  // Scrollpoints are elements with data-scroll-id="<id>"
  isScrollPointHash(hash) {
    const raw = String(hash || '');
    if (!raw || raw === '#') return false;
    const id = raw.slice(1);
    return !!document.querySelector(`[data-scroll-id="${id}"]`);
  }

  getScrollElFromHash(hash) {
    const raw = String(hash || '');
    if (!raw || raw === '#') return null;
    const id = raw.slice(1);
    return document.querySelector(`[data-scroll-id="${id}"]`);
  }

  // Scroll helper (you can tweak behavior if you want)
  scrollToEl(el) {
    if (!el) return;
    try {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch {
      // older browsers / edge cases
      el.scrollIntoView(true);
    }
  }

  // Active Carrd section canonical name ('' for home)
  activeSectionCanonical() {
    const sec =
      document.querySelector('#main section.active[id]') ||
      document.querySelector('main section.active[id]') ||
      document.querySelector('section.active[id]');
    let id = (sec && sec.id) ? sec.id : (this._rootId || 'home');
    id = String(id).replace(/-section$/, '');
    if (id === 'home') return '';
    return id.replaceAll('--', '/');
  }

  drive(section, push) {
    const t = this, l = t.l, ms = t.SETTLE_MS;
    t._driving = 1;

    const hh = t.hashFor(section);
    push ? (l.hash = hh) : l.replace(hh);

    setTimeout(() => {
      t.rS({ section }, '', `${t.o}/${section || ''}`);
      t._driving = 0;
    }, ms);
  }

  init() {
    const t = this, l = t.l, o = t.o, rS = t.rS, ms = t.SETTLE_MS;

    t._rootId = t.detectRootId();

    const clean = (section) => rS({ section }, '', `${o}/${section || ''}`);
    const settleClean = (section) => setTimeout(() => clean(section), ms);

    // ---- Initial entry ----
    // If URL is /page#test (scrollpoint), we must:
    // 1) navigate to /page section (Carrd needs it visible)
    // 2) scroll to the scrollpoint ourselves
    // 3) ensure URL remains /page#test
    if (t.isScrollPointHash(l.hash)) {
      const section = t.sectionFromPath(l.pathname) || '';
      // Ensure Carrd is on the correct section.
      // (If you're already on that section this is harmless.)
      t.drive(section, 0);

      // After section settles, scroll and re-mask URL.
      setTimeout(() => {
        const el = t.getScrollElFromHash(l.hash);
        t.scrollToEl(el);
        rS({ section }, '', `${o}/${section || ''}${l.hash}`);
      }, ms + 30);

      // Don’t run the normal init logic.
      return;
    }

    // Original init behavior (unchanged)
    if ((!l.hash || l.hash === '#') && l.pathname !== '/') {
      t.drive(t.sectionFromPath(l.pathname), 0);
    } else {
      const s = (l.hash === '#') ? '' : t.sectionFromHash(l.hash);
      settleClean(s);
      if (l.hash === '#') t.drive('', 0);
    }

    // ---- Click ----
    // Two modes:
    // - section nav: original behavior (preventDefault + drive)
    // - scrollpoint: preventDefault, keep URL as /section#id, and scroll ourselves
    t.aEL('click', (e) => {
      const a = e.target?.closest?.('a[href^="#"]');
      if (!a) return;

      const href = a.getAttribute('href') || '#';

      // Scrollpoint click (secondary fragment)
      if (href.startsWith('#') && href.length > 1) {
        const el = t.getScrollElFromHash(href);
        if (el) {
          e.preventDefault();

          // Determine the current canonical section (prefer history state; fallback to DOM).
          const section =
            (typeof history.state?.section === 'string')
              ? history.state.section
              : t.activeSectionCanonical();

          // Mask URL immediately as /page#test (does not change location.hash)
          rS({ section }, '', `${o}/${section || ''}${href}`);

          // Scroll ourselves (no need for /#test)
          // Use a microtask delay so layout is stable.
          setTimeout(() => t.scrollToEl(el), 0);

          return;
        }
      }

      // Otherwise: treat as section link (original)
      e.preventDefault();

      const s = (href === '#' || href === '') ? '' : t.sectionFromHash(href);
      t.drive(s, 1);
    }, 1);

    // ---- Hashchange ----
    // We only keep this for section routing.
    // If the hash becomes a scrollpoint for any reason, we DO NOT treat it as a section;
    // instead we scroll + mask.
    t.aEL('hashchange', () => {
      if (t._driving) return;

      // If hash becomes a scrollpoint, handle it as secondary fragment.
      if (t.isScrollPointHash(l.hash)) {
        const el = t.getScrollElFromHash(l.hash);
        const section =
          (typeof history.state?.section === 'string')
            ? history.state.section
            : t.activeSectionCanonical();

        // Scroll and mask
        setTimeout(() => t.scrollToEl(el), 0);
        rS({ section }, '', `${o}/${section || ''}${l.hash}`);
        return;
      }

      // Original section behavior
      if (l.hash === '#') return t.drive('', 0);
      settleClean(t.sectionFromHash(l.hash));
    });

    // ---- Back / Forward ----
    t.aEL('popstate', (e) => {
      if (t._driving) return;

      const section =
        typeof e.state?.section === 'string'
          ? e.state.section
          : t.sectionFromPath(l.pathname);

      // If the current URL has a secondary fragment, after driving,
      // scroll to it ourselves and keep it visible.
      const maybeScrollHash = l.hash && l.hash !== '#' ? l.hash : '';

      t.drive(section, 0);

      if (maybeScrollHash && t.isScrollPointHash(maybeScrollHash)) {
        setTimeout(() => {
          const el = t.getScrollElFromHash(maybeScrollHash);
          t.scrollToEl(el);
          rS({ section }, '', `${o}/${section || ''}${maybeScrollHash}`);
        }, ms + 30);
      }
    });
  }
}

export default new HybridRouter();
