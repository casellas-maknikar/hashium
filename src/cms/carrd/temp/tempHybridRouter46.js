class HybridRouter {
  constructor() {
    const w = window;
    this.l = w.location;
    this.h = w.history;
    this.o = this.l.origin;
    this.rS = this.h.replaceState.bind(this.h);
    this.aEL = w.addEventListener.bind(w);

    this.SETTLE_MS = 450;
    this._driving = false;

    const init = () => this.init();
    w.document.readyState === 'loading'
      ? document.addEventListener('DOMContentLoaded', init, { once: true })
      : init();
  }

  path = s => String(s || '').replaceAll('--', '/');
  unpath = s => String(s || '').replaceAll('/', '--');
  sectionFromHash = h => this.path(String(h || '').slice(1));
  sectionFromPathname = p =>
    decodeURIComponent(String(p || '').replace(/^\/+/, ''));
  hashFor = s => (s ? `#${this.unpath(s)}` : '#');
  settle = fn => setTimeout(fn, this.SETTLE_MS);

  findScrollId(id) {
    return document.querySelector(`[data-scroll-id="${id}"]`);
  }

  cleanUrl(section, scroll) {
    return `${this.o}/${section || ''}${scroll ? `#${scroll}` : ''}`;
  }

  cleanTo(section, scroll) {
    this.rS({ section }, '', this.cleanUrl(section, scroll));
  }

  drive(section, push) {
    this._driving = true;
    const target = this.hashFor(section);

    push ? (this.l.hash = target) : this.l.replace(target);

    this.settle(() => {
      this.cleanTo(section);
      this._driving = false;
    });
  }

  init() {
    // Initial load
    if ((!this.l.hash || this.l.hash === '#') && this.l.pathname !== '/') {
      this.drive(this.sectionFromPathname(this.l.pathname), false);
    } else {
      const s = this.sectionFromHash(this.l.hash);
      this.settle(() => this.cleanTo(s));
    }

    // Click interception (sections only)
    this.aEL(
      'click',
      e => {
        const a = e.target?.closest?.('a[href^="#"]');
        if (!a) return;
        e.preventDefault();
        this.drive(this.sectionFromHash(a.getAttribute('href')), true);
      },
      true
    );

    // Hash change (Carrd first, router mirrors state)
    this.aEL('hashchange', () => {
      if (this._driving) return;

      const raw = this.l.hash.slice(1);

      // Scrollpoint? Do NOT drive.
      if (this.findScrollId(raw)) {
        const section =
          history.state?.section ||
          this.sectionFromPathname(this.l.pathname);

        this.settle(() => this.cleanTo(section, raw));
        return;
      }

      // Normal section change
      const s = this.sectionFromHash(this.l.hash);
      this.settle(() => this.cleanTo(s));
    });

    // Back / Forward
    this.aEL('popstate', e => {
      if (this._driving) return;

      const s =
        typeof e.state?.section === 'string'
          ? e.state.section
          : this.sectionFromPathname(this.l.pathname);

      this.drive(s, false);
    });
  }
}

export default new HybridRouter();
