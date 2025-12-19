class HybridRouter {
  constructor() {
    const { location, history, addEventListener } = window;
    this.l = location;
    this.rS = history.replaceState.bind(history);
    this.aEL = addEventListener.bind(window);

    // prevents loops when we set hash programmatically
    this._suppressNextHashClean = false;

    this.init();
  }

  path(str) {
    return String(str || "").replaceAll("--", "/");
  }

  unpath(str) {
    // "foo/bar" -> "foo--bar" (Carrd-safe hash id style)
    return String(str || "").replaceAll("/", "--");
  }

  // Your original: hash -> clean URL (works)
  route() {
    const section = this.path(this.l.hash.slice(1)); // "#about" -> "about"
    const url = section ? `/${section}` : `/`;
    this.rS({ section }, "", url);
  }

  // New: clean URL -> hash (drives Carrd)
  goToSectionFromPath() {
    const section = decodeURIComponent(this.l.pathname.replace(/^\/+/, "")); // "/about" -> "about"
    const targetHash = section ? `#${this.unpath(section)}` : "";

    if (this.l.hash !== targetHash) {
      // We are about to cause a hashchange; don't instantly clean it away
      this._suppressNextHashClean = true;
      this.l.hash = targetHash;
    }
  }

  init() {
    // On load:
    // - If hash exists, do your normal cleanup
    // - Else if URL is /about, set hash so Carrd navigates (cleanup will happen on hashchange)
    this.aEL("load", () => {
      if (this.l.hash && this.l.hash.length > 1) {
        this.route();
      } else if (this.l.pathname !== "/") {
        this.goToSectionFromPath();
      }
    });

    // On hashchange:
    // - If it was caused by us setting hash from pathname, let Carrd navigate first, then clean
    // - If user clicked a section link, same: let Carrd navigate, then clean
    this.aEL("hashchange", () => {
      if (this._suppressNextHashClean) {
        this._suppressNextHashClean = false;
      }

      // Give Carrd time to switch sections before removing the hash from the URL bar
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          this.route();
        });
      });
    });

    // On back/forward:
    // - The URL path changes; set hash to match so Carrd navigates.
    // - DO NOT call replaceState here. Let the hashchange handler do the cleanup.
    this.aEL("popstate", () => {
      this.goToSectionFromPath();
    });
  }
}

export default new HybridRouter();
