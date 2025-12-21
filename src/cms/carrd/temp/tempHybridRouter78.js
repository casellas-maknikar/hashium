class HybridRouter {
  constructor() {
    const w = window, d = w.document, l = w.location, h = w.history, t = this;
    t.l = l;
    t.o = l.origin;
    t.h = h;

    // Toggle to 1 if you want console logs
    t.DEBUG = 0;

    // Keep originals (we will wrap history methods)
    t._origReplaceState = h.replaceState.bind(h);
    t._origPushState = h.pushState.bind(h);

    t.rS = t._origReplaceState;
    t.aEL = w.addEventListener.bind(w);
    t.SETTLE_MS = 450;
    t._driving = 0;

    t._rootId = '';

    // scrollpoint state
    t._pendingScrollHash = '';     // '#test' we want Carrd to use
    t._pendingScrollSection = '';  // 'page' (canonical) for masking
    t._reassertArmed = 0;

    // guard window
    t._lastScrollHash = '';
    t._lastScrollSection = '';
    t._lastScrollAt = 0;
    t.SCROLL_GUARD_MS = 3500;

    // watchdog handle
    t._watchdogTimer = 0;

    (d.readyState === 'loading'
      ? d.addEventListener.bind(d, 'DOMContentLoaded')
      : (f) => f()
    )(() => t.init(), { once: 1 });
  }

  log(...args) { if (this.DEBUG) console.log('[HybridRouter]', ...args); }

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

  currentSectionCanonical() {
    const s = history.state?.section;
    if (typeof s === 'string') return s;
    return this.sectionFromPath(this.l.pathname) || '';
  }

  _toUrl(urlLike) {
    try { return new URL(String(urlLike), this.o + '/'); }
    catch { return null; }
  }

  // ✅ Watchdog: keep /page#test visible even if Carrd keeps clearing it post-scroll
  startScrollpointWatchdog(section, hash) {
    const t = this;
    const start = Date.now();
    const MAX_MS = 3000;       // watch for 3s after scroll
    const TICK_MS = 80;        // check ~12x/sec
    let stableTicks = 0;       // stop once it stays correct a bit

    if (t._watchdogTimer) clearInterval(t._watchdogTimer);

    t._watchdogTimer = setInterval(() => {
      const elapsed = Date.now() - start;

      // stop conditions
      if (elapsed > MAX_MS) {
        clearInterval(t._watchdogTimer);
        t._watchdogTimer = 0;
        t.log('watchdog stop: timeout');
        return;
      }

      const want = `${t.o}/${section || ''}${hash}`;
      const have = t.l.href;

      // If URL already correct, count stability and stop after a few ticks
      if (have === want) {
        stableTicks++;
        if (stableTicks >= 8) { // ~8 * 80ms = 640ms stable
          clearInterval(t._watchdogTimer);
          t._watchdogTimer = 0;
          t.log('watchdog stop: stable');
        }
        return;
      }

      stableTicks = 0;

      // If hash got cleared or changed away, restore visible URL (no re-scroll)
      // We *do not* touch location.hash here.
      t._origReplaceState({ section }, '', want);
      t.log('watchdog restore ->', want);
    }, TICK_MS);
  }

  patchHistoryForScrollpoints() {
    const t = this;
    const h = t.h;

    const wrap = (origFn) => function (state, title, url) {
      // If no URL passed, forward.
      if (typeof url !== 'string' && !(url instanceof String)) {
        return origFn(state, title, url);
      }

      const now = Date.now();
      const inGuard =
        t._lastScrollHash &&
        (now - t._lastScrollAt) <= t.SCROLL_GUARD_MS;

      if (!inGuard) return origFn(state, title, url);

      const rawUrl = String(url).trim();

      // If Carrd writes hash-only URLs (like '#'), preserve path + last scroll hash
      if (rawUrl === '' || rawUrl.startsWith('#')) {
        const path = (t._lastScrollSection ? `/${t._lastScrollSection}` : t.l.pathname) || '/';
        const fixed = `${t.o}${path}${t._lastScrollHash}`;
        t.log('history wrapper: hash-only ->', rawUrl, 'fixed ->', fixed);
        return origFn(state, title, fixed);
      }

      const u = t._toUrl(url);
      if (!u) return origFn(state, title, url);

      const hashCleared = (u.hash === '' || u.hash === '#');
      if (hashCleared) {
        const pathSection = t.sectionFromPath(u.pathname) || '';
        const shouldPreserve =
          pathSection === (t._lastScrollSection || '') ||
          u.pathname === t.l.pathname;

        if (shouldPreserve) {
          u.hash = t._lastScrollHash;
          url = u.toString();
          t.log('history wrapper: cleared-hash -> restored ->', url);
        }
      }

      return origFn(state, title, url);
    };

    h.replaceState = wrap(t._origReplaceState);
    h.pushState = wrap(t._origPushState);
  }

  maskUrl(section, hash) {
    this._origReplaceState({ section }, '', `${this.o}/${section || ''}${hash || ''}`);
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
    t.patchHistoryForScrollpoints();

    const settleClean = (section) => setTimeout(() => {
      t._origReplaceState({ section }, '', `${o}/${section || ''}`);
    }, ms);

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

        setTimeout(() => {
          if (!t._reassertArmed) return;
          if (l.hash === t._pendingScrollHash) {
            t._reassertArmed = 0;
            return;
          }
          t._reassertArmed = 0;
          l.hash = t._pendingScrollHash; // let Carrd scroll natively
          t.log('reassert hash ->', t._pendingScrollHash);
        }, 0);

        return;
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

      // Scrollpoint hash: Carrd scrolls natively
      if (t.isScrollPointHash(l.hash)) {
        const section = t._pendingScrollSection || t.currentSectionCanonical();
        const hash = l.hash;

        t._lastScrollHash = hash;
        t._lastScrollSection = section;
        t._lastScrollAt = Date.now();

        // Mask immediately to /page#test
        setTimeout(() => {
          t.maskUrl(section, hash);
        }, 0);

        // ✅ Start watchdog to defeat later Carrd URL cleanup
        t.startScrollpointWatchdog(section, hash);

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
