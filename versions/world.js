// Shared by the "worlds": the other versions of the home page.
// The way from one world to the next is always the same yellow dot: on the i of "Nicola", or wherever a world puts it (data-nlr-dot).
// Every element marked data-nlr-name gets the name with that dot; a small link in the corner leads back to the site.
(function () {
  var ALL = ['chase', 'depth', 'doors', 'terminal', 'torch', 'slot', 'scratch', 'breakout', 'orbit', 'popups', 'type', 'claw', 'maze', 'radio', 'vinyl', 'plates', 'justified', 'magazine', 'receipt'];
  var here = (location.pathname.match(/([a-z]+)\.html$/) || [])[1];
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
    '#nlr-w{position:fixed;right:12px;bottom:12px;z-index:9999;padding:9px 13px;border-radius:999px;background:#0d0d0c;color:#f4f2ec;font:500 11px/1 "JetBrains Mono",ui-monospace,monospace;letter-spacing:.06em;text-transform:uppercase;text-decoration:none;box-shadow:0 6px 18px -8px #000a}' +
    '#nlr-w:hover{background:#f4f2ec;color:#0d0d0c}' +
    '#nlr-wipe{position:fixed;inset:0;z-index:10000;pointer-events:none;transition:clip-path .45s cubic-bezier(.5,0,.2,1)}';
  document.head.appendChild(css);

  function place(ii) {
    var cs = getComputedStyle(ii), fs = parseFloat(cs.fontSize), c = document.createElement('canvas').getContext('2d');
    c.font = cs.fontWeight + ' 200px ' + cs.fontFamily;
    var hi = c.measureText('i').actualBoundingBoxAscent / 200, lo = c.measureText('ı').actualBoundingBoxAscent / 200;
    var d = Math.max(8, Math.max(.12, (hi - lo) * .92) * fs), cy = (hi - (hi - lo) * .4) * fs, b = ii.querySelector('.nlr-dot');
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
    [].forEach.call(document.querySelectorAll('[data-nlr-dot]:not([data-nlr-done])'), function (el) { el.setAttribute('data-nlr-done', '1'); el.style.cursor = 'pointer'; el.addEventListener('click', go); });
  }
  window.nlrDress = dress; window.nlrGo = travel; dress();
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(dress);
  addEventListener('resize', dress);

  var back = document.createElement('a'); back.id = 'nlr-w'; back.href = '../index.html'; back.textContent = 'Back to the site'; document.body.appendChild(back);
  addEventListener('pageshow', function () { var w = document.getElementById('nlr-wipe'); if (w) w.remove(); });
})();
