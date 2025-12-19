// tempHybridRouter36.js — no hash reset, proper push/replace on navigation
class HybridRouter {
  constructor() {
    const { location, history, document, addEventListener } = window;
    this.l  = location;
    this.o  = location.origin;
    this.h  = history;
    this.rS = history.replaceState.bind(history);
    this.pS = history.pushState.bind(history);
    this.aEL= addEventListener.bind(window);

    // allow Carrd transitions/animations to finish before we clean URL
    this.SETTLE_MS = 450;
    this._driving  = false; // ignore our own hashchange/popstate triggers

    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", () => this.init(), { once: true });
    } else {
      this.init();
    }
  }

  path(str) { return String(str || "").replaceAll("--","/"); }
  unpath(str) { return String(str || "").replaceAll("/","--"); }
  sectionFromHash(hash) { return this.path(String(hash || "").replace(/^#/,"")); }
  sectionFromPathname(p) { return decodeURIComponent(String(p || "").replace(/^\/+/,"")); }

  hashFor(section) { return section ? `#${this.unpath(section)}` : "#"; }
  cleanUrl(section) { return section ? `${this.o}/${section}` : `${this.o}/`; }

  settle(fn) { setTimeout(fn, this.SETTLE_MS); }

  // Clean the address bar (remove hash) using pushState/replaceState as needed
  cleanTo(section, push = false) {
    const url = this.cleanUrl(section);
    if (push) this.pS({ section }, "", url);
    else      this.rS({ section }, "", url);
  }

  // Drive Carrd via a real hash change; then call cleanTo with push flag
  driveCarrd(section, push) {
    const targetHash = this.hashFor(section);
    this._driving = true;
    if (this.l.hash !== targetHash) {
      this.l.hash = targetHash; // Carrd router reacts
    }
    this.settle(() => {
      this.cleanTo(section, push);
      this._driving = false;
    });
  }

  init() {
    // If the URL is /page/subpage without a hash, convert to hash so Carrd shows the right section.
    if ((!this.l.hash || this.l.hash === "#") && this.l.pathname !== "/") {
      const section = this.sectionFromPathname(this.l.pathname);
      this.driveCarrd(section, false); // do not push on initial load
    } else {
      // Normal load or with hash (#page...), just clean after Carrd processes it
      const section = this.sectionFromHash(this.l.hash);
      this.settle(() => this.cleanTo(section, false));
    }

    // Intercept navigation links before Carrd sees them
    this.aEL("click", (event) => {
      const anchor = event.target?.closest?.("a[href^='#']");
      if (!anchor) return;
      event.preventDefault();
      const section = this.sectionFromHash(anchor.getAttribute("href"));
      // On user click, always push a new entry
      this.driveCarrd(section, true);
    }, true);

    // When Carrd triggers a hash change (e.g. via keyboard), clean it (no push)
    this.aEL("hashchange", () => {
      if (this._driving) return;
      const section = this.sectionFromHash(this.l.hash);
      this.settle(() => this.cleanTo(section, false));
    });

    // Back/Forward: read the stored state or path; drive Carrd and then replace (no push)
    this.aEL("popstate", (e) => {
      if (this._driving) return;
      const section =
        typeof e.state?.section === "string"
          ? e.state.section
          : this.sectionFromPathname(this.l.pathname);
      this.driveCarrd(section, false);
    });
  }
}
export default new HybridRouter();
