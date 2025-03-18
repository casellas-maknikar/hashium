class SemanticLandmark {
  static transform() {
    const oldM = document.querySelector('#main'),
    newM = document.createElement('main');
    [...oldM.attributes].forEach(({
        name,
        value
      }) => name !== 'id' && newM.setAttribute(name, value));
    while (oldM.firstChild)
      newM.appendChild(oldM.firstChild);
    oldM.replaceWith(newM);
    [...document.styleSheets].forEach(sheet => {
      if (!sheet.cssRules)
        return;
      for (let i = 0; i < sheet.cssRules.length; i++) {
        const r = sheet.cssRules[i];
        if (r.selectorText && r.selectorText.includes('#main')) {
          sheet.deleteRule(i);
          sheet.insertRule(`${r.selectorText.replace(/#main/g, 'main')} { ${r.style.cssText} }`, i);
        }
      }
    });
    [...document.querySelectorAll('style')].forEach(tag =>
      tag.textContent = tag.textContent.replace(/#main/g, 'main'));
  }
}
document.addEventListener('DOMContentLoaded', SemanticLandmark.transform);
