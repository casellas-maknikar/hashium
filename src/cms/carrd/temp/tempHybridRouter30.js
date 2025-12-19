class HybridRouter {
  constructor() {
    const { location, history, document, addEventListener } = window;

    this.l = location;
    this.o = location.origin;
    this.h = history;

    this.rS = history.replaceState.bind(history);
    this.aEL = addEventListener.bind(window);

    // Carrd needs time to finish its own section activation/locking.
    this.SETTLE_MS = 350; // if still flaky: 500–700

    // When Carrd clears hash to "#", we still remember what the user actually clicked.
    this._pendingSection = null;

    // Init AFTER Carrd’s last body script has executed
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", () => this.init(), { once: true });
    } else {
      this.init();
    }
  }

  // "#page--subpage" -> "page/subpage"
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

  hashForSection(section) {
    return section ? `#${this.unpath(section)}` : "#";
  }

  cleanUrl(section) {
    return `${this.o}/${section}`;
  }

  settle(fn) {
    setTimeout(fn, this.SETTLE_MS);
  }

  // Clean URL using a *known* section (never read location.hash inside the delayed call)
  cleanTo(section) {
    this.rS({ section }, "", this.cleanUrl(section));
  }

  init() {
    // Handle direct entry to /page/subpage (no hash) by setting hash once
    if ((!this.l.hash || this.l.hash === "#") && this.l.pathname !== "/") {
      const section = this.sectionFromPathname(this.l.pathname);
      this._pendingSection = section;
      this.l.replace(this.hashForSection(section)); // no new history entry
      // hashchange will fire; we will clean after settle
    } else {
      // Normal load: capture current hash immediately
      const section = this.sectionFromHash(this.l.hash);
      this._pendingSection = section;
      this.settle(() => this.cleanTo(section));
    }

    // Hash navigation (user clicks)
    this.aEL("hashchange", () => {
      // CAPTURE immediately (before Carrd can normalize hash back to "#")
      const section = this.sectionFromHash(this.l.hash);
      this._pendingSection = section;

      // Clean later using the captured section
      this.settle(() => this.cleanTo(section));
    });

    // Back/Forward
    this.aEL("popstate", () => {
      // Browser moved among clean URLs; Carrd needs hash to switch sections.
      const section = this.sectionFromPathname(this.l.pathname);
      this._pendingSection = section;

      // Drive Carrd without adding history
      this.l.replace(this.hashForSection(section));

      // Clean later using captured section (NOT whatever hash becomes)
      this.settle(() => this.cleanTo(section));
    });
  }
}

export default new HybridRouter();
