class HybridRouter {
  constructor() {
    const { location, history, document, addEventListener } = window;

    this.l = location;
    this.o = location.origin;
    this.h = history;
    this.rS = history.replaceState.bind(history);
    this.aEL = addEventListener.bind(window);

    this._driving = false;
    this._observer = null;

    // NEW: latest-wins queue for ultra-fast clicking
    this._pending = null;

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => this.init(), { once: true });
    } else {
      this.init();
    }
  }

  /* ---------- helpers ---------- */

  path(str) {
    return String(str || '').replaceAll('--', '/');
  }

  unpath(str) {
    return String(str || '').replaceAll('/', '--');
  }

  sectionFromHash(hash) {
    return this.path(String(hash || '').replace(/^#/, ''));
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

  cleanTo(section) {
    this.rS({ section }, '', this.cleanUrl(section));
  }

  /* ---------- Carrd settle via MutationObserver ---------- */

  waitForSection(section, callback) {
    const expectedId = section ? `${this.unpath(section)}-section` : 'home-section';

    const isActive = () => {
      const el = document.getElementById(expectedId);
      return !!(el && el.classList.contains('active'));
    };

    if (isActive()) {
      callback();
      return;
    }

    if (this._observer) this._observer.disconnect();

    this._observer = new MutationObserver(() => {
      if (isActive()) {
        this._observer.disconnect();
        this._observer = null;
        callback();
      }
    });

    this._observer.observe(document.body, {
      subtree: true,
      attributes: true,
      attributeFilter: ['class'],
    });
  }

  /* ---------- latest-wins scheduling ---------- */

  // NEW: If we're mid-transition, remember only the most recent request.
  schedule(section, mode) {
    if (!this._driving) return false;
    this._pending = { section, mode }; // overwrite previous pending request
    return true;
  }

  // NEW: After finishing, run pending request (if any).
  flushPending() {
    if (!this._pending) return;
    const { section, mode } = this._pending;
    this._pending = null;

    if (mode === 'click') this.driveFromClick(section);
    else this.driveFromPop(section);
  }

  /* ---------- drivers ---------- */

  driveFromClick(section) {
    // NEW: fast-click protection
    if (this.schedule(section, 'click')) return;

    const targetHash = this.hashFor(section);
    this._driving = true;

    // creates ONE history entry
    this.l.hash = targetHash;

    this.waitForSection(section, () => {
      this.cleanTo(section);
      this._driving = false;
      this.flushPending();
    });
  }

  driveFromPop(section) {
    // NEW: fast-click protection
    if (this.schedule(section, 'pop')) return;

    const targetHash = this.hashFor(section);
    this._driving = true;

    // does NOT create a history entry
    this.l.replace(targetHash);

    this.waitForSection(section, () => {
      this.cleanTo(section);
      this._driving = false;
      this.flushPending();
    });
  }

  /* ---------- init ---------- */

  init() {
    // Direct entry: /page/subpage (no hash)
    if ((!this.l.hash || this.l.hash === '#') && this.l.pathname !== '/') {
      const section = this.sectionFromPathname(this.l.pathname);
      this.driveFromPop(section);
    } else {
      const section = this.sectionFromHash(this.l.hash);
      this.waitForSection(section, () => this.cleanTo(section));
    }

    // Intercept Carrd links
    this.aEL(
      'click',
      (event) => {
        const anchor = event.target?.closest?.('a[href^="#"]');
        if (!anchor) return;

        event.preventDefault();
        const section = this.sectionFromHash(anchor.getAttribute('href'));
        this.driveFromClick(section);
      },
      true
    );

    // External hash changes
    this.aEL('hashchange', () => {
      if (this._driving) return;
      const section = this.sectionFromHash(this.l.hash);
      this.waitForSection(section, () => this.cleanTo(section));
    });

    // Back / Forward
    this.aEL('popstate', (e) => {
      if (this._driving) return;

      const section =
        typeof e.state?.section === 'string'
          ? e.state.section
          : this.sectionFromPathname(this.l.pathname);

      this.driveFromPop(section);
    });
  }
}

export default new HybridRouter();
