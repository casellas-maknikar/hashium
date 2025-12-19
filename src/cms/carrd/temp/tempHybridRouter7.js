class HybridRouter {
  constructor() {
    const { location, history, addEventListener, requestAnimationFrame } = window;
    this.l = location;
    this.rS = history.replaceState.bind(history);
    this.aEL = addEventListener.bind(window);
    this.rAF = requestAnimationFrame.bind(window);
    this.init();
  }

  path(str) {
    return String(str || "").replaceAll("--", "/");
  }

  unpath(str) {
    return String(str || "").replaceAll("/", "--");
  }

  // YOUR WORKING: hash -> clean URL
  route() {
    const section = this.path(this.l.hash.slice(1)); // "#about" -> "about"
    const url = section ? `/${section}` : `/`;
    this.rS({ section }, "", url);
  }

  // FIX: history state -> hash (so Carrd actually navigates on back/forward)
  go(section) {
    const hash = section ? `#${this.unpath(section)}` : "";
    if (this.l.hash !== hash) this.l.hash = hash;
  }

  init() {
    // On load: keep your behavior
    this.aEL("load", () => this.route());

    // On hashchange: keep your behavior, but wait 2 frames so Carrd can move first
    this.aEL("hashchange", () => {
      this.rAF(() => this.rAF(() => this.route()));
    });

    // On back/forward: use the saved state.section, set hash to navigate, then clean again
    this.aEL("popstate", (e) => {
      const section = e.state?.section;

      if (typeof section === "string") {
        // 1) make Carrd navigate
        this.go(section);

        // 2) after Carrd reacts, clean URL again
        this.rAF(() => this.rAF(() => this.route()));
      }
    });
  }
}

export default new HybridRouter();
