class HybridRouter {
  constructor() {
    const { location, history, addEventListener } = window;

    this.l = location;
    this.rS = history.replaceState.bind(history);
    this.aEL = addEventListener.bind(window);

    this.init();
  }

  // Hash uses -- as slash substitute (your original idea)
  decodeSection(str) {
    return decodeURIComponent(String(str || "")).replaceAll("--", "/");
  }

  encodeSection(str) {
    return encodeURIComponent(String(str || "")).replaceAll("%2F", "--");
    // note: encodeURIComponent keeps "/" as "%2F", we convert it to "--"
  }

  // Read "section" from hash (#foo--bar) or from pathname (/foo/bar)
  sectionFromHash() {
    return this.decodeSection(this.l.hash.slice(1));
  }

  sectionFromPath() {
    // "/foo/bar" -> "foo/bar"
    return decodeURIComponent(this.l.pathname.replace(/^\/+/, ""));
  }

  // Clean URL: turn current hash section into clean pathname using replaceState
  cleanHashToPath() {
    const section = this.sectionFromHash();
    const path = section ? `/${section}` : `/`;

    // Store section in state so popstate has something sane
    this.rS({ section }, "", path);
  }

  // Drive Carrd: when the URL path changes (back/forward or direct entry),
  // set the hash so Carrd shows the correct section.
  syncPathToHash() {
    const section = this.sectionFromPath();

    // Convert "foo/bar" -> "#foo--bar" to match Carrd section IDs
    const targetHash = section ? `#${this.encodeSection(section)}` : "";

    if (this.l.hash !== targetHash) {
      // Setting hash makes Carrd navigate
      this.l.hash = targetHash;
    }

    // Keep state aligned with the clean URL
    const path = section ? `/${section}` : `/`;
    this.rS({ section }, "", path);
  }

  init() {
    // On load:
    // - If there is a hash, clean it into a nice path.
    // - Otherwise, ensure the path drives the hash (for direct /about entry).
    this.aEL("load", () => {
      if (this.l.hash && this.l.hash.length > 1) {
        this.cleanHashToPath();
      } else {
        this.syncPathToHash();
      }
    });

    // When Carrd changes the hash (user section nav), clean it to a pretty URL
    this.aEL("hashchange", () => {
      // Carrd updates DOM/scroll on hashchange; queue cleanup after it
      setTimeout(() => this.cleanHashToPath(), 0);
    });

    // Back/forward: the path changes -> set hash so Carrd changes sections
    this.aEL("popstate", () => {
      this.syncPathToHash();
    });
  }
}

export default new HybridRouter();
