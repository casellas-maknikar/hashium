class HybridRouter {
  constructor() {
    const { location, history, document, addEventListener } = window;

    this.l = location;
    this.o = location.origin;
    this.h = history;

    this.rS = history.replaceState.bind(history);
    this.aEL = addEventListener.bind(window);

    // Carrd needs time to finish its own section transition before we wipe hash.
    // If your template animates longer, bump to 600–800.
    this.SETTLE_MS = 450;

    // Guards
    this._drivingHash = false; // true when WE set location.hash (avoid re-entrancy)
    this._lastClean = null;    // dedupe URL cleanups

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
    // For home, keep it as origin + "/"
    if (!section) return `${this.o}/`;
    return `${this.o}/${section}`;
  }

  settle(fn) {
    setTimeout(fn, this.SETTLE_MS);
  }

  cleanTo(section) {
    // Prevent spamming replaceState with identical URLs
    const url = this.cleanUrl(section);
    if (url === this._lastClean) return;
    this._lastClean = url;

    this.rS({ section }, "", url);
  }

  // Carrd-safe: REAL hash navigation so Carrd's router always activates the section
  driveCarrdTo(section) {
    const targetHash = this.hashFor(section);

    this._drivingHash = true;

    // If already at that hash, do Carrd's "reset then go" trick automatically.
    if (this.l.hash === targetHash) {
      this.l.hash = "#";
      setTimeout(() => {
        this.l.hash = targetHash;
      }, 0);
    } else {
      this.l.hash = targetHash;
    }

    // After Carrd processes the hashchange + transition window, clean URL
    this.settle(() => {
      this.cleanTo(section);
      this._drivingHash = false;
    });
  }

  init() {
    // 1) Direct entry to clean URL (/page/subpage) with no hash:
    // Drive Carrd via REAL hash, then clean.
    if ((!this.l.hash || this.l.hash === "#") && this.l.pathname !== "/") {
      const section = this.sectionFromPathname(this.l.pathname);
      this.driveCarrdTo(section);
    } else {
      // Normal load: if a hash exists, let Carrd use it, then clean after settle.
      const section = this.sectionFromHash(this.l.hash);
      this.settle(() => this.cleanTo(section));
    }

    // 2) Capture clicks BEFORE Carrd's click handler.
    // We handle ONLY internal hash links (#...) used for section navigation.
    this.aEL(
      "click",
      (event) => {
        const a = event.target?.closest?.("a[href^='#']");
        if (!a) return;

        const href = a.getAttribute("href");
        if (!href) return;

        // Let normal "#" behavior still be controlled by us for consistency.
        event.preventDefault();

        const section = this.sectionFromHash(href);
        this.driveCarrdTo(section);
      },
      true // capture phase
    );

    // 3) If the user navigates via Carrd hash change (keyboard, programmatic, etc.)
    // We clean AFTER Carrd processes it. Ignore if we caused it.
    this.aEL("hashchange", () => {
      if (this._drivingHash) return;

      const section = this.sectionFromHash(this.l.hash);
      this.settle(() => this.cleanTo(section));
    });

    // 4) Back/Forward: browser changes pathname among clean URLs.
    // Drive Carrd via REAL hash based on pathname, then clean.
    this.aEL("popstate", () => {
      if (this._drivingHash) return;

      const section = this.sectionFromPathname(this.l.pathname);
      this.driveCarrdTo(section);
    });
  }
}

export default new HybridRouter();
