class HybridRouter {
  constructor() {
    const { location, history, document, addEventListener } = window;

    this.l = location;
    this.o = location.origin;
    this.h = history;

    this.rS = history.replaceState.bind(history);
    this.aEL = addEventListener.bind(window);

    this.SETTLE_MS = 450; // if needed: 600–800 for heavy Carrd transitions
    this._handlingPop = false;

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
    this.rS({ section }, "", this.cleanUrl(section));
  }

  // Navigate Carrd via a REAL hash change (so Carrd’s router runs)
  goHash(targetHash) {
    if (this.l.hash === targetHash) {
      // Carrd-style “reset then go” in one click (fixes the double-click symptom)
      this.l.hash = "#";
      setTimeout(() => (this.l.hash = targetHash), 0);
      return;
    }
    this.l.hash = targetHash;
  }

  init() {
    // 1) If user lands on /page/subpage directly, translate to hash so Carrd can render
    if ((!this.l.hash || this.l.hash === "#") && this.l.pathname !== "/") {
      const section = this.sectionFromPathname(this.l.pathname);
      this._handlingPop = true;
      this.l.replace(this.hashFor(section)); // no new history entry
      this.settle(() => {
        this.cleanTo(section);
        this._handlingPop = false;
      });
    } else {
      // Normal load: clean whatever hash is present AFTER Carrd has had time to activate
      const section = this.sectionFromHash(this.l.hash);
      this.settle(() => this.cleanTo(section));
    }

    // 2) CAPTURE clicks in the CAPTURE phase (runs before Carrd’s bubbling click handler)
    this.aEL(
      "click",
      (event) => {
        const a = event.target?.closest?.("a[href^='#']");
        if (!a) return;

        // Only handle same-page hashes (Carrd style)
        const href = a.getAttribute("href");
        if (!href) return;

        event.preventDefault();

        const targetHash = href; // e.g. "#page--subpage"
        const section = this.sectionFromHash(targetHash);

        // Real hash navigation (Carrd will switch sections)
        this.goHash(targetHash);

        // Clean URL after Carrd finishes
        this.settle(() => this.cleanTo(section));
      },
      true // <-- CAPTURE!
    );

    // 3) Back/Forward: browser moves among clean URLs; drive Carrd to match pathname
    this.aEL("popstate", () => {
      if (this._handlingPop) return;

      const section = this.sectionFromPathname(this.l.pathname);
      const targetHash = this.hashFor(section);

      this._handlingPop = true;
      this.l.replace(targetHash); // no new entry; triggers Carrd hashchange internally
      this.settle(() => {
        this.cleanTo(section);
        this._handlingPop = false;
      });
    });
  }
}

export default new HybridRouter();
