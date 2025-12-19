class HybridRouter {
  constructor() {
    const { location, history, addEventListener, requestAnimationFrame } = window;

    this.l = location;
    this.h = history;

    this.pS = history.pushState.bind(history);
    this.rS = history.replaceState.bind(history);

    this.aEL = addEventListener.bind(window);
    this.rAF = requestAnimationFrame.bind(window);

    // When we set hash due to popstate or initial clean-path entry,
    // we must NOT create a new history entry on the resulting hashchange.
    this._suppressNextCommit = false;

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

  // Always produce relative clean URL (no origin)
  cleanUrl(section) {
    return section ? `/${section}` : `/`;
  }

  // Carrd hash for a section
  hashUrl(section) {
    const hash = section ? `#${this.unpath(section)}` : "";
    // keep current path (whatever it is) but add hash
    return `${this.l.pathname}${this.l.search}${hash}`;
  }

  // Let Carrd finish the section switch, then clean the bar
  afterCarrd(fn) {
    this.rAF(() => this.rAF(fn));
  }

  // Called after hashchange
  commitFromHash() {
    const section = this.sectionFromHash();

    // If this hashchange was triggered by back/forward or load sync,
    // don't add new history entries — just clean the URL.
    if (this._suppressNextCommit) {
      this._suppressNextCommit = false;
      this.afterCarrd(() => {
        this.rS({ section }, "", this.cleanUrl(section));
      });
      return;
    }

    // 1) Add a real history entry BUT keep the URL as the hash URL (Carrd-safe)
    //    This creates a stack: ... -> (hash URL) entry
    this.pS({ section }, "", this.hashUrl(section));

    // 2) Immediately clean the bar for that same entry (no extra history step)
    this.afterCarrd(() => {
      this.rS({ section }, "", this.cleanUrl(section));
    });
  }

  // Back/forward: drive Carrd by restoring the hash from state
  onPopState(e) {
    const section = e.state?.section;

    // If we don't have state (rare), do nothing rather than breaking navigation.
    if (typeof section !== "string") return;

    const targetHash = section ? `#${this.unpath(section)}` : "";

    // Prevent hashchange from pushing a new entry
    this._suppressNextCommit = true;

    // This triggers Carrd navigation
    if (this.l.hash !== targetHash) {
      this.l.hash = targetHash;
    } else {
      // If already on that hash, still ensure URL is clean/state aligned
      this.afterCarrd(() => {
        this.rS({ section }, "", this.cleanUrl(section));
      });
      this._suppressNextCommit = false;
    }
  }

  // On direct entry to /page/subpage (clean path), force Carrd section via hash
  syncCleanPathOnLoad() {
    const section = decodeURIComponent(this.l.pathname.replace(/^\/+/, ""));
    if (!section) return;

    const targetHash = `#${this.unpath(section)}`;
    this._suppressNextCommit = true;
    this.l.hash = targetHash;
  }

  init() {
    // If page loads with a clean path (/page/...), make Carrd navigate via hash.
    this.aEL("load", () => {
      if (!this.l.hash) this.syncCleanPathOnLoad();
      // If it loads with a hash, hashchange will fire as user interacts; we don’t need to do anything here.
    });

    this.aEL("hashchange", () => this.commitFromHash());
    this.aEL("popstate", (e) => this.onPopState(e));
  }
}

export default new HybridRouter();
