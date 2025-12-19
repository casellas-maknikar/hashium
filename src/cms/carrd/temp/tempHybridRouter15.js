class HybridRouter {
  constructor() {
    const { location, history, addEventListener, requestAnimationFrame } = window;

    this.l = location;
    this.h = history;

    this.rS = history.replaceState.bind(history);
    this.aEL = addEventListener.bind(window);
    this.rAF = requestAnimationFrame.bind(window);

    // Carrd transitions + its internal locked flag are async.
    // We wait a bit before rewriting URLs.
    this.SETTLE_MS = 150;

    // Prevent loops when popstate triggers a hash replace
    this._syncing = false;

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
    // Carrd uses "#" for home (empty)
    return this.path(this.l.hash.slice(1));
  }

  sectionFromPath() {
    return decodeURIComponent(this.l.pathname.replace(/^\/+/, ""));
  }

  cleanUrl(section) {
    return section ? `/${section}` : `/`;
  }

  // Wait until Carrd has definitely finished reacting to the hashchange
  afterCarrd(fn) {
    this.rAF(() => this.rAF(() => setTimeout(fn, this.SETTLE_MS)));
  }

  // Rewrite the CURRENT history entry to the clean URL (no new entry)
  rewriteCurrentEntryToClean(section) {
    this.rS({ section }, "", this.cleanUrl(section));
  }

  // Drive Carrd navigation WITHOUT adding a new history entry
  // by using location.replace on the hash.
  driveCarrdWithoutHistory(section) {
    const hash = section ? `#${this.unpath(section)}` : "#";
    // location.replace does not create a new history entry
    this.l.replace(hash);
  }

  onHashChange() {
    const section = this.sectionFromHash();

    // During popstate sync, don't rewrite too early; still rewrite after settle.
    this.afterCarrd(() => {
      this.rewriteCurrentEntryToClean(section);
      this._syncing = false;
    });
  }

  onPopState() {
    // Browser went to /page/subpage (clean URL) — Carrd won’t react to that.
    const section = this.sectionFromPath();

    this._syncing = true;

    // Make Carrd navigate to the correct section without creating new history
    this.driveCarrdWithoutHistory(section);

    // Carrd will fire hashchange; that handler will clean the URL again.
  }

  onLoad() {
    // If user lands directly on /page/subpage, convert to hash once (no history entry)
    if (!this.l.hash || this.l.hash === "#") {
      const section = this.sectionFromPath();
      if (section) {
        this._syncing = true;
        this.driveCarrdWithoutHistory(section);
        return; // hashchange will fire and clean it
      }
    }

    // If user lands with a hash, just clean it after Carrd settles
    if (this.l.hash && this.l.hash.length > 1) {
      this.onHashChange();
    } else {
      // Home case: ensure state is consistent
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
