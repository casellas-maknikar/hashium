class HybridRouter {
  constructor() {
    const d = document, l = location, h = history, t = this;
    t.l = l;
    t.o = l.origin;
    t.rS = h.replaceState.bind(h);
    t.aEL = addEventListener;
    t.SETTLE_MS = 450;
    t._driving = 0;

    d.readyState === 'loading'
      ? d.addEventListener('DOMContentLoaded', () => t.init(), { once: 1 })
      : t.init();
  }

  sectionFromHash(h) { return String(h || '').slice(1).replaceAll('--', '/'); }
  sectionFromPath(p) { return decodeURIComponent(String(p || '').replace(/^\/+/, '')); }

  drive(section, push) {
    const t = this, l = t.l, ms = t.SETTLE_MS;
    t._driving = 1;

    const hh = section ? `#${section.replaceAll('/', '--')}` : '#';
    push ? (l.hash = hh) : l.replace(hh);

    setTimeout(() => {
      t.rS({ section }, '', `${t.o}/${section || ''}`);
      t._driving = 0;
    }, ms);
  }

  init() {
    const t = this, l = t.l, o = t.o, rS = t.rS, ms = t.SETTLE_MS;
    const settleClean = (s) => setTimeout(() => rS({ section: s }, '', `${o}/${s || ''}`), ms);

    if ((!l.hash || l.hash === '#') && l.pathname !== '/') {
      t.drive(t.sectionFromPath(l.pathname), 0);
    } else {
      settleClean(t.sectionFromHash(l.hash));
    }

    t.aEL('click', (e) => {
      const a = e.target?.closest?.('a[href^="#"]');
      if (!a) return;
      e.preventDefault();
      t.drive(t.sectionFromHash(a.getAttribute('href')), 1);
    }, 1);

    t.aEL('hashchange', () => {
      if (t._driving) return;
      settleClean(t.sectionFromHash(l.hash));
    });

    t.aEL('popstate', (e) => {
      if (t._driving) return;
      t.drive(
        typeof e.state?.section === 'string'
          ? e.state.section
          : t.sectionFromPath(l.pathname),
        0
      );
    });
  }
}

export default new HybridRouter();
