(function () {
    'use strict';

    var GROUPS = {
        S: 'Social Democrats', 'M-E': 'The Centre', G: 'Greens', RL: 'FDP.The Liberals',
        V: 'Swiss People\'s Party', GL: 'Green Liberals', BD: 'BDP (dissolved)'
    };
    var GROUP_BY_NAME = {
        'FDP-Liberale Fraktion': 'RL', 'Grüne Fraktion': 'G', 'Sozialdemokratische Fraktion': 'S',
        'Fraktion der Schweizerischen Volkspartei': 'V', 'Grünliberale Fraktion': 'GL',
        'Die Mitte-Fraktion. Die Mitte. EVP.': 'M-E'
    };
    var XPARTY = 'Cross-party texts';
    var TYPES = {
        'Interpellation': 'Interpellation', 'Motion': 'Motion', 'Postulat': 'Postulate',
        'Fragestunde. Frage': 'Question time', 'Anfrage': 'Written question',
        'Dringliche Anfrage': 'Urgent question', 'Parlamentarische Initiative': 'Parliamentary initiative',
        'Petition': 'Petition', 'Standesinitiative': 'Cantonal initiative'
    };
    var STATUS = {
        'Erledigt': 'Closed', 'Eingereicht': 'Filed, not yet answered',
        'Stellungnahme zum Vorstoss liegt vor': 'Answered by the Federal Council',
        'Überwiesen an den Bundesrat': 'Referred to the Federal Council'
    };
    var TOPICS = {
        work: 'Work', education: 'Education', public_administration: 'Public administration',
        security_defence: 'Security and defence', media_disinformation: 'Media and disinformation',
        privacy_surveillance: 'Privacy and surveillance', health: 'Health', economy_innovation: 'Economy and innovation',
        energy_infrastructure: 'Energy and infrastructure', data_centres: 'Data centres', copyright_culture: 'Copyright and culture',
        children_youth: 'Children and young people', justice_law: 'Justice and law',
        international: 'International', other: 'Other'
    };
    var RULES = {
        transparency: 'Transparency and labelling', ban_limit: 'Bans and moratoria',
        liability_penalties: 'Liability and penalties', rights_of_people: 'Rights of the people affected',
        provider_duties: 'Duties for providers', oversight_body: 'A supervisory or advisory body',
        general_framework: 'A general legal framework', review: 'Asks whether rules are needed',
        no_rule: 'Another kind of measure'
    };
    var RULE_HINT = {
        rights_of_people: 'Protection against discrimination, consent of authors, human review of decisions, a say for employees.',
        provider_duties: 'Risk assessments, audits, safety standards, age checks, duties of care for platforms.',
        ban_limit: 'Bans or moratoria on facial recognition, autonomous weapons, profiling or single applications.',
        transparency: 'Labelling AI-generated content, public registers of systems, explaining how algorithms choose.',
        liability_penalties: 'Product liability, criminal offences, liability of platforms for content.',
        general_framework: 'A general AI law, taking over European rules, international standards.',
        oversight_body: 'A supervisory authority, a control centre, an ethics commission.'
    };
    var SCOPE_LABEL = { ai: 'items about AI', core: 'items mainly about AI', all: 'items that mention AI' };
    var FC_ACCEPT = { 44: 1, 18: 1, 19: 1 };
    var FC_REJECT = { 45: 1, 20: 1, 21: 1 };
    var FIRST_YEAR = 2015;
    var PAGE = 40;
    var MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

    var rows = [];
    var sel = {};            // dimension -> selected key
    var scope = 'ai';        // ai: AI is a substantial subject; core: the main subject; all: every mention
    var dupOnce = true;      // count identical texts filed by several members once
    var query = '';
    var lang = 'de';
    var shown = PAGE;
    var lastYear = 0, cutoff = '';   // latest year in the data and the month-day of the latest item

    // Each dimension: how to get the key(s) of a row and how to label a key.
    var DIMS = {
        year: { name: 'Year', keys: function (r) { return [r.yearKey]; }, label: function (k) { return k; } },
        group: {
            name: 'Group',
            keys: function (r) { return [dupOnce && r.xparty ? XPARTY : r.groupKey]; },
            label: function (k) { return GROUPS[k] || k; }
        },
        type: { name: 'Type', keys: function (r) { return [r.type_de]; }, label: function (k) { return TYPES[k] || k; } },
        topic: { name: 'Subject', keys: function (r) { return r.topic ? [r.topic] : []; }, label: function (k) { return TOPICS[k] || k; } },
        rule: { name: 'Kind of rule', keys: function (r) { return r.rule ? [r.rule] : []; }, label: function (k) { return RULES[k] || k; } },
        author: { name: 'Author', keys: function (r) { return r.author_kind === 'member' ? [r.author] : []; }, label: function (k) { return k; } }
    };

    function $(id) { return document.getElementById(id); }
    function esc(s) {
        return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
        });
    }
    function pct(v, n) { return n ? Math.round(v / n * 100) : 0; }
    function plural(n, word) { return n + ' ' + word + (n === 1 ? '' : 's'); }
    function link(r) { return 'https://www.parlament.ch/' + lang + '/ratsbetrieb/suche-curia-vista/geschaeft?AffairId=' + r.id; }
    function dayLabel(md) { return (+md.slice(3)) + ' ' + MONTHS[+md.slice(0, 2) - 1]; }

    function prepare(r) {
        var y = r.date ? +r.date.slice(0, 4) : null;
        r.year = y;
        r.yearKey = y === null ? 'n/a' : (y < FIRST_YEAR ? 'Before ' + FIRST_YEAR : String(y));
        if (r.author_kind === 'member') r.groupKey = r.group || 'No group';
        else if (r.author_kind === 'group') r.groupKey = GROUP_BY_NAME[r.author] || r.author;
        else if (r.author_kind === 'committee') r.groupKey = 'Committees';
        else r.groupKey = 'Other';
        r.who = r.author_kind === 'member'
            ? [GROUPS[r.group] || r.party, r.canton].filter(Boolean).join(', ') : '';
        r.hay = [r.title_de, r.title_fr, r.title_it, r.author, r.number, r.summary].join(' ').toLowerCase();
        return r;
    }

    function inScope(r) { return scope === 'all' || (scope === 'core' ? r.relevance === 2 : r.relevance >= 1); }

    // Rows passing every active filter except the one on dimension `skip`.
    // opts.anyScope: ignore the scope control. opts.allCopies: keep copies of identical texts.
    function filtered(skip, opts) {
        opts = opts || {};
        return rows.filter(function (r) {
            if (!opts.anyScope && !inScope(r)) return false;
            if (dupOnce && !opts.allCopies && r.dup_of) return false;
            if (query && r.hay.indexOf(query) < 0) return false;
            for (var d in sel) {
                if (d === skip) continue;
                if (DIMS[d].keys(r).indexOf(sel[d]) < 0) return false;
            }
            return true;
        });
    }

    function count(dim, data) {
        var c = {};
        data.forEach(function (r) {
            DIMS[dim].keys(r).forEach(function (k) { c[k] = (c[k] || 0) + 1; });
        });
        return c;
    }

    function toggle(dim, key) {
        if (sel[dim] === key) delete sel[dim]; else sel[dim] = key;
        shown = PAGE;
        render();
    }

    function barChart(id, dim, opts) {
        opts = opts || {};
        var c = count(dim, filtered(dim));
        var keys = Object.keys(c).sort(function (a, b) { return c[b] - c[a] || a.localeCompare(b); });
        if (opts.last) keys = keys.filter(function (k) { return opts.last.indexOf(k) < 0; })
            .concat(opts.last.filter(function (k) { return c[k]; }));
        if (opts.top) {
            var cut = keys.slice(0, opts.top);
            if (sel[dim] && cut.indexOf(sel[dim]) < 0 && c[sel[dim]]) cut.push(sel[dim]);
            keys = cut;
        }
        var max = Math.max.apply(null, keys.map(function (k) { return c[k]; }).concat([1]));
        $(id).innerHTML = keys.length ? keys.map(function (k) {
            var cls = 'bar' + (sel[dim] && sel[dim] !== k ? ' dim' : '');
            var sub = opts.sub ? opts.sub(k) : '';
            return '<button type="button" class="' + cls + '" data-dim="' + dim + '" data-key="' + esc(k) +
                '" data-tip="' + esc(DIMS[dim].label(k) + ': ' + c[k]) + '" aria-pressed="' + (sel[dim] === k) + '">' +
                '<span class="lab">' + esc(DIMS[dim].label(k)) + (sub ? ' <small>' + esc(sub) + '</small>' : '') + '</span>' +
                '<span class="track"><span class="fill" style="width:' + (c[k] / max * 100).toFixed(1) + '%"></span></span>' +
                '<span class="val">' + c[k] + '</span></button>';
        }).join('') : '<p class="note">No items match the current filters.</p>';
    }

    // Items in a year up to the month-day of the latest item in the data.
    function sameWindow(data, year) {
        return data.filter(function (r) { return r.year === year && r.date.slice(5) <= cutoff; }).length;
    }

    // Columns per year: items in the chosen scope, with passing mentions stacked on top in a lighter tone.
    function yearChart() {
        var c = count('year', filtered('year'));
        var p = scope === 'all' ? {} : count('year', filtered('year', { anyScope: true }).filter(function (r) { return !inScope(r); }));
        var keys = ['Before ' + FIRST_YEAR];
        for (var y = FIRST_YEAR; y <= lastYear; y++) keys.push(String(y));
        var max = Math.max.apply(null, keys.map(function (k) { return (c[k] || 0) + (p[k] || 0); }).concat([1]));
        var restWord = scope === 'core' ? 'not mainly about AI' : 'passing mentions';
        $('chart-year').innerHTML = keys.map(function (k) {
            var v = c[k] || 0, q = p[k] || 0, partial = k === String(lastYear);
            var x = k.indexOf('Before') === 0 ? 'pre-' + String(FIRST_YEAR).slice(2)
                : '<i class="c">' + k.slice(0, 2) + '</i>' + k.slice(2) + (partial ? '*' : '');
            return '<button type="button" class="col' + (sel.year && sel.year !== k ? ' dim' : '') + (partial ? ' partial' : '') +
                '" data-dim="year" data-key="' + esc(k) + '" data-tip="' + esc(k + ': ' + v + (q ? ' + ' + q + ' ' + restWord : '') +
                (partial ? ' (year to date)' : '')) + '" aria-pressed="' + (sel.year === k) + '">' +
                '<span class="v">' + (v || '') + '</span>' +
                (q ? '<span class="fill rest" style="height:' + (q / max * 86).toFixed(1) + '%"></span>' : '') +
                '<span class="fill' + (q ? ' under' : '') + '" style="height:' + (v / max * 86).toFixed(1) + '%"></span>' +
                '<span class="x">' + x + '</span></button>';
        }).join('');
        var data = filtered('year');
        $('yearLegend').innerHTML = '<span><i style="background:var(--bar)"></i>' + esc(SCOPE_LABEL[scope].replace('items', 'Items')) + '</span>' +
            (scope === 'all' ? '' : '<span><i style="background:var(--bar-soft)"></i>' + (scope === 'core' ? 'Other items that mention AI' : 'Items that mention AI only in passing') + '</span>');
        $('yearNote').textContent = '* ' + lastYear + ' is the year to date. From 1 January to ' + dayLabel(cutoff) + ': ' +
            sameWindow(data, lastYear) + ' in ' + lastYear + ', ' + sameWindow(data, lastYear - 1) + ' in ' + (lastYear - 1) + '.';
    }

    // Rows of 100% bars: asks for rules, no clear request, asks to promote.
    function tally(data, dim, keep) {
        var agg = {}, all = { k: 'all', n: 0, reg: 0, none: 0, pro: 0 };
        var put = function (a, r) { a.n++; a[r.state > 0 ? 'reg' : r.state < 0 ? 'pro' : 'none']++; };
        data.forEach(function (r) {
            put(all, r);
            DIMS[dim].keys(r).forEach(function (k) {
                if (keep && !keep(k)) return;
                put(agg[k] || (agg[k] = { k: k, n: 0, reg: 0, none: 0, pro: 0 }), r);
            });
        });
        return { all: all, list: Object.keys(agg).map(function (k) { return agg[k]; }) };
    }
    function stackRows(id, t, dim, min, allLabel) {
        var el = $(id);
        if (!t.all.n) { el.innerHTML = '<p class="note">No scored items for the current filters.</p>'; return; }
        var seg = function (cls, v, n, word) {
            if (!v) return '';
            var w = v / n * 100;
            return '<span class="' + cls + '" style="width:' + w.toFixed(1) + '%" data-tip="' + esc(word + ': ' + v + ' of ' + n + ' items (' + pct(v, n) + '%)') + '">' +
                (w >= 11 ? pct(v, n) + '%' : '') + '</span>';
        };
        var row = function (a, name, clickable) {
            var cls = 'srow' + (clickable && sel[dim] && sel[dim] !== a.k ? ' dim' : '');
            var attrs = clickable ? ' data-dim="' + dim + '" data-key="' + esc(a.k) + '" aria-pressed="' + (sel[dim] === a.k) + '"' : ' disabled';
            return '<button type="button" class="' + cls + '"' + attrs + '><span class="lab">' + esc(name) + '</span>' +
                '<span class="stack">' + seg('reg', a.reg, a.n, 'Asks for rules or safeguards') + seg('none', a.none, a.n, 'No clear request') +
                seg('pro', a.pro, a.n, 'Asks to promote AI or to remove rules') + '</span><span class="val">' + a.n + '</span></button>';
        };
        var list = t.list.filter(function (a) { return a.n >= min; }).sort(function (a, b) { return b.n - a.n; });
        el.innerHTML = '<div class="stacks"><div class="srow head"><span></span><span></span><span class="val">Items</span></div>' +
            row(t.all, allLabel, false) + list.map(function (a) { return row(a, DIMS[dim].label(a.k), true); }).join('') + '</div>';
    }
    function scored(r) { return r.relevance >= 1 && r.state != null && r.stance != null; }

    function askCharts() {
        // By subject: every author, each text once.
        var bySubject = filtered('topic').filter(scored);
        stackRows('chart-ask-topic', tally(bySubject, 'topic'), 'topic', 8, 'All subjects');
        var risk = bySubject.filter(function (r) { return r.stance < 0; }).length, opp = bySubject.filter(function (r) { return r.stance > 0; }).length;
        $('askNote').textContent = bySubject.length ? 'Subjects with at least 8 items. Of these ' + bySubject.length + ' items, ' + pct(risk, bySubject.length) +
            '% present AI mostly as a risk and ' + pct(opp, bySubject.length) + '% mostly as an opportunity. Almost all items that see a risk ask for rules and almost all that see an opportunity ask for promotion, so only one of the two questions is charted.' : '';
        // By group: items filed by members; a text filed by members of several groups counts for each of them.
        var byGroup = filtered('group', { allCopies: true }).filter(function (r) { return scored(r) && r.author_kind === 'member'; });
        var gk = { name: 'Group', keys: function (r) { return [r.groupKey]; }, label: DIMS.group.label };
        var saved = DIMS.group; DIMS.group = gk;
        stackRows('chart-ask-group', tally(byGroup, 'group', function (k) { return GROUPS[k]; }), 'group', 10, 'All members');
        DIMS.group = saved;
    }

    // Main kinds of rule asked for, each with a few examples. Not every item fits one kind, so the rest is only counted.
    function themes() {
        var el = $('chart-rule');
        var data = filtered('rule').filter(function (r) { return r.rule; });
        var by = {};
        data.forEach(function (r) { (by[r.rule] || (by[r.rule] = [])).push(r); });
        var keys = Object.keys(RULE_HINT).filter(function (k) { return by[k]; })
            .sort(function (a, b) { return by[b].length - by[a].length; }).slice(0, 6);
        if (!keys.length) { el.innerHTML = '<p class="note">No items asking for rules match the current filters.</p>'; return; }
        var shownN = 0;
        var html = keys.map(function (k) {
            var items = by[k].slice().sort(function (a, b) { return b.state - a.state || (b.date || '').localeCompare(a.date || ''); });
            shownN += items.length;
            var examples = items.filter(function (r, i) {
                // Skip examples that repeat an earlier one (same request filed twice in slightly different words).
                var key = (r.summary || '').slice(0, 28);
                return !items.slice(0, i).some(function (q) { return (q.summary || '').slice(0, 28) === key; });
            }).slice(0, 3);
            return '<div class="theme' + (sel.rule && sel.rule !== k ? ' dim' : '') + '"><button type="button" class="th" data-dim="rule" data-key="' + k +
                '" aria-pressed="' + (sel.rule === k) + '"><b>' + esc(RULES[k]) + '</b><span>' + plural(items.length, 'item') + '</span></button>' +
                '<p class="hint">' + esc(RULE_HINT[k]) + '</p><ul>' + examples.map(function (r) {
                    return '<li><a href="' + link(r) + '" target="_blank" rel="noopener noreferrer">' + esc(r.summary) + '</a> <small>' + esc(r.number) + '</small></li>';
                }).join('') + '</ul></div>';
        }).join('');
        var rest = data.length - shownN;
        el.innerHTML = '<div class="themes">' + html + '</div>' + (rest > 0 ? '<p class="note">The other ' + rest +
            (rest === 1 ? ' item asks' : ' items ask') + ' only whether rules are needed, or for another kind of measure such as a report or a tax.</p>' : '');
    }

    function fcCounts(data) {
        var t = { Motion: { a: 0, r: 0, o: 0, p: 0 }, Postulat: { a: 0, r: 0, o: 0, p: 0 } };
        data.forEach(function (r) {
            if (!t[r.type_de]) return;
            t[r.type_de][FC_ACCEPT[r.fc_code] ? 'a' : FC_REJECT[r.fc_code] ? 'r' : r.fc_code == null ? 'p' : 'o']++;
        });
        t.a = t.Motion.a + t.Postulat.a; t.r = t.Motion.r + t.Postulat.r;
        return t;
    }
    function fcChart() {
        var t = fcCounts(filtered(null)), a = t.a, rj = t.r, tot = a + rj;
        if (!tot) { $('chart-fc').innerHTML = '<p class="note">No position yet for the current filters.</p>'; return; }
        var row = function (name, o) {
            var n = o.a + o.r;
            return '<tr><td>' + name + '</td><td>' + o.a + '</td><td>' + o.r + '</td><td>' +
                (n ? pct(o.r, n) + '%' : '–') + '</td><td>' + o.o + '</td><td>' + o.p + '</td></tr>';
        };
        $('chart-fc').innerHTML =
            '<div class="split" role="img" aria-label="Accept ' + a + ', reject ' + rj + '">' +
            '<span class="a" style="width:' + (a / tot * 100).toFixed(1) + '%" data-tip="Accept: ' + a + '"></span>' +
            '<span class="r" style="width:' + (rj / tot * 100).toFixed(1) + '%" data-tip="Reject: ' + rj + '"></span></div>' +
            '<p class="legend"><span><i style="background:var(--bar)"></i>Accept: ' + a + ' (' + pct(a, tot) + '%)</span>' +
            '<span><i style="background:var(--bar-alt)"></i>Reject: ' + rj + ' (' + pct(rj, tot) + '%)</span></p>' +
            '<div class="scroll"><table class="fc-table"><thead><tr><th></th><th>Accept</th><th>Reject</th><th>Share rejected</th><th>Other</th><th>No position yet</th></tr></thead><tbody>' +
            row('Motions', t.Motion) + row('Postulates', t.Postulat) + '</tbody></table></div>';
    }

    function itemHtml(r) {
        var title = r['title_' + lang] || r.title_de || r.title_fr || '';
        var who = r.author || (r.author_kind === 'committee' ? 'Committee' : r.author_kind === 'group' ? 'Parliamentary group' : 'Author not published');
        return '<div class="item"><span class="meta">' + esc(r.date || '') + ' · ' + esc(r.number) + ' · ' +
            esc(TYPES[r.type_de] || r.type_de) + '</span>' +
            '<a class="t" href="' + link(r) + '" target="_blank" rel="noopener noreferrer">' + esc(r.summary || title || '(no title)') + '</a>' +
            (r.summary && title ? '<span class="orig" lang="' + lang + '">' + esc(title) + '</span>' : '') +
            '<span class="who">' + esc(who) + (r.who ? ' (' + esc(r.who) + ')' : '') +
            ' · ' + esc(STATUS[r.status_de] || 'In progress') + '</span></div>';
    }
    function list() {
        var data = filtered(null).slice().sort(function (a, b) { return (b.date || '').localeCompare(a.date || ''); });
        $('listCount').textContent = plural(data.length, 'item');
        $('list').innerHTML = data.slice(0, shown).map(itemHtml).join('');
        $('more').hidden = data.length <= shown;
    }

    // Data centres: shown apart, whatever the scope and the filters.
    function dataCentres() {
        var dc = rows.filter(function (r) { return r.topic === 'data_centres' && !r.dup_of; })
            .sort(function (a, b) { return (b.date || '').localeCompare(a.date || ''); });
        if (!dc.length) { $('dc').innerHTML = ''; return; }
        var inLast = dc.filter(function (r) { return r.year === lastYear; }).length;
        var noAi = dc.filter(function (r) { return r.relevance === 0; }).length;
        $('dcNote').textContent = plural(dc.length, 'item') + ' since 2023 have data centres as their main subject, ' + inLast + ' of them in ' + lastYear +
            '. ' + noAi + ' of the ' + dc.length + ' do not link them to AI: they are about electricity, water, noise and permits. They are not counted in the charts above unless "Every mention" is selected.';
        $('dc').innerHTML = dc.map(itemHtml).join('');
    }

    function tiles() {
        var data = filtered(null);
        var authors = {};
        data.forEach(function (r) { if (r.author_kind === 'member') authors[r.author] = 1; });
        var t = fcCounts(data), tot = t.a + t.r;
        var cells = [
            [data.length, SCOPE_LABEL[scope], ''],
            [sameWindow(data, lastYear), 'filed in ' + lastYear + ' so far', sameWindow(data, lastYear - 1) + ' in the same period of ' + (lastYear - 1)],
            [Object.keys(authors).length, 'members of parliament', ''],
            [tot ? pct(t.r, tot) + '%' : '–', 'of motions and postulates: the Federal Council proposes to reject', tot ? t.r + ' of ' + tot : '']
        ];
        $('tiles').innerHTML = cells.map(function (x) {
            return '<div class="tile"><b>' + x[0] + '</b><span>' + esc(x[1]) + '</span>' + (x[2] ? '<small>' + esc(x[2]) + '</small>' : '') + '</div>';
        }).join('');
    }

    // The main results, computed once on the items about AI with identical texts counted once.
    function findings() {
        var base = rows.filter(function (r) { return r.relevance >= 1 && !r.dup_of; });
        var members = rows.filter(function (r) { return r.relevance >= 1 && r.author_kind === 'member'; });
        var mem1 = members.filter(function (r) { return !r.dup_of; });
        var reg = mem1.filter(function (r) { return r.state > 0; }).length, pro = mem1.filter(function (r) { return r.state < 0; }).length;
        var byTopic = tally(base, 'topic').list.filter(function (a) { return a.n >= 8; });
        var names = function (list) {
            var n = list.map(function (a) { return TOPICS[a.k].toLowerCase(); });
            return n.length > 1 ? n.slice(0, -1).join(', ') + ' and ' + n[n.length - 1] : n[0] || '';
        };
        var high = byTopic.filter(function (a) { return a.reg / a.n >= 0.9; }).sort(function (a, b) { return b.n - a.n; });
        var promo = byTopic.filter(function (a) { return a.pro / a.n >= 0.5; });
        var greens = members.filter(function (r) { return r.group === 'G'; });
        var gReg = greens.filter(function (r) { return r.state > 0; }).length;
        var t = fcCounts(base), tot = t.a + t.r;
        var items = [
            'Between 1 January and ' + dayLabel(cutoff) + ' ' + lastYear + ', ' + sameWindow(base, lastYear) + ' items about AI were filed, against ' +
                sameWindow(base, lastYear - 1) + ' in the same period of ' + (lastYear - 1) + '.',
            pct(reg, mem1.length) + '% of the items filed by members ask for rules or safeguards; ' + pct(pro, mem1.length) + '% ask to promote AI or to remove rules.',
            'The subject matters more than the party. On ' + names(high) + ', nine items in ten or more ask for rules' +
                (promo.length ? '; on ' + names(promo) + ', most ask to promote AI.' : '.'),
            'Among the groups, the Greens ask for rules most often (' + pct(gReg, greens.length) + '% of their items). The differences between the other groups are small compared with their margin of error.',
            'The Federal Council proposes to reject ' + pct(t.r, tot) + '% of the motions and postulates it has answered (' + t.r + ' of ' + tot + ').'
        ];
        $('findings').innerHTML = items.map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('');
    }

    function chips() {
        var keys = Object.keys(sel);
        $('chips').innerHTML = keys.map(function (d) {
            return '<button type="button" class="chip" data-dim="' + d + '" data-key="' + esc(sel[d]) + '">' +
                esc(DIMS[d].name + ': ' + DIMS[d].label(sel[d])) + '</button>';
        }).join('');
        $('reset').hidden = !(keys.length || scope !== 'ai' || !dupOnce || query);
    }

    function render() {
        tiles();
        chips();
        yearChart();
        askCharts();
        themes();
        barChart('chart-topic', 'topic');
        barChart('chart-group', 'group', { last: [XPARTY, 'Committees', 'Other'] });
        barChart('chart-author', 'author', { top: 12, sub: function (k) { return authorSub[k] || ''; } });
        barChart('chart-type', 'type');
        fcChart();
        list();
    }

    var authorSub = {};

    function setSeg(id, attr, value) {
        Array.prototype.forEach.call($(id).children, function (x) { x.classList.toggle('on', x.getAttribute(attr) === value); });
    }

    document.addEventListener('click', function (e) {
        $('tip').hidden = true;
        var b = e.target.closest('[data-dim]');
        if (b) toggle(b.getAttribute('data-dim'), b.getAttribute('data-key'));
    });
    $('reset').addEventListener('click', function () {
        sel = {}; scope = 'ai'; dupOnce = true; query = ''; shown = PAGE;
        setSeg('scope', 'data-scope', 'ai'); $('dupOnce').checked = true; $('search').value = '';
        render();
    });
    $('scope').addEventListener('click', function (e) {
        var b = e.target.closest('button[data-scope]');
        if (!b) return;
        scope = b.getAttribute('data-scope'); shown = PAGE;
        setSeg('scope', 'data-scope', scope);
        render();
    });
    $('dupOnce').addEventListener('change', function (e) { dupOnce = e.target.checked; shown = PAGE; render(); });
    $('search').addEventListener('input', function (e) { query = e.target.value.trim().toLowerCase(); shown = PAGE; render(); });
    $('more').addEventListener('click', function () { shown += PAGE; list(); });
    $('lang').addEventListener('click', function (e) {
        var b = e.target.closest('button[data-lang]');
        if (!b) return;
        lang = b.getAttribute('data-lang');
        setSeg('lang', 'data-lang', lang);
        themes(); list(); dataCentres();
    });

    // Tooltip
    var tip = $('tip');
    document.addEventListener('mousemove', function (e) {
        var t = e.target.closest && e.target.closest('[data-tip]');
        if (!t) { tip.hidden = true; return; }
        tip.textContent = t.getAttribute('data-tip');
        tip.hidden = false;
        var x = Math.min(e.clientX + 12, window.innerWidth - tip.offsetWidth - 8);
        tip.style.left = x + 'px';
        tip.style.top = (e.clientY + 14) + 'px';
    });

    fetch('data.json').then(function (r) { return r.json(); }).then(function (d) {
        rows = d.business.map(prepare);
        var byId = {};
        rows.forEach(function (r) { byId[r.id] = r; });
        // A text filed by members of several groups is shown once, as a cross-party text.
        var groupsOf = {};
        rows.forEach(function (r) {
            var root = r.dup_of || r.id;
            (groupsOf[root] || (groupsOf[root] = {}))[r.groupKey] = 1;
        });
        rows.forEach(function (r) {
            if (!r.dup_of && Object.keys(groupsOf[r.id]).length > 1) r.xparty = true;
            if (r.author_kind === 'member') authorSub[r.author] = r.who;
        });
        lastYear = Math.max.apply(null, rows.map(function (r) { return r.year || 0; }));
        cutoff = rows.filter(function (r) { return r.year === lastYear; })
            .map(function (r) { return r.date.slice(5); }).sort().pop();
        var u = new Date(d.updated + 'T00:00:00');
        $('updated').textContent = u.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
        findings();
        dataCentres();
        render();
    }).catch(function (err) {
        $('tiles').innerHTML = '<p class="note">Could not load the data: ' + esc(err.message) + '</p>';
    });
})();
