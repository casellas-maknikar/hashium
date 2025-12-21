class HybridRouter {
  constructor() {
    const w = window, d = w.document, l = w.location, h = w.history, t = this;
    t.l = l;
    t.o = l.origin;
    t.h = h;

    // Debug
    t.DEBUG = 0;
    t.log = (...args) => { if (t.DEBUG) console.log('[HybridRouter]', ...args); };

    // Originals
    t._origReplaceState = h.replaceState.bind(h);
    t._origPushState = h.pushState.bind(h);

    t.aEL = w.addEventListener.bind(w);
    t.SETTLE_MS = 450;
    t._driving = 0;

    // Carrd root section id (first section)
    t._rootId = '';

    // Scrollpoint intent (cooperative)
    t._pendingScrollHash = '';
    t._pendingScrollSection = '';
    t._reassertArmed = 0;

    // Guard window
    t._lastScrollHash = '';
    t._lastScrollSection = '';
    t._lastScrollAt = 0;
    t.SCROLL_GUARD_MS = 8000;

    // Watchdog
    t._watchdogTimer = 0;

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

  isScrollPointHash(hash) {
    const raw = String(hash || '');
    if (!raw || raw === '#') return false;
    const id = raw.startsWith('#') ? raw.slice(1) : raw;
    return !!document.querySelector(`[data-scroll-id="${id}"]`);
  }

  currentSectionCanonical() {
    const s = history.state?.section;
    if (typeof s === 'string') return s;
    // fallback: pathname (your clean URL)
    return this.sectionFromPath(this.l.pathname) || '';
  }

  _inScrollGuard() {
    return (
      this._lastScrollHash &&
      (Date.now() - this._lastScrollAt) <= this.SCROLL_GUARD_MS
    );
  }

  // Build the canonical masked URL you want visible: /page#test
  buildMaskedUrl(section, hash) {
    // note: section '' => root '/'
    return `${this.o}/${section || ''}${hash || ''}`;
  }

  // Set visible URL WITHOUT re-triggering Carrd scroll logic
  // (replaceState won’t fire hashchange)
  restoreMaskedUrl(section, hash) {
    const url = this.buildMaskedUrl(section, hash);
    this._origReplaceState({ section }, '', url);
    this.log('restoreMaskedUrl ->', url);
  }

  // ✅ NEW: robust watchdog that outlasts Carrd’s “late clear”
  startScrollpointWatchdog(section, hash) {
    const t = this;
    const start = Date.now();

    const MIN_RUN_MS = 2000;  // must run at least this long
    const MAX_RUN_MS = 6000;  // stop after this long no matter what
    const TICK_MS = 60;

    let stableTicks = 0;

    if (t._watchdogTimer) clearInterval(t._watchdogTimer);

    t._watchdogTimer = setInterval(() => {
      const elapsed = Date.now() - start;

      if (elapsed > MAX_RUN_MS) {
        clearInterval(t._watchdogTimer);
        t._watchdogTimer = 0;
        t.log('watchdog stop: timeout');
        return;
      }

      const wantHash = String(hash || '');
      const haveHash = String(t.l.hash || '');

      // If Carrd cleared it (haveHash '' or '#'), restore.
      if (haveHash !== wantHash) {
        stableTicks = 0;

        // Only restore during the scroll guard window (avoid messing with unrelated nav)
        if (t._inScrollGuard()) {
          t.restoreMaskedUrl(section, hash);
        }
        return;
      }

      // Hash matches (currently good)
      stableTicks++;

      // Only allow stopping after minimum run time AND stable for ~600ms
      if (elapsed >= MIN_RUN_MS && stableTicks >= Math.ceil(600 / TICK_MS)) {
        clearInterval(t._watchdogTimer);
        t._watchdogTimer = 0;
        t.log('watchdog stop: stable');
      }
    }, TICK_MS);
  }

  drive(section, push) {
    const t = this, l = t.l, ms = t.SETTLE_MS;
    t._driving = 1;

    const hh = t.hashFor(section);
    push ? (l.hash = hh) : l.replace(hh);

    setTimeout(() => {
      t._origReplaceState({ section }, '', `${t.o}/${section || ''}`);
      t._driving = 0;
    }, ms);
  }

  init() {
    const t = this, l = t.l, o = t.o, ms = t.SETTLE_MS;

    t._rootId = t.detectRootId();

    const settleClean = (section) => setTimeout(() => {
      t._origReplaceState({ section }, '', `${o}/${section || ''}`);
    }, ms);

    // Initial entry (original behavior)
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

      // Scrollpoint intent: DO NOT preventDefault; let Carrd do its scroll.
      if (t.isScrollPointHash(href)) {
        t._pendingScrollHash = href;
        t._pendingScrollSection = t.currentSectionCanonical();
        t._reassertArmed = 1;

        // After Carrd processes the click, if it turned it into '#page', reassert '#test' once.
        setTimeout(() => {
          if (!t._reassertArmed) return;
          if (l.hash === t._pendingScrollHash) {
            t._reassertArmed = 0;
            return;
          }
          t._reassertArmed = 0;
          l.hash = t._pendingScrollHash;
          t.log('reassert hash ->', t._pendingScrollHash);
        }, 0);

        return;
      }

      // Section navigation (your normal router behavior)
      e.preventDefault();
      const s = (href === '#' || href === '') ? '' : t.sectionFromHash(href);
      t.drive(s, 1);
    }, 1);

    // Hashchange
    t.aEL('hashchange', () => {
      if (t._driving) return;

      // Keep original root handling
      if (l.hash === '#') return t.drive('', 0);

      // Scrollpoint hash: Carrd will scroll natively (with its animation variants)
      if (t.isScrollPointHash(l.hash)) {
        const section = t._pendingScrollSection || t.currentSectionCanonical();
        const hash = l.hash;

        // Arm guard + record
        t._lastScrollHash = hash;
        t._lastScrollSection = section;
        t._lastScrollAt = Date.now();
        t.log('scrollpoint detected; guard armed:', { section, hash });

        // Mask immediately (so you see /page#test quickly)
        setTimeout(() => {
          t.restoreMaskedUrl(section, hash);
        }, 0);

        // ✅ Watchdog keeps it from disappearing later
        t.startScrollpointWatchdog(section, hash);

        return;
      }

      // Normal section hash => clean URL
      settleClean(t.sectionFromHash(l.hash));
    });

    // Back / Forward
    t.aEL('popstate', (e) => {
      if (t._driving) return;
      t.drive(
        typeof e.state?.section === 'string' ? e.state.section : t.sectionFromPath(l.pathname),
        0
      );
    });
  }
}

window.hybridRouter = new HybridRouter();
export default window.hybridRouter;
