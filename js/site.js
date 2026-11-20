/**
 * Behaviour of the public pages.
 * - the dot of the "i" in the name changes the two colours of the site, at random (on every page)
 * - home: one list of posts and projects; rows and the About stamp can be dragged, the dot can be thrown,
 *   the name can be rewritten. All of it stays in the visitor's browser (localStorage keys "nlr-*").
 * - "Plain version" turns colour, figures and motion off.
 * Everything is inside one function so that no name leaks into the scripts of the posts.
 */
(function () {
  'use strict';
  var F = window.NLR_F || {}, root = document.documentElement, rs = root.style;
  var still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  var COLOURS = [['#0b3fd0', '#ffe600'], ['#ef4a23', '#111111'], ['#00754f', '#ffd23f'], ['#111111', '#ff4fa3'], ['#ff4fa3', '#0b3fd0'], ['#5b3fa8', '#ff8a3d'], ['#ffe600', '#ef4a23'], ['#111111', '#f4efe4']];
  var INK = '#0d0d0c';
  var $ = function (s, el) { return (el || document).querySelector(s); }, $$ = function (s, el) { return Array.prototype.slice.call((el || document).querySelectorAll(s)); };
  function lum(h) { var n = parseInt(h.slice(1), 16); return (.2126 * (n >> 16) + .7152 * (n >> 8 & 255) + .0722 * (n & 255)) / 255; }
  function on(c) { return lum(c) > .5 ? '#111111' : '#f4efe4'; }
  var store = {
    get: function (k) { try { return JSON.parse(localStorage.getItem('nlr-' + k)); } catch (e) { return null; } },
    set: function (k, v) { try { localStorage.setItem('nlr-' + k, JSON.stringify(v)); } catch (e) {} },
    del: function (k) { try { localStorage.removeItem('nlr-' + k); } catch (e) {} }
  };
  var K = 0; store.del('colour'); // every page opens in blue and yellow: the colour a visitor picks lasts until the page is left
  var PLAIN = root.classList.contains('n-plain');

  // ---- the dot of the "i": placed from the metrics of the font in use
  function idot(host) {
    var cs = getComputedStyle(host), fs = parseFloat(cs.fontSize), c = document.createElement('canvas').getContext('2d');
    c.font = cs.fontWeight + ' 200px ' + cs.fontFamily;
    var hi = c.measureText('i').actualBoundingBoxAscent / 200, lo = c.measureText('ı').actualBoundingBoxAscent / 200;
    var d = Math.max(.12, (hi - lo) * .92) * fs, cy = (hi - (hi - lo) * .4) * fs, b = $('.n-dot', host);
    b.style.width = b.style.height = d + 'px';
    b.style.left = (host.offsetWidth - (parseFloat(cs.letterSpacing) || 0)) / 2 - d / 2 + 'px';
    b.style.top = $('.n-bl', host).offsetTop - cy - d / 2 + 'px';
  }
  function placeDots() { $$('.n-ii').forEach(idot); }

  // ---- figures: still, they run only while the pointer is on them (or on their row)
  var plates = [];
  function draw(p) {
    var w = p.cv.clientWidth, h = p.cv.clientHeight, d = Math.min(window.devicePixelRatio || 1, 2);
    if (!w || !h) return;
    if (p.cv.width !== Math.round(w * d) || p.cv.height !== Math.round(h * d)) { p.cv.width = Math.round(w * d); p.cv.height = Math.round(h * d); }
    var c = p.cv.getContext('2d'), vw = 170, k = w / vw, m = 12;
    c.setTransform(d * k, 0, 0, d * k, 0, 0); c.clearRect(0, 0, vw, h / k); c.translate(m, m * .75); c.lineWidth = 1.3; c.fillStyle = c.strokeStyle = p.a;
    (F[p.fig] || F.line)(c, vw - 2 * m, h / k - 1.5 * m, p.t, p.a, p.b);
  }
  function plate(tile, i, host) {
    var p = { tile: tile, host: host || tile, cv: $('canvas', tile), fig: tile.getAttribute('data-fig'), t: i * 2.3 + 3, hover: false, ti: i % 3 };
    p.host.addEventListener('pointerenter', function () { p.hover = true; });
    p.host.addEventListener('pointerleave', function () { p.hover = false; });
    plates.push(p); return p;
  }
  var lastT = Date.now();
  setInterval(function () {
    var now = Date.now(), dt = Math.min(.05, (now - lastT) / 1000); lastT = now;
    if (still || PLAIN) return;
    for (var i = 0; i < plates.length; i++) if (plates[i].hover) { plates[i].t += dt * 1.5; draw(plates[i]); }
  }, 33);

  // ---- colours
  function tones() {
    var A = COLOURS[K][0], B = COLOURS[K][1];
    return [[A, on(A), B === on(A) ? '#8a8880' : B], [A === '#111111' ? B : '#111111', A === '#111111' ? on(B) : '#f4efe4', A === '#111111' ? '#111111' : B], ['#e4dfd3', lum(A) < .6 ? A : INK, lum(A) < .6 ? INK : A]];
  }
  function band(k) {
    var A = COLOURS[k][0], B = COLOURS[k][1];
    rs.setProperty('--n-A', A); rs.setProperty('--n-onA', on(A)); rs.setProperty('--n-B', B); rs.setProperty('--n-onB', on(B));
    root.style.removeProperty('--n-link'); document.body.style.setProperty('--n-link', lum(A) < .75 ? A : (lum(B) < .75 ? B : INK));
  }
  function paintTiles() {
    var T = tones();
    plates.forEach(function (p) {
      var t = T[p.ti]; p.host.style.setProperty('--n-p', t[0]); p.host.style.setProperty('--n-a', t[1]); p.tile.style.setProperty('--n-p', t[0]); p.bg = t[0]; p.a = t[1]; p.b = t[2]; draw(p);
    });
  }
  function paint(k, later) { K = k; if (!later) band(k); paintTiles(); }
  function another() { var k; do { k = Math.floor(Math.random() * COLOURS.length); } while (k === K); return k; }

  band(K);

  // ---- the dot of the i is a door: it leads to another version of the home page (see versions/world.js)
  var WORLDS = ['chase', 'depth', 'doors', 'terminal', 'torch', 'slot', 'scratch', 'breakout', 'orbit', 'popups', 'type', 'claw', 'maze', 'radio', 'vinyl', 'plates', 'justified', 'magazine', 'receipt'];
  var BASE = (function () { var el = document.querySelector('script[src*="js/site.js"]'); return el ? el.getAttribute('src').replace(/js\/site\.js.*$/, '') : ''; })();
  function travel(from) {
    var q; try { q = JSON.parse(sessionStorage.getItem('nlr-worlds') || '[]'); } catch (e) { q = []; }
    q = (q || []).filter(function (w) { return WORLDS.indexOf(w) >= 0; });
    if (!q.length) q = WORLDS.slice().sort(function () { return Math.random() - .5; });
    var url = BASE + 'versions/' + q.shift() + '.html'; try { sessionStorage.setItem('nlr-worlds', JSON.stringify(q)); } catch (e) {}
    if (still) { location.href = url; return; }
    var r = from.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2, w = document.createElement('div');
    w.className = 'n-door'; w.style.clipPath = 'circle(0px at ' + x + 'px ' + y + 'px)'; document.body.appendChild(w);
    requestAnimationFrame(function () { requestAnimationFrame(function () { w.style.clipPath = 'circle(' + Math.hypot(innerWidth, innerHeight) + 'px at ' + x + 'px ' + y + 'px)'; }); });
    setTimeout(function () { location.href = url; }, 470);
  }
  addEventListener('pageshow', function () { $$('.n-door').forEach(function (w) { w.remove(); }); });

  // ---- plain version
  var pb = $('#n-plain'), onPlain = [];
  function plain(v) {
    PLAIN = v; v ? store.set('plain', 1) : store.del('plain'); root.classList.toggle('n-plain', v);
    if (pb) pb.textContent = v ? 'Turn the colours on' : 'Plain version';
    onPlain.forEach(function (f) { f(v); }); placeDots(); if (!v) requestAnimationFrame(function () { plates.forEach(draw); });
  }
  // the head script stores "1" as plain text
  try { if (localStorage.getItem('nlr-plain') === '1') PLAIN = true; } catch (e) {}
  if (pb) pb.addEventListener('click', function () { plain(!PLAIN); });

  var main = $('#n-main');
  if (main) home(); else inner();
  plain(PLAIN);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(placeDots);
  var rt; addEventListener('resize', function () { clearTimeout(rt); rt = setTimeout(function () { placeDots(); plates.forEach(draw); }, 100); });

  // =====================================================================================
  function inner() {
    $$('.n-tile[data-fig]').forEach(function (t, i) { var p = plate(t, i, t.closest('.n-row')); if (t.closest('.n-band')) p.ti = 1; });
    paintTiles();
    $$('.n-dot').forEach(function (d) { d.addEventListener('click', function (e) { e.preventDefault(); e.stopPropagation(); if (!PLAIN) travel(d); }); });
    // table of contents from the h2 of the article; the copy of the title inside older posts is removed
    var art = $('.n-article'), toc = $('.n-toc');
    if (art) {
      var norm = function (s) { return s.replace(/\s+/g, ' ').trim().toLowerCase(); }, h1 = $('h1', art);
      if (h1) h1.remove(); // the band already carries the title, and a page has one h1
      var hs = $$('h2', art).filter(function (h) { return !h.closest('.playground,.riddle-box,.voting-box'); });
      if (toc && hs.length > 1) {
        var html = '<b>In this post</b>';
        hs.forEach(function (h, i) { if (!h.id) h.id = 's-' + (i + 1); html += '<a href="#' + h.id + '"></a>'; });
        toc.innerHTML = html; $$('a', toc).forEach(function (a, i) { a.textContent = hs[i].textContent; });
      }
      var bar = $('.n-progress'), links = toc ? $$('a', toc) : [];
      addEventListener('scroll', function () {
        var h = document.documentElement; if (bar) bar.style.transform = 'scaleX(' + Math.min(1, h.scrollTop / (h.scrollHeight - h.clientHeight || 1)) + ')';
        var cur = -1; hs.forEach(function (el, i) { if (el.getBoundingClientRect().top < innerHeight * .35) cur = i; });
        links.forEach(function (a, i) { a.classList.toggle('n-on', i === cur); });
      }, { passive: true });
    }
  }

  // =====================================================================================
  function home() {
    var top_ = $('.n-top'), nameEl = $('.n-name'), II = $('.n-ii', nameEl), dotEl = $('.n-dot', nameEl), stamp = $('.n-stamp'), resetB = $('#n-reset'), chips = $('#n-chips');
    var cat = main.getAttribute('data-cat') === 'projects' ? 'projects' : 'posts', dragged = false, thrown = false, phys = null, busy = false;
    // the list as written by the server; the rows are kept and only moved around
    var ITEMS = $$('.n-row', main).map(function (a) { return { el: a, t: $('h3', a).textContent, d: a.getAttribute('data-date') || '', cat: a.getAttribute('data-cat'), meta: $('.n-mono', a) }; });
    ITEMS.forEach(function (it) { it.label = it.meta.textContent; });
    function byDate(x, y) { return y.d.localeCompare(x.d); }
    // an order saved by the visitor is used only if it still lists exactly the posts of today
    var ord = store.get('order');
    if (ord && (ord.length !== ITEMS.length || ITEMS.some(function (it) { return ord.indexOf(it.t) < 0; }))) { store.del('order'); ord = null; }
    if (ord) ITEMS.sort(function (x, y) { return ord.indexOf(x.t) - ord.indexOf(y.t); });
    var projEl = $('.n-projects', main), PROJ = $$('.n-proj', main);
    PROJ.forEach(function (el, i) { plate($('.n-tile', el), i, el).t = 3; });
    function changed() { resetB.hidden = !(store.get('order') || store.get('stamp') || store.get('name')); }

    var list = $('.n-list', main);
    ITEMS.forEach(function (it, i) {
      var p = plate($('.n-tile', it.el), i, it.el); it.plate = p; it.el.draggable = false; dragRow(it);
      it.el.addEventListener('click', function (e) {
        if (dragged) { e.preventDefault(); return; }
        if (PLAIN || still || e.metaKey || e.ctrlKey || e.shiftKey || it.el.target === '_blank') return;
        e.preventDefault(); var r = it.el.getBoundingClientRect(), f = document.createElement('div'); f.className = 'n-fly';
        f.style.cssText = 'left:' + r.left + 'px;top:' + r.top + 'px;width:' + r.width + 'px;height:' + r.height + 'px;background:' + p.bg; document.body.appendChild(f);
        requestAnimationFrame(function () { requestAnimationFrame(function () { f.style.cssText = 'left:0;top:0;width:100vw;height:100vh;background:' + p.bg; }); });
        setTimeout(function () { location.href = it.el.href; }, 520);
      });
    });
    addEventListener('pageshow', function () { $$('.n-fly').forEach(function (f) { f.remove(); }); });

    function render() {
      var vis = ITEMS;
      list.hidden = cat !== 'posts'; if (projEl) projEl.hidden = cat !== 'projects';
      ITEMS.forEach(function (it) { it.el.classList.remove('n-lead', 'n-drag', 'n-over'); it.el.style.transform = ''; list.appendChild(it.el); });
      vis.forEach(function (it, i) { it.plate.ti = (i + Math.floor((i + 1) / 3)) % 3; it.meta.textContent = (i === 0 ? 'Latest · ' : '') + it.label; });
      if (vis[0]) vis[0].el.classList.add('n-lead');
      rows();
      $$('button', chips).forEach(function (b) { b.classList.toggle('n-on', b.getAttribute('data-c') === cat); });
      paintTiles();
    }
    // the list is read down each column: the number of rows follows from the number of columns
    function rows() { var cols = parseInt(getComputedStyle(root).getPropertyValue('--n-cols')) || 3; rs.setProperty('--n-rows', Math.max(cols > 1 ? 6 : 1, Math.ceil((ITEMS.length + 1) / cols))); }
    addEventListener('resize', rows);
    [['posts', 'Posts', ITEMS.length], ['projects', 'Projects', PROJ.length]].forEach(function (c) {
      var n = c[2]; if (!n || !PROJ.length) return;
      var b = document.createElement('button'); b.type = 'button'; b.setAttribute('data-c', c[0]); b.textContent = c[1]; var x = document.createElement('b'); x.textContent = n; b.appendChild(x);
      b.addEventListener('click', function () { cat = c[0]; render(); }); chips.appendChild(b);
    });

    // ---- rows can be dragged onto another row (mouse only: on touch it would fight with scrolling)
    function dragRow(it) {
      var a = it.el;
      a.addEventListener('pointerdown', function (e) {
        if (PLAIN || e.pointerType !== 'mouse' || e.button) return;
        var sx = e.clientX, sy = e.clientY, active = false, over = null;
        function under(ev) { var t = document.elementFromPoint(ev.clientX, ev.clientY); return t && t.closest('.n-row'); }
        function mv(ev) {
          var dx = ev.clientX - sx, dy = ev.clientY - sy; if (!active && Math.hypot(dx, dy) < 8) return;
          active = true; a.classList.add('n-drag'); a.style.transform = 'translate(' + dx + 'px,' + dy + 'px) rotate(-1.2deg)';
          var t = under(ev); if (t !== over) { if (over) over.classList.remove('n-over'); over = t; if (over) over.classList.add('n-over'); }
        }
        function up(ev) {
          removeEventListener('pointermove', mv); if (!active) return;
          dragged = true; setTimeout(function () { dragged = false; }, 60);
          var t = under(ev), target = t && ITEMS.filter(function (x) { return x.el === t; })[0];
          if (target && target !== it) { ITEMS.splice(ITEMS.indexOf(it), 1); ITEMS.splice(ITEMS.indexOf(target), 0, it); store.set('order', ITEMS.map(function (x) { return x.t; })); changed(); }
          render();
        }
        addEventListener('pointermove', mv); addEventListener('pointerup', up, { once: true });
      });
    }

    // ---- the dot: a click changes the colours (the new one spreads from the dot); it can also be grabbed and thrown
    function setTf(x, y) { dotEl.style.transform = 'translate(' + x.toFixed(1) + 'px,' + y.toFixed(1) + 'px)'; }
    function rest() { dotEl.style.transform = ''; setTimeout(function () { dotEl.style.transition = ''; }, 50); }
    function stopPhys() { if (phys) { clearInterval(phys); phys = null; } }
    function goHome(x, y, ms, lift) {
      var t0 = Date.now();
      phys = setInterval(function () {
        var u = Math.min(1, (Date.now() - t0) / ms), e = u * u * (3 - 2 * u); setTf(x * (1 - e), y * (1 - e) - lift * 4 * u * (1 - u));
        if (u >= 1) { stopPhys(); rest(); }
      }, 16);
    }
    dotEl.addEventListener('click', function () { if (busy || thrown || PLAIN) return; busy = true; travel(dotEl); setTimeout(function () { busy = false; }, 1500); });
    function launch(x, y, vx, vy) {
      dotEl.style.transition = 'none'; dotEl.style.transform = ''; var r = dotEl.getBoundingClientRect(); setTf(x, y);
      var minX = -r.left, maxX = innerWidth - r.right, minY = -r.top, maxY = innerHeight - r.bottom, last = Date.now(), calm = 0, t0 = last;
      phys = setInterval(function () {
        var now = Date.now(), dt = Math.min(.04, (now - last) / 1000); last = now; vy += 2600 * dt; x += vx * dt; y += vy * dt;
        if (x < minX) { x = minX; vx = -vx * .75; } if (x > maxX) { x = maxX; vx = -vx * .75; } if (y < minY) { y = minY; vy = -vy * .75; }
        if (y > maxY) { y = maxY; vy = -vy * .72; vx *= .88; if (Math.abs(vy) < 160) calm++; }
        setTf(x, y);
        if (calm > 2 || now - t0 > 7000) { stopPhys(); goHome(x, y, 550, y > 60 ? 70 : 0); }
      }, 16);
    }
    dotEl.addEventListener('pointerdown', function (e) {
      if (PLAIN) return; stopPhys();
      var m = new DOMMatrix(getComputedStyle(dotEl).transform), ox = m.m41, oy = m.m42, sx = e.clientX, sy = e.clientY, active = false, hist = [];
      try { dotEl.setPointerCapture(e.pointerId); } catch (_) {}
      function mv(ev) {
        var dx = ev.clientX - sx, dy = ev.clientY - sy; if (!active && Math.hypot(dx, dy) < 6) return;
        active = true; dotEl.style.transition = 'none'; setTf(ox + dx, oy + dy); hist.push([Date.now(), ox + dx, oy + dy]); if (hist.length > 6) hist.shift();
      }
      function up() {
        dotEl.removeEventListener('pointermove', mv); if (!active) return;
        thrown = true; setTimeout(function () { thrown = false; }, 80);
        var a = hist[0], b = hist[hist.length - 1], dt = Math.max(.016, (b[0] - a[0]) / 1000); launch(b[1], b[2], (b[1] - a[1]) / dt, (b[2] - a[2]) / dt);
      }
      dotEl.addEventListener('pointermove', mv); dotEl.addEventListener('pointerup', up, { once: true });
    });

    // ---- on arrival the name is there without the dot of the i; a moment later the dot pops in
    function bounce() {
      dotEl.style.visibility = ''; if (still || PLAIN || phys) return;
      idot(II); dotEl.classList.add('n-pop'); setTimeout(function () { dotEl.classList.remove('n-pop'); }, 700);
    }
    if (!still && !PLAIN) dotEl.style.visibility = 'hidden';
    var started = false, start = function () { if (started) return; started = true; bounce(); };
    (document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve()).then(function () { setTimeout(start, 900); }); setTimeout(start, 2500);

    // ---- the stamp can be moved; a plain click still opens About
    var sp = store.get('stamp'), stampMoved = false; if (sp) stamp.style.translate = sp[0] + 'px ' + sp[1] + 'px'; stamp.draggable = false;
    stamp.addEventListener('pointerdown', function (e) {
      if (e.button) return; var b = store.get('stamp') || [0, 0], sx = e.clientX, sy = e.clientY, active = false, x = b[0], y = b[1];
      function mv(ev) { var dx = ev.clientX - sx, dy = ev.clientY - sy; if (!active && Math.hypot(dx, dy) < 6) return; active = true; x = b[0] + dx; y = b[1] + dy; stamp.style.translate = x + 'px ' + y + 'px'; }
      function up() { removeEventListener('pointermove', mv); if (!active) return; stampMoved = true; setTimeout(function () { stampMoved = false; }, 80); store.set('stamp', [x, y]); changed(); }
      addEventListener('pointermove', mv); addEventListener('pointerup', up, { once: true });
    });
    stamp.addEventListener('click', function (e) { if (stampMoved) e.preventDefault(); });

    // ---- the name can be rewritten (double-click). The dot goes on its first i, or after the name if there is none
    var NAME = 'Nicola Lo Russo';
    function setName(str) {
      str = (str || '').trim().slice(0, 26) || NAME; var k = str.indexOf('i'); II.remove(); nameEl.textContent = '';
      if (k >= 0) { nameEl.appendChild(document.createTextNode(str.slice(0, k))); nameEl.appendChild(II); nameEl.appendChild(document.createTextNode(str.slice(k + 1))); II.style.color = ''; }
      else { nameEl.appendChild(document.createTextNode(str)); nameEl.appendChild(II); II.style.color = 'transparent'; }
      nameEl.setAttribute('aria-label', str); nameEl.style.fontSize = '';
      if (!PLAIN) { var avail = nameEl.parentElement.clientWidth - 140, rg = document.createRange(); rg.selectNodeContents(nameEl); var wd = rg.getBoundingClientRect().width; if (wd > avail) nameEl.style.fontSize = parseFloat(getComputedStyle(nameEl).fontSize) * avail / wd + 'px'; }
      idot(II);
    }
    nameEl.title = 'Double-click to rename';
    nameEl.addEventListener('dblclick', function (e) {
      if (PLAIN || e.target === dotEl) return;
      var inp = document.createElement('input'); inp.className = 'n-nameedit n-d'; inp.value = nameEl.getAttribute('aria-label'); inp.maxLength = 26; inp.setAttribute('aria-label', 'Name');
      nameEl.style.display = 'none'; nameEl.parentNode.insertBefore(inp, nameEl.nextSibling); inp.focus(); inp.select(); var done = false;
      function end(ok) {
        if (done) return; done = true; var v = inp.value.trim(); inp.remove(); nameEl.style.display = '';
        if (ok && v) { if (v === NAME) store.del('name'); else store.set('name', v); setName(v); changed(); } else idot(II);
      }
      inp.addEventListener('keydown', function (ev) { if (ev.key === 'Enter') end(true); if (ev.key === 'Escape') end(false); ev.stopPropagation(); });
      inp.addEventListener('blur', function () { end(true); });
    });
    if (store.get('name')) setName(store.get('name'));

    // ---- everything goes back in place without reloading; the dot travels home from wherever it is at that moment
    resetB.addEventListener('click', function () {
      stopPhys(); var from = dotEl.getBoundingClientRect();
      ['order', 'stamp', 'name'].forEach(store.del);
      ITEMS.sort(byDate); cat = main.getAttribute('data-cat') || 'all'; stamp.style.translate = ''; dotEl.style.transition = 'none'; dotEl.style.transform = '';
      setName(NAME); K = 0; band(0); render(); changed();
      var to = dotEl.getBoundingClientRect(), x = from.left - to.left, y = from.top - to.top;
      if (still || Math.hypot(x, y) < 2) { dotEl.style.transition = ''; return; }
      setTf(x, y); goHome(x, y, 650, Math.min(120, 40 + Math.hypot(x, y) * .25));
    });

    onPlain.push(function (v) { stopPhys(); dotEl.style.transform = ''; if (v || started) dotEl.style.visibility = ''; nameEl.style.fontSize = ''; if (!v && store.get('name')) setName(store.get('name')); });
    render(); changed();
    // for tests
    window.NLR = { throwDot: function (vx, vy) { launch(0, 0, vx, vy); }, setName: setName };
  }
})();
