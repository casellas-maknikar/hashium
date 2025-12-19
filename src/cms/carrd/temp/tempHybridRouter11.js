class HybridRouter {
  constructor() {
    const { location, history, addEventListener, requestAnimationFrame } = window;

    this.l = location;
    this.h = history;

    this.push = history.pushState.bind(history);
    this.replace = history.replaceState.bind(history);

    this.on = addEventListener.bind(window);
    this.rAF = requestAnimationFrame.bind(window);

    // When we set hash due to popstate or initial /path entry,
    // the next hashchange should NOT push a new entry.
    this._hashChangeIsSync = false;

    // Carrd needs time to finish switching sections before we remove hash.
    this.CARRD_SETTLE_MS = 200;

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

  // Run AFTER Carrd has reacted to the hash
  afterCarrd(fn) {
    this.rAF(() => {
      this.rAF(() => {
        setTimeout(fn, this.CARRD_SETTLE_MS);
      });
    });
  }

  // Called when hash changes (Carrd navigation signal)
  onHashChange() {
    const section = this.sectionFromHash();

    // Let Carrd complete its section swap first, then we touch the URL bar.
    this.afterCarrd(() => {
      if (this._hashChangeIsSync) {
        // Back/forward or initial sync: don't add history entries
        this._hashChangeIsSync = false;
        this.replace({ section }, "", this.cleanUrl(section));
      } else {
        // User click: add a history entry
        this.push({ section }, "", this.cleanUrl(section));
      }
    });
  }

  // Back/forward: drive Carrd by restoring hash; do NOT push a new entry
  onPopState(e) {
    const section =
      typeof e.state?.section === "string"
        ? e.state.section
        : this.sectionFromPath(); // fallback if state missing

    this._hashChangeIsSync = true;

    const targetHash = section ? `#${this.unpath(section)}` : "";

    // This is what makes Carrd navigate.
    if (this.l.hash !== targetHash) {
      this.l.hash = targetHash;
    } else {
      // If hash already matches, just clean URL/state
      this._hashChangeIsSync = false;
      this.replace({ section }, "", this.cleanUrl(section));
    }
  }

  // Direct entry to /page/subpage should navigate Carrd via hash
  syncOnLoad() {
    // If user entered a clean path, convert it to hash so Carrd can navigate.
    if (!this.l.hash) {
      const section = this.sectionFromPath();
      if (section) {
        this._hashChangeIsSync = true;
        this.l.hash = `#${this.unpath(section)}`;
        return;
      }
    }

    // If loaded with hash already (/#page...), let Carrd do it, then replace URL (no push).
    if (this.l.hash && this.l.hash.length > 1) {
      this._hashChangeIsSync = true;
      this.onHashChange();
    }
  }

  init() {
    this.on("load", () => this.syncOnLoad());
    this.on("hashchange", () => this.onHashChange());
    this.on("popstate", (e) => this.onPopState(e));
  }
}

export default new HybridRouter();
