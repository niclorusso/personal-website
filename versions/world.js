// Shared by the "worlds": the other versions of the home page.
// The way from one world to the next is always the same yellow dot: on the i of "Nicola", or wherever a world puts it (data-nlr-dot).
// Every element marked data-nlr-name gets the name with that dot; a small link in the corner leads back to the site.
(function () {
  var ALL = ['chase', 'depth', 'doors', 'terminal', 'torch', 'slot', 'scratch', 'breakout', 'orbit', 'popups', 'type', 'claw', 'maze', 'radio', 'vinyl', 'plates', 'justified', 'magazine', 'receipt'];
  var here = (location.pathname.match(/([a-z]+)\.html$/) || [])[1];
  // remember that this world has been seen: the dot on the site shows the count as an arc
  try { var sn = JSON.parse(localStorage.getItem('nlr-seen') || '[]'); if (ALL.indexOf(here) >= 0 && sn.indexOf(here) < 0) { sn.push(here); localStorage.setItem('nlr-seen', JSON.stringify(sn)); } } catch (e) {}
  function next() {
    var q = []; try { q = JSON.parse(sessionStorage.getItem('nlr-worlds') || '[]'); } catch (e) {}
    q = q.filter(function (w) { return ALL.indexOf(w) >= 0 && w !== here; });
    if (!q.length) { q = ALL.filter(function (w) { return w !== here; }).sort(function () { return Math.random() - .5; }); }
    var w = q.shift(); try { sessionStorage.setItem('nlr-worlds', JSON.stringify(q)); } catch (e) {}
    return w + '.html';
  }
  var css = document.createElement('style');
  css.textContent = '[data-nlr-name]:not([data-nlr-own]){font-family:"Bricolage Grotesque",system-ui,sans-serif;font-weight:800;font-stretch:75%;text-transform:none;letter-spacing:-.022em}' +
    '.nlr-wm{font-size:clamp(34px,3.6vw,50px);line-height:1}' +
    '.nlr-ii{position:relative;display:inline-block}.nlr-bl{display:inline-block;width:0;height:0}' +
    '.nlr-dot{all:unset;cursor:pointer;pointer-events:auto;position:absolute;border-radius:50%;background:#ffe600;box-shadow:var(--nlr-ring,none);transition:transform .25s cubic-bezier(.3,1.8,.4,1)}' +
    '.nlr-dot:hover{transform:scale(1.5)}.nlr-dot:active{transform:scale(.8)}.nlr-dot:focus-visible{outline:2px solid currentColor;outline-offset:4px}' +
    '.nlr-dot::after{content:"";position:absolute;inset:-16px}' +
    /* inside the dot: a pupil that turns towards the pointer, and on the edge an arc for the worlds already seen */
    '.nlr-p{position:absolute;left:50%;top:50%;width:34%;height:34%;margin:-17% 0 0 -17%;border-radius:50%;background:#0d0d0c;pointer-events:none;display:block}' +
    '.nlr-eye::before{content:"";position:absolute;inset:0;border-radius:50%;pointer-events:none;background:conic-gradient(#0d0d0c calc(var(--nlr-seen,0)*1%),transparent 0);-webkit-mask:radial-gradient(circle closest-side,transparent 0 78%,#000 82%);mask:radial-gradient(circle closest-side,transparent 0 78%,#000 82%)}' +
    '#nlr-w{position:fixed;right:12px;bottom:12px;z-index:9999;padding:9px 13px;border-radius:999px;background:#0d0d0c;color:#f4f2ec;font:500 11px/1 "JetBrains Mono",ui-monospace,monospace;letter-spacing:.06em;text-transform:uppercase;text-decoration:none;box-shadow:0 6px 18px -8px #000a}' +
    '#nlr-w:hover{background:#f4f2ec;color:#0d0d0c}' +
    '#nlr-wipe{position:fixed;inset:0;z-index:10000;pointer-events:none;transition:clip-path .45s cubic-bezier(.5,0,.2,1)}';
  document.head.appendChild(css);

  function place(ii) {
    var cs = getComputedStyle(ii), fs = parseFloat(cs.fontSize), c = document.createElement('canvas').getContext('2d');
    c.font = cs.fontWeight + ' 200px ' + cs.fontFamily;
    var hi = c.measureText('i').actualBoundingBoxAscent / 200, lo = c.measureText('ı').actualBoundingBoxAscent / 200;
    var d = Math.max(9, Math.max(.12, (hi - lo) * .92) * fs), cy = (hi - (hi - lo) * .4) * fs, b = ii.querySelector('.nlr-dot');
    b.style.width = b.style.height = d + 'px';
    b.style.left = (ii.offsetWidth - (parseFloat(cs.letterSpacing) || 0)) / 2 - d / 2 + 'px';
    b.style.top = ii.querySelector('.nlr-bl').offsetTop - cy - d / 2 + 'px';
  }
  function go(e) { e.preventDefault(); e.stopPropagation(); travel(e.currentTarget); }
  function travel(b) {
    var r = b.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2, url = next();
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) { location.href = url; return; }
    var w = document.createElement('div'); w.id = 'nlr-wipe'; w.style.background = getComputedStyle(b).backgroundColor; w.style.clipPath = 'circle(0px at ' + x + 'px ' + y + 'px)'; document.body.appendChild(w);
    requestAnimationFrame(function () { requestAnimationFrame(function () { w.style.clipPath = 'circle(' + Math.hypot(innerWidth, innerHeight) + 'px at ' + x + 'px ' + y + 'px)'; }); });
    setTimeout(function () { location.href = url; }, 470);
  }
  function dress() {
    [].forEach.call(document.querySelectorAll('[data-nlr-name]:not([data-nlr-done])'), function (el) {
      el.setAttribute('data-nlr-done', '1'); var tail = el.querySelector('i,small'); // a second line some worlds keep under the name
      var nm = el.getAttribute('data-nlr-name') || 'Nicola Lo Russo', k = nm.indexOf('i'); // the attribute may hold another text, such as one line of the name
      el.innerHTML = nm.slice(0, k) + '<span class="nlr-ii">ı<span class="nlr-bl"></span><button class="nlr-dot" type="button" aria-label="Another version of this site"></button></span>' + nm.slice(k + 1);
      if (tail) el.appendChild(tail);
      el.querySelector('.nlr-dot').addEventListener('click', go);
    });
    [].forEach.call(document.querySelectorAll('.nlr-ii'), place);
    eyes();
    [].forEach.call(document.querySelectorAll('[data-nlr-dot]:not([data-nlr-done])'), function (el) { el.setAttribute('data-nlr-done', '1'); el.style.cursor = 'pointer'; el.addEventListener('click', go); });
  }
  // every door dot is an eye (except those marked data-nlr-plain, such as a lamp)
  var EYES = [], ptr = null, still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  function eyes() {
    [].forEach.call(document.querySelectorAll('.nlr-dot:not(.nlr-eye), [data-nlr-dot]:not(.nlr-eye):not([data-nlr-plain])'), function (el) {
      el.classList.add('nlr-eye'); if (getComputedStyle(el).position === 'static') el.style.position = 'relative';
      var p = document.createElement('i'); p.className = 'nlr-p'; el.appendChild(p); EYES.push({ d: el, i: p, x: 0, y: 0 });
    });
  }
  function aim(e) { ptr = [e.clientX, e.clientY]; }
  addEventListener('pointermove', aim, { passive: true }); addEventListener('pointerdown', aim, { passive: true });
  if (!still) setInterval(function () {
    if (!ptr) return;
    EYES.forEach(function (o) {
      var r = o.d.getBoundingClientRect(); if (!r.width) return;
      var dx = ptr[0] - (r.left + r.width / 2), dy = ptr[1] - (r.top + r.height / 2), dist = Math.hypot(dx, dy) || 1, k = Math.min(1, dist / 140) * o.d.offsetWidth * .15;
      o.x += (dx / dist * k - o.x) * .12; o.y += (dy / dist * k - o.y) * .12; o.i.style.transform = 'translate(' + o.x.toFixed(2) + 'px,' + o.y.toFixed(2) + 'px)';
    });
  }, 33);
  try { var sn2 = JSON.parse(localStorage.getItem('nlr-seen') || '[]'); document.documentElement.style.setProperty('--nlr-seen', (ALL.filter(function (w) { return sn2.indexOf(w) >= 0; }).length / ALL.length * 100).toFixed(1)); } catch (e) {}
  window.nlrDress = dress; window.nlrGo = travel; dress();
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(dress);
  addEventListener('resize', dress);

  var back = document.createElement('a'); back.id = 'nlr-w'; back.href = '../index.html'; back.textContent = 'Back to the site'; document.body.appendChild(back);
  addEventListener('pageshow', function () { var w = document.getElementById('nlr-wipe'); if (w) w.remove(); });
})();
