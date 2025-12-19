class HybridRouter {
  constructor() {
    const { location, history, addEventListener, requestAnimationFrame } = window;

    this.l = location;
    this.h = history;

    this.rS = history.replaceState.bind(history);
    this.aEL = addEventListener.bind(window);
    this.rAF = requestAnimationFrame.bind(window);

    this.SETTLE_MS = 200;

    // Guards
    this._ignoreNextHash = false;
    this._popLock = false; // re-entrancy guard for popstate loops

    this.init();
  }

  path(str) {
    return String(str || "").replaceAll("--", "/");
  }

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
    return section ? `/${section}` : `/`;
  }

  hashFor(section) {
    // Carrd home is "#"
    return section ? `#${this.unpath(section)}` : "#";
  }

  afterCarrd(fn) {
    this.rAF(() => this.rAF(() => setTimeout(fn, this.SETTLE_MS)));
  }

  rewriteCurrentEntryToClean(section) {
    this.rS({ section }, "", this.cleanUrl(section));
  }

  driveCarrdWithoutHistory(section) {
    const targetHash = this.hashFor(section);

    // No-op if already correct
    if (this.l.hash === targetHash) return;

    // We'll cause a hashchange — mark it as ours (so we don't do anything weird)
    this._ignoreNextHash = true;

    // DOES NOT add a history entry
    this.l.replace(targetHash);
  }

  onHashChange() {
    // Consume the "ours" flag (but we still want to clean the URL)
    this._ignoreNextHash = false;

    const section = this.sectionFromHash();

    this.afterCarrd(() => {
      this.rewriteCurrentEntryToClean(section);
    });
  }

  onPopState() {
    // Re-entrancy lock: handle the first popstate, ignore any immediate nested ones
    if (this._popLock) return;
    this._popLock = true;
    setTimeout(() => (this._popLock = false), 0);

    // Browser moved to /page/subpage (clean URL). Carrd doesn't react to that.
    const section = this.sectionFromPath();

    // Drive Carrd via hash WITHOUT adding a history entry
    this.driveCarrdWithoutHistory(section);
    // Carrd triggers hashchange; we then clean the URL again.
  }

  onLoad() {
    // If landing directly on /page/subpage with no hash, convert to hash once
    if (!this.l.hash || this.l.hash === "#") {
      const section = this.sectionFromPath();
      if (section) {
        this.driveCarrdWithoutHistory(section);
        return;
      }
    }

    // If landing with hash, clean it after Carrd settles
    if (this.l.hash && this.l.hash.length > 1) {
      this.onHashChange();
    } else {
      this.rewriteCurrentEntryToClean("");
    }
  }

  init() {
    this.aEL("load", () => this.onLoad());
    this.aEL("hashchange", () => this.onHashChange());
    this.aEL("popstate", () => this.onPopState());
  }
}

export default new HybridRouter();
