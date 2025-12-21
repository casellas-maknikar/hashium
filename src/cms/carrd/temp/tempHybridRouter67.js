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

    // FEATURE 2: pending scrollpoint hash we want Carrd to see
    t._pendingScrollHash = '';

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

  // scrollpoint = element with data-scroll-id="<id>"
  isScrollPoint(hash) {
    const raw = String(hash || '');
    if (!raw || raw === '#') return false;
    const id = this.sectionFromHash(raw);
    return !!document.querySelector(`[data-scroll-id="${id}"]`);
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

    // Initial entry (unchanged)
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

      // ✅ FEATURE 2 (reassert): if user clicked a scrollpoint,
      // Carrd is overwriting it to "#page". So we queue setting it back to "#test"
      // right after this click completes.
      if (href && href !== '#' && t.isScrollPoint(href)) {
        t._pendingScrollHash = href;

        // Let Carrd do whatever it does for the click,
        // then re-apply the scrollpoint hash so Carrd scrolls.
        setTimeout(() => {
          if (t._pendingScrollHash) l.hash = t._pendingScrollHash;
        }, 0);

        return; // do NOT drive
      }

      // section navigation (unchanged)
      e.preventDefault();
      const s = (href === '#' || href === '') ? '' : t.sectionFromHash(href);
      t.drive(s, 1);
    }, 1);

    // Hash cleanup
    t.aEL('hashchange', () => {
      if (t._driving) return;

      if (l.hash === '#') return t.drive('', 0);

      // If a scrollpoint click is pending but Carrd changed hash to something else,
      // re-assert it once more (prevents cases where Carrd sets "#page" after our setTimeout).
      if (t._pendingScrollHash && l.hash !== t._pendingScrollHash) {
        setTimeout(() => {
          if (t._pendingScrollHash) l.hash = t._pendingScrollHash;
        }, 0);
        return;
      }

      // ✅ FEATURE 1 (masking): when the hash is truly a scrollpoint, keep it,
      // but rewrite the visible URL to /page#test instead of /test or /#test.
      if (t.isScrollPoint(l.hash)) {
        // clear pending (we successfully got the real scroll hash)
        t._pendingScrollHash = '';

        setTimeout(() => {
          const section = t.sectionFromPath(l.pathname) || '';
          rS({ section }, '', `${o}/${section || ''}${l.hash}`);
        }, 0);

        return;
      }

      settleClean(t.sectionFromHash(l.hash));
    });

    // Back / Forward (unchanged)
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
