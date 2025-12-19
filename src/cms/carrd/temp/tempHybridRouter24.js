// Carrd-safe HybridRouter (original + delayed cleanup)

class HybridRouter {
  constructor() {
    const { location, history, addEventListener, requestAnimationFrame, document } = window;

    this.l = location;
    this.o = location.origin;
    this.rS = history.replaceState.bind(history);
    this.aEL = addEventListener.bind(window);
    this.rAF = requestAnimationFrame.bind(window);

    // Carrd section transitions + routing logic aren't instantaneous.
    // If we remove the hash too early, Carrd never navigates.
    this.SETTLE_MS = 600; // try 200; if still flaky use 350–600

    this.init();

    // If script loads after DOM ready (async), still initialize once.
    if (document.readyState === "complete" || document.readyState === "interactive") {
      this.settle(() => this.route());
    }
  }

  path(str) {
    return String(str || "").replaceAll("--", "/");
  }

  settle(fn) {
    // Wait longer than Carrd’s own hashchange handler timing.
    // rAF+rAF ensures we're past current event loop; SETTLE_MS gives Carrd time to unlock/activate.
    this.rAF(() => this.rAF(() => setTimeout(fn, this.SETTLE_MS)));
  }

  route() {
    const section = this.path(this.l.hash.slice(1));
    this.rS({ section }, "", `${this.o}/${section}`);
  }

  init() {
    // On load, let Carrd initialize first, then clean URL
    this.aEL("load", () => this.settle(() => this.route()));

    // On hashchange, do NOT do setTimeout(..., 0). That’s too early for your page.
    this.aEL("hashchange", () => this.settle(() => this.route()));

    // Keep your popstate behavior unchanged (this only cleans URL, doesn’t drive Carrd)
    this.aEL("popstate", (e) => {
      const section = e.state?.section;
      if (typeof section === "string") {
        this.rS(e.state, "", `${this.o}/${section}`);
      }
    });
  }
}

export default new HybridRouter();
