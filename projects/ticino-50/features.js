(function () {
    'use strict';
    var by = {}, plots = [];
    function $(id) { return document.getElementById(id); }
    function fmt(v, d) { return v.toLocaleString('en-GB', { minimumFractionDigits: d || 0, maximumFractionDigits: d || 0 }); }
    function pts(o) { return Object.keys(o).map(function (y) { return { y: +y, v: o[y] }; }).sort(function (a, b) { return a.y - b.y; }); }
    function last(p) { return p[p.length - 1]; }
    function at(p, y) { return p.filter(function (q) { return q.y === y; })[0]; }
    function avg(p, n) {
        var out = [];
        p.forEach(function (q, i) {
            if (i + 1 < n) return;
            var s = 0; for (var j = i - n + 1; j <= i; j++) s += p[j].v;
            out.push({ y: q.y, v: s / n });
        });
        return out;
    }
    function ticks(lo, hi) {
        var span = hi - lo, step = Math.pow(10, Math.floor(Math.log10(span / 3)));
        [5, 2, 1].forEach(function (m) { if (span / (step * m) >= 3) step *= m, m = 0; });
        var out = [];
        for (var t = Math.ceil(lo / step) * step; t <= hi + 1e-9; t += step) out.push(+t.toFixed(6));
        return out;
    }

    // series: [{pts, cls, name, thin: pts}], opts: {d, lo, hi, x0, x1, unit, area}
    function draw(el, series, o) {
        var W = Math.max(260, Math.round(el.clientWidth)), H = o.h || Math.round(Math.min(300, Math.max(190, W * 0.5)));
        var P = { l: 44, r: o.names === false ? 58 : 112, t: 12, b: 22 };
        var all = [];
        series.forEach(function (s) { all = all.concat(s.pts, s.thin || []); });
        var x0 = o.x0 || Math.min.apply(null, all.map(function (p) { return p.y; }));
        var x1 = o.x1 || Math.max.apply(null, all.map(function (p) { return p.y; }));
        var lo = o.lo != null ? o.lo : Math.min(0, Math.min.apply(null, all.map(function (p) { return p.v; })));
        var hi = o.hi != null ? o.hi : Math.max.apply(null, all.map(function (p) { return p.v; })) * 1.06;
        var X = function (y) { return P.l + (y - x0) / (x1 - x0) * (W - P.l - P.r); };
        var Y = function (v) { return P.t + (hi - v) / (hi - lo) * (H - P.t - P.b); };
        var path = function (p) { return p.map(function (q, i) { return (i ? 'L' : 'M') + X(q.y).toFixed(1) + ' ' + Y(q.v).toFixed(1); }).join(''); };
        var s = '';
        ticks(lo, hi).forEach(function (t) {
            s += '<line class="' + (t === 0 ? 'g0' : 'g') + '" x1="' + P.l + '" x2="' + (W - P.r) + '" y1="' + Y(t).toFixed(1) + '" y2="' + Y(t).toFixed(1) + '"/>';
            s += '<text text-anchor="end" x="' + (P.l - 8) + '" y="' + (Y(t) + 4).toFixed(1) + '">' + fmt(t, o.td || 0) + (o.unit || '') + '</text>';
        });
        var dec = (W - P.l - P.r) / (x1 - x0) * 10 < 44 ? 20 : 10;
        for (var y = Math.ceil(x0 / dec) * dec; y <= x1; y += dec) {
            s += '<text x="' + X(y).toFixed(1) + '" y="' + (H - 5) + '" text-anchor="middle">' + y + '</text>';
        }
        if (o.area) {
            var a = series[0].pts;
            s += '<path class="area" d="' + path(a) + 'L' + X(last(a).y).toFixed(1) + ' ' + Y(lo).toFixed(1) + 'L' + X(a[0].y).toFixed(1) + ' ' + Y(lo).toFixed(1) + 'Z"/>';
        }
        series.slice().reverse().forEach(function (q) {
            if (q.thin) s += '<path class="l thin ' + q.cls + '" d="' + path(q.thin) + '"/>';
            s += '<path class="l ' + q.cls + '" d="' + path(q.pts) + '"/>';
        });
        // End labels, pushed apart when they would overlap.
        var labs = series.map(function (q) { var e = last(q.pts); return { q: q, e: e, y: Y(e.v) }; }).sort(function (a, b) { return a.y - b.y; });
        for (var i = 1; i < labs.length; i++) if (labs[i].y - labs[i - 1].y < 15) {
            var mid = (labs[i].y + labs[i - 1].y) / 2; labs[i - 1].y = mid - 7.5; labs[i].y = mid + 7.5;
        }
        labs.forEach(function (L) {
            s += '<circle class="end ' + L.q.cls + '" r="4.5" cx="' + X(L.e.y).toFixed(1) + '" cy="' + Y(L.e.v).toFixed(1) + '"/>';
            s += '<text class="lab' + (L.q.cls === 'ch' ? ' dim' : '') + '" x="' + (X(L.e.y) + 9).toFixed(1) + '" y="' + (L.y + 4).toFixed(1) + '">' +
                fmt(L.e.v, o.d || 0) + (o.unit || '') + (o.names === false ? '' : ' ' + L.q.short) + '</text>';
        });
        s += '<line class="cur" y1="' + P.t + '" y2="' + (H - P.b) + '" visibility="hidden"/>';
        el.innerHTML = '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + (o.label || '') + '">' + s + '</svg>';
        var svg = el.firstChild, cur = svg.querySelector('.cur'), tip = $('tip');
        var base = series[0].thin || series[0].pts;
        svg.onpointermove = svg.onpointerdown = function (e) {
            e.stopPropagation();
            var b = svg.getBoundingClientRect(), yr = x0 + ((e.clientX - b.left) / b.width * W - P.l) / (W - P.l - P.r) * (x1 - x0);
            var p = base[0]; base.forEach(function (q) { if (Math.abs(q.y - yr) < Math.abs(p.y - yr)) p = q; });
            cur.setAttribute('x1', X(p.y)); cur.setAttribute('x2', X(p.y)); cur.setAttribute('visibility', 'visible');
            var h = '<b>' + p.y + '</b>';
            series.forEach(function (q) {
                var v = at(q.pts, p.y), t = q.thin && at(q.thin, p.y);
                if (t) h += '<span>' + q.name + ', that year: ' + fmt(t.v, o.d || 0) + (o.unit || '') + '</span>';
                if (v) h += '<span>' + q.name + (q.thin ? ', 10-year average' : '') + ': ' + fmt(v.v, o.d || 0) + (o.unit || '') + '</span>';
            });
            tip.innerHTML = h; tip.hidden = false;
            tip.style.left = Math.min(e.clientX + 12, window.innerWidth - tip.offsetWidth - 8) + 'px';
            tip.style.top = (e.clientY + 14) + 'px';
        };
        svg.onpointerleave = function () { cur.setAttribute('visibility', 'hidden'); tip.hidden = true; };
    }

    function S(id, which, cls, name, short) { return { pts: pts(by[id][which]), cls: cls, name: name, short: short == null ? name : short }; }
    function fig(v, label, cls) { return '<div class="fig ' + (cls || '') + '"><b>' + v + '</b><span>' + label + '</span></div>'; }
    var KEY = '<p class="key"><span><i></i>Ticino</span><span><i class="ch"></i>Switzerland</span></p>';

    function build() {
        var F = [];
        var w = S('wage', 'ti', 'ti', 'Ticino'), wc = S('wage', 'ch', 'ch', 'Switzerland'), gap = pts(by.wage_gap.ti);
        F.push({
            h: 'The median wage is ' + fmt(last(gap).v, 0) + '% of the Swiss one',
            figs: fig(fmt(last(w.pts).v), 'francs a month in Ticino, ' + last(w.pts).y) + fig(fmt(last(wc.pts).v), 'in Switzerland', 'ch'),
            txt: 'In ' + gap[0].y + ' the median full-time wage in Ticino was ' + fmt(gap[0].v, 0) + '% of the Swiss median. Since then it rose by ' +
                fmt((last(w.pts).v / w.pts[0].v - 1) * 100, 0) + '% in Ticino and by ' + fmt((last(wc.pts).v / wc.pts[0].v - 1) * 100, 0) + '% in Switzerland.',
            src: 'Federal Statistical Office, wage structure survey', key: KEY,
            plots: [{ s: [w, wc], o: { lo: 0, names: true } }]
        });
        var cb = S('cross_border', 'ti', 'ti', 'Cross-border workers', ''), cj = pts(by.cross_border_jobs.ti), cjc = pts(by.cross_border_jobs.ch);
        F.push({
            h: 'Cross-border workers went from ' + fmt(Math.round(cb.pts[0].v / 100) * 100) + ' to ' + fmt(Math.round(last(cb.pts).v / 100) * 100),
            figs: fig(fmt(last(cj).v, 0), 'per 100 jobs in Ticino, ' + last(cj).y) + fig(fmt(last(cjc).v, 0), 'in Switzerland', 'ch'),
            txt: 'Between ' + cb.pts[0].y + ' and ' + last(cb.pts).y + ' the cross-border workers in Ticino grew ' + fmt(last(cb.pts).v / cb.pts[0].v, 1) +
                ' times. In ' + cj[0].y + ' they were ' + fmt(cj[0].v, 0) + ' for every 100 jobs in the canton.',
            src: 'Federal Statistical Office',
            plots: [{ s: [cb], o: { lo: 0, area: true, names: false } }]
        });
        var bi = S('births', 'ti', 'ti', 'Births'), de = S('deaths', 'ti', 'warm', 'Deaths'), since = null;
        bi.pts.slice().reverse().some(function (p) { var d = at(de.pts, p.y); if (d && d.v > p.v) { since = p.y; return false; } return true; });
        var ma = pts(by.median_age.ti), mac = pts(by.median_age.ch);
        F.push({
            h: 'More deaths than births every year since ' + since,
            figs: fig(fmt(last(bi.pts).v), 'births in ' + last(bi.pts).y) + fig(fmt(last(de.pts).v), 'deaths'),
            txt: 'In ' + bi.pts[0].y + ' there were ' + fmt(bi.pts[0].v) + ' births and ' + fmt(de.pts[0].v) + ' deaths. The median age is ' + fmt(last(ma).v, 1) +
                ' years, against ' + fmt(last(mac).v, 1) + ' in Switzerland; in ' + ma[0].y + ' it was ' + fmt(ma[0].v, 1) + '.',
            src: 'Federal Statistical Office', key: '<p class="key"><span><i></i>Births</span><span><i class="warm"></i>Deaths</span></p>',
            plots: [{ s: [bi, de], o: { lo: 0 } }]
        });
        var hd = pts(by.hot_days.ti), ha = avg(hd, by.hot_days.smooth || 10), first = at(ha, 1976) || ha[0];
        F.push({
            h: fmt(last(ha).v, 0) + ' days a year at 30 °C or more in Lugano',
            figs: fig(fmt(last(ha).v, 0), 'days a year, ' + (last(ha).y - 9) + '–' + last(ha).y) + fig(fmt(first.v, 0), (first.y - 9) + '–' + first.y, 'ch'),
            txt: 'Averages over ten years, because single summers vary a lot. In the same periods the nights that stay at 20 °C or more went from ' +
                fmt(at(avg(pts(by.tropical_nights.ti), 10), first.y).v, 0) + ' to ' + fmt(last(avg(pts(by.tropical_nights.ti), 10)).v, 0) + ' a year.',
            src: 'MeteoSwiss, Lugano station', key: '<p class="key"><span><i></i>10-year average</span><span><i style="opacity:.35;border-top-width:1px"></i>Single years</span></p>',
            plots: [{ s: [{ pts: ha, thin: hd, cls: 'ti', name: 'Days', short: '' }], o: { lo: 0, names: false } }]
        });

        var reg = S('unemp_registered', 'ti', 'ti', 'Ticino'), regC = S('unemp_registered', 'ch', 'ch', 'Switzerland');
        var ilo = S('unemp_ilo', 'ti', 'ti', 'Ticino'), iloC = S('unemp_ilo', 'ch', 'ch', 'Switzerland');
        var yr = last(ilo.pts).y;
        F.push({
            h: 'Unemployment is ' + fmt(last(reg.pts).v, 1) + '% by one count and ' + fmt(last(ilo.pts).v, 1) + '% by the other',
            figs: fig(fmt(last(reg.pts).v, 1) + '%', 'registered at an employment office, ' + yr) + fig(fmt(last(ilo.pts).v, 1) + '%', 'in the labour force survey, ' + yr),
            txt: 'Switzerland measures unemployment in two ways. The employment offices count the people registered with them: ' + fmt(last(reg.pts).v, 1) + '% in Ticino, ' + fmt(last(regC.pts).v, 1) + '% in Switzerland. ' +
                'The labour force survey also counts those who look for a job without being registered: ' + fmt(last(ilo.pts).v, 1) + '% against ' + fmt(last(iloC.pts).v, 1) + '%.',
            src: 'SECO, Federal Statistical Office', key: KEY,
            plots: [{ t: 'Registered', s: [reg, regC], o: { d: 1, unit: '%', hi: 8.6, x0: 1975, x1: 2025, h: 170 } },
                    { t: 'Labour force survey, from 2002', s: [ilo, iloC], o: { d: 1, unit: '%', hi: 8.6, x0: 1975, x1: 2025, h: 170 } }]
        });
        plots = [];
        $('features').innerHTML = F.map(function (f, i) {
            return '<article class="feat"><div><p class="n"><b>0' + (i + 1) + '</b> / 05</p><h2>' + f.h + '</h2><div class="figs">' + f.figs + '</div><p class="txt">' + f.txt + '</p></div>' +
                '<div>' + (f.key || '') + '<div class="plots' + (f.two ? ' two' : '') + '">' + f.plots.map(function (p, j) {
                    plots.push({ id: 'p' + i + '_' + j, p: p });
                    return '<div class="plot">' + (p.t ? '<h4>' + p.t + '</h4>' : '') + '<div id="p' + i + '_' + j + '"></div></div>';
                }).join('') + '</div><p class="src">Source: ' + f.src + '</p></div></article>';
        }).join('');
        paint();
    }
    function paint() { plots.forEach(function (q) { draw($(q.id), q.p.s, q.p.o); }); }
    var t; window.addEventListener('resize', function () { clearTimeout(t); t = setTimeout(paint, 120); });

    fetch('data.json').then(function (r) { return r.json(); }).then(function (d) {
        d.indicators.forEach(function (i) { by[i.id] = i; });
        build();
    });
})();
