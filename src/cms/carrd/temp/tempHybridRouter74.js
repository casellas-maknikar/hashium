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

    // scrollpoint state
    t._pendingScrollHash = '';     // '#test'
    t._pendingScrollSection = '';  // 'page'
    t._reassertArmed = 0;

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

  // Carrd scrollpoints are elements with data-scroll-id="test"
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

  // NEW: brute-force restore attempts (5x) to beat Carrd timing/races
  restoreFragmentBurst(section, hash) {
    const t = this;

    // 5 attempts at increasing delays (tunable)
    const delays = [0, 60, 120, 250, 450];

    for (let i = 0; i < delays.length; i++) {
      setTimeout(() => {
        // Only restore if Carrd has cleared the hash OR changed it away from our scrollpoint.
        // (If it's still '#test', no need.)
        if (t.l.hash !== hash) {
          t.maskUrl(section, hash);
        }
      }, delays[i]);
    }
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

    // Initial entry (original)
    if ((!l.hash || l.hash === '#') && l.pathname !== '/') {
      t.drive(t.sectionFromPath(l.pathname), 0);
    } else {
      const s = (l.hash === '#') ? '' : t.sectionFromHash(l.hash);
      settleClean(s);
      if (l.hash === '#') t.drive('', 0);
    }

    // Click (cooperative)
    t.aEL('click', (e) => {
      const a = e.target?.closest?.('a[href^="#"]');
      if (!a) return;

      const href = a.getAttribute('href') || '#';
      if (!href || href === '#') return;

      // Scrollpoint intent
      if (t.isScrollPointHash(href)) {
        t._pendingScrollHash = href;
        t._pendingScrollSection = t.currentSectionCanonical();
        t._reassertArmed = 1;

        // After Carrd processes click, if it did NOT leave us at '#test', reassert once.
        setTimeout(() => {
          if (!t._reassertArmed) return;
          if (l.hash === t._pendingScrollHash) {
            t._reassertArmed = 0;
            return;
          }
          t._reassertArmed = 0;
          l.hash = t._pendingScrollHash;
        }, 0);

        return; // do not drive
      }

      // Section navigation (original)
      e.preventDefault();
      const s = (href === '#' || href === '') ? '' : t.sectionFromHash(href);
      t.drive(s, 1);
    }, 1);

    // Hashchange
    t.aEL('hashchange', () => {
      if (t._driving) return;

      if (l.hash === '#') return t.drive('', 0);

      // Scrollpoint hash: let Carrd scroll natively.
      if (t.isScrollPointHash(l.hash)) {
        const section = t._pendingScrollSection || t.currentSectionCanonical();
        const hash = l.hash;

        // Mask immediately (so you see /page#test right away)
        setTimeout(() => {
          t.maskUrl(section, hash);
        }, 0);

        // NEW: try restoring 5 times to beat Carrd clearing it later
        t.restoreFragmentBurst(section, hash);

        return;
      }

      // Normal section hash => clean URL
      settleClean(t.sectionFromHash(l.hash));
    });

    // Back / Forward (original)
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
