export default class CarrdOptimizer {
  constructor() {
    this.optimize();
  }

  createBlobURL = (content, type) =>
    URL.createObjectURL(new Blob([content], { type }));

  extractFirstStyleContent = () => {
    const firstStyle = document.head?.querySelector("style");
    if (!firstStyle) return;
    const originalContent = firstStyle.textContent;
    window.styleContent = originalContent;
    const url = this.createBlobURL(originalContent, "text/css");
    const link = document.createElement("link");
    link.id = "blobStyle";
    link.rel = "stylesheet";
    link.href = url;
    document.head.append(link);
    firstStyle.remove();
  };

  extractScriptContent = () => {
    const scripts = document.body?.querySelectorAll("script");
    if (!scripts) return;
    for (const script of scripts) {
      if (script.attributes.length === 0) {
        const originalContent = script.textContent;
        window.scriptContent = originalContent;
        const url = this.createBlobURL(originalContent, "text/javascript");
        const newScript = document.createElement("script");
        newScript.id = "blobScript";
        newScript.src = url;
        script.parentNode.insertBefore(newScript, script.nextSibling);
        script.remove();
        break;
      }
    }
  };

  optimize = () => {
    this.extractFirstStyleContent();
    this.extractScriptContent();
    return this;
  };
}
