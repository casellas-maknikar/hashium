class HybridRouter {
  // Private fields for all window references
  #loc;
  #orig;
  #replaceState;
  #addEvent;

  constructor() {
    // Capture references to window APIs exactly once
    this.#loc = window.location;
    this.#orig = window.location.origin;
    this.#replaceState = window.history.replaceState.bind(window.history);
    this.#addEvent = window.addEventListener.bind(window);

    // Freeze the instance so no one can add or overwrite properties
    Object.freeze(this);

    this.init();
  }

  /**
   * 1) Replace “--” with “/” 
   * 2) Remove any character not in [A–Za–z0–9-/]
   * 3) Split on “/” and re-encode each segment
   */
  #sanitizeAndEncode(raw) {
    // Step A: replace double-hyphens with slash
    const replaced = raw.replaceAll('--', '/');

    // Step B: remove any character outside our whitelist (letters, digits, hyphen, slash)
    //   This drops things like “.” or “:” or spaces or “<script>” etc.
    const cleaned = replaced.replace(/[^a-zA-Z0-9\-\/]/g, '');

    // Step C: split into segments and URI-encode each segment
    //   This prevents any leftover “../” or other sneaky patterns
    const segments = cleaned.split('/').filter(s => s.length > 0);
    const encodedSegments = segments.map(seg => encodeURIComponent(seg));

    return encodedSegments.join('/');
  }

  route() {
    // Grab everything after the ‘#’
    const rawHash = this.#loc.hash.slice(1); // e.g. "foo--bar" or "../etc"
    const sanitizedPath = this.#sanitizeAndEncode(rawHash);

    // If there’s nothing left after sanitization, just go to origin
    const newPath = sanitizedPath === '' ? '' : '/' + sanitizedPath;

    // Build the final URL: always origin + “/” + sanitizedPath
    const finalUrl = `${this.#orig}${newPath}`;

    // Update history.state with the sanitized section
    this.#replaceState({ section: sanitizedPath }, '', finalUrl);
  }

  init() {
    // On page load, immediately route
    this.#addEvent('load', () => this.route());

    // On hashchange, wait a tick then route
    this.#addEvent('hashchange', () => setTimeout(() => this.route(), 0));

    // On popstate (e.g. back/forward), only process if it’s our own sanitized state
    this.#addEvent('popstate', (e) => {
      const state = e.state;
      if (
        state &&
        typeof state.section === 'string' &&
        // Ensure the saved section only contains letters, digits, hyphen, slash
        /^[a-zA-Z0-9\-\/]*$/.test(state.section)
      ) {
        // Re-build the URL from the trusted state
        const newPath = state.section === '' ? '' : '/' + state.section;
        const finalUrl = `${this.#orig}${newPath}`;
        this.#replaceState(state, '', finalUrl);
      }
      // Otherwise: ignore any popstate that wasn’t created by our own route()
    });
  }
}

// Export a single, immutable instance
export default new HybridRouter();
