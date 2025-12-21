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

    (d.readyState === 'loading'
      ? d.addEventListener.bind(d, 'DOMContentLoaded')
      : (f) => f()
    )(() => t.init(), { once: 1 });
  }

  sectionFromHash(h) { return String(h || '').slice(1).replaceAll('--', '/'); }
  sectionFromPath(p) { return decodeURIComponent(String(p || '').replace(/^\/+/, '')); }

  // detect first Carrd section id
  detectRootId() {
    const s =
      document.querySelector('#main section[id]') ||
      document.querySelector('main section[id]') ||
      document.querySelector('section[id]');
    return (s && s.id) ? s.id : 'home';
  }

  // map canonical section -> Carrd-driving hash
  // Canonical root is '' (clean URL "/"), but Carrd needs a real id to switch sections.
  hashFor(section) {
    if (!section) return `#${this._rootId}`;
    return `#${section.replaceAll('/', '--')}`;
  }

  // FEATURE: detect Carrd scrollpoints (secondary fragments)
  // Carrd scrollpoints are elements with data-scroll-id="test"
  isScrollPoint(hash) {
    const raw = String(hash || '');
    if (!raw || raw === '#') return false;

    const id = this.sectionFromHash(raw); // '#test' -> 'test'
    // NOTE: data-scroll-id values like "test" are simple; querySelector is safe here.
    return !!document.querySelector(`[data-scroll-id="${id}"]`);
  }

  // FEATURE: determine current active section canonically ('' for home)
  activeSectionCanonical() {
    const sec =
      document.querySelector('#main section.active[id]') ||
      document.querySelector('main section.active[id]') ||
      document.querySelector('section.active[id]');

    let id = (sec && sec.id) ? sec.id : (this._rootId || 'home');
    id = String(id).replace(/-section$/, ''); // 'page-section' -> 'page'
    if (id === 'home') return '';
    return id.replaceAll('--', '/');
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

    // Initial entry (UNCHANGED)
    if ((!l.hash || l.hash === '#') && l.pathname !== '/') {
      t.drive(t.sectionFromPath(l.pathname), 0);
    } else {
      const s = (l.hash === '#') ? '' : t.sectionFromHash(l.hash);
      settleClean(s);
      if (l.hash === '#') t.drive('', 0);
    }

    // Click (UNCHANGED from your original)
    t.aEL('click', (e) => {
      const a = e.target?.closest?.('a[href^="#"]');
      if (!a) return;
      e.preventDefault();

      const href = a.getAttribute('href') || '#';
      const s = (href === '#' || href === '') ? '' : t.sectionFromHash(href);

      t.drive(s, 1);
    }, 1);

    // Hash cleanup (ONLY CHANGE: scrollpoint masking)
    t.aEL('hashchange', () => {
      if (t._driving) return;

      if (l.hash === '#') return t.drive('', 0);

      // ✅ ONE FEATURE: if hash is a scrollpoint, DO NOT treat it as a section.
      // Let Carrd scroll using '#test', then mask the visible URL as '/page#test'.
      if (t.isScrollPoint(l.hash)) {
        setTimeout(() => {
          const section = t.activeSectionCanonical(); // '' or 'page' etc.
          rS({ section }, '', `${o}/${section || ''}${l.hash}`);
        }, 0);
        return;
      }

      // original behavior for section hashes
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
