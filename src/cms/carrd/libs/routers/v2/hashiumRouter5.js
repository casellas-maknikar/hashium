import { HybridMode } from "./modes/hybridMode1.js";

class HashiumRouter {
  constructor() {
    this.cms = "unknown";
    this.mode = "default";
    this.enabled = false;
    this.start().catch(console.error);
  }

  async start() {
    if (document.readyState === "loading") {
      await new Promise(res =>
        document.addEventListener("DOMContentLoaded", res, { once: true })
      );
    }

    if (!this.isCarrdSite()) return;

    this.cms = "carrd";
    this.enabled = true;

    if (this.usesDoubleDashSections()) {
      this.mode = "hybrid";
      hybridMode({ cms: this.cms, mode: this.mode, router: this });
    }
  }

  isCarrdSite() {
    return this.isCarrdHost(location.hostname) ||
           this.hasCarrdBootSignature();
  }

  isCarrdHost(host) {
    const h = host.toLowerCase();
    return [".carrd.co", ".crd.co", ".ju.mp", ".uwu.ai", ".drr.ac"]
      .some(s => h === s.slice(1) || h.endsWith(s));
  }

  hasCarrdBootSignature() {
    const sig = "(function() {var on = addEventListener,off = removeEventListener";
    const scripts = [...document.body.querySelectorAll("script")].slice(-8);
    return scripts.some(s => !s.src && s.textContent?.includes(sig));
  }

  usesDoubleDashSections() {
    return [...document.querySelectorAll("section[id]")]
      .some(s => s.id.includes("--"));
  }
}

export default new HashiumRouter();
