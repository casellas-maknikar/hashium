class HybridRouter {
  constructor() {
    const w = window, d = w.document, l = w.location, h = w.history, t = this;
    t.l = l;
    t.o = l.origin;
    t.rS = h.replaceState.bind(h);
    t.aEL = w.addEventListener.bind(w);

    t.SETTLE_MS = 450;

    t._driving = 0;
    t._tok = 0;
    t._timer = 0;

    const i = () => t.init();
    d.readyState === 'loading'
      ? d.addEventListener('DOMContentLoaded', i, { once: true })
      : i();
  }

  sectionFromHash(h) {
    // Carrd home can be "#" or "" => canonical section = ""
    const raw = String(h || '');
    if (!raw || raw === '#') return '';
    return raw.slice(1).replaceAll('--', '/');
  }

  sectionFromPath(p) {
    return decodeURIComponent(String(p || '').replace(/^\/+/, ''));
  }

  _driveHash(section, push) {
    const t = this, l = t.l;

    // HOME: remove hash entirely (works even if home is unnamed)
    if (!section) {
      if (push) l.hash = ''; // creates one entry when coming from a section
      else l.replace(l.pathname + l.search); // no new entry, fragment-only navigation
      return;
    }

    const hh = `#${section.replaceAll('/', '--')}`;
    push ? (l.hash = hh) : l.replace(hh);
  }

  _clean(section) {
    this.rS({ section }, '', `${this.o}/${section || ''}`);
  }

  _scheduleClean(section) {
    const t = this, tok = ++t._tok;
    if (t._timer) clearTimeout(t._timer);

    t._timer = setTimeout(() => {
      if (tok !== t._tok) return; // stale timeout
      t._clean(section);
      t._driving = 0;
      t._timer = 0;
    }, t.SETTLE_MS);
  }

  drive(section, push) {
    const t = this;
    t._driving = 1;
    t._driveHash(section, push);
    t._scheduleClean(section);
  }

  init() {
    const t = this, l = t.l;

    // Initial entry
    if ((!l.hash || l.hash === '#') && l.pathname !== '/') {
      t.drive(t.sectionFromPath(l.pathname), 0);
    } else {
      t._scheduleClean(t.sectionFromHash(l.hash));
    }

    // Click (capture)
    t.aEL('click', (e) => {
      const a = e.target?.closest?.('a[href^="#"]');
      if (!a) return;

      // keep normal browser behaviors
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
