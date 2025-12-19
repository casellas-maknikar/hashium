class HybridRouter {
  constructor() {
    const { location, history, addEventListener } = window;

    this.l = location;
    this.o = location.origin;

    this.h = history;
    this.rS = history.replaceState.bind(history);
    this.aEL = addEventListener.bind(window);

    // Prevent loops when we set hash during popstate handling
    this._syncingFromPop = false;

    this.init();
  }

  // "page--subpage" -> "page/subpage"
  path(str) {
    return String(str || "").replaceAll("--", "/");
  }

  // "page/subpage" -> "page--subpage" (Carrd section id style)
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
    return `${this.o}/${section}`;
  }

  // --- stateful stack helpers in history.state ---

  getState() {
    const s = this.h.state;
    if (
      s &&
      typeof s === "object" &&
      Array.isArray(s.stack) &&
      typeof s.index === "number"
    ) {
      return s;
    }
    return { stack: [], index: -1, section: "" };
  }

  // Push a new section into stack (logical push, not history.pushState)
  pushLogical(section) {
    const s = this.getState();

    // If user navigated after going "back", drop forward history
    const nextStack = s.stack.slice(0, s.index + 1);

    // De-dupe consecutive same section
    if (nextStack.length && nextStack[nextStack.length - 1] === section) {
      return { ...s, stack: nextStack, index: nextStack.length - 1, section };
    }

    nextStack.push(section);
    return { stack: nextStack, index: nextStack.length - 1, section };
  }

  // For popstate: accept browser-provided state as source of truth
  normalizePopStateSection(e) {
    const section =
      typeof e.state?.section === "string"
        ? e.state.section
        : this.sectionFromPath(); // fallback if state missing

    // Ensure state object is well-formed
    const s = this.getState();
    if (!Array.isArray(s.stack) || typeof s.index !== "number") {
      return { stack: [section], index: 0, section };
    }

    return { ...s, section };
  }

  // Carrd needs the hash to actually switch sections
  driveCarrd(section) {
    const targetHash = section ? `#${this.unpath(section)}` : "#";
    if (this.l.hash !== targetHash) this.l.hash = targetHash;
  }

  // Main sync point: hash -> clean URL + stateful stack
  route() {
    const section = this.sectionFromHash();

    // If we arrived here because popstate set the hash, do NOT add a new logical entry.
    const nextState = this._syncingFromPop
      ? { ...this.getState(), section }
      : this.pushLogical(section);

    // Clean URL (smooth) + persist stack in history.state
    this.rS(nextState, "", this.cleanUrl(section));

    // Once hashchange handling completes, release pop-sync flag
    this._syncingFromPop = false;
  }

  init() {
    // On load, if user entered /page/subpage directly, convert to hash so Carrd shows it
    this.aEL("load", () => {
      if (!this.l.hash || this.l.hash === "#") {
        const section = this.sectionFromPath();
        if (section) {
          this._syncingFromPop = true; // treat like sync (don’t add extra logical entry twice)
          this.driveCarrd(section);
          // hashchange will fire and call route()
          return;
        }
      }

      // Normal case: hash already present (or home)
      this.route();
    });

    // Carrd navigation happens first, then we clean URL/state
    this.aEL("hashchange", () => setTimeout(() => this.route(), 0));

    // Back/Forward: read state, drive Carrd, then clean URL/state on next hashchange
    this.aEL("popstate", (e) => {
      const normalized = this.normalizePopStateSection(e);

      // Put the normalized state back immediately (keeps stack/index consistent)
      this.rS(normalized, "", this.cleanUrl(normalized.section));

      // Now actually move Carrd (causes hashchange -> route -> clean)
      this._syncingFromPop = true;
      this.driveCarrd(normalized.section);
    });
  }
}

export default new HybridRouter();
