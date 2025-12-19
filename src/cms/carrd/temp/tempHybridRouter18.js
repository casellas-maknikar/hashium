class HybridRouter {
  constructor() {
    const { location, history, addEventListener, sessionStorage } = window;

    this.l = location;
    this.o = location.origin;
    this.h = history;
    this.ss = sessionStorage;

    this.rS = history.replaceState.bind(history);
    this.aEL = addEventListener.bind(window);

    this.KEY = "__hybrid_stack_v1__";

    // Prevent recording when we change hash during popstate handling
    this.suppressRecord = false;

    this.init();
  }

  // "page--subpage" -> "page/subpage"
  path(str) {
    return String(str || "").replaceAll("--", "/");
  }

  // "page/subpage" -> "page--subpage"
  unpath(str) {
    return String(str || "").replaceAll("/", "--");
  }

  // ----- stack helpers -----

  loadStack() {
    try {
      const raw = this.ss.getItem(this.KEY);
      const stack = raw ? JSON.parse(raw) : [];
      return Array.isArray(stack) ? stack : [];
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

  pushStack(section) {
    const stack = this.loadStack();
    const last = this.top(stack);
    if (section !== last) {
      stack.push(section);
      this.saveStack(stack);
    }
  }

  popStack() {
    const stack = this.loadStack();
    if (!stack.length) return "";
    stack.pop();
    this.saveStack(stack);
    return this.top(stack);
  }

  // ----- core routing -----

  getSectionFromHash() {
    return this.path(this.l.hash.slice(1));
  }

  cleanUrl(section) {
    // keep EXACT behavior: origin + "/" + section (section may be "")
    return `${this.o}/${section}`;
  }

  route() {
    const section = this.getSectionFromHash();

    // Record forward navigation (user clicks)
    if (!this.suppressRecord) {
      this.pushStack(section);
    }

    // Your original smooth URL cleanup
    this.rS({ section }, "", this.cleanUrl(section));
  }

  goToSection(section) {
    // Drive Carrd by setting hash (this is what actually changes sections)
    const hash = section ? `#${this.unpath(section)}` : "#";

    this.suppressRecord = true;

    if (this.l.hash !== hash) {
      this.l.hash = hash;
    } else {
      // If hash already matches, at least keep URL clean
      this.rS({ section }, "", this.cleanUrl(section));
    }

    // Release suppression next tick (hashchange will have fired)
    setTimeout(() => {
      this.suppressRecord = false;
    }, 0);
  }

  initStackOnLoad() {
    // Seed stack from initial hash section
    const section = this.getSectionFromHash();
    this.saveStack([section]);
  }

  init() {
    this.aEL("load", () => {
      this.initStackOnLoad();
      this.route();
    });

    this.aEL("hashchange", () => setTimeout(() => this.route(), 0));

    this.aEL("popstate", () => {
      // Browser is going back/forward through clean URLs,
      // but Carrd only reacts to hash. Use our stack to decide where to go.
      const prev = this.popStack();
      this.goToSection(prev);
    });
  }
}

export default new HybridRouter();
