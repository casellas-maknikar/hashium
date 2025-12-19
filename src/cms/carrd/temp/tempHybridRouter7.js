class HybridRouter {
  constructor() {
    const { location, history, addEventListener, requestAnimationFrame } = window;

    this.l = location;
    this.h = history;
    this.pS = history.pushState.bind(history);
    this.rS = history.replaceState.bind(history);
    this.aEL = addEventListener.bind(window);
    this.rAF = requestAnimationFrame.bind(window);

    // When popstate sets the hash, we MUST NOT pushState again.
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

  // Read section from current hash/path
  sectionFromHash() {
    return this.path(this.l.hash.slice(1));
  }

  sectionFromPath() {
    // "/page/subpage" -> "page/subpage"
    return decodeURIComponent(this.l.pathname.replace(/^\/+/, ""));
  }

  // Clean URL for a section (no origin, relative only)
  urlFor(section) {
    return section ? `/${section}` : `/`;
  }

  // After Carrd has navigated (hashchange already happened),
  // remove the hash from the URL bar without adding history entries.
  cleanupUrlSoon(section) {
    // Two rAFs: gives Carrd time to switch sections before we remove the hash
    this.rAF(() => {
      this.rAF(() => {
        this.rS({ section }, "", this.urlFor(section));
      });
    });
  }

  // User navigation (hash change triggered by clicking Carrd links):
  // create a REAL history entry for each route.
  commitRouteFromHash() {
    const section = this.sectionFromHash();

    if (this._suppressNextPush) {
      // This hashchange was caused by popstate -> we should NOT push a new entry.
      this._suppressNextPush = false;
      this.cleanupUrlSoon(section);
      return;
    }

    // Add a new history entry so Back steps through each route
    this.pS({ section }, "", this.urlFor(section));

    // Remove hash from the bar after Carrd already used it
    this.cleanupUrlSoon(section);
  }

  // Back/Forward: the URL changes to /page/subpage...
  // Carrd only responds to hash, so set the hash to match.
  syncCarrdToHistory() {
    const section = this.h.state?.section;

    // Fallback: if state missing (rare), derive from path
    const safeSection =
      typeof section === "string" ? section : this.sectionFromPath();

    const targetHash = safeSection ? `#${this.unpath(safeSection)}` : "";

    // Prevent hashchange from pushing a new history entry
    this._suppressNextPush = true;

    // Trigger Carrd navigation
    if (this.l.hash !== targetHash) {
      this.l.hash = targetHash;
    } else {
      // If hash is already correct, still ensure URL is clean + state is consistent
      this._suppressNextPush = false;
      this.rS({ section: safeSection }, "", this.urlFor(safeSection));
    }
  }

  init() {
    // On load:
    // - If arriving with hash (/#page--subpage), push initial state as replace (no new entry)
    // - If arriving clean (/page/subpage), set state and hash so Carrd navigates
    this.aEL("load", () => {
      if (this.l.hash && this.l.hash.length > 1) {
        const section = this.sectionFromHash();
        this.rS({ section }, "", this.urlFor(section));
        // let Carrd keep using hash for initial jump; then cleanup
        this.cleanupUrlSoon(section);
        return;
      }

      // Clean entry like /page/subpage
      const section = this.sectionFromPath();
      this.rS({ section }, "", this.urlFor(section));

      if (section) {
        // drive Carrd to the right section without creating history entries
        this._suppressNextPush = true;
        this.l.hash = `#${this.unpath(section)}`;
      }
    });

    // Carrd navigation (clicking internal section links)
    this.aEL("hashchange", () => this.commitRouteFromHash());

    // Browser back/forward
    this.aEL("popstate", () => this.syncCarrdToHistory());
  }
}

export default new HybridRouter();
