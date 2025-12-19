class HybridRouter {
  constructor() {
    const { location, history, addEventListener, sessionStorage } = window;

    this.l = location;
    this.h = history;
    this.ss = sessionStorage;

    this.rS = history.replaceState.bind(history);
    this.pS = history.pushState.bind(history);
    this.aEL = addEventListener.bind(window);

    this.KEY = "__hybrid_router_stack_v1__";
    this.KEY_ARMED = "__hybrid_router_armed_v1__";

    // prevents loops when we programmatically move hash/state
    this._suppressHashRecord = false;
    this._handlingPop = false;

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

  cleanUrl(section) {
    return section ? `/${section}` : `/`;
  }

  sectionFromHash() {
    return this.path(this.l.hash.slice(1));
  }

  sectionFromPath() {
    return decodeURIComponent(this.l.pathname.replace(/^\/+/, ""));
  }

  // ------- stack helpers -------

  loadStack() {
    try {
      const raw = this.ss.getItem(this.KEY);
      const arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr : [];
    } catch {
      return [];
    }
  }

  saveStack(stack) {
    this.ss.setItem(this.KEY, JSON.stringify(stack));
  }

  top(stack) {
    return stack.length ? stack[stack.length - 1] : "";
  }

  pushSection(section) {
    const stack = this.loadStack();
    const last = this.top(stack);

    // de-dupe consecutive duplicates
    if (section !== last) {
      stack.push(section);
      this.saveStack(stack);
    }
  }

  popSection() {
    const stack = this.loadStack();
    if (!stack.length) return null;
    const popped = stack.pop();
    this.saveStack(stack);
    return popped;
  }

  // ------- core behavior -------

  // Keep URL clean (replaceState) but let Carrd drive sections (hash)
  syncCleanUrlFromHash() {
    const section = this.sectionFromHash();

    // record navigation into our stack unless we're doing it programmatically
    if (!this._suppressHashRecord) this.pushSection(section);

    // make address bar clean (smooth)
    this.rS({ section }, "", this.cleanUrl(section));
  }

  // Ensure we have exactly one browser-history "trap" entry so Back triggers popstate
  armBackTrap() {
    if (this.ss.getItem(this.KEY_ARMED) === "1") return;

    // Create ONE extra entry. From now on, Back will fire popstate inside the app.
    this.pS({ armed: true }, "", this.l.href);
    this.ss.setItem(this.KEY_ARMED, "1");
  }

  // Drive Carrd to a section by setting hash, then clean URL
  goToSection(section) {
    const targetHash = section ? `#${this.unpath(section)}` : "#";

    // prevent hashchange handler from recording this as a "new forward nav"
    this._suppressHashRecord = true;

    // trigger Carrd navigation
    if (this.l.hash !== targetHash) {
      this.l.hash = targetHash;
    } else {
      // if hash already matches, still clean URL/state
      this.rS({ section }, "", this.cleanUrl(section));
    }

    // release suppression on next tick (hashchange will have fired)
    setTimeout(() => {
      this._suppressHashRecord = false;
    }, 0);
  }

  onPopState() {
    // avoid re-entrancy
    if (this._handlingPop) return;
    this._handlingPop = true;

    // When user hits Back, we want to move back within our stack, not leave the site yet.
    // Current section is top; pop it, then navigate to new top.
    const current = this.sectionFromPath(); // clean URL reflects current
    const stack = this.loadStack();

    // If stack doesn't match reality (refresh edge cases), rebuild minimal stack.
    if (!stack.length || this.top(stack) !== current) {
      this.saveStack([current]);
    }

    // Pop current
    this.popSection();
    const nextStack = this.loadStack();
    const next = this.top(nextStack); // "" means home

    // Re-arm the trap so the next Back press still lands inside app
    // (push a new entry after handling this pop)
    this.pS({ armed: true }, "", this.l.href);

    // Move Carrd
    this.goToSection(next);

    // allow next pop
    setTimeout(() => {
      this._handlingPop = false;
    }, 0);
  }

  onLoad() {
    // Initialize stack from either hash or path
    let section = "";

    if (this.l.hash && this.l.hash.length > 1) section = this.sectionFromHash();
    else section = this.sectionFromPath();

    // Seed stack
    this.saveStack([section]);

    // Clean URL (smooth)
    this.rS({ section }, "", this.cleanUrl(section));

    // If loaded by clean URL (no hash), we must drive Carrd to that section
    // so the correct section becomes visible.
    if (!this.l.hash || this.l.hash === "#") {
      if (section) this.goToSection(section);
    }

    // Arm the back trap once per tab session
    this.armBackTrap();
  }

  init() {
    this.aEL("load", () => this.onLoad());
    this.aEL("hashchange", () => this.syncCleanUrlFromHash());
    this.aEL("popstate", () => this.onPopState());
  }
}

export default new HybridRouter();
