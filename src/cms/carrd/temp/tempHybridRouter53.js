class HybridRouter {
  constructor() {
    const w = window, d = w.document, l = w.location, h = w.history, t = this;
    t.l = l;
    t.o = l.origin;
    t.rS = h.replaceState.bind(h);
    t.aEL = w.addEventListener.bind(w);

    t.SETTLE_MS = 450;

    // navigation/cleanup control
    t._driving = 0;     // truthy while we are actively driving Carrd + pending cleanup
    t._tok = 0;         // monotonic token; newest navigation wins
    t._timer = 0;       // active cleanup timeout id

    const i = () => t.init();
    d.readyState === 'loading'
      ? d.addEventListener('DOMContentLoaded', i, { once: true })
      : i();
  }

  sectionFromHash(h) { return String(h || '').slice(1).replaceAll('--', '/'); }
  sectionFromPath(p) { return decodeURIComponent(String(p || '').replace(/^\/+/, '')); }

  // Schedules "clean current entry" so only the latest navigation can win.
  _scheduleClean(section) {
    const t = this, tok = ++t._tok;
    if (t._timer) clearTimeout(t._timer);

    t._timer = setTimeout(() => {
      if (tok !== t._tok) return; // stale cleanup => ignore
      t.rS({ section }, '', `${t.o}/${section || ''}`);
      t._driving = 0;
      t._timer = 0;
    }, t.SETTLE_MS);
  }

  drive(section, push) {
    const t = this, l = t.l;
    t._driving = 1;

    const hh = section ? `#${section.replaceAll('/', '--')}` : '#';
    push ? (l.hash = hh) : l.replace(hh);

    t._scheduleClean(section);
  }

  init() {
    const t = this, l = t.l;

    // Initial entry
    if ((!l.hash || l.hash === '#') && l.pathname !== '/') {
      t.drive(t.sectionFromPath(l.pathname), 0);
    } else {
      // Not "driving" Carrd here; just normalize URL after Carrd settles
      t._scheduleClean(t.sectionFromHash(l.hash));
    }

    // Click (still capture-phase)
    t.aEL('click', (e) => {
      const a = e.target?.closest?.('a[href^="#"]');
      if (!a) return;

      // (Optional but recommended) don't break new-tab / modifier clicks
      if (e.defaultPrevented || e.button === 1 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;

      e.preventDefault();
      t.drive(t.sectionFromHash(a.getAttribute('href')), 1);
    }, 1);

    // Hash cleanup (keyboard edits / other scripts)
    t.aEL('hashchange', () => {
      if (t._driving) return;
      t._scheduleClean(t.sectionFromHash(l.hash));
    });

    // Back / Forward
    t.aEL('popstate', (e) => {
      if (t._driving) return;

      const section =
        typeof e.state?.section === 'string'
          ? e.state.section
          : t.sectionFromPath(l.pathname);

      t.drive(section, 0);
    });
  }
}

export default new HybridRouter();
