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

    // detected root section id (first Carrd section)
    t._rootId = '';

    // scrollpoint intent state
    t._pendingScrollHash = '';
    t._pendingScrollSection = '';
    t._reassertArmed = 0;

    // timers
    t._scrollEndTimer = 0;
    t._holdTimer = 0;

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

  // Visible URL we want: /page#test
  wantUrl(section, hash) {
    return `${this.o}/${section || ''}${hash || ''}`;
  }

  // Update address bar without triggering scroll/hashchange
  setUrl(section, hash) {
    const url = this.wantUrl(section, hash);
    this._origReplaceState({ section }, '', url);
    this.log('setUrl ->', url);
  }

  // After Carrd scroll ends, keep URL as /page#test even if Carrd clears it again.
  // Runs only briefly.
  holdSecondaryFragment(section, hash) {
    const t = this;

    if (t._holdTimer) clearInterval(t._holdTimer);

    const start = Date.now();
    const HOLD_MS = 3000;    // adjust if Carrd clears later than 3s
    const TICK_MS = 80;

    t._holdTimer = setInterval(() => {
      const elapsed = Date.now() - start;
      if (elapsed > HOLD_MS) {
        clearInterval(t._holdTimer);
        t._holdTimer = 0;
        t.log('holdSecondaryFragment stop');
        return;
      }

      // Carrd’s cleanup clears hash -> URL becomes /page (no #test)
      // We restore the *visible* URL, without touching location.hash.
      if (t.l.href !== t.wantUrl(section, hash)) {
        t.setUrl(section, hash);
      }
    }, TICK_MS);
  }

  // Debounced scroll-end detector:
  // When scrolling stops for QUIET_MS, we treat that as "Carrd done scrolling".
  onScrollEnd(cb) {
    const t = this;
    const QUIET_MS = 180;

    if (t._scrollEndTimer) clearTimeout(t._scrollEndTimer);

    const onScroll = () => {
      if (t._scrollEndTimer) clearTimeout(t._scrollEndTimer);
      t._scrollEndTimer = setTimeout(() => {
        window.removeEventListener('scroll', onScroll, true);
        t._scrollEndTimer = 0;
        cb();
      }, QUIET_MS);
    };

    window.addEventListener('scroll', onScroll, true);

    // Kick once for "no movement" cases
    onScroll();
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

      // Scrollpoint intent: do NOT preventDefault (work with Carrd)
      if (t.isScrollPointHash(href)) {
        t._pendingScrollHash = href;
        t._pendingScrollSection = t.currentSectionCanonical();
        t._reassertArmed = 1;

        // After Carrd processes click, if it rewrote to '#page', reassert '#test' once
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

      // Section navigation (your router)
      e.preventDefault();
      const s = (href === '#' || href === '') ? '' : t.sectionFromHash(href);
      t.drive(s, 1);
    }, 1);

    // Hashchange
    t.aEL('hashchange', () => {
      if (t._driving) return;

      if (l.hash === '#') return t.drive('', 0);

      // Scrollpoint hash: let Carrd scroll natively, then set URL after scroll ends
      if (t.isScrollPointHash(l.hash)) {
        const section = t._pendingScrollSection || t.currentSectionCanonical();
        const hash = l.hash;

        // Optional immediate mask (you’ll briefly see /page#test)
        // Carrd may clear it later; we’ll restore after scroll ends + hold.
        setTimeout(() => t.setUrl(section, hash), 0);

        // The real win: AFTER scroll ends, restore and hold for a short window
        t.onScrollEnd(() => {
          t.log('scroll ended; restoring & holding');
          t.setUrl(section, hash);
          t.holdSecondaryFragment(section, hash);
        });

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
