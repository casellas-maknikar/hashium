// tempHybridRouter82.js
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
    t._pendingScrollHash = '';     // '#test'
    t._pendingScrollSection = '';  // 'page'
    t._reassertArmed = 0;

    // internal timer for scroll-end detection
    t._scrollEndTimer = 0;

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

  // Canonical root is '' ("/"), but Carrd needs a real id to switch sections.
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

  // Prefer canonical section from history.state; fallback to pathname
  currentSectionCanonical() {
    const s = history.state?.section;
    if (typeof s === 'string') return s;
    return this.sectionFromPath(this.l.pathname) || '';
  }

  // Restore the visible URL without triggering Carrd scroll logic
  restoreMaskedUrl(section, hash) {
    const url = `${this.o}/${section || ''}${hash || ''}`;
    this._origReplaceState({ section }, '', url);
    this.log('restoreMaskedUrl ->', url);
  }

  // ✅ Let Carrd scroll with its own animation, then restore /page#test AFTER scroll ends
  restoreAfterScrollEnds(section, hash) {
    const t = this;

    // cancel any previous pending restore
    if (t._scrollEndTimer) clearTimeout(t._scrollEndTimer);

    const onScroll = () => {
      if (t._scrollEndTimer) clearTimeout(t._scrollEndTimer);

      // when scrolling stops for 160ms, assume Carrd is done
      t._scrollEndTimer = setTimeout(() => {
        window.removeEventListener('scroll', onScroll, true);
        t._scrollEndTimer = 0;

        t.restoreMaskedUrl(section, hash);
        t.log('restoreAfterScrollEnds done');
      }, 160);
    };

    // Listen during the scroll animation
    window.addEventListener('scroll', onScroll, true);

    // Kick once so "no-move" / tiny-move cases still restore
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

    // Initial entry (original)
    if ((!l.hash || l.hash === '#') && l.pathname !== '/') {
      t.drive(t.sectionFromPath(l.pathname), 0);
    } else {
      const s = (l.hash === '#') ? '' : t.sectionFromHash(l.hash);
      settleClean(s);
      if (l.hash === '#') t.drive('', 0);
    }

    // Click
    // - Scrollpoints: let Carrd do native scroll, but if Carrd rewrites to '#page', reassert '#test' once
    // - Sections: your normal drive behavior
    t.aEL('click', (e) => {
      const a = e.target?.closest?.('a[href^="#"]');
      if (!a) return;

      const href = a.getAttribute('href') || '#';
      if (!href || href === '#') return;

      // Scrollpoint intent: DO NOT preventDefault (work with Carrd)
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

      // Root hash
      if (l.hash === '#') return t.drive('', 0);

      // Scrollpoint hash: let Carrd scroll, then restore secondary fragment AFTER scroll ends
      if (t.isScrollPointHash(l.hash)) {
        const section = t._pendingScrollSection || t.currentSectionCanonical();
        const hash = l.hash;

        // Optional: show /page#test immediately while Carrd scrolls (cosmetic)
        // This may get cleared by Carrd at the end; we'll restore again after scroll ends.
        setTimeout(() => t.restoreMaskedUrl(section, hash), 0);

        // The real win: restore after scroll completes (Carrd clears hash at the end)
        t.restoreAfterScrollEnds(section, hash);

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
