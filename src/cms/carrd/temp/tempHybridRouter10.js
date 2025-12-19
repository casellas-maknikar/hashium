class HybridRouter {
  constructor() {
    const { location, history, addEventListener } = window;

    this.l = location;
    this.h = history;

    this.pS = history.pushState.bind(history);
    this.rS = history.replaceState.bind(history);

    this.aEL = addEventListener.bind(window);

    // Carrd needs time to finish its section switch before we remove the hash
    this.POST_HASH_DELAY_MS = 120;

    // prevents hashchange handler from pushing when hash was set by popstate/load
    this._suppressNextPush = false;

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

  carrdHash(section) {
    return section ? `#${this.unpath(section)}` : "";
  }

  // After Carrd navigates via hash, create ONE real history entry for /clean/path
  commitFromHash() {
    const section = this.sectionFromHash();

    // If this hashchange was triggered by us (popstate/load sync), don't push.
    if (this._suppressNextPush) {
      this._suppressNextPush = false;

      // Just clean the bar (no new history entry)
      this.rS({ section }, "", this.cleanUrl(section));
      return;
    }

    // IMPORTANT: wait for Carrd to finish switching sections
    setTimeout(() => {
      // Add a new entry to history stack (this is what fixes "can only back once")
      this.pS({ section }, "", this.cleanUrl(section));

      // Ensure hash is not in the bar (pushState already removed it, but keep state consistent)
      this.rS({ section }, "", this.cleanUrl(section));
    }, this.POST_HASH_DELAY_MS);
  }

  // Back/forward: URL changes to /page/subpage...
  // Carrd only moves sections when the hash changes, so set it.
  onPopState(e) {
    const section =
      typeof e.state?.section === "string"
        ? e.state.section
        : this.sectionFromPath(); // fallback if state missing

    // Prevent the hashchange we cause from pushing a new history entry
    this._suppressNextPush = true;

    // Drive Carrd navigation
    const targetHash = this.carrdHash(section);
    if (this.l.hash !== targetHash) {
      this.l.hash = targetHash;
    } else {
      // If already at correct hash, still keep bar clean
      this._suppressNextPush = false;
      this.rS({ section }, "", this.cleanUrl(section));
    }
  }

  // If someone enters /page/subpage directly, convert it to hash so Carrd navigates
  syncOnLoad() {
    // If there is already a hash, Carrd will handle it; we just clean state later on hashchange.
    if (this.l.hash && this.l.hash.length > 1) return;

    const section = this.sectionFromPath();
    if (!section) return;

    // Prevent this from creating a new entry
    this._suppressNextPush = true;

    // Make Carrd navigate
    this.l.hash = this.carrdHash(section);
  }

  init() {
    this.aEL("load", () => this.syncOnLoad());
    this.aEL("hashchange", () => this.commitFromHash());
    this.aEL("popstate", (e) => this.onPopState(e));
  }
}

export default new HybridRouter();
