class HybridRouter {
  constructor() {
    const w = window,
      d = w.document,
      l = w.location,
      h = w.history,
      t = this;
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
      : (f) => f())(() => t.init(), { once: 1 });
  }

  sectionFromHash(h) {
    return String(h || '').slice(1).replaceAll('--', '/');
  }
  sectionFromPath(p) {
    return decodeURIComponent(String(p || '').replace(/^\/+/, ''));
  }

  // NEW: detect first Carrd section id
  detectRootId() {
    const s =
      document.querySelector('#main section[id]') ||
      document.querySelector('main section[id]') ||
      document.querySelector('section[id]');
    return s && s.id ? s.id : 'home';
  }

  // NEW: map canonical section -> Carrd-driving hash
  // Canonical root is '' (clean URL "/"), but Carrd needs a real id to switch sections.
  hashFor(section) {
    if (!section) return `#${this._rootId}`;
    return `#${section.replaceAll('/', '--')}`;
  }

  /**
   * Determine if a given href/hash refers to a scrollpoint (has a matching
   * element with a data-scroll-id attribute). Accepts either a full hash
   * (starting with '#') or the decoded section string.
   *
   * @param {string} href The href or hash to examine (e.g. '#test').
   */
  isScrollPoint(href) {
    if (!href || href === '#') return false;
    let id;
    if (href.startsWith('#')) {
      id = href.slice(1);
    } else {
      id = href;
    }
    // Normalize '--' sequences back into '/'; scrollpoint IDs are simple
    // strings so this usually does nothing, but if someone uses '--' in
    // a scrollpoint name this will still match the data attribute.
    id = id.replaceAll('--', '/');
    return !!document.querySelector(`[data-scroll-id="${id}"]`);
  }

  drive(section, push) {
    const t = this,
      l = t.l,
      ms = t.SETTLE_MS;
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
    const t = this,
      l = t.l,
      o = t.o,
      rS = t.rS,
      ms = t.SETTLE_MS;

    // NEW: learn root section id once
    t._rootId = t.detectRootId();

    const clean = (section) => rS({ section }, '', `${o}/${section || ''}`);
    const settleClean = (section) => setTimeout(() => clean(section), ms);

    // Initial entry
    if ((!l.hash || l.hash === '#') && l.pathname !== '/') {
      t.drive(t.sectionFromPath(l.pathname), 0);
    } else {
      // NEW: treat "/#" as root (empty canonical section)
      const s = l.hash === '#' ? '' : t.sectionFromHash(l.hash);
      settleClean(s);

      // NEW: if hash is exactly '#', force Carrd to the real root section without new history
      if (l.hash === '#') t.drive('', 0);
    }

    // Click
    t.aEL(
      'click',
      (e) => {
        const a = e.target?.closest?.('a[href^="#"]');
        if (!a) return;

        const href = a.getAttribute('href') || '#';
        // '#' means canonical root section ''
        const section = href === '#' || href === '' ? '' : t.sectionFromHash(href);

        // FEATURE: skip driving for scrollpoint anchors
        if (t.isScrollPoint(href)) {
          // Let default anchor behaviour occur; scrollpoint hash remains in URL
          return;
        }

        e.preventDefault();
        t.drive(section, 1);
      },
      1
    );

    // Hash cleanup
    t.aEL('hashchange', () => {
      if (t._driving) return;

      // '#' means canonical root; drive Carrd to actual root id (no new history)
      if (l.hash === '#') return t.drive('', 0);

      // If the hash refers to a scrollpoint, do not clean it. Instead,
      // update the history state to reflect the current section and
      // preserve the fragment. This prevents '/page#test' from being
      // rewritten to '/test'.
      if (t.isScrollPoint(l.hash)) {
        const currentSection = t.sectionFromPath(l.pathname);
        // Replace state so that back/forward works with section; include
        // the fragment in the URL. Do not push a new entry; this mirrors
        // native hashchange behaviour.
        rS({ section: currentSection }, '', `${o}/${currentSection}${l.hash}`);
        return;
      }

      // Otherwise, treat the hash as referring to a section and clean it.
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

export default new HybridRouter();
