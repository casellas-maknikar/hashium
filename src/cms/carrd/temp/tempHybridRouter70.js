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

    // used to suppress the follow-up click after pointerdown
    t._suppressClickUntil = 0;

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
  getScrollElFromHash(hash) {
    const raw = String(hash || '');
    if (!raw || raw === '#') return null;
    const id = raw.startsWith('#') ? raw.slice(1) : raw;
    return document.querySelector(`[data-scroll-id="${id}"]`);
  }

  isScrollPointHash(hash) {
    return !!this.getScrollElFromHash(hash);
  }

  // Best-effort current canonical section: use history.state if present, else pathname
  currentSectionCanonical() {
    const s = history.state?.section;
    if (typeof s === 'string') return s;
    return this.sectionFromPath(this.l.pathname) || '';
  }

  // Programmatic scroll that tolerates Carrd layout/animation timing
  scrollToEl(el) {
    if (!el) return;

    const doScroll = () => {
      try {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      } catch {
        el.scrollIntoView(true);
      }
    };

    // 2 rAFs helps when Carrd is finishing a transition/layout pass
    requestAnimationFrame(() => requestAnimationFrame(doScroll));
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

    // -----------------------------
    // Secondary fragment interception
    // -----------------------------
    // We intercept pointerdown/mousedown BEFORE Carrd click logic can force "#page".
    // Then we:
    // - keep URL as "/page#test" using replaceState (no location.hash changes)
    // - scroll ourselves to [data-scroll-id="test"]
    const interceptScrollpoint = (e) => {
      const a = e.target?.closest?.('a[href^="#"]');
      if (!a) return;

      const href = a.getAttribute('href') || '#';
      if (!href || href === '#') return;

      const el = t.getScrollElFromHash(href);
      if (!el) return; // not a scrollpoint, let normal routing handle it

      // Block Carrd & default anchor behavior
      e.preventDefault();
      e.stopImmediatePropagation();

      // Suppress the click that follows pointerdown/mousedown
      t._suppressClickUntil = Date.now() + 1000;

      // Maintain current canonical section in path and append secondary fragment
      const section = t.currentSectionCanonical();
      rS({ section }, '', `${o}/${section || ''}${href}`);

      // Scroll now (programmatic)
      t.scrollToEl(el);
    };

    // Use both pointerdown and mousedown for broad compatibility
    t.aEL('pointerdown', interceptScrollpoint, true);
    t.aEL('mousedown', interceptScrollpoint, true);

    // Also suppress the click if we intercepted pointerdown (Carrd may still listen on click)
    t.aEL('click', (e) => {
      if (Date.now() <= t._suppressClickUntil) {
        // If the click was on an anchor, prevent any last-second Carrd rewriting
        const a = e.target?.closest?.('a[href^="#"]');
        if (a) {
          e.preventDefault();
          e.stopImmediatePropagation();
        }
      }
    }, true);

    // -----------------------------
    // Initial entry (original logic, with ONE addition: handle /page#test direct loads)
    // -----------------------------
    if (t.isScrollPointHash(l.hash)) {
      // If user loaded /page#test, keep it and scroll after Carrd settles.
      const section = t.sectionFromPath(l.pathname) || '';
      // Ensure history state is correct and URL stays masked
      rS({ section }, '', `${o}/${section || ''}${l.hash}`);

      setTimeout(() => {
        const el = t.getScrollElFromHash(l.hash);
        t.scrollToEl(el);
        // re-mask once more in case Carrd touches history
        rS({ section }, '', `${o}/${section || ''}${l.hash}`);
      }, ms + 30);

      // Don’t treat #test as section routing
    } else if ((!l.hash || l.hash === '#') && l.pathname !== '/') {
      t.drive(t.sectionFromPath(l.pathname), 0);
    } else {
      const s = (l.hash === '#') ? '' : t.sectionFromHash(l.hash);
      settleClean(s);
      if (l.hash === '#') t.drive('', 0);
    }

    // -----------------------------
    // Normal section click routing (original)
    // -----------------------------
    t.aEL('click', (e) => {
      // If we already intercepted as scrollpoint, ignore
      if (Date.now() <= t._suppressClickUntil) return;

      const a = e.target?.closest?.('a[href^="#"]');
      if (!a) return;
      e.preventDefault();

      const href = a.getAttribute('href') || '#';
      const s = (href === '#' || href === '') ? '' : t.sectionFromHash(href);
      t.drive(s, 1);
    }, 1);

    // -----------------------------
    // Hash cleanup (original, but do NOT treat scrollpoints as sections)
    // -----------------------------
    t.aEL('hashchange', () => {
      if (t._driving) return;

      // If Carrd ever sets a scrollpoint hash directly, convert it into a secondary fragment
      if (t.isScrollPointHash(l.hash)) {
        const section = t.currentSectionCanonical();
        rS({ section }, '', `${o}/${section || ''}${l.hash}`);
        const el = t.getScrollElFromHash(l.hash);
        t.scrollToEl(el);
        return;
      }

      if (l.hash === '#') return t.drive('', 0);
      settleClean(t.sectionFromHash(l.hash));
    });

    // -----------------------------
    // Back / Forward (original)
    // -----------------------------
    t.aEL('popstate', (e) => {
      if (t._driving) return;
      t.drive(
        typeof e.state?.section === 'string' ? e.state.section : t.sectionFromPath(l.pathname),
        0
      );
    });
  }
}

export default new HybridRouter();
