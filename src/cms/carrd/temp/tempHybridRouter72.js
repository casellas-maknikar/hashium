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

    // "Work with Carrd" scrollpoint state
    t._pendingScrollHash = '';    // '#test' we WANT Carrd to scroll to
    t._pendingScrollSection = ''; // 'page' we want to mask as /page#test
    t._reassertArmed = 0;         // allow 1 reassert per click
    t._lastScrollHash = '';       // last scrollpoint hash Carrd actually used
    t._lastScrollAt = 0;          // timestamp when Carrd used it

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

  // Scrollpoints are elements with data-scroll-id="test"
  isScrollPointHash(hash) {
    const raw = String(hash || '');
    if (!raw || raw === '#') return false;
    const id = raw.startsWith('#') ? raw.slice(1) : raw;
    return !!document.querySelector(`[data-scroll-id="${id}"]`);
  }

  // Prefer canonical section from history.state; fallback to pathname.
  currentSectionCanonical() {
    const s = history.state?.section;
    if (typeof s === 'string') return s;
    return this.sectionFromPath(this.l.pathname) || '';
  }

  maskUrl(section, hash) {
    this.rS({ section }, '', `${this.o}/${section || ''}${hash || ''}`);
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

    // --------------------------
    // Initial entry (original behavior)
    // --------------------------
    if ((!l.hash || l.hash === '#') && l.pathname !== '/') {
      t.drive(t.sectionFromPath(l.pathname), 0);
    } else {
      const s = (l.hash === '#') ? '' : t.sectionFromHash(l.hash);
      settleClean(s);
      if (l.hash === '#') t.drive('', 0);
    }

    // --------------------------
    // CLICK (cooperative)
    // Don't preventDefault. Don't stop propagation.
    // Just detect scrollpoint intent and, if Carrd misclassifies it,
    // reassert '#test' ONCE after Carrd runs.
    // --------------------------
    t.aEL('click', (e) => {
      const a = e.target?.closest?.('a[href^="#"]');
      if (!a) return;

      const href = a.getAttribute('href') || '#';
      if (!href || href === '#') return;

      // If this click targets a scrollpoint, arm a one-time reassert.
      if (t.isScrollPointHash(href)) {
        t._pendingScrollHash = href;                 // '#test'
        t._pendingScrollSection = t.currentSectionCanonical(); // 'page'
        t._reassertArmed = 1;

        // After Carrd processes click, if it turned it into '#page' (or anything else),
        // reassert '#test' so Carrd's own hashchange scrollpoint logic runs.
        setTimeout(() => {
          if (!t._reassertArmed) return;

          // If Carrd already put us at the intended scroll hash, do nothing.
          if (l.hash === t._pendingScrollHash) return;

          // If Carrd replaced it with section hash (like '#page'), reassert once.
          // This is a "workaround" not a fight: we still let Carrd do the scrolling.
          t._reassertArmed = 0;
          l.hash = t._pendingScrollHash;
        }, 0);

        return;
      }

      // Not a scrollpoint: keep your original section routing behavior.
      // (This part DOES preventDefault, as your section system requires it.)
      e.preventDefault();

      const s = (href === '#' || href === '') ? '' : t.sectionFromHash(href);
      t.drive(s, 1);
    }, 1);

    // --------------------------
    // HASHCHANGE
    // - If it's a scrollpoint: let Carrd scroll, then mask URL to /page#test
    // - If Carrd clears hash after scrolling: restore masked /page#test in address bar
    // --------------------------
    t.aEL('hashchange', () => {
      if (t._driving) return;

      // If Carrd clears the hash shortly after a scrollpoint scroll, restore masked URL
      // WITHOUT touching location.hash (no re-scroll).
      if ((!l.hash || l.hash === '#') && t._lastScrollHash && (Date.now() - t._lastScrollAt) < 1500) {
        const section = t._pendingScrollSection || t.currentSectionCanonical();
        t.maskUrl(section, t._lastScrollHash);
        return;
      }

      // Root hash behavior (original)
      if (l.hash === '#') return t.drive('', 0);

      // Scrollpoint hash: Carrd will scroll natively (with its variants).
      if (t.isScrollPointHash(l.hash)) {
        // Record so we can restore if Carrd clears it.
        t._lastScrollHash = l.hash;
        t._lastScrollAt = Date.now();

        const section = t._pendingScrollSection || t.currentSectionCanonical();
        const hash = l.hash;

        // After Carrd scrolls, mask to /page#test without changing the hash.
        setTimeout(() => {
          t.maskUrl(section, hash);
        }, 0);

        return;
      }

      // Otherwise treat as section hash (original)
      settleClean(t.sectionFromHash(l.hash));
    });

    // --------------------------
    // Back / Forward (original)
    // --------------------------
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
