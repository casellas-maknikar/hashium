/** Additional integration checks against the captured, unmodified Carrd runtime. */
export default async function extraCases({test, fresh, assert, checkRoute, click, travel, until, getWindow}) {
  const frames = w => new Promise(resolve => w.requestAnimationFrame(() => w.requestAnimationFrame(resolve)));
  const tallSections = w => {
    const style = w.document.createElement('style');
    style.textContent = '.site-main > .inner > section { min-height: 2200px !important; }';
    w.document.head.append(style);
  };
  const geometryFixture = w => {
    const point = w.document.querySelector('[data-scroll-id="fragment2"]');
    const before = w.document.createElement('div');
    before.style.cssText = 'height:700px;margin:0;padding:0';
    point.before(before);
    point.style.cssText += ';height:140px;min-height:140px;max-height:140px;overflow:hidden';
    const after = w.document.createElement('div');
    after.style.cssText = 'height:2200px;margin:0;padding:0';
    point.after(after);
    point.dataset.scrollSpeed = '5';
    return {point, before};
  };
  const boundedY = (w, y) => Math.max(0, Math.min(y, w.document.documentElement.scrollHeight - w.innerHeight));
  const near = (actual, expected, message) => assert(Math.abs(actual - expected) <= 2, `${message}: ${actual} != ${expected}`);

  await test('Native disableAutoScroll, header, and footer options survive the adapter', async () => {
    await fresh('/?__nativeOptions=1'); const w = getWindow();
    tallSections(w); await frames(w); w.scrollTo(0,420);
    near(w.scrollY,420,'Fixture must have scrollable space');
    await click('#page'); checkRoute('/page','page-section');
    near(w.scrollY,420,'Native disableAutoScroll was overridden');
    await click('#page');
    near(w.scrollY,420,'Repeated section navigation overrode disableAutoScroll');
    for (const id of ['header','footer']) {
      const element = w.document.getElementById(id);
      assert(element.classList.contains('hidden') && element.style.display==='none', `${id} was not hidden by Carrd`);
    }
    await click('#'); checkRoute('/','home-section');
    near(w.scrollY,0,'Normal native auto-scroll did not run');
    for (const id of ['header','footer']) {
      const element = w.document.getElementById(id);
      assert(!element.classList.contains('hidden') && element.style.display!=='none', `${id} was not restored by Carrd`);
    }
  });

  await test('Native lifecycle resets forms, loads content, and keeps history methods intact', async () => {
    await fresh(); const w = getWindow(), d = w.document;
    const home = d.getElementById('home-section'), page = d.getElementById('page-section');
    const methods = [w.history.pushState,w.history.replaceState];
    const form = d.createElement('form'); form.dataset.resetOnSectionChange='1';
    const input = d.createElement('input'); input.defaultValue='original'; input.value='edited';
    form.append(input); home.append(form); page.dataset.title='Lifecycle fixture';
    const unloaded = d.createElement('div'); unloaded.dataset.unloaded=''; page.append(unloaded);
    let loads=0; unloaded.addEventListener('loadelements',()=>loads++);
    const iframe = d.createElement('iframe'); iframe.dataset.src='about:blank'; page.append(iframe);
    const script = d.createElement('unloaded-script'); script.textContent='window.__lifecycleScriptRuns=(window.__lifecycleScriptRuns||0)+1';page.append(script);
    const starts=[], stops=[];
    d.body.addEventListener('startComponents',e=>starts.push(e.detail.parent));
    d.body.addEventListener('stopComponents',e=>stops.push(e.detail.parent));
    const pointIds=[...d.querySelectorAll('[data-scroll-id]')].map(el=>el.dataset.scrollId).sort().join(',');
    const childCount=home.childElementCount+page.childElementCount;
    await click('#page');
    assert(input.value==='original','Carrd form reset did not run');
    assert(stops.includes(home) && starts.includes(page),'Carrd component lifecycle events were bypassed');
    assert(loads===1 && !unloaded.hasAttribute('data-unloaded'),'Carrd loadelements processing was bypassed');
    assert(page.querySelector('iframe').getAttribute('src')==='about:blank','Lazy iframe was not loaded');
    assert(w.__lifecycleScriptRuns===1,'Deferred section script did not run');
    assert(d.title==='Lifecycle fixture - Dynamic Routing Demo','Native section title was not applied');
    assert(w.history.pushState===methods[0] && w.history.replaceState===methods[1],'Adapter left a history patch installed');
    assert(home.childElementCount+page.childElementCount===childCount,'Adapter left structural elements behind');
    assert([...d.querySelectorAll('[data-scroll-id]')].map(el=>el.dataset.scrollId).sort().join(',')===pointIds,'Adapter leaked a scrollpoint');
    await click('#');
    assert(d.title==='Dynamic Routing Demo','Native root title was not restored');
    assert(stops.includes(page) && starts.includes(home),'Native return lifecycle did not run');
  });

  await test('Native scrollpoint geometry uses rem offsets, center, and the previous sibling', async () => {
    await fresh('/page'); const w=getWindow(), {point,before}=geometryFixture(w);
    await frames(w);
    const rem=parseFloat(w.getComputedStyle(w.document.documentElement).fontSize);
    for (const [behavior,offset] of [['default',2],['center',2],['previous',-1]]) {
      point.dataset.scrollBehavior=behavior; point.dataset.scrollOffset=String(offset);
      w.scrollTo(0,0);
      let expected=point.offsetTop+offset*rem;
      if (behavior==='center') expected=point.offsetTop-(w.innerHeight-point.offsetHeight)/2+offset*rem;
      if (behavior==='previous') expected=before.offsetTop+before.offsetHeight+offset*rem;
      w.__router.navigate('#fragment2');await w.__router.whenIdle();
      near(w.scrollY,boundedY(w,expected),`Incorrect ${behavior} geometry`);
    }
  });

  await test('User wheel input cancels an in-progress scrollpoint animation', async () => {
    await fresh('/page'); const w=getWindow(), {point}=geometryFixture(w);
    point.dataset.scrollSpeed='1';await frames(w);w.scrollTo(0,0);
    w.__router.navigate('#fragment2');
    if (w.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      await w.__router.whenIdle();near(w.scrollY,boundedY(w,point.offsetTop),'Reduced motion scroll did not reach the point');
      return;
    }
    await until(()=>w.scrollY>5 && w.scrollY<point.offsetTop-5,'Animated scroll never started');
    w.dispatchEvent(new w.WheelEvent('wheel',{bubbles:true,cancelable:true,deltaY:-100}));
    w.scrollTo(0,50); // Synthetic wheel has no browser default action: apply the user's new position.
    await w.__router.whenIdle();
    await new Promise(resolve=>w.setTimeout(resolve,1350));
    near(w.scrollY,50,'Cancelled animation continued to fight user input');
  });

  await test('Back restores a manually scrolled section position', async () => {
    await fresh('/page'); const w=getWindow();tallSections(w);await frames(w);
    w.scrollTo(0,560);near(w.scrollY,560,'Fixture must have scrollable space');
    await click('#page--subpage');await travel('back','/page');checkRoute('/page','page-section');
    near(w.scrollY,560,'Back lost the saved scroll position');
  });

  await test('Scroll persistence is throttled and immediate Back retains the latest position', async () => {
    await fresh();const w=getWindow();tallSections(w);await click('#page');await frames(w);
    w.__historyWrites.length=0;const start=w.performance.now();let y=0;
    while(w.performance.now()-start<1100) {y=300+Math.floor((w.performance.now()-start)/2);w.scrollTo(0,y);await new Promise(resolve=>w.requestAnimationFrame(resolve));}
    const last=w.scrollY;
    assert(w.__historyWrites.length<=5,`Scrolling made ${w.__historyWrites.length} history writes in 1.1 seconds`);
    await travel('back','/');await travel('forward','/page');
    near(w.scrollY,last,'Immediate history traversal lost the final scroll position');
  });

  await test('Disabled session storage does not break section routing or refresh', async () => {
    await fresh('/?__blockedStorage=1');let w=getWindow();await click('#page');checkRoute('/page','page-section');
    const previous=w.__router;w.location.reload();
    await until(()=>w.__ready && w.__router!==previous,'Blocked storage reload failed');
    await w.__router.whenIdle();checkRoute('/page','page-section');
  });

  await test('A manually scrolled section survives reload through Carrd redirect', async () => {
    await fresh('/page?__redirects=1&__tall=1');const w=getWindow();await frames(w);w.scrollTo(0,520);
    near(w.scrollY,520,'Reload fixture must be scrollable');
    const previous=w.__router;w.location.reload();
    await until(()=>w.__ready && w.__router!==previous,'Manual position reload failed');
    await w.__router.whenIdle();checkRoute('/page','page-section');near(w.scrollY,520,'Redirect reload lost the manual scroll position');
  });

  await test('Carrd section helper actions use clean URLs without fragment writes', async () => {
    await fresh(); const w=getWindow();
    for (const [helper,path,id] of [
      ['_nextSection','/page','page-section'],
      ['_lastSection','/page/subpage/third-page','page--subpage--third-page-section'],
      ['_previousSection','/page/subpage','page--subpage-section'],
      ['_firstSection','/','home-section']
    ]) {
      assert(typeof w[helper]==='function',`Missing native helper ${helper}`);
      w[helper]();await w.__router.whenIdle();checkRoute(path,id);
    }
    assert(w.__historyWrites.every(write=>!new URL(write.url,w.location.origin).hash),'A section helper wrote a fragment');
  });

  await test('Carrd scrollpoint helper actions and scroll-to-top preserve routing', async () => {
    await fresh('/page'); const w=getWindow();
    const points=[...w.document.querySelectorAll('#page-section > [data-scroll-id]')];
    assert(points.length===3,'Expected three playground scrollpoints');
    for (const [helper,source,target] of [
      ['_nextScrollPoint',0,1],['_lastScrollPoint',0,2],
      ['_previousScrollPoint',2,1],['_firstScrollPoint',2,0]
    ]) {
      w[helper]({target:points[source].firstElementChild||points[source]});
      await w.__router.whenIdle();checkRoute('/page','page-section',`#${points[target].dataset.scrollId}`);
    }
    w.__historyWrites.length=0;w._scrollToTop();await w.__router.whenIdle();
    checkRoute('/page','page-section');near(w.scrollY,0,'Native scroll-to-top helper did not reach top');
    assert(w.__historyWrites.every(write=>{const hash=new URL(write.url,w.location.origin).hash;return !hash||points.some(point=>'#'+point.dataset.scrollId===hash);}), 'Scroll-to-top wrote a section fragment');
  });
}
