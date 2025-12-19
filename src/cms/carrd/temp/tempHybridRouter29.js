class HybridRouter {
  constructor() {
    const { location, history, document } = window;

    this.l = location;
    this.o = location.origin;
    this.h = history;

    this.rS = history.replaceState.bind(history);

    // Carrd uses timed transitions/locks; clearing hash too early breaks navigation.
    // Tune: 350 is usually safe; if still flaky, try 500–700.
    this.SETTLE_MS = 350;

    // guard to avoid re-entrant pop loops
    this._popSyncing = false;

    // IMPORTANT: keep async load, but initialize only after Carrd (end-of-body script) has run.
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", () => this.init(), { once: true });
    } else {
      this.init();
    }
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

  hashFor(section) {
    return section ? `#${this.unpath(section)}` : "#";
  }

  cleanUrl(section) {
    return `${this.o}/${section}`;
  }

  settle(fn) {
    setTimeout(fn, this.SETTLE_MS);
  }

  // Your original route(), but only run AFTER Carrd has had time to process hash navigation
  route() {
    const section = this.sectionFromHash();
    this.rS({ section }, "", this.cleanUrl(section));
  }

  // Back/Forward: drive Carrd via hash without adding an entry, then clean later
  syncCarrdToPath() {
    const section = this.sectionFromPath();
    const targetHash = this.hashFor(section);

    // If already correct, just clean (after settle)
    if (this.l.hash === targetHash) {
      this.settle(() => this.route());
      return;
    }

    this._popSyncing = true;

    // IMPORTANT: replace() does NOT add a new history entry
    this.l.replace(targetHash);

    // After Carrd processes the hashchange & transitions, clean URL
    this.settle(() => {
      this.route();
      this._popSyncing = false;
    });
  }

  init() {
    // If user lands directly on /page/subpage (no hash), we must set hash so Carrd shows correct section
    if ((!this.l.hash || this.l.hash === "#") && this.l.pathname && this.l.pathname !== "/") {
      this.syncCarrdToPath();
    } else {
      // normal load
      this.settle(() => this.route());
    }

    window.addEventListener("hashchange", () => {
      // Let Carrd do its thing first, then clean
      this.settle(() => this.route());
    });

    window.addEventListener("popstate", () => {
      // If popstate was triggered by our own replace(), ignore re-entry
      if (this._popSyncing) return;

      // Browser moved between clean URLs; drive Carrd via hash
      this.syncCarrdToPath();
    });
  }
}

export default new HybridRouter();
