class HybridRouter {
  constructor() {
    const { location, history, addEventListener, requestAnimationFrame } = window;

    this.l = location;
    this.h = history;

    this.pS = history.pushState.bind(history);
    this.rS = history.replaceState.bind(history);

    this.aEL = addEventListener.bind(window);
    this.rAF = requestAnimationFrame.bind(window);

    this.SETTLE_MS = 250; // increase to 400–600 if needed

    // when we set hash from popstate/path sync, don't push again
    this._syncing = false;

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

  // Wait for Carrd to finish section switch before touching History
  afterCarrd(fn) {
    this.rAF(() => this.rAF(() => setTimeout(fn, this.SETTLE_MS)));
  }

  onHashChange() {
    const section = this.sectionFromHash();

    this.afterCarrd(() => {
      if (this._syncing) {
        // popstate / sync: do not add entries
        this._syncing = false;
        this.rS({ section }, "", this.cleanUrl(section));
        return;
      }

      // user click: add a real history entry for clean URL
      this.pS({ section }, "", this.cleanUrl(section));

      // keep state aligned (no extra entry)
      this.rS({ section }, "", this.cleanUrl(section));
    });
  }

  onPopState(e) {
    const section =
      typeof e.state?.section === "string"
        ? e.state.section
        : this.sectionFromPath(); // fallback

    this._syncing = true;

    const targetHash = section ? `#${this.unpath(section)}` : "";
    if (this.l.hash !== targetHash) {
      this.l.hash = targetHash; // Carrd navigates
    } else {
      this._syncing = false;
      this.rS({ section }, "", this.cleanUrl(section));
    }
  }

  onLoad() {
    // If user enters /page/subpage directly, convert to hash to let Carrd navigate.
    if (!this.l.hash) {
      const section = this.sectionFromPath();
      if (section) {
        this._syncing = true;
        this.l.hash = `#${this.unpath(section)}`;
      }
    } else {
      // If user enters /#page..., let Carrd navigate first, then clean URL
      this._syncing = true;
      this.onHashChange();
    }
  }

  init() {
    this.aEL("load", () => this.onLoad());
    this.aEL("hashchange", () => this.onHashChange());
    this.aEL("popstate", (e) => this.onPopState(e));
  }
}

export default new HybridRouter();
