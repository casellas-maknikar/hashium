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

    // Detected at init; used when section === '' (aka "#")
    t._rootId = '';

    const i = () => t.init();
    d.readyState === 'loading'
      ? d.addEventListener('DOMContentLoaded', i, { once: true })
      : i();
  }

  sectionFromHash(h) {
    return String(h || '').slice(1).replaceAll('--', '/');
  }
  sectionFromPath(p) {
    return decodeURIComponent(String(p || '').replace(/^\/+/, ''));
  }

  // Find the first Carrd "real" section element (root section).
  // Fallback to "home" if we can't detect (Carrd default when unnamed).
  detectRootId() {
    // Prefer a section inside main content, but fall back to any section with an id.
    const s =
      document.querySelector('#main section[id]') ||
      document.querySelector('main section[id]') ||
      document.querySelector('section[id]');
    return (s && s.id) ? s.id : 'home';
  }

  isRootSection(section) {
    return !section;
  }

  // Convert canonical section -> hash that Carrd understands
  // Canonical root is '' (clean URL "/"), but Carrd needs an actual section id to switch.
  hashTargetFor(section) {
    if (this.isRootSection(section)) return `#${this._rootId}`;
    return `#${section.replaceAll('/', '--')}`;
  }

  _scheduleClean(section) {
    const t = this, tok = ++t._tok;
    if (t._timer) clearTimeout(t._timer);

    t._timer = setTimeout(() => {
      if (tok !== t._tok) return; // stale cleanup
      t.rS({ section }, '', `${t.o}/${section || ''}`);
      t._driving = 0;
      t._timer = 0;
    }, t.SETTLE_MS);
  }

  drive(section, push) {
    const t = this, l = t.l;
    t._driving = 1;

    const target = t.hashTargetFor(section);
    push ? (l.hash = target) : l.replace(target);

    t._scheduleClean(section);
  }

  init() {
    const t = this, l = t.l;

    // Detect true root section id once the DOM is ready.
    t._rootId = t.detectRootId();

    // Initial entry
    if ((!l.hash || l.hash === '#') && l.pathname !== '/') {
      // Direct entry to /something -> drive without new history
      t.drive(t.sectionFromPath(l.pathname), 0);
      return;
    }

    // If landing on "/#" (or "#"), treat it as root and actively drive Carrd to root.
    if (l.hash === '#') {
      t.drive('', 0);
      return;
    }

    // Otherwise: normal hash entry; just normalize URL after settle.
    t._scheduleClean(t.sectionFromHash(l.hash));

    // Click interception for hash links
    t.aEL('click', (e) => {
      const a = e.target?.closest?.('a[href^="#"]');
      if (!a) return;

      // Don’t break new-tab / modifiers
      if (e.defaultPrevented || e.button === 1 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;

      e.preventDefault();

      const href = a.getAttribute('href') || '#';
      const section = (href === '#' || href === '') ? '' : t.sectionFromHash(href);

      t.drive(section, 1);
    }, 1);

    // Hash change (keyboard edits / other scripts)
    t.aEL('hashchange', () => {
      if (t._driving) return;

      if (l.hash === '#') return t.drive('', 0);

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
