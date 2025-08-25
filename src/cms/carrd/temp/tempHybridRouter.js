// hybridRouter.js (proposed)
class HybridRouter {
  constructor() {
    const { location, history, addEventListener } = window;
    this.l = location;
    this.h = history;
    this.o = location.origin;

    // guards to prevent feedback loops
    this.squelchHash = false;
    this.squelchPop  = false;

    // prefer explicit helpers
    this.toSectionFromHash = (hash) =>
      hash.replace(/^#/, '').trim().replaceAll('--', '/');

    this.toHashFromSection = (section) =>
      section.replace(/^\/+/, '').trim().replaceAll('/', '--');

    this.cleanURL = (section, mode = 'replace') => {
      const url = `${this.o}/${section}`.replace(/\/+$/, '').replace(/\/{2,}/g, '/');
      const st = { section };
      if (mode === 'push') this.h.pushState(st, '', url);
      else this.h.replaceState(st, '', url);
    };

    this.handleHashChange = () => {
      if (this.squelchHash) { this.squelchHash = false; return; }
      const section = this.toSectionFromHash(this.l.hash || '#');
      // Keep history light: replace current entry with pretty path
      this.cleanURL(section, 'replace');
    };

    this.handlePopState = (e) => {
      if (this.squelchPop) { this.squelchPop = false; return; }
      const section =
        (e.state && typeof e.state.section === 'string')
          ? e.state.section
          : this.l.pathname.replace(/^\//, '') || '';

      // Recreate the hash so Carrd updates the visible section
      this.squelchHash = true;
      this.l.hash = '#' + this.toHashFromSection(section);

      // After Carrd reacts to the hash, immediately re-clean the URL
      // (microtask tick keeps this snappy without visible flicker)
      queueMicrotask(() => {
        this.cleanURL(section, 'replace');
      });
    };

    this.init();
  }

  init() {
    const { addEventListener: aEL } = window;

    // Initial load: support both hash and pretty path deep-links
    const hasHash = !!this.l.hash;
    const pathSection = this.l.pathname.replace(/^\//, '').trim();

    if (hasHash) {
      const section = this.toSectionFromHash(this.l.hash);
      this.cleanURL(section, 'replace');
    } else if (pathSection) {
      // Convert pretty path ➜ hash to let Carrd render the right section
      this.squelchHash = true;
      this.l.hash = '#' + this.toHashFromSection(pathSection);
      // and keep the pretty URL visible
      this.cleanURL(pathSection, 'replace');
    } else {
      // Home: ensure a stable initial state object
      this.cleanURL('', 'replace');
    }

    aEL('hashchange', this.handleHashChange, { passive: true });
    aEL('popstate',    this.handlePopState,  { passive: true });

    // Optional: make back/forward feel nicer on long pages
    if ('scrollRestoration' in this.h) {
      this.h.scrollRestoration = 'manual';
    }
  }
}

export default new HybridRouter();
