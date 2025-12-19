class HybridRouter {
  constructor() {
    const { location, history, document, addEventListener } = window;
    this.l = location;
    this.o = location.origin;
    this.h = history;
    this.rS = history.replaceState.bind(history);
    this.aEL = addEventListener.bind(window);

    this.SETTLE_MS = 0;
    this._driving = false;

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => this.init(), { once: true });
    } else {
      this.init();
    }
  }

  path(str) {
    return String(str || '').replaceAll('--', '/');
  }
  unpath(str) {
    return String(str || '').replaceAll('/', '--');
  }
  sectionFromHash(h) {
    return this.path(String(h || '').replace(/^#/, ''));
  }
  sectionFromPathname(p) {
    return decodeURIComponent(String(p || '').replace(/^\/+/, ''));
  }
  hashFor(section) {
    return section ? `#${this.unpath(section)}` : '#';
  }
  cleanUrl(section) {
    return section ? `${this.o}/${section}` : `${this.o}/`;
  }
  settle(fn) {
    setTimeout(fn, this.SETTLE_MS);
  }

  // Always normalize the *current* entry into a clean URL (no new history entry)
  cleanTo(section) {
    this.rS({ section }, '', this.cleanUrl(section));
  }

  // User navigation: create ONE new entry via hash, then clean that same entry.
  driveCarrdFromClick(section) {
    const target = this.hashFor(section);
    this._driving = true;

    // This creates a history entry (good for click navigation)
    this.l.hash = target;

    this.settle(() => {
      this.cleanTo(section);   // convert that hash entry into /clean/path
      this._driving = false;
    });
  }

  // Back/Forward: do NOT create a new entry. Use replace() to change hash without history.
  driveCarrdFromPop(section) {
    const target = this.hashFor(section);
    this._driving = true;

    // Does not add a history entry
    this.l.replace(target);

    this.settle(() => {
      this.cleanTo(section);
      this._driving = false;
    });
  }

  init() {
    // Direct entry to /page/subpage with no hash:
    // drive Carrd without adding new history (replace), then clean.
    if ((!this.l.hash || this.l.hash === '#') && this.l.pathname !== '/') {
      const section = this.sectionFromPathname(this.l.pathname);
      this.driveCarrdFromPop(section);
    } else {
      // Normal hash entry: let Carrd handle it; then clean current entry.
      const section = this.sectionFromHash(this.l.hash);
      this.settle(() => this.cleanTo(section));
    }

    // Capture links before Carrd sees them
    this.aEL('click', (event) => {
      const anchor = event.target?.closest?.('a[href^="#"]');
      if (!anchor) return;

      event.preventDefault();
      const section = this.sectionFromHash(anchor.getAttribute('href'));
      this.driveCarrdFromClick(section);
    }, true);

    // If something else changes hash (keyboard etc), just clean current entry
    this.aEL('hashchange', () => {
      if (this._driving) return;
      const section = this.sectionFromHash(this.l.hash);
      this.settle(() => this.cleanTo(section));
    });

    // Back/Forward
    this.aEL('popstate', (e) => {
      if (this._driving) return;

      const section =
        typeof e.state?.section === 'string'
          ? e.state.section
          : this.sectionFromPathname(this.l.pathname);

      this.driveCarrdFromPop(section);
    });
  }
}

export default new HybridRouter();
