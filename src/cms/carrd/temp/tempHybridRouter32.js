class HybridRouter {
  constructor() {
    const { location, history, document, addEventListener } = window;

    this.l = location;
    this.o = location.origin;
    this.h = history;

    this.rS = history.replaceState.bind(history);
    this.aEL = addEventListener.bind(window);

    // Carrd needs time (locked/transition). If you clear hash too early, navigation dies.
    this.SETTLE_MS = 450; // if still flaky: 600–800

    // Guards
    this._drivingHash = false;   // true only when *we* set location.hash (popstate / direct entry)
    this._pendingSection = null; // capture immediately, clean later

    // Init AFTER Carrd has installed its hash router (last body script runs before DOMContentLoaded)
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", () => this.init(), { once: true });
    } else {
      this.init();
    }
  }

  // "page--subpage" -> "page/subpage"
  path(str) {
    return String(str || "").replaceAll("--", "/");
  }

  // "page/subpage" -> "page--subpage"
  unpath(str) {
    return String(str || "").replaceAll("/", "--");
  }

  sectionFromHash(hash) {
    return this.path(String(hash || "").replace(/^#/, ""));
  }

  sectionFromPathname(pathname) {
    return decodeURIComponent(String(pathname || "").replace(/^\/+/, ""));
  }

  hashFor(section) {
    return section ? `#${this.unpath(section)}` : "#";
  }

  cleanUrl(section) {
    return `${this.o}/${section}`;
  }

  settle(fn) {
    setTimeout(fn, this.SETTLE_MS);
  }

  cleanTo(section) {
    // Use the section we captured (not whatever hash becomes later)
    this.rS({ section }, "", this.cleanUrl(section));
  }

  routeFromHash() {
    // CAPTURE IMMEDIATELY
    const section = this.sectionFromHash(this.l.hash);
    this._pendingSection = section;

    // Clean AFTER Carrd finishes its own handling
    this.settle(() => this.cleanTo(section));
  }

  // For Back/Forward (or direct entry): drive Carrd with a REAL hash change
  driveCarrdToSection(section) {
    const target = this.hashFor(section);

    // If already correct, just clean later
    if (this.l.hash === target) {
      this._pendingSection = section;
      this.settle(() => this.cleanTo(section));
      return;
    }

    this._drivingHash = true;
    this._pendingSection = section;

    // REAL hash navigation (Carrd will actually switch sections)
    this.l.hash = target;

    // After the hashchange handler runs once, release the guard
    this.settle(() => {
      this._drivingHash = false;
      // hashchange will have already scheduled cleaning, but this ensures it happens even if Carrd normalizes hash
      this.cleanTo(section);
    });
  }

  init() {
    // Direct entry to clean URL like /page/subpage (no hash): convert to hash so Carrd can render it
    if ((!this.l.hash || this.l.hash === "#") && this.l.pathname !== "/") {
      const section = this.sectionFromPathname(this.l.pathname);
      this.driveCarrdToSection(section);
    } else {
      // Normal: hash-driven SPA nav
      this.routeFromHash();
    }

    // Normal clicks: Carrd changes hash → we clean later
    this.aEL("hashchange", () => {
      // If this hashchange was caused by our popstate/direct-entry drive, we still want to route,
      // but avoid any extra hash rewriting.
      this.routeFromHash();
    });

    // Back/Forward: browser moved among clean URLs; drive Carrd to match the pathname
    this.aEL("popstate", () => {
      // If we’re in the middle of our own hash drive+cleanup window, ignore this pop
      if (this._drivingHash) return;

      const section = this.sectionFromPathname(this.l.pathname);
      this.driveCarrdToSection(section);
    });
  }
}

export default new HybridRouter();
