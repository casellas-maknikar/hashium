class HybridRouter {
  constructor() {
    const { location, history, addEventListener, requestAnimationFrame } = window;

    this.l = location;
    this.h = history;

    this.rS = history.replaceState.bind(history);
    this.aEL = addEventListener.bind(window);
    this.rAF = requestAnimationFrame.bind(window);

    this.SETTLE_MS = 200;

    // Guards to prevent loops
    this._ignoreNextPop = false;
    this._ignoreNextHash = false;

    this.init();
  }

  // "#page--subpage" -> "page/subpage"
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

  // Set hash WITHOUT creating a new history entry (and without looping)
  driveCarrdWithoutHistory(section) {
    const targetHash = this.hashFor(section);

    // If already there, nothing to do
    if (this.l.hash === targetHash) return;

    // We are about to cause a hash navigation. Prevent our own handlers looping.
    this._ignoreNextHash = true;

    // location.replace avoids adding an entry
    this.l.replace(targetHash);
  }

  onHashChange() {
    // If this hashchange was caused by us, consume the guard but still clean URL.
    const wasIgnored = this._ignoreNextHash;
    this._ignoreNextHash = false;

    const section = this.sectionFromHash();

    this.afterCarrd(() => {
      this.rewriteCurrentEntryToClean(section);

      // If the hashchange was caused by us, some browsers can emit popstate;
      // preemptively ignore one popstate tick.
      if (wasIgnored) this._ignoreNextPop = true;
    });
  }

  onPopState() {
    if (this._ignoreNextPop) {
      this._ignoreNextPop = false;
      return;
    }

    // Browser navigated to a clean URL (/page/subpage). Carrd won't react to that.
    const section = this.sectionFromPath();

    // Prevent immediate re-entry if browser emits popstate for replace()
    this._ignoreNextPop = true;

    this.driveCarrdWithoutHistory(section);
    // Carrd will fire hashchange, which will clean the URL again.
  }

  onLoad() {
    // If landing on a clean URL with no hash, convert to hash once (no new entry)
    if (!this.l.hash || this.l.hash === "#") {
      const section = this.sectionFromPath();
      if (section) {
        this._ignoreNextPop = true;
        this.driveCarrdWithoutHistory(section);
        return;
      }
    }

    // If landing with a hash, clean it after Carrd settles
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
