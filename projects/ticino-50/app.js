(function () {
    'use strict';

    var W = 300, H = 110, PAD = { l: 4, r: 4, t: 8, b: 14 };
    var ORDER = ['People', 'Work and money', 'Everyday life', 'Land', 'Politics', 'Climate'];
    var inds = [], byId = {}, year = 1976;

    function $(id) { return document.getElementById(id); }
    function esc(s) {
        return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
        });
    }
    function fmt(v, d) {
        if (v == null || isNaN(v)) return '–';
        return v.toLocaleString('en-GB', { minimumFractionDigits: d, maximumFractionDigits: d });
    }

    // Turn {year: value} into sorted points; for smoothed indicators add the trailing average.
    function prepare(ind) {
        ind.pts = Object.keys(ind.ti).map(function (y) { return { y: +y, v: ind.ti[y] }; })
            .sort(function (a, b) { return a.y - b.y; });
        ind.chPts = ind.ch ? Object.keys(ind.ch).map(function (y) { return { y: +y, v: ind.ch[y] }; })
            .sort(function (a, b) { return a.y - b.y; }) : null;
        if (ind.smooth) {
            ind.avg = [];
            ind.pts.forEach(function (p, i) {
                if (i + 1 < ind.smooth) return;
                var s = 0;
                for (var j = i - ind.smooth + 1; j <= i; j++) s += ind.pts[j].v;
                ind.avg.push({ y: p.y, v: s / ind.smooth });
            });
        }
        ind.cmp = ind.avg || ind.pts;      // the series the numbers are read from
        ind.last = ind.cmp[ind.cmp.length - 1];
        return ind;
    }

    // The point compared with today: for indicators by period (decades), the period that contains the year.
    function pick(ind, y) {
        if (ind.period) {
            var start = Math.floor(y / ind.period) * ind.period;
            var hit = ind.cmp.filter(function (p) { return p.y === start; })[0];
            if (hit) return hit;
        }
        return nearest(ind.cmp, y);
    }
    function yearLabel(ind, p) { return ind.period ? p.y + 's' : String(p.y); }
    function rnd(v, d) { var k = Math.pow(10, d); return Math.round(v * k) / k; }

    function nearest(pts, y) {
        var best = pts[0];
        pts.forEach(function (p) { if (Math.abs(p.y - y) < Math.abs(best.y - y)) best = p; });
        return best;
    }

    function delta(ind, a, b) {
        if (a.y === b.y) return '';
        // Work on the rounded numbers the card shows, so the difference matches them.
        var av = rnd(a.v, ind.decimals), bv = rnd(b.v, ind.decimals);
        var d = bv - av, sign = d > 0 ? '+' : d < 0 ? '−' : '';
        var abs = Math.abs(d);
        if (abs === 0) return 'No change';
        if (ind.unit.indexOf('%') >= 0) return sign + fmt(abs, ind.decimals) + ' points';
        if (ind.unit === '°C' || ind.unit === 'years') return sign + fmt(abs, 1) + ' ' + ind.unit;
        if (ind.kind === 'bar' || av === 0) return sign + fmt(abs, ind.decimals);
        var pct = abs / Math.abs(av) * 100;
        if (pct >= 99.5 && d > 0) return '×' + fmt(bv / av, 1);
        return sign + fmt(pct, pct < 10 ? 1 : 0) + '%';
    }

    function scale(ind) {
        var all = ind.pts.concat(ind.chPts || []);
        var x0 = ind.pts[0].y, x1 = ind.pts[ind.pts.length - 1].y;
        if (ind.chPts) { x0 = Math.min(x0, ind.chPts[0].y); x1 = Math.max(x1, ind.chPts[ind.chPts.length - 1].y); }
        x0 = Math.min(x0, 1971); if (x1 === x0) x1 = x0 + 1;
        var lo = Math.min.apply(null, all.map(function (p) { return p.v; }));
        var hi = Math.max.apply(null, all.map(function (p) { return p.v; }));
        if (ind.kind === 'bar') { lo = Math.min(lo, 0); hi = Math.max(hi, 0); }
        if (hi === lo) { hi += 1; lo -= 1; }
        var pad = (hi - lo) * 0.08;
        if (ind.kind !== 'bar') { lo = lo >= 0 && lo - pad < 0 ? 0 : lo - pad; hi += pad; }
        return {
            x0: x0, x1: x1, lo: lo, hi: hi,
            x: function (y) { return PAD.l + (y - x0) / (x1 - x0) * (W - PAD.l - PAD.r); },
            y: function (v) { return PAD.t + (hi - v) / (hi - lo) * (H - PAD.t - PAD.b); }
        };
    }

    function path(pts, s) {
        return pts.map(function (p, i) { return (i ? 'L' : 'M') + s.x(p.y).toFixed(1) + ' ' + s.y(p.v).toFixed(1); }).join('');
    }

    function chart(ind, then) {
        var s = scale(ind), o = '';
        o += '<line class="axis" x1="' + PAD.l + '" x2="' + (W - PAD.r) + '" y1="' + (H - PAD.b) + '" y2="' + (H - PAD.b) + '"/>';
        if (ind.kind === 'bar') {
            var z = s.y(0), bw = Math.max(1.5, (W - PAD.l - PAD.r) / (s.x1 - s.x0 + 1) - 1.2);
            ind.pts.forEach(function (p) {
                var yv = s.y(p.v);
                o += '<rect class="b' + (p.v < 0 ? ' neg' : '') + '" x="' + (s.x(p.y) - bw / 2).toFixed(1) + '" y="' +
                    Math.min(yv, z).toFixed(1) + '" width="' + bw.toFixed(1) + '" height="' + Math.max(0.5, Math.abs(yv - z)).toFixed(1) + '"/>';
            });
            o += '<line class="zero" x1="' + PAD.l + '" x2="' + (W - PAD.r) + '" y1="' + z.toFixed(1) + '" y2="' + z.toFixed(1) + '"/>';
        } else {
            if (ind.chPts) {
                o += '<path class="chl" d="' + path(ind.chPts, s) + '"/>';
                if (ind.kind === 'dots') ind.chPts.forEach(function (p) {
                    o += '<circle class="dot c" r="2.5" cx="' + s.x(p.y).toFixed(1) + '" cy="' + s.y(p.v).toFixed(1) + '"/>';
                });
            }
            if (ind.avg) {
                o += '<path class="ti thin" d="' + path(ind.pts, s) + '"/><path class="ti" d="' + path(ind.avg, s) + '"/>';
            } else {
                o += '<path class="ti" d="' + path(ind.pts, s) + '"/>';
            }
            if (ind.kind === 'dots') ind.pts.forEach(function (p) {
                o += '<circle class="dot" r="3.5" cx="' + s.x(p.y).toFixed(1) + '" cy="' + s.y(p.v).toFixed(1) + '"/>';
            });
        }
        o += '<line class="vline" x1="' + s.x(then.y).toFixed(1) + '" x2="' + s.x(then.y).toFixed(1) + '" y1="' + PAD.t + '" y2="' + (H - PAD.b) + '"/>';
        o += '<circle class="mark" r="4" cx="' + s.x(then.y).toFixed(1) + '" cy="' + s.y(then.v).toFixed(1) + '"/>';
        o += '<line class="cursor" y1="' + PAD.t + '" y2="' + (H - PAD.b) + '" visibility="hidden"/>';
        o += '<text x="' + PAD.l + '" y="' + (H - 3) + '">' + s.x0 + '</text>';
        o += '<text x="' + (W - PAD.r) + '" y="' + (H - 3) + '" text-anchor="end">' + s.x1 + '</text>';
        return '<svg viewBox="0 0 ' + W + ' ' + H + '" data-id="' + ind.id + '" role="img" aria-label="' +
            esc(ind.title + ', ' + s.x0 + ' to ' + s.x1) + '">' + o + '</svg>';
    }

    function card(ind) {
        var then = pick(ind, year), now = ind.last;
        var far = !ind.period && Math.abs(then.y - year) > 2;   // no figure near the chosen year
        var yr = function (p) {
            return '<span class="yr' + (p === then && far ? ' far' : '') + '">' + yearLabel(ind, p) + '</span>';
        };
        var chNow = '';
        if (ind.chPts) {
            var c = nearest(ind.chPts, now.y);
            chNow = '<span class="ch-now">Switzerland: ' + fmt(c.v, ind.decimals) + '</span>';
        }
        var d = delta(ind, then, now);
        return '<article class="ind"><h3>' + esc(ind.title) + '</h3><p class="unit">' + esc(ind.unit) +
            (ind.smooth ? ', ' + ind.smooth + '-year average' : '') + '</p>' +
            '<div class="nums"><span class="then">' + fmt(then.v, ind.decimals) + yr(then) + '</span><span class="arrow">→</span>' +
            '<span class="now">' + fmt(now.v, ind.decimals) + yr(now) + '</span></div>' +
            '<p class="delta">' + (d ? d + ' since ' + (ind.period ? 'the ' : '') + yearLabel(ind, then) : 'No earlier figure') + (chNow ? ' · ' + chNow : '') + '</p>' +
            chart(ind, then) +
            (ind.note ? '<details class="info"><summary>About this figure</summary><p>' + esc(ind.note) + '</p></details>' : '') + '</article>';
    }

    function render() {
        $('yearOut').textContent = year;
        var sections = ORDER.filter(function (n) { return inds.some(function (i) { return i.section === n; }); });
        inds.forEach(function (i) { if (sections.indexOf(i.section) < 0) sections.push(i.section); });
        $('nav').innerHTML = sections.map(function (name, n) {
            return '<a href="#sec' + n + '">' + esc(name) + ' <small>' + inds.filter(function (i) { return i.section === name; }).length + '</small></a>';
        }).join('');
        $('sections').innerHTML = sections.map(function (name, n) {
            return '<section id="sec' + n + '"><h2><span class="num">' + ('0' + (n + 1)).slice(-2) + '</span> ' + esc(name) + '</h2><div class="grid">' +
                inds.filter(function (i) { return i.section === name; }).map(card).join('') + '</div></section>';
        }).join('');
    }

    // Hover: nearest year on the chart under the pointer.
    var tip = $('tip');
    function hover(e) {
        var svg = e.target.closest && e.target.closest('svg[data-id]');
        if (!svg) { tip.hidden = true; return; }
        var ind = byId[svg.getAttribute('data-id')], s = scale(ind);
        var box = svg.getBoundingClientRect();
        var px = (e.clientX - box.left) / box.width * W;
        var yv = s.x0 + (px - PAD.l) / (W - PAD.l - PAD.r) * (s.x1 - s.x0);
        var p = nearest(ind.pts, yv);
        var cur = svg.querySelector('.cursor');
        cur.setAttribute('x1', s.x(p.y)); cur.setAttribute('x2', s.x(p.y)); cur.setAttribute('visibility', 'visible');
        var html = '<b>' + p.y + '</b><span>Ticino: ' + fmt(p.v, ind.decimals) + '</span>';
        if (ind.avg) {
            var a = ind.avg.filter(function (q) { return q.y === p.y; })[0];
            if (a) html += '<span>' + ind.smooth + '-year average: ' + fmt(a.v, ind.decimals) + '</span>';
        }
        if (ind.chPts) {
            var c = ind.chPts.filter(function (q) { return q.y === p.y; })[0];
            if (c) html += '<span>Switzerland: ' + fmt(c.v, ind.decimals) + '</span>';
        }
        tip.innerHTML = html;
        tip.hidden = false;
        tip.style.left = Math.min(e.clientX + 12, window.innerWidth - tip.offsetWidth - 8) + 'px';
        tip.style.top = (e.clientY + 14) + 'px';
    }
    document.addEventListener('pointermove', hover);
    document.addEventListener('pointerdown', hover);
    document.addEventListener('pointerleave', function () { tip.hidden = true; }, true);
    document.addEventListener('pointerout', function (e) {
        var svg = e.target.closest && e.target.closest('svg[data-id]');
        if (svg && !svg.contains(e.relatedTarget)) {
            svg.querySelector('.cursor').setAttribute('visibility', 'hidden');
            tip.hidden = true;
        }
    });

    $('year').addEventListener('input', function (e) { year = +e.target.value; render(); });

    fetch('data.json').then(function (r) { return r.json(); }).then(function (d) {
        inds = d.indicators.map(prepare);
        inds.forEach(function (i) { byId[i.id] = i; });
        $('count').textContent = inds.length;
        $('updated').textContent = new Date(d.updated + 'T00:00:00')
            .toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
        render();
    }).catch(function (err) {
        $('sections').innerHTML = '<p class="note">Could not load the data: ' + esc(err.message) + '</p>';
    });
})();
