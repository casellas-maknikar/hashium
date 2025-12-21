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

    // Secondary-fragment (scrollpoint) support state
    t._pendingScrollHash = ''; // what we want Carrd to see (e.g. '#test')
    t._lastScrollHash = '';    // last scrollpoint hash Carrd actually used
    t._lastScrollAt = 0;       // timestamp when Carrd used it

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

  // Is this hash a Carrd scrollpoint?
  // Carrd scrollpoints are elements with data-scroll-id="<hash>"
  isScrollPoint(hash) {
    const raw = String(hash || '');
    if (!raw || raw === '#') return false;
    const id = this.sectionFromHash(raw); // '#test' -> 'test'
    // Carrd scroll ids are typically simple; this selector is safe for your use case.
    return !!document.querySelector(`[data-scroll-id="${id}"]`);
  }

  drive(section, push) {
    const t = this, l = t.l, ms = t.SETTLE_MS;
    t._driving = 1;

    // use hashFor() so '#' drives the real root section
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

      // Scrollpoint click:
      // Carrd only scrolls if the *real* hash becomes '#test', but Carrd also likes to
      // override it to '#page'. So we let Carrd run, then re-assert '#test' immediately.
      if (href && href !== '#' && t.isScrollPoint(href)) {
        t._pendingScrollHash = href;

        // Let Carrd do whatever it does for the click, then re-apply scrollpoint hash.
        setTimeout(() => {
          if (t._pendingScrollHash) l.hash = t._pendingScrollHash;
        }, 0);

        return; // do NOT drive
      }

      // Section navigation (unchanged)
      e.preventDefault();

      const s = (href === '#' || href === '') ? '' : t.sectionFromHash(href);
      t.drive(s, 1);
    }, 1);

    // Hash cleanup / secondary-fragment logic
    t.aEL('hashchange', () => {
      if (t._driving) return;

      // FEATURE 3:
      // Carrd sometimes clears scrollpoint hashes after scrolling (hash becomes '' or '#').
      // If that happens shortly after a scrollpoint, restore the fragment in the visible URL
      // WITHOUT changing location.hash (so we don't re-scroll or fight Carrd).
      if ((!l.hash || l.hash === '#') && t._lastScrollHash && (Date.now() - t._lastScrollAt) < 1500) {
        const section = t.sectionFromPath(l.pathname) || '';
        rS({ section }, '', `${o}/${section || ''}${t._lastScrollHash}`);
        return;
      }

      // '#' means canonical root; drive Carrd to actual root id (no new history)
      if (l.hash === '#') return t.drive('', 0);

      // If a scrollpoint click is pending but Carrd changed hash to something else
      // (like '#page'), re-assert the scroll hash again.
      if (t._pendingScrollHash && l.hash !== t._pendingScrollHash) {
        setTimeout(() => {
          if (t._pendingScrollHash) l.hash = t._pendingScrollHash;
        }, 0);
        return;
      }

      // FEATURE 1:
      // If hash is a scrollpoint, let Carrd scroll using the real '#test',
      // then mask the visible URL to '/page#test'.
      if (t.isScrollPoint(l.hash)) {
        t._pendingScrollHash = '';

        // Record last scrollpoint so we can restore it if Carrd clears the hash later.
        t._lastScrollHash = l.hash;
        t._lastScrollAt = Date.now();

        setTimeout(() => {
          const section = t.sectionFromPath(l.pathname) || '';
          rS({ section }, '', `${o}/${section || ''}${l.hash}`);
        }, 0);

        return;
      }

      // Normal section hash -> clean URL after Carrd switches sections
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
