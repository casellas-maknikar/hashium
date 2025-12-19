class HybridRouter {
  constructor() {
    const { location, history, addEventListener, document } = window;

    this.l = location;
    this.o = location.origin;
    this.h = history;

    this.rS = history.replaceState.bind(history);
    this.aEL = addEventListener.bind(window);

    // Guards
    this._syncingPop = false;
    this._ignorePop = false;

    // Keep async load fast, but INIT after Carrd script has run (end of body).
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", () => this.init(), { once: true });
    } else {
      // DOM already parsed (possible with async)
      this.init();
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

  cleanUrl(section) {
    return `${this.o}/${section}`;
  }

  hashFor(section) {
    return section ? `#${this.unpath(section)}` : "#";
  }

  // Your original: hash -> clean URL
  route() {
    const section = this.sectionFromHash();
    this.rS({ section }, "", this.cleanUrl(section));
  }

  // Back/Forward: clean path -> hash (so Carrd can activate), but no new entry
  syncHashToPath() {
    const section = this.sectionFromPath();
    const targetHash = this.hashFor(section);

    // If already matching, just ensure clean URL is consistent
    if (this.l.hash === targetHash) {
      this.route();
      return;
    }

    // Prevent popstate recursion in some browsers
    this._ignorePop = true;
    setTimeout(() => (this._ignorePop = false), 0);

    // Mark that next hashchange came from pop sync
    this._syncingPop = true;

    // IMPORTANT: replace() does not add a history entry
    this.l.replace(targetHash);
    // Carrd will handle hashchange; then our hashchange handler will clean URL.
  }

  init() {
    // 1) Handle direct entry to clean URL (/page/subpage) with no hash:
    // Convert to hash once so Carrd shows the right section.
    if ((!this.l.hash || this.l.hash === "#") && this.l.pathname && this.l.pathname !== "/") {
      this.syncHashToPath();
      // hashchange will fire and route() will run after Carrd processes it
    } else {
      // Otherwise just clean whatever hash is there
      this.route();
    }

    // 2) IMPORTANT: these listeners are now registered AFTER Carrd’s (since DOMContentLoaded)
    this.aEL("hashchange", () => {
      // If hashchange was triggered by back/forward sync, still just clean URL.
      // Carrd already activated section because its handler runs first.
      this._syncingPop = false;
      this.route();
    });

    this.aEL("popstate", () => {
      if (this._ignorePop) return;

      // Browser moved among clean URLs; drive Carrd via hash
      this.syncHashToPath();
    });
  }
}

export default new HybridRouter();
