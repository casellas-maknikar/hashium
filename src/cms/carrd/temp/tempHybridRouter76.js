class HybridRouter {
  constructor() {
    const w = window, d = w.document, l = w.location, h = w.history, t = this;
    t.l = l;
    t.o = l.origin;
    t.h = h;

    // Keep originals (we will wrap history methods)
    t._origReplaceState = h.replaceState.bind(h);
    t._origPushState = h.pushState.bind(h);

    // Your router uses t.rS for masking/cleaning
    t.rS = t._origReplaceState;

    t.aEL = w.addEventListener.bind(w);
    t.SETTLE_MS = 450;
    t._driving = 0;

    // detected root section id (first Carrd section)
    t._rootId = '';

    // scrollpoint state
    t._pendingScrollHash = '';     // '#test' we want Carrd to use
    t._pendingScrollSection = '';  // 'page' (canonical) for masking
    t._reassertArmed = 0;

    // guard window to prevent Carrd clearing the scroll hash in the URL
    t._lastScrollHash = '';
    t._lastScrollSection = '';
    t._lastScrollAt = 0;
    t.SCROLL_GUARD_MS = 2500; // adjust if Carrd clears later than this

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

  // Normalize a URL arg (can be relative or absolute) into an absolute URL object
  _toUrl(urlLike) {
    try {
      return new URL(String(urlLike), this.o + '/');
    } catch {
      return null;
    }
  }

  // Patch history.replaceState/pushState so Carrd can't clear #test immediately after scroll
  patchHistoryForScrollpoints() {
    const t = this;
    const h = t.h;

    const wrap = (origFn) => function (state, title, url) {
      // If no URL passed, just forward.
      if (typeof url !== 'string' && !(url instanceof String)) {
        return origFn(state, title, url);
      }

      const now = Date.now();
      const inGuard =
        t._lastScrollHash &&
        (now - t._lastScrollAt) <= t.SCROLL_GUARD_MS;

      if (!inGuard) {
        return origFn(state, title, url);
      }

      const rawUrl = String(url);

      // Carrd often clears with url === '#'
      // When url is only a hash (or empty), DO NOT allow it to wipe the path or hash.
      // Restore to the *current path* (or last scroll section path) + last scroll hash.
      const isHashOnly = rawUrl.trim().startsWith('#') || rawUrl.trim() === '';

      if (isHashOnly) {
        // Pick the most correct path to keep.
        // Prefer the current location path, but if we have lastScrollSection,
        // ensure we keep that section path.
        const path =
          (t._lastScrollSection ? `/${t._lastScrollSection}` : t.l.pathname) || '/';

        const fixed = `${t.o}${path}${t._lastScrollHash}`;
        return origFn(state, title, fixed);
      }

      const u = t._toUrl(url);
      if (!u) return origFn(state, title, url);

      // Treat BOTH "" and "#" as "hash cleared" inside guard window.
      const hashCleared = (u.hash === '' || u.hash === '#');

      if (hashCleared) {
        // Determine the canonical section from the URL path Carrd is writing
        const pathSection = t.sectionFromPath(u.pathname) || '';

        // Preserve only if it matches the same section context we just scrolled within.
        const shouldPreserve =
          pathSection === (t._lastScrollSection || '') ||
          u.pathname === t.l.pathname;

        if (shouldPreserve) {
          u.hash = t._lastScrollHash; // restore '#test'
          url = u.toString();
        }
      }

      return origFn(state, title, url);
    };

    // Install wrappers
    h.replaceState = wrap(t._origReplaceState);
    h.pushState = wrap(t._origPushState);
  }

  // Mask URL to /section#hash (using original replaceState)
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

    // Install the “don’t clear scrollpoint hash” wrapper
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

        // After Carrd processes click, if it didn't leave us at '#test', reassert once
        setTimeout(() => {
          if (!t._reassertArmed) return;
          if (l.hash === t._pendingScrollHash) {
            t._reassertArmed = 0;
            return;
          }
          t._reassertArmed = 0;
          l.hash = t._pendingScrollHash; // triggers Carrd's native scroll animation
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

      // Scrollpoint hash: Carrd scrolls natively.
      if (t.isScrollPointHash(l.hash)) {
        const section = t._pendingScrollSection || t.currentSectionCanonical();
        const hash = l.hash;

        // Arm the guard so Carrd can't clear the hash from the URL right after scroll
        t._lastScrollHash = hash;
        t._lastScrollSection = section;
        t._lastScrollAt = Date.now();

        // Mask immediately to /page#test
        setTimeout(() => {
          t.maskUrl(section, hash);
        }, 0);

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
