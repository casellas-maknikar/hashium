class HybridRouter {
  constructor() {
    const { location, history, addEventListener, requestAnimationFrame, document } = window;

    this.l = location;
    this.o = location.origin;
    this.h = history;

    this.rS = history.replaceState.bind(history);
    this.aEL = addEventListener.bind(window);
    this.rAF = requestAnimationFrame.bind(window);

    // Loop guards
    this._ignorePop = false;

    this.init();

    // Script is async in <head>; Carrd may already be ready when we run
    if (document.readyState === "complete" || document.readyState === "interactive") {
      this.boot();
    }
  }

  // "page--subpage" -> "page/subpage"
  path(str) {
    return String(str || "").replaceAll("--", "/");
  }

  // "page/subpage" -> "page--subpage"
  unpath(str) {
    return String(str || "").replaceAll("/", "--");
  }

  sectionFromHash() {
    return this.path(this.l.hash.slice(1));
  }

  sectionFromPath() {
    return decodeURIComponent(this.l.pathname.replace(/^\/+/, ""));
  }

  hashFor(section) {
    return section ? `#${this.unpath(section)}` : "#";
  }

  cleanUrl(section) {
    return `${this.o}/${section}`;
  }

  // Wait until Carrd router is actually running (body becomes is-ready)
  waitForCarrdReady(cb) {
    const start = Date.now();
    const tick = () => {
      const ready =
        document.body &&
        (document.body.classList.contains("is-ready") ||
          document.body.classList.contains("is-playing"));

      if (ready) return cb();

      // Safety timeout (2s) so we don't hang forever
      if (Date.now() - start > 2000) return cb();

      this.rAF(tick);
    };
    tick();
  }

  // Wait until Carrd has actually activated the expected section
  waitForSectionActive(section, cb) {
    const start = Date.now();
    const expectedId = section ? `${this.unpath(section)}-section` : "home-section";

    const tick = () => {
      const active = document.querySelector(".site-main > .inner > section.active");
      if (active && active.id === expectedId) return cb();

      // If already on that section but id conventions differ, allow fallback:
      // if hash matches and some section is active, proceed after a short grace.
      if (Date.now() - start > 1200) return cb();

      this.rAF(tick);
    };
    tick();
  }

  // Clean URL only AFTER Carrd has switched sections
  cleanAfterCarrd(section) {
    this.waitForSectionActive(section, () => {
      this.rS({ section }, "", this.cleanUrl(section));
    });
  }

  // Your original behavior, but DOM-synced
  routeFromHash() {
    const section = this.sectionFromHash();
    this.cleanAfterCarrd(section);
  }

  // Back/Forward: path changed, but Carrd needs hash.
  // Use location.replace(hash) so we DO NOT add a new history entry.
  syncHashFromPath() {
    const section = this.sectionFromPath();
    const targetHash = this.hashFor(section);

    if (this.l.hash === targetHash) {
      // Hash already correct; just ensure clean URL is consistent
      this.cleanAfterCarrd(section);
      return;
    }

    this._ignorePop = true; // avoid any weird re-entrant popstate
    this.l.replace(targetHash);

    // Carrd will react to hashchange; then we clean.
    // Release guard on next tick.
    setTimeout(() => (this._ignorePop = false), 0);
  }

  boot() {
    this.waitForCarrdReady(() => {
      // If landing on a clean URL with no hash, drive Carrd once
      if (!this.l.hash || this.l.hash === "#") {
        const section = this.sectionFromPath();
        if (section) {
          this.l.replace(this.hashFor(section));
          // hashchange will fire; we’ll clean after Carrd activates
          return;
        }
      }

      // Normal case: hash already present; clean after Carrd activates
      this.routeFromHash();
    });
  }

  init() {
    this.aEL("load", () => this.boot());

    // On user clicks (hash changes), let Carrd activate first, then clean
    this.aEL("hashchange", () => this.waitForCarrdReady(() => this.routeFromHash()));

    // On Back/Forward, translate clean path -> hash so Carrd switches section
    this.aEL("popstate", () => {
      if (this._ignorePop) return;
      this.waitForCarrdReady(() => this.syncHashFromPath());
    });
  }
}

export default new HybridRouter();
