class HybridRouter {
  constructor() {
    const w = window, d = w.document, l = w.location, h = w.history, t = this;
    t.l = l;
    t.o = l.origin;
    t.rS = h.replaceState.bind(h);
    t.aEL = w.addEventListener.bind(w);
    t.SETTLE_MS = 450;
    t._driving = 0;

    // NEW: detected root section id (first Carrd section)
    t._rootId = '';

    (d.readyState === 'loading'
      ? d.addEventListener.bind(d, 'DOMContentLoaded')
      : (f) => f()
    )(() => t.init(), { once: 1 });
  }

  sectionFromHash(h) { return String(h || '').slice(1).replaceAll('--', '/'); }
  sectionFromPath(p) { return decodeURIComponent(String(p || '').replace(/^\/+/, '')); }

  // NEW: detect first Carrd section id
  detectRootId() {
    const s =
      document.querySelector('#main section[id]') ||
      document.querySelector('main section[id]') ||
      document.querySelector('section[id]');
    return (s && s.id) ? s.id : 'home';
  }

  // NEW: map canonical section -> Carrd-driving hash
  // Canonical root is '' (clean URL "/"), but Carrd needs a real id to switch sections.
  hashFor(section) {
    if (!section) return `#${this._rootId}`;
    return `#${section.replaceAll('/', '--')}`;
  }

  // NEW: is this hash a Carrd scrollpoint?
  isScrollPoint(hash) {
    const raw = String(hash || '');
    if (!raw || raw === '#') return false;
    const id = this.sectionFromHash(raw); // '#test' -> 'test'
    return !!document.querySelector(`[data-scroll-id="${id}"]`);
  }

  drive(section, push) {
    const t = this, l = t.l, ms = t.SETTLE_MS;
    t._driving = 1;

    // CHANGED: use hashFor() so '#' drives the real root section
    const hh = t.hashFor(section);
    push ? (l.hash = hh) : l.replace(hh);

    setTimeout(() => {
      t.rS({ section }, '', `${t.o}/${section || ''}`);
      t._driving = 0;
    }, ms);
  }

  init() {
    const t = this, l = t.l, o = t.o, rS = t.rS, ms = t.SETTLE_MS;

    // NEW: learn root section id once
    t._rootId = t.detectRootId();

    const clean = (section) => rS({ section }, '', `${o}/${section || ''}`);
    const settleClean = (section) => setTimeout(() => clean(section), ms);

    // Initial entry (UNCHANGED)
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

      // ✅ FEATURE 2 (REVISED): scrollpoint clicks must still become "/#test"
      // so Carrd scrolls, BUT we must block Carrd's click handler from converting
      // it to "#page" / section navigation.
      if (href && href !== '#' && t.isScrollPoint(href)) {
        e.preventDefault();
        e.stopImmediatePropagation(); // critical: stop Carrd click logic

        // set REAL hash so Carrd scrolls
        l.hash = href;

        // (Feature 1) hashchange will mask the URL to /page#test
        return;
      }

      e.preventDefault();

      // '#' means canonical root section ''
      const s = (href === '#' || href === '') ? '' : t.sectionFromHash(href);
      t.drive(s, 1);
    }, 1);

    // Hash cleanup
    t.aEL('hashchange', () => {
      if (t._driving) return;

      if (l.hash === '#') return t.drive('', 0);

      // ✅ FEATURE 1: if it's a scrollpoint, keep the REAL hash (Carrd scroll),
      // then mask visible URL to /<current-section>#<scroll-id>
      if (t.isScrollPoint(l.hash)) {
        setTimeout(() => {
          const section = t.sectionFromPath(l.pathname) || '';
          rS({ section }, '', `${o}/${section || ''}${l.hash}`);
        }, 0);
        return;
      }

      settleClean(t.sectionFromHash(l.hash));
    });

    // Back / Forward (UNCHANGED)
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
