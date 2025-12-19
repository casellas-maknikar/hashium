class HybridRouter {
  constructor() {
    const { location, history, addEventListener, requestAnimationFrame } = window;
    this.l = location;
    this.rS = history.replaceState.bind(history);
    this.aEL = addEventListener.bind(window);
    this.rAF = requestAnimationFrame.bind(window);

    // tune this if needed (some Carrd templates need a beat longer)
    this.CLEAN_DELAY_MS = 50;

    this.init();
  }

  // hash uses -- as slash substitute
  decodeHashToSection(hash) {
    return decodeURIComponent(hash || "").replaceAll("--", "/");
  }

  encodeSectionToHash(section) {
    // "foo/bar" -> "foo--bar"
    return encodeURIComponent(section || "").replaceAll("%2F", "--");
  }

  sectionFromHash() {
    return this.decodeHashToSection(this.l.hash.slice(1));
  }

  sectionFromPath() {
    return decodeURIComponent(this.l.pathname.replace(/^\/+/, ""));
  }

  // Cleans #section to /section WITHOUT touching the hash directly
  // (replaceState url without hash removes it from the bar)
  cleanHashToPathNow() {
    const section = this.sectionFromHash();
    const url = section ? `/${section}` : `/`;
    this.rS({ section }, "", url);
  }

  // Delay cleanup so Carrd can finish navigating to the section first
  cleanHashToPathSoon() {
    // Two rAFs + a small timeout tends to be very reliable for UI-driven routers
    this.rAF(() => {
      this.rAF(() => {
        setTimeout(() => this.cleanHashToPathNow(), this.CLEAN_DELAY_MS);
      });
    });
  }

  // When user goes back/forward to a clean URL (/about),
  // drive Carrd by setting the hash (#about), then clean again.
  syncPathToCarrd() {
    const section = this.sectionFromPath(); // "about" or "foo/bar"
    const targetHash = section ? `#${this.encodeSectionToHash(section)}` : "";

    if (this.l.hash !== targetHash) {
      this.l.hash = targetHash; // this is what makes Carrd actually navigate
    }

    // After Carrd reacts, clean URL again (keeps address bar pretty)
    this.cleanHashToPathSoon();
  }

  init() {
    // On load:
    // - If there's a hash, let Carrd load that section, then clean it.
    // - If there's a clean path, drive Carrd to that section.
    this.aEL("load", () => {
      if (this.l.hash && this.l.hash.length > 1) {
        this.cleanHashToPathSoon();
      } else {
        // direct entry like /about
        if (this.l.pathname !== "/") this.syncPathToCarrd();
      }
    });

    // Carrd section navigation (clicks) changes the hash
    this.aEL("hashchange", () => {
      this.cleanHashToPathSoon();
    });

    // Back/forward changes the path (clean URL), so we must update Carrd via hash
    this.aEL("popstate", () => {
      this.syncPathToCarrd();
    });
  }
}

export default new HybridRouter();
