class HybridRouter {
  constructor() {
    const { location, history, document, addEventListener } = window;

    this.l = location;
    this.o = location.origin;
    this.h = history;

    this.rS = history.replaceState.bind(history);
    this.aEL = addEventListener.bind(window);

    // Tune for Carrd transitions
    this.SETTLE_MS = 350;

    // Guards
    this._driving = false;
    this._lastSection = null;

    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", () => this.init(), { once: true });
    } else {
      this.init();
    }
  }

  path(str) {
    return String(str || "").replaceAll("--", "/");
  }

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

  cleanTo(section) {
    // De-dupe repeated calls
    if (section === this._lastSection) return;
    this._lastSection = section;

    this.rS({ section }, "", this.cleanUrl(section));
  }

  // Set hash WITHOUT navigation, and (if needed) manually trigger Carrd via hashchange
  setHashWithoutNavigation(targetHash) {
    if (this.l.hash === targetHash) return;

    // Update URL bar hash in-place
    this.rS(this.h.state, "", targetHash);

    // Carrd listens for hashchange; replaceState doesn't emit it.
    // So we dispatch it ourselves.
    window.dispatchEvent(new HashChangeEvent("hashchange"));
  }

  init() {
    // 1) If user lands on clean URL, convert to hash *without navigation*, then let Carrd handle hashchange
    if ((!this.l.hash || this.l.hash === "#") && this.l.pathname !== "/") {
      const section = this.sectionFromPathname(this.l.pathname);
      const targetHash = this.hashForSection(section);

      this._driving = true;
      this.setHashWithoutNavigation(targetHash);
      this._driving = false;

      // After Carrd processes, clean to the same section
      this.settle(() => this.cleanTo(section));
    } else {
      // Normal load: capture hash immediately, clean later
      const section = this.sectionFromHash(this.l.hash);
      this.settle(() => this.cleanTo(section));
    }

    // 2) User click navigation (hash changes normally)
    this.aEL("hashchange", () => {
      if (this._driving) return;

      const section = this.sectionFromHash(this.l.hash);
      this.settle(() => this.cleanTo(section));
    });

    // 3) Back/Forward: browser changes pathname among clean URLs;
    // drive Carrd by setting hash in-place (no location.replace = no recursion)
    this.aEL("popstate", () => {
      const section = this.sectionFromPathname(this.l.pathname);
      const targetHash = this.hashForSection(section);

      this._driving = true;
      this.setHashWithoutNavigation(targetHash);
      this._driving = false;

      this.settle(() => this.cleanTo(section));
    });
  }
}

export default new HybridRouter();
