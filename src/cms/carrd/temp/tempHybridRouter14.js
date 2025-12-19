class HybridRouter {
  constructor() {
    const { location, history, addEventListener } = window;

    this.l = location;
    this.h = history;

    this.pS = history.pushState.bind(history);
    this.rS = history.replaceState.bind(history);
    this.aEL = addEventListener.bind(window);

    // Track current section ourselves so we can push the *previous* clean URL
    this.currentSection = null;

    // When popstate sets the hash, the ensuing hashchange must not push again
    this.suppressPushOnce = false;

    this.init();
  }

  // "#page--subpage" -> "page/subpage"
  path(str) {
    return String(str || "").replaceAll("--", "/");
  }

  // "page/subpage" -> "page--subpage" (Carrd-friendly)
  unpath(str) {
    return String(str || "").replaceAll("/", "--");
  }

  sectionFromHash() {
    return this.path(this.l.hash.slice(1));
  }

  cleanUrl(section) {
    return section ? `/${section}` : `/`;
  }

  // Your original cleanup: hash -> clean URL using replaceState
  replaceToClean(section) {
    this.rS({ section }, "", this.cleanUrl(section));
  }

  // Establish initial section (from hash if present, otherwise from pathname)
  initSection() {
    const fromHash = this.sectionFromHash();
    const fromPath = decodeURIComponent(this.l.pathname.replace(/^\/+/, ""));
    return fromHash || fromPath || "";
  }

  init() {
    // On load, do what already worked: clean hash (if any) via replaceState
    this.aEL("load", () => {
      const section = this.initSection();
      this.currentSection = section;

      // If user lands with a hash, clean it
      if (this.l.hash && this.l.hash.length > 1) {
        this.replaceToClean(section);
      } else {
        // Ensure state is at least consistent with current URL
        this.rS({ section }, "", this.cleanUrl(section));
      }
    });

    // When user clicks Carrd links, hash changes -> Carrd navigates.
    // AFTER that, we:
    //  1) pushState the PREVIOUS clean URL (to build history)
    //  2) replaceState to NEW clean URL (remove hash from bar)
    this.aEL("hashchange", () => {
      const newSection = this.sectionFromHash();
      const prevSection = this.currentSection ?? "";

      // If hash is empty or same section, just keep things consistent
      if (newSection === prevSection) {
        this.replaceToClean(newSection);
        return;
      }

      // If this hashchange was caused by popstate sync, don't push.
      if (this.suppressPushOnce) {
        this.suppressPushOnce = false;
        this.currentSection = newSection;
        // Let Carrd finish its switch first; then clean URL
        setTimeout(() => this.replaceToClean(newSection), 0);
        return;
      }

      // Build history stack: push previous clean URL as a new entry
      this.pS({ section: prevSection }, "", this.cleanUrl(prevSection));

      // Now clean the current entry to the new clean URL (your original behavior)
      this.currentSection = newSection;
      setTimeout(() => this.replaceToClean(newSection), 0);
    });

    // Back/forward: restore hash so Carrd navigates to the right section
    this.aEL("popstate", (e) => {
      const section = typeof e.state?.section === "string" ? e.state.section : "";

      // Prevent the upcoming hashchange from pushing another entry
      this.suppressPushOnce = true;
      this.currentSection = section;

      const targetHash = section ? `#${this.unpath(section)}` : "";
      if (this.l.hash !== targetHash) {
        this.l.hash = targetHash; // Carrd will navigate
      } else {
        // If already correct, just ensure URL/state is clean
        this.suppressPushOnce = false;
        this.replaceToClean(section);
      }
    });
  }
}

export default new HybridRouter();
