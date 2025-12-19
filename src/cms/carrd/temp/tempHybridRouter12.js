class HybridRouter {
  constructor() {
    const { location, history, addEventListener } = window;
    this.l = location;
    this.h = history;
    this.rS = history.replaceState.bind(history);
    this.aEL = addEventListener.bind(window);

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

  // IMPORTANT: Do NOT change URL on click yet.
  // Only store state while leaving Carrd hash navigation alone.
  recordStateOnly() {
    const section = this.sectionFromHash();
    this.rS({ section }, ""); // keep current URL exactly as-is
  }

  init() {
    // Do NOT do anything on load that modifies URL or hash.
    // Just record current state once.
    this.aEL("load", () => this.recordStateOnly());

    // When Carrd navigates, just record state—do not rewrite URL.
    this.aEL("hashchange", () => this.recordStateOnly());

    // Back/Forward already works naturally with hashes.
    // (No popstate needed for basic Carrd behavior)
  }
}

export default new HybridRouter();
