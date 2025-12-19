class HybridRouter {
  constructor() {
    const { location, history, document, addEventListener } = window;
    this.l = location;
    this.o = location.origin;
    this.h = history;
    this.rS = history.replaceState.bind(history);
    this.pS = history.pushState.bind(history);
    this.aEL = addEventListener.bind(window);

    // time for Carrd transitions; adjust if your template animates longer
    this.SETTLE_MS = 450;
    this._driving = false;
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => this.init(), { once: true });
    } else {
      this.init();
    }
  }

  path(str) {
    return String(str || '').replaceAll('--','/');
  }
  unpath(str) {
    return String(str || '').replaceAll('/','--');
  }
  sectionFromHash(h) {
    return this.path(String(h || '').replace(/^#/,''));
  }
  sectionFromPathname(p) {
    return decodeURIComponent(String(p || '').replace(/^\/+/,''));
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
  cleanTo(section, push = false) {
    // push==true when this is a new user navigation; otherwise replace current entry
    const url = this.cleanUrl(section);
    if (push) {
      this.pS({ section }, '', url);
    } else {
      this.rS({ section }, '', url);
    }
  }

  driveCarrd(section, push = false) {
    const target = this.hashFor(section);
    this._driving = true;
    // real hash navigation so Carrd sees it
    if (this.l.hash === target) {
      this.l.hash = '#';
      setTimeout(() => { this.l.hash = target; }, 0);
    } else {
      this.l.hash = target;
    }
    // after Carrd finishes, clean URL and optionally push new entry
    this.settle(() => {
      this.cleanTo(section, push);
      this._driving = false;
    });
  }

  init() {
    // direct entry: if we land on /page/subpage without a hash, convert to hash and then clean
    if ((!this.l.hash || this.l.hash === '#') && this.l.pathname !== '/') {
      const section = this.sectionFromPathname(this.l.pathname);
      this.driveCarrd(section);  // no push here: initial load should not create extra entries
    } else {
      const section = this.sectionFromHash(this.l.hash);
      this.settle(() => this.cleanTo(section)); // normalise initial hash
    }

    // capture links before Carrd sees them; push==true because this is a new navigation
    this.aEL('click', event => {
      const anchor = event.target?.closest?.('a[href^="#"]');
      if (!anchor) return;
      event.preventDefault();
      const section = this.sectionFromHash(anchor.getAttribute('href'));
      this.driveCarrd(section, true);
    }, true);

    // handle native hash navigation (e.g. keyboard) and clean it (no push)
    this.aEL('hashchange', () => {
      if (this._driving) return;
      const section = this.sectionFromHash(this.l.hash);
      this.settle(() => this.cleanTo(section));
    });

    // Back/Forward: use the stored state to drive Carrd; then replace the URL (no push)
    this.aEL('popstate', e => {
      if (this._driving) return;
      const section = typeof e.state?.section === 'string'
        ? e.state.section
        : this.sectionFromPathname(this.l.pathname);
      this.driveCarrd(section, false);
    });
  }
}

export default new HybridRouter();
