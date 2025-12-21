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

    // scrollpoint bookkeeping
    t._pendingScrollHash = '';     // '#test' we want Carrd to act on
    t._maskSectionForScroll = '';  // section we want in the masked URL
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

  hashFor(section) {
    if (!section) return `#${this._rootId}`;
    return `#${section.replaceAll('/', '--')}`;
  }

  // Carrd scrollpoint exists?
  isScrollPointHash(hash) {
    const raw = String(hash || '');
    if (!raw || raw === '#') return false;
    const id = raw.startsWith('#') ? raw.slice(1) : raw;
    return !!document.querySelector(`[data-scroll-id="${id}"]`);
  }

  // Figure out what section we should mask as (prefer history.state)
  currentSectionCanonical() {
    const s = history.state?.section;
    if (typeof s === 'string') return s;
    return this.sectionFromPath(this.l.pathname) || '';
  }

  // Mask URL to /section#scroll without changing location.hash
  maskScrollUrl(section, hash) {
    const t = this;
    t.rS({ section }, '', `${t.o}/${section || ''}${hash}`);
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
    const t = this, l = t.l, ms = t.SETTLE_MS;

    t._rootId = t.detectRootId();

    const settleClean = (section) => setTimeout(() => {
      t.rS({ section }, '', `${t.o}/${section || ''}`);
    }, ms);

    // -----------------------------
    // 1) Intercept scrollpoint clicks early (like your working version)
    // BUT instead of scrolling ourselves, we force Carrd to scroll by setting hash.
    // -----------------------------
    const interceptScrollpoint = (e) => {
      const a = e.target?.closest?.('a[href^="#"]');
      if (!a) return;

      const href = a.getAttribute('href') || '#';
      if (!href || href === '#') return;
      if (!t.isScrollPointHash(href)) return;

      // Block Carrd click routing to prevent "#page"
      e.preventDefault();
      e.stopImmediatePropagation();

      t._suppressClickUntil = Date.now() + 1000;

      // Remember what we want to mask to after Carrd scrolls
      t._pendingScrollHash = href;
      t._maskSectionForScroll = t.currentSectionCanonical();

      // IMPORTANT: Let Carrd do its native scrollpoint behavior:
      // set the REAL hash to '#test'
      // Carrd listens for hashchange and will scroll using its own animation variants
      l.hash = href;
    };

    t.aEL('pointerdown', interceptScrollpoint, true);
    t.aEL('mousedown', interceptScrollpoint, true);

    // Suppress the follow-up click (Carrd may also listen on click)
    t.aEL('click', (e) => {
      if (Date.now() <= t._suppressClickUntil) {
        const a = e.target?.closest?.('a[href^="#"]');
        if (a) {
          e.preventDefault();
          e.stopImmediatePropagation();
        }
      }
    }, true);

    // -----------------------------
    // 2) Initial entry (original routing)
    // BUT if loaded directly at /page#test, we want Carrd to scroll, then mask
    // -----------------------------
    if (t.isScrollPointHash(l.hash)) {
      // Make sure the section is correct (pathname already is /page)
      const section = t.sectionFromPath(l.pathname) || '';
      t._maskSectionForScroll = section;
      t._pendingScrollHash = l.hash;

      // Let Carrd process the hash on load; then we will mask in hashchange
      // (do NOT call drive() here or you’ll fight Carrd’s initialization)
      t.rS({ section }, '', `${t.o}/${section || ''}${l.hash}`);
    } else if ((!l.hash || l.hash === '#') && l.pathname !== '/') {
      t.drive(t.sectionFromPath(l.pathname), 0);
    } else {
      const s = (l.hash === '#') ? '' : t.sectionFromHash(l.hash);
      settleClean(s);
      if (l.hash === '#') t.drive('', 0);
    }

    // -----------------------------
    // 3) Hashchange
    // - if it’s a scrollpoint hash, Carrd will scroll natively.
    // - after Carrd handles it, mask the visible URL to /page#test
    // - if Carrd clears the hash, restore the masked URL (without changing hash)
    // -----------------------------
    t.aEL('hashchange', () => {
      if (t._driving) return;

      // If Carrd clears hash after scrolling, keep the masked /page#test in the bar
      if ((!l.hash || l.hash === '#') && t._pendingScrollHash && t.isScrollPointHash(t._pendingScrollHash)) {
        t.maskScrollUrl(t._maskSectionForScroll || t.currentSectionCanonical(), t._pendingScrollHash);
        return;
      }

      if (l.hash === '#') return t.drive('', 0);

      // Scrollpoint hash: let Carrd scroll, then mask URL
      if (t.isScrollPointHash(l.hash)) {
        const section = t._maskSectionForScroll || t.currentSectionCanonical();
        const hash = l.hash;

        t._pendingScrollHash = hash;

        // Wait a tick so Carrd completes its internal scroll handling first
        setTimeout(() => {
          t.maskScrollUrl(section, hash);
        }, 0);

        return;
      }

      // Otherwise: normal section hash
      settleClean(t.sectionFromHash(l.hash));
    });

    // -----------------------------
    // 4) Section clicks (original)
    // -----------------------------
    t.aEL('click', (e) => {
      if (Date.now() <= t._suppressClickUntil) return;

      const a = e.target?.closest?.('a[href^="#"]');
      if (!a) return;
      e.preventDefault();

      const href = a.getAttribute('href') || '#';
      const s = (href === '#' || href === '') ? '' : t.sectionFromHash(href);
      t.drive(s, 1);
    }, 1);

    // -----------------------------
    // 5) Back/Forward (original)
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
