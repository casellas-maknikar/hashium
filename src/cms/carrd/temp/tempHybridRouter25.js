class HybridRouter {
  constructor() {
    const {
      location,
      history,
      addEventListener,
      requestAnimationFrame,
      document
    } = window;

    this.l = location;
    this.o = location.origin;
    this.h = history;

    this.rS = history.replaceState.bind(history);
    this.aEL = addEventListener.bind(window);
    this.rAF = requestAnimationFrame.bind(window);

    // Delay long enough that Carrd always processes hashchange first.
    this.SETTLE_MS = 200; // if needed: 350–600

    // Popstate loop protection (timestamp window)
    this._ignorePopUntil = 0;

    this.init();

    // Script is async; load may already have happened.
    if (document.readyState === "complete" || document.readyState === "interactive") {
      this.settle(() => this.route());
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

  sectionFromHash() {
    return this.path(this.l.hash.slice(1));
  }

  sectionFromPath() {
    return decodeURIComponent(this.l.pathname.replace(/^\/+/, ""));
  }

  cleanUrl(section) {
    return `${this.o}/${section}`;
  }

  hashFor(section) {
    // Carrd home is "#"
    return section ? `#${this.unpath(section)}` : "#";
  }

  settle(fn) {
    // rAF+rAF gets us past current event loop; SETTLE_MS lets Carrd finish its own work.
    this.rAF(() => this.rAF(() => setTimeout(fn, this.SETTLE_MS)));
  }

  route() {
    const section = this.sectionFromHash();
    this.rS({ section }, "", this.cleanUrl(section));
  }

  // Drive Carrd without creating a NEW history entry.
  // We do that by replacing the URL with a hash URL (same document).
  driveCarrdWithoutHistory(section) {
    const targetHash = this.hashFor(section);

    if (this.l.hash === targetHash) return;

    // Ignore any popstate that some browsers may emit due to replace()
    this._ignorePopUntil = Date.now() + 200;

    // IMPORTANT: location.replace does not add a history entry
    this.l.replace(targetHash);
  }

  init() {
    // On load: if user enters clean URL directly, we must set hash so Carrd shows the right section
    this.aEL("load", () => {
      if (!this.l.hash || this.l.hash === "#") {
        const section = this.sectionFromPath();
        if (section) {
          this.driveCarrdWithoutHistory(section);
          // Carrd will fire hashchange; our handler will clean URL afterward
          return;
        }
      }

      // Normal hash/home load
      this.settle(() => this.route());
    });

    // On Carrd navigation, wait for Carrd then clean URL
    this.aEL("hashchange", () => this.settle(() => this.route()));

    // Back/Forward: browser lands on clean path; convert it to hash so Carrd navigates
    this.aEL("popstate", () => {
      if (Date.now() < this._ignorePopUntil) return;

      const section = this.sectionFromPath();
      this.driveCarrdWithoutHistory(section);
      // hashchange -> settle -> route() will clean URL again
    });
  }
}

export default new HybridRouter();
