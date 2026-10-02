const STATE_KEY = '__hashiumHybridRouter';
const RELOAD_KEY = STATE_KEY + '.reload';
let instanceId = 0;

/** Clean URLs for Carrd's section runtime. Import this module after Carrd's script. */
export class HybridRouter {
  constructor({ window: win = globalThis.window, transitionTimeoutMs = 5000 } = {}) {
    if (!win?.document) throw new Error('HybridRouter requires a browser window.');
    this.window = win;
    this.document = win.document;
    this.history = win.history;
    this.location = win.location;
    this.transitionTimeoutMs = transitionTimeoutMs;
    this.lastError = null;
    this._id = ++instanceId;
    this._sequence = 0;
    this._listeners = [];
    this._syntheticClicks = new WeakSet();
    this._waits = new Set();
    this._scrollPositions = new Map();
    this._entryPrefix = this._id + '-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2);
    this._entrySequence = 0;
    this._lastScrollSave = 0;
    this._idle = Promise.resolve(true);
    this._pushState = this.history.pushState.bind(this.history);
    this._replaceState = this.history.replaceState.bind(this.history);
    this.ready = new Promise(resolve => { this._resolveReady = resolve; });
    this._start = () => {
      if (this._destroyed) return this._resolveReady(false);
      try {
        this.init();
        this.whenIdle().then(this._resolveReady);
      } catch (error) {
        this._report(error);
        this._resolveReady(false);
      }
    };
    if (this.document.readyState === 'loading') {
      this.document.addEventListener('DOMContentLoaded', this._start, { once: true });
    } else this._start();
  }

  init() {
    if (this._initialized || this._destroyed) return;
    const d = this.document;
    this.sections = Array.from(d.querySelectorAll('.site-main > .inner > section[id]'));
    if (!this.sections.length) this.sections = Array.from(d.querySelectorAll('#main section[id], main section[id]'));
    if (!this.sections.length) this.sections = Array.from(d.querySelectorAll('section[id]'));
    if (!this.sections.length) throw new Error('HybridRouter: no Carrd sections were found.');
    this._rootId = this.sections[0].id.replace(/-section$/, '');
    this._byId = new Map();
    this._byPath = new Map();
    for (const section of this.sections) {
      const id = section.id.replace(/-section$/, '');
      const path = id === this._rootId ? '' : id.replaceAll('--', '/');
      this._byId.set(id, section);
      this._byPath.set(path, section);
    }
    this._byPath.set(this._rootId.replaceAll('--', '/'), this.sections[0]);
    this._initialized = true;
    this._reloadSnapshot = this._consumeReloadSnapshot();
    this._wrapCarrdHelpers();
    this._oldScrollRestoration = this.history.scrollRestoration;
    if ('scrollRestoration' in this.history) this.history.scrollRestoration = 'manual';

    if (this.window.navigation?.addEventListener) {
      this._listen(this.window.navigation, 'navigate', event => {
        // Scroll persistence changes state only; it must not replace the
        // destination of a document traversal that is still loading.
        if (this._writingHistory) return;
        this._traverseSnapshot = null;
        if (event.navigationType !== 'traverse' || event.destination.sameDocument !== false) return;
        const route = this._resolve(event.destination.url);
        if (!route) return;
        this._traverseSnapshot = {
          kind: 'traverse', origin: this.location.origin, time: Date.now(),
          saved: { version: 1, section: route.path, scrollId: route.scrollId, url: route.url },
        };
      });
    }
    this._listen(this.window, 'click', event => this._onClick(event), true);
    this._listen(this.window, 'popstate', () => this._onHistory(), true);
    this._listen(this.window, 'hashchange', event => {
      const route = this._resolve(this.location.href, this.history.state);
      if (!route) return;
      // Carrd must not start a second, uncoordinated transition on this event.
      event.stopImmediatePropagation();
      this._onHistory(route);
    }, true);
    this._listen(this.window, 'scroll', () => {
      if (!this._scrollReady) return;
      this._rememberScroll();
      if (this._saveTimer) return;
      this._saveTimer = this.window.setTimeout(() => {
        this._saveTimer = 0;
        if (this._scrollReady) this._saveScroll();
      }, Math.max(0, 500 - (this.window.performance.now() - this._lastScrollSave)));
    }, { passive: true });
    for (const type of ['wheel', 'touchstart', 'pointerdown']) {
      this._listen(this.window, type, () => this._cancelScroll(), { passive: true });
    }
    this._listen(this.window, 'keydown', event => {
      if (['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' '].includes(event.key)) this._cancelScroll();
    });
    this._listen(this.window, 'pageshow', event => { if (event.persisted) this._onHistory(); });
    this._listen(this.window, 'pagehide', () => {
      this._saveScroll();
      this._storeReloadSnapshot();
    });

    let route = this._resolve(this.location.href, this.history.state);
    if (route) {
      let saved = this._savedRoute(this.history.state);
      const restored = this._restoreReloadRoute(route);
      if (restored) ({ route, saved } = restored);
      this._write(route, false);
      this._enqueue(route, { instant: true, position: saved?.position });
    }
    this._reloadSnapshot = null;
  }

  _listen(target, type, handler, options) {
    target.addEventListener(type, handler, options);
    this._listeners.push(() => target.removeEventListener(type, handler, options));
  }

  _wrapCarrdHelpers() {
    const wrap = (name, handler) => {
      if (typeof this.window[name] !== 'function') return;
      const original = this.window[name];
      const descriptor = Object.getOwnPropertyDescriptor(this.window, name);
      this.window[name] = handler;
      this._listeners.push(() => {
        if (this.window[name] !== handler) return;
        if (descriptor) Object.defineProperty(this.window, name, descriptor);
        else { delete this.window[name]; if (this.window[name] !== original) this.window[name] = original; }
      });
    };
    const sectionTarget = direction => {
      const current = this._current?.section || this.sections.find(section => section.classList.contains('active'));
      const index = this.sections.indexOf(current);
      const target = direction === 'first' ? this.sections[0]
        : direction === 'last' ? this.sections.at(-1)
        : this.sections[index + (direction === 'next' ? 1 : -1)];
      return target ? this.navigate('#' + target.id.replace(/-section$/, '')) : false;
    };
    const pointTarget = (direction, event) => {
      let source = (event || this.window.event)?.target;
      while (source && source.parentElement?.tagName !== 'SECTION') source = source.parentElement;
      if (!source || !this.sections.includes(source.parentElement)) return false;
      const forward = direction === 'next' || direction === 'last';
      const edge = direction === 'first' || direction === 'last';
      let target;
      while ((source = forward ? source.nextElementSibling : source.previousElementSibling)) {
        if (!source.getAttribute('data-scroll-id')) continue;
        target = source;
        if (!edge) break;
      }
      return target ? this.navigate('#' + encodeURIComponent(target.getAttribute('data-scroll-id'))) : false;
    };
    for (const direction of ['next', 'previous', 'first', 'last']) {
      wrap('_' + direction + 'Section', () => sectionTarget(direction));
      wrap('_' + direction + 'ScrollPoint', event => pointTarget(direction, event));
    }
    wrap('_scrollToTop', () => {
      const section = this._current?.section || this.sections.find(section => section.classList.contains('active'));
      return section ? this.navigate('#' + section.id.replace(/-section$/, ''), { scrollToTop: true }) : false;
    });
  }

  sectionFromHash(hash) {
    const id = this._decode(String(hash || '').replace(/^#/, ''));
    return id === null ? null : id.replaceAll('--', '/');
  }

  sectionFromPath(path) {
    return this._decode(String(path || '').replace(/^\/+|\/+$/g, ''));
  }

  _decode(value) {
    try { return decodeURIComponent(value); } catch { return null; }
  }

  _pathFor(section) {
    const id = section.id.replace(/-section$/, '');
    return id === this._rootId ? '' : id.replaceAll('--', '/');
  }

  getScrollElFromHash(hashOrId) {
    const id = this._decode(String(hashOrId || '').replace(/^#/, ''));
    if (!id) return null;
    // Compare attributes instead of interpolating untrusted fragments into CSS.
    return Array.from(this.document.querySelectorAll('[data-scroll-id]'))
      .find(element => element.getAttribute('data-scroll-id') === id) || null;
  }

  _savedRoute(state) {
    const saved = state?.[STATE_KEY];
    return saved?.version === 1 && saved.url === this.location.pathname + this.location.search + this.location.hash ? saved : null;
  }

  _consumeReloadSnapshot() {
    try {
      const raw = this.window.sessionStorage.getItem(RELOAD_KEY);
      this.window.sessionStorage.removeItem(RELOAD_KEY);
      const snapshot = raw ? JSON.parse(raw) : null;
      const age = Date.now() - snapshot?.time;
      return snapshot?.origin === this.location.origin && age >= 0 && age < 120000 ? snapshot : null;
    } catch { return null; }
  }

  _storeReloadSnapshot() {
    try {
      if (this._traverseSnapshot) {
        this.window.sessionStorage.setItem(RELOAD_KEY, JSON.stringify(this._traverseSnapshot));
        this._traverseSnapshot = null;
        return;
      }
      const saved = this._savedRoute(this.history.state);
      if (!saved) { this.window.sessionStorage.removeItem(RELOAD_KEY); return; }
      const { version, section, scrollId, url, position } = saved;
      this.window.sessionStorage.setItem(RELOAD_KEY, JSON.stringify({
        origin: this.location.origin, time: Date.now(), saved: { version, section, scrollId, url, position },
      }));
    } catch { /* Storage may be disabled; routing itself must still work. */ }
  }

  _restoreReloadRoute(route) {
    // Carrd's /page -> /#page HTTP redirect replaces an incoming scrollpoint
    // fragment on reload or document traversal, and browsers can discard the
    // history state in that redirect. Only a captured traversal destination can
    // recover Back/Forward; an outgoing page snapshot belongs to a different entry.
    const navigationType = this.window.performance.getEntriesByType?.('navigation')[0]?.type;
    const traversal = navigationType === 'back_forward' && this._reloadSnapshot?.kind === 'traverse';
    if (navigationType !== 'reload' && !traversal) return null;
    if (this.location.pathname !== '/' || !this._byId.has(this._decode(this.location.hash.slice(1)))) return null;
    const saved = traversal ? this._reloadSnapshot.saved : this.history.state?.[STATE_KEY] || this._reloadSnapshot?.saved;
    if (saved?.version !== 1 || saved.section !== route.path || typeof saved.url !== 'string' || typeof saved.scrollId !== 'string') return null;
    let url;
    try { url = new URL(saved.url, this.location.origin); } catch { return null; }
    if (url.origin !== this.location.origin || url.search !== this.location.search) return null;
    const point = saved.scrollId ? this.getScrollElFromHash(saved.scrollId) : null;
    if (saved.scrollId && point?.closest('section[id]') !== route.section) return null;
    const restored = this._resolve(url.href);
    if (!restored || restored.section !== route.section || restored.url !== saved.url) return null;
    if (!restored.point && point?.getAttribute('data-scroll-invisible') === '1') {
      restored.point = point;
      restored.scrollId = saved.scrollId;
    }
    if (restored.scrollId !== saved.scrollId) return null;
    return { route: restored, saved };
  }

  _resolve(target, state) {
    const bareHome = String(target) === '#';
    let url;
    try { url = new URL(String(target), this.location.href); } catch { return null; }
    if (url.origin !== this.location.origin) return null;
    const pathname = this.sectionFromPath(url.pathname);
    if (!bareHome && (pathname === null || !this._byPath.has(pathname))) return null;
    let section, point = null;
    const hash = this._decode(url.hash.slice(1));
    if (hash === null) return null;
    if (bareHome) {
      section = this.sections[0];
    } else if (hash) {
      point = this.getScrollElFromHash(url.hash);
      section = point ? point.closest('section[id]') : this._byId.get(hash);
      if (!section || !this.sections.includes(section)) return null;
    } else {
      section = this._byPath.get(pathname);
      if (!section) return null;
      const saved = this._savedRoute(state);
      if (saved?.section === this._pathFor(section) && saved.scrollId) {
        const candidate = this.getScrollElFromHash(saved.scrollId);
        if (candidate?.closest('section[id]') === section) point = candidate;
      }
    }
    const path = this._pathFor(section);
    const scrollId = point?.getAttribute('data-scroll-id') || '';
    const fragment = point && point.getAttribute('data-scroll-invisible') !== '1' ? '#' + encodeURIComponent(scrollId) : '';
    return { section, path, point, scrollId, url: '/' + path.split('/').map(encodeURIComponent).join('/') + url.search + fragment };
  }

  _state(route, position, push) {
    const previous = this.history.state;
    const objectState = previous !== null && typeof previous === 'object' && !Array.isArray(previous);
    const entry = !push && previous?.[STATE_KEY]?.entry || this._entryPrefix + '-' + ++this._entrySequence;
    const namespace = { version: 1, entry, section: route.path, scrollId: route.scrollId, url: route.url };
    if (Array.isArray(position) && position.length === 2 && position.every(Number.isFinite)) namespace.position = position;
    // Objects retain their keys; primitive/array state remains available in the namespace.
    if (!objectState && previous !== null) namespace.foreignState = previous;
    else if (previous?.[STATE_KEY] && 'foreignState' in previous[STATE_KEY]) namespace.foreignState = previous[STATE_KEY].foreignState;
    return { ...(objectState ? previous : {}), [STATE_KEY]: namespace };
  }

  _write(route, push, position) {
    const state = this._state(route, position, push);
    this._writingHistory = true;
    try { (push ? this._pushState : this._replaceState)(state, '', route.url); }
    finally { this._writingHistory = false; }
    this._currentEntry = state[STATE_KEY].entry;
  }

  _rememberScroll() {
    if (!this._scrollReady || !this._current || !this._currentEntry) return;
    this._scrollPositions.set(this._currentEntry, {
      url: this._current.url, scrollId: this._current.scrollId, position: [this.window.scrollX, this.window.scrollY],
    });
    if (this._scrollPositions.size > 256) this._scrollPositions.delete(this._scrollPositions.keys().next().value);
  }

  _saveScroll() {
    if (this._saveTimer) this.window.clearTimeout(this._saveTimer);
    this._saveTimer = 0;
    const route = this._current;
    if (!this._scrollReady || !route || route.url !== this.location.pathname + this.location.search + this.location.hash) return;
    this._rememberScroll();
    this._write(route, false, [this.window.scrollX, this.window.scrollY]);
    this._lastScrollSave = this.window.performance.now();
  }

  /** Returns false for unknown routes and cross-origin URLs; does not reload the page. */
  navigate(target, { replace = false, scrollToTop = false } = {}) {
    if (!this._initialized || this._destroyed) return false;
    const route = this._resolve(target);
    if (!route) return false;
    this._traverseSnapshot = null;
    this._saveScroll();
    const current = this._savedRoute(this.history.state);
    const same = route.url === this.location.pathname + this.location.search + this.location.hash && current?.scrollId === route.scrollId;
    this._write(route, !replace && !same);
    this._enqueue(route, { position: scrollToTop ? [0, 0] : undefined });
    return true;
  }

  _onClick(event) {
    if (this._syntheticClicks.has(event) || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const anchor = event.composedPath?.().find(node => node?.tagName === 'A') || event.target?.closest?.('a[href]');
    if (!anchor?.hasAttribute('href') || anchor.hasAttribute('download')) return;
    const target = anchor.getAttribute('target') || this.document.querySelector('base[target]')?.getAttribute('target') || '';
    if (target && target.toLowerCase() !== '_self') return;
    const href = anchor.getAttribute('href');
    if (!href) return;
    const route = this._resolve(href);
    if (!route) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    this.navigate(href);
  }

  _onHistory(route = this._resolve(this.location.href, this.history.state)) {
    // popstate arrives after the address changes, while the old viewport and
    // entry ID still describe the page being left. Keep that position in memory.
    this._rememberScroll();
    if (!route) {
      this._sequence++;
      this._pending = null;
      this._cancelScroll();
      this._scrollReady = false;
      return;
    }
    const saved = this._savedRoute(this.history.state);
    const remembered = this._scrollPositions.get(saved?.entry);
    const position = remembered?.url === route.url && remembered.scrollId === route.scrollId ? remembered.position : saved?.position;
    // A fragment traversal emits popstate followed by hashchange. Coalesce the pair.
    if (this._current?.url === route.url && this._current?.scrollId === route.scrollId && this._historyHref === this.location.href) return;
    this._write(route, false, position);
    this._historyHref = this.location.href;
    this._enqueue(route, { instant: true, position });
  }

  _enqueue(route, options = {}) {
    this._cancelScroll();
    this._scrollReady = false;
    this._current = route;
    this._pending = { route, options, sequence: ++this._sequence };
    if (!this._running) {
      this._running = true;
      this._idle = this._drain();
    }
  }

  async _drain() {
    try {
      while (this._pending && !this._destroyed) {
        const request = this._pending;
        this._pending = null;
        const { route, options, sequence } = request;
        const changed = route.section.classList.contains('inactive');
        if (changed) await this._activate(route.section);
        else if (!this._isSettled(route.section)) await this._waitForSection(route.section);
        if (sequence !== this._sequence || this._destroyed) continue;
        if (Array.isArray(options.position) && options.position.length === 2 && options.position.every(Number.isFinite)) {
          this.window.scrollTo(options.position[0], options.position[1]);
        } else if (route.point) await this.scrollToEl(route.point, { instant: options.instant || changed });
        if (sequence === this._sequence && !this._destroyed) {
          this._scrollReady = true;
          this._saveScroll();
        }
      }
      return !this.lastError;
    } catch (error) {
      this._pending = null;
      this._report(error);
      return false;
    } finally {
      this._running = false;
    }
  }

  _isSettled(section) {
    return section.classList.contains('active') && !section.classList.contains('inactive') && section.style.display !== 'none' && !section.style.minHeight && !section.style.maxHeight && section.style.transition !== 'none';
  }

  _waitForSection(section) {
    if (this._isSettled(section)) return Promise.resolve();
    return new Promise((resolve, reject) => {
      let timeout;
      const finish = error => {
        observer.disconnect();
        this.window.clearTimeout(timeout);
        this._waits.delete(cancel);
        error ? reject(error) : resolve();
      };
      const cancel = () => finish();
      const observer = new this.window.MutationObserver(() => { if (this._isSettled(section)) finish(); });
      observer.observe(section, { attributes: true, attributeFilter: ['class', 'style'] });
      this._waits.add(cancel);
      timeout = this.window.setTimeout(() => finish(new Error('HybridRouter: Carrd section activation timed out for ' + section.id)), this.transitionTimeoutMs);
    });
  }

  async _activate(section) {
    const d = this.document, h = this.history;
    const marker = d.createElement('span');
    const id = 'hashium-router-' + this._id + '-' + this._sequence;
    marker.setAttribute('data-scroll-id', id);
    marker.setAttribute('data-scroll-invisible', '1');
    marker.setAttribute('aria-hidden', 'true');
    marker.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden;pointer-events:none;margin:0;padding:0;border:0;';
    // Carrd retains this marker through its transition. Its final instant scroll
    // should leave native auto-scroll (including disableAutoScroll) undisturbed.
    Object.defineProperty(marker, 'offsetTop', { get: () => this.window.scrollY });
    section.append(marker);
    const anchor = d.createElement('a');
    anchor.href = '#' + id;
    anchor.hidden = true;
    d.body.append(anchor);
    const event = new this.window.MouseEvent('click', { bubbles: true, cancelable: true, button: 0 });
    event.preventDefault();
    this._syntheticClicks.add(event);
    const descriptor = Object.getOwnPropertyDescriptor(h, 'pushState');
    const original = h.pushState;
    const expected = '#' + section.id.replace(/-section$/, '');
    let acknowledged = false;
    try {
      // Scope interception to Carrd's synchronous invisible-scrollpoint branch.
      // No real section fragment ever reaches the address bar or history stack.
      h.pushState = function(state, title, url) {
        if (state === null && title === null && url === expected) { acknowledged = true; return; }
        return original.apply(this, arguments);
      };
      anchor.dispatchEvent(event);
    } finally {
      if (descriptor) Object.defineProperty(h, 'pushState', descriptor);
      else delete h.pushState;
      anchor.remove();
      marker.remove();
    }
    if (!acknowledged) throw new Error('HybridRouter: unsupported Carrd runtime. The invisible-scrollpoint adapter did not activate ' + section.id + '.');
    await this._waitForSection(section);
  }

  scrollPrefs(element) {
    const integer = (value, fallback) => { const number = parseInt(value, 10); return Number.isFinite(number) ? number : fallback; };
    return {
      behavior: element.getAttribute('data-scroll-behavior') || 'default',
      offset: integer(element.getAttribute('data-scroll-offset'), 0),
      speed: integer(element.getAttribute('data-scroll-speed'), 3),
    };
  }

  speedToDurationMs(speed) { return ({ 1: 1250, 2: 1000, 3: 750, 4: 500, 5: 250 })[speed] || 750; }

  computeScrollTargetY(element) {
    const { behavior, offset } = this.scrollPrefs(element);
    const pixels = offset * (parseFloat(this.window.getComputedStyle(this.document.documentElement).fontSize) || 16);
    let y = element.offsetTop + pixels;
    if (behavior === 'center') {
      y = element.offsetHeight < this.window.innerHeight ? element.offsetTop - (this.window.innerHeight - element.offsetHeight) / 2 + pixels : element.offsetTop - pixels;
    } else if (behavior === 'previous' && element.previousElementSibling) {
      y = element.previousElementSibling.offsetTop + element.previousElementSibling.offsetHeight + pixels;
    }
    return Math.max(0, y);
  }

  scrollToEl(element, { instant = false } = {}) {
    this._cancelScroll();
    const win = this.window;
    const target = this.computeScrollTargetY(element);
    const start = win.scrollY;
    if (instant || win.matchMedia?.('(prefers-reduced-motion: reduce)').matches || Math.abs(target - start) < 1) {
      win.scrollTo(0, target);
      return Promise.resolve(true);
    }
    return new Promise(resolve => {
      this._scrollResolve = resolve;
      const started = win.performance.now();
      const duration = this.speedToDurationMs(this.scrollPrefs(element).speed);
      const step = now => {
        const progress = Math.min(1, (now - started) / duration);
        const eased = progress < 0.5 ? 4 * progress ** 3 : 1 - (-2 * progress + 2) ** 3 / 2;
        win.scrollTo(0, start + (target - start) * eased);
        if (progress < 1) this._scrollFrame = win.requestAnimationFrame(step);
        else {
          this._scrollFrame = 0;
          this._scrollResolve = null;
          resolve(true);
        }
      };
      this._scrollFrame = win.requestAnimationFrame(step);
    });
  }

  _cancelScroll() {
    if (this._scrollFrame) this.window.cancelAnimationFrame(this._scrollFrame);
    this._scrollFrame = 0;
    this._scrollResolve?.(false);
    this._scrollResolve = null;
  }

  async whenIdle() {
    do { await this._idle; } while (this._running || this._pending);
    return !this.lastError && !this._destroyed;
  }

  _report(error) {
    this.lastError = error;
    this.window.dispatchEvent(new this.window.CustomEvent('hybridroutererror', { detail: error }));
    this.window.console?.error(error);
  }

  destroy() {
    if (this._destroyed) return;
    this._destroyed = true;
    this._sequence++;
    this._pending = null;
    this._cancelScroll();
    if (this._saveTimer) this.window.clearTimeout(this._saveTimer);
    for (const remove of this._listeners) remove();
    for (const cancel of this._waits) cancel();
    this.document.removeEventListener('DOMContentLoaded', this._start);
    if (this._initialized && 'scrollRestoration' in this.history && this.history.scrollRestoration === 'manual') this.history.scrollRestoration = this._oldScrollRestoration;
    this._resolveReady(false);
  }
}

export default typeof window === 'undefined' ? null : new HybridRouter();
