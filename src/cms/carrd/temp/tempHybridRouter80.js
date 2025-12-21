class HybridRouter {
  constructor() {
    const w = window, d = w.document, l = w.location, h = w.history, t = this;
    t.l = l;
    t.o = l.origin;
    t.h = h;

    // Debug
    t.DEBUG = 0;
    t.log = (...args) => { if (t.DEBUG) console.log('[HybridRouter]', ...args); };

    // Keep originals
    t._origReplaceState = h.replaceState.bind(h);
    t._origPushState = h.pushState.bind(h);

    // Try to keep original location.replace (may be non-writable in some browsers)
    t._origLocationReplace = null;
    try { t._origLocationReplace = l.replace.bind(l); } catch {}

    t.rS = t._origReplaceState;

    t.aEL = w.addEventListener.bind(w);
    t.SETTLE_MS = 450;
    t._driving = 0;

    t._rootId = '';

    // scrollpoint state
    t._pendingScrollHash = '';
    t._pendingScrollSection = '';
    t._reassertArmed = 0;

    // guard window
    t._lastScrollHash = '';
    t._lastScrollSection = '';
    t._lastScrollAt = 0;
    t.SCROLL_GUARD_MS = 5000;

    // lightweight URL observer (debug only)
    t._lastHrefSeen = l.href;

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
    return this.sectionFromPath(this.l.pathname) || '';
  }

  _toUrl(urlLike) {
    try { return new URL(String(urlLike), this.o + '/'); }
    catch { return null; }
  }

  _inScrollGuard() {
    return (
      this._lastScrollHash &&
      (Date.now() - this._lastScrollAt) <= this.SCROLL_GUARD_MS
    );
  }

  _fixUrlToKeepScrollHash(urlLike) {
    const t = this;
    const raw = String(urlLike ?? '');

    // If Carrd passes just '#' or '' (hash-only URL), preserve current path + last scroll hash
    if (raw.trim() === '' || raw.trim().startsWith('#')) {
      const path = (t._lastScrollSection ? `/${t._lastScrollSection}` : t.l.pathname) || '/';
      return `${t.o}${path}${t._lastScrollHash}`;
    }

    const u = t._toUrl(raw);
    if (!u) return urlLike;

    // Treat '' and '#' as cleared
    if (u.hash === '' || u.hash === '#') {
      const pathSection = t.sectionFromPath(u.pathname) || '';
      const shouldPreserve =
        pathSection === (t._lastScrollSection || '') ||
        u.pathname === t.l.pathname;

      if (shouldPreserve) {
        u.hash = t._lastScrollHash;
        return u.toString();
      }
    }

    return urlLike;
  }

  patchCarrdClearers() {
    const t = this;
    const h = t.h;

    // Wrap replaceState / pushState
    const wrapHistory = (name, origFn) => function (state, title, url) {
      if (t.DEBUG) t.log(`${name} called with url=`, url);

      if (t._inScrollGuard() && (typeof url === 'string' || url instanceof String)) {
        const fixed = t._fixUrlToKeepScrollHash(url);
        if (fixed !== url) t.log(`${name} FIXED url ->`, fixed);
        url = fixed;
      }

      return origFn(state, title, url);
    };

    h.replaceState = wrapHistory('replaceState', t._origReplaceState);
    h.pushState = wrapHistory('pushState', t._origPushState);

    // Try to wrap location.replace too (this is often what wins last)
    try {
      const loc = t.l;
      const orig = t._origLocationReplace || loc.replace.bind(loc);

      loc.replace = function (url) {
        if (t.DEBUG) t.log('location.replace called with url=', url);

        if (t._inScrollGuard() && (typeof url === 'string' || url instanceof String)) {
          const fixed = t._fixUrlToKeepScrollHash(url);
          if (fixed !== url) t.log('location.replace FIXED url ->', fixed);
          url = fixed;
        }

        return orig(url);
      };

      t.log('location.replace wrapped');
    } catch (e) {
      t.log('location.replace NOT wrappable in this environment:', e?.message || e);
    }
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

    // Install wrappers (history + location.replace)
    t.patchCarrdClearers();

    // Debug URL observer (helps catch “silent” URL changes)
    setInterval(() => {
      if (!t.DEBUG) return;
      if (l.href !== t._lastHrefSeen) {
        t.log('URL CHANGED:', t._lastHrefSeen, '=>', l.href);
        t._lastHrefSeen = l.href;
      }
    }, 50);

    const settleClean = (section) => setTimeout(() => {
      t._origReplaceState({ section }, '', `${o}/${section || ''}`);
    }, ms);

    // Initial entry
    if ((!l.hash || l.hash === '#') && l.pathname !== '/') {
      t.drive(t.sectionFromPath(l.pathname), 0);
    } else {
      const s = (l.hash === '#') ? '' : t.sectionFromHash(l.hash);
      settleClean(s);
      if (l.hash === '#') t.drive('', 0);
    }

    // Click
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
          l.hash = t._pendingScrollHash;
          t.log('reassert hash ->', t._pendingScrollHash);
        }, 0);

        return;
      }

      // Section navigation
      e.preventDefault();
      const s = (href === '#' || href === '') ? '' : t.sectionFromHash(href);
      t.drive(s, 1);
    }, 1);

    // Hashchange
    t.aEL('hashchange', () => {
      if (t._driving) return;

      if (l.hash === '#') return t.drive('', 0);

      if (t.isScrollPointHash(l.hash)) {
        const section = t._pendingScrollSection || t.currentSectionCanonical();
        const hash = l.hash;

        // Arm guard
        t._lastScrollHash = hash;
        t._lastScrollSection = section;
        t._lastScrollAt = Date.now();
        t.log('scrollpoint detected; guard armed:', { section, hash });

        // Mask immediately
        setTimeout(() => t.maskUrl(section, hash), 0);

        return;
      }

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
