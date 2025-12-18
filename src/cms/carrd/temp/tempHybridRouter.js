class HybridRouter {
  constructor() {
    const { location, history, addEventListener } = window;
    this.l = location;
    this.o = location.origin;
    this.rS = history.replaceState.bind(history);
    this.aEL = addEventListener.bind(window);
    this.init();
  }

  path(str) {
    return str.replaceAll('--', '/');
  }

  // reverse of path(): "/a/b" -> "a--b"
  unpath(str) {
    return str.replaceAll('/', '--');
  }

  route() {
    const section = this.path(this.l.hash.slice(1));
    this.rS({ section }, '', `${this.o}/${section}`);
  }

  init() {
    this.aEL('load', () => this.route());
    this.aEL('hashchange', () => setTimeout(() => this.route(), 0));

    // FIX: on back/forward, drive Carrd instead of rewriting the URL again
    this.aEL('popstate', () => {
      const section = decodeURIComponent(this.l.pathname.slice(1)); // "/about" -> "about"
      const targetHash = section ? `#${this.unpath(section)}` : '';

      if (this.l.hash !== targetHash) {
        this.l.hash = targetHash; // Carrd changes section
      }

      // optional: keep state aligned without changing the URL
      this.rS({ section }, '', this.l.href);
    });
  }
}

export default new HybridRouter();
