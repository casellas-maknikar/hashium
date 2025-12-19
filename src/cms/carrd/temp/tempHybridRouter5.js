// Fixed Version: keeps your working behavior, adds path->hash on popstate

class HybridRouter {
  constructor() {
    const { location, history, addEventListener } = window;
    this.l = location;
    this.rS = history.replaceState.bind(history);
    this.aEL = addEventListener.bind(window);

    this.init();
  }

  // hash uses -- as slash substitute
  path(str) {
    return String(str || "").replaceAll("--", "/");
  }

  // reverse of path(): "foo/bar" -> "foo--bar"
  hashify(str) {
    return String(str || "").replaceAll("/", "--");
  }

  // hash -> clean URL (your original idea)
  routeFromHash() {
    const section = this.path(this.l.hash.slice(1)); // "#about" -> "about"
    const url = section ? `/${section}` : `/`;

    this.rS({ section }, "", url); // remove hash from the bar
  }

  // clean URL -> hash (this is what you were missing)
  routeFromPath() {
    const section = decodeURIComponent(this.l.pathname.replace(/^\/+/, "")); // "/about" -> "about"
    const hash = section ? `#${this.hashify(section)}` : "";

    // Setting hash is what makes Carrd actually change sections
    if (this.l.hash !== hash) {
      this.l.hash = hash;
    }

    // Keep state aligned with the current URL
    const url = section ? `/${section}` : `/`;
    this.rS({ section }, "", url);
  }

  init() {
    // On load: if a hash exists (/#about), clean it to /about
    this.aEL("load", () => {
      if (this.l.hash && this.l.hash.length > 1) {
        this.routeFromHash();
      } else {
        // If user entered /about directly, force Carrd to that section
        if (this.l.pathname !== "/") this.routeFromPath();
      }
    });

    // When user clicks a Carrd section link, hash changes -> clean it
    this.aEL("hashchange", () => {
      // Let Carrd process the hash navigation first, then clean the URL
      setTimeout(() => this.routeFromHash(), 0);
    });

    // Back/forward: path changes -> set hash so Carrd navigates
    this.aEL("popstate", () => {
      this.routeFromPath();
    });
  }
}

export default new HybridRouter();
