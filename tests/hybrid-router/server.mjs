import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const root = new URL('../../', import.meta.url);
const fixture = await readFile(new URL('./carrd-playground.html', import.meta.url), 'utf8');
const port = Number(process.env.PORT || 4173);
const bootstrap = `<script>
window.__historyWrites = [];
window.__errors = [];
window.__bootState = history.state;
window.__bootNavType = performance.getEntriesByType('navigation')[0]?.type;
window.__bootEntryKey = window.navigation?.currentEntry?.key;
window.__bootStorage = (()=>{try{return sessionStorage.getItem('__hashiumHybridRouter.reload')}catch{return null}})();
if (new URLSearchParams(location.search).has('__blockedStorage')) Object.defineProperty(window, 'sessionStorage', {get(){throw new DOMException('Storage disabled for this test','SecurityError')}});
addEventListener('error', event => window.__errors.push(event.message));
addEventListener('unhandledrejection', event => window.__errors.push(String(event.reason)));
for (const method of ['pushState', 'replaceState']) {
  const original = history[method];
  history[method] = function(state, title, url) {
    window.__historyWrites.push({method, url: String(url), time: performance.now()});
    return original.apply(this, arguments);
  };
}
if (new URLSearchParams(location.search).has('foreign')) history.replaceState({foreign:42}, '', location.href);
</script>`;
const init = `<script type="module">
import router from '/__router.js';
window.__router = router;
try { window.__ready = await router.ready ? true : 'error'; }
catch (error) { window.__errors.push(String(error)); window.__ready = 'error'; }
</script>`;
const html = fixture
  .replace(/<script\b[^>]*\bsrc="https:\/\/cdn\.jsdelivr\.net\/gh\/casellas-maknikar\/hashium[^>]*><\/script>/g, '')
  .replace('<head>', '<head>' + bootstrap)
  .replace('</body>', init + '</body>');

http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const path = url.pathname;
  res.setHeader('Cache-Control', 'no-store');
  try {
    if (path === '/__tests') {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.end(await readFile(new URL('./runner.html', import.meta.url)));
    } else if (path === '/__extra-cases.js') {
      res.setHeader('Content-Type', 'text/javascript; charset=utf-8');
      res.end(await readFile(new URL('./extra-cases.js', import.meta.url)));
    } else if (path === '/__router.js') {
      res.setHeader('Content-Type', 'text/javascript; charset=utf-8');
      res.end(await readFile(new URL('src/cms/carrd/libs/routers/v2/hybridRouter.js', root)));
    } else if (url.searchParams.has('__redirects') && path !== '/') {
      const sections = {'/page':'page','/page/subpage':'page--subpage','/page/subpage/third-page':'page--subpage--third-page'};
      res.writeHead(301, {Location:'/'+url.search+(sections[path]?'#'+sections[path]:'')});
      res.end();
    } else {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      let page = url.searchParams.has('__nativeOptions') ? html.replace('sections = {};', 'sections = {page:{disableAutoScroll:true,hideHeader:true,hideFooter:true}};') : html;
      if (url.searchParams.has('__tall')) page=page.replace('</head>','<style>.site-main > .inner > section { min-height:2200px !important; }</style></head>');
      res.end(page);
    }
  } catch (error) { res.writeHead(500); res.end(String(error)); }
}).listen(port, '127.0.0.1', () => {
  console.log(`HybridRouter tests: http://127.0.0.1:${port}/__tests`);
  console.log(`Playground preview: http://127.0.0.1:${port}/`);
  console.log(`Repository: ${fileURLToPath(root)}`);
});
