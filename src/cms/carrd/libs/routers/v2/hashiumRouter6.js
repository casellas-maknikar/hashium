import HybridMode from "./modes/hybridMode2.js";

class HashiumRouter {
  constructor() {
    this.cms = "unknown";
    this.mode = "default";
    this.enabled = false;

    // Ensure async errors are visible
    this.start().catch(console.error);
  }

  async start() {
    // Wait for DOM if needed
    if (document.readyState === "loading") {
      await new Promise((res) =>
        document.addEventListener("DOMContentLoaded", res, { once: true })
      );
    }

    // Only Carrd logic for now (per your requirement)
    if (!this.isCarrdSite()) return;

    this.cms = "carrd";
    this.enabled = true;

    // If Carrd is using section ids with "--", enable HybridMode
    if (this.usesDoubleDashSections()) {
      this.mode = "hybrid";

      // Constructing the mode triggers init() (your class already does that)
      new HybridMode({ cms: this.cms, mode: this.mode, router: this });
      return;
    }

    // Else: Carrd default hash routing (do nothing)
    this.mode = "default";
  }

  isCarrdSite() {
    return this.isCarrdHost(location.hostname) || this.hasCarrdBootSignature();
  }

  isCarrdHost(host) {
    const h = String(host || "").toLowerCase();
    return [".carrd.co", ".crd.co", ".ju.mp", ".uwu.ai", ".drr.ac"].some(
      (s) => h === s.slice(1) || h.endsWith(s)
    );
  }

  hasCarrdBootSignature() {
    const sig =
      "(function() {var on = addEventListener,off = removeEventListener";
    const scripts = [...document.body.querySelectorAll("script")].slice(-8);
    return scripts.some(
      (s) => !s.src && (s.textContent || "").includes(sig)
    );
  }

  usesDoubleDashSections() {
    return [...document.querySelectorAll("section[id]")].some((s) =>
      String(s.id || "").includes("--")
    );
  }
}

// Self-boot on import
new HashiumRouter();
