class HybridRouter {
  constructor() {
    const { location, history, addEventListener, document } = window;
    this.l = location;
    this.h = history;
    this.rS = history.replaceState.bind(history);
    this.pS = history.pushState.bind(history);
    this.aEL = addEventListener.bind(window);
    this.d = document;

    this.init();
  }

  path(str) {
    return str.replaceAll("--", "/");
  }
  unpath(str) {
    return str.replaceAll("/", "--");
  }

  // Convert hash -> clean URL (your original idea)
  routeFromHash() {
    const section = this.path(this.l.hash.slice(1));
    const clean = section ? `/${section}` : `/`;
    this.rS({ section }, "", clean);
  }

  // Convert clean URL -> hash (so Carrd navigates), WITHOUT adding history
  goHashNoHistory(section) {
    const hash = section ? `#${this.unpath(section)}` : "";
    if (this.l.hash !== hash) {
      // Replace current entry instead of adding a new one
      this.l.replace(hash || "#");
      if (!hash) {
        // If "home" has no hash, remove "#" that replace() may add
        this.l.replace(this.l.pathname + this.l.search);
      }
    }
  }

  // Intercept section clicks so we control history
  interceptHashLinks() {
    this.d.addEventListener(
      "click",
      (e) => {
        const a = e.target.closest?.("a[href^='#']");
        if (!a) return;

        const raw = a.getAttribute("href").slice(1); // "about" or "foo--bar"
        const section = this.path(raw);              // "foo/bar"

        // Stop default hash nav (which creates /#about history entry)
        e.preventDefault();

        // Create exactly one history entry: /about
        const clean = section ? `/${section}` : `/`;
        this.pS({ section }, "", clean);

        // Tell Carrd to navigate, but without adding history
        this.goHashNoHistory(section);

        // Clean any hash Carrd might set anyway
        this.rS({ section }, "", clean);
      },
      true // capture early
    );
  }

  init() {
    // On load: clean hash if present (your current behavior)
    this.aEL("load", () => this.routeFromHash());

    // Hashchange: keep cleaning it (your current behavior)
    this.aEL("hashchange", () => setTimeout(() => this.routeFromHash(), 0));

    // Back/Forward: let the URL drive the section (no extra history)
    this.aEL("popstate", (e) => {
      const section =
        e.state?.section ?? decodeURIComponent(this.l.pathname.slice(1) || "");
      this.goHashNoHistory(section);
      // keep URL clean
      const clean = section ? `/${section}` : `/`;
      this.rS({ section }, "", clean);
    });

    this.interceptHashLinks();
  }
}

export default new HybridRouter();
