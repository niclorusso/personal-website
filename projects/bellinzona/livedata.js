// Live data, defensively: one helper for every real-time source the map reads from the visitor's browser.
// The rule of the house: better no data than wrong data. A source that is slow, down, changed its format, returns
// values out of range or goes stale simply reads as null, and whatever depends on it draws nothing.
//
//   const wind = source({ id: 'vento', url: 'https://…', every: 10 * MIN, maxAge: 40 * MIN,
//                         parse: txt => ({ v: …, at: ms }),      // throw or return null when the answer is not what was expected
//                         ok: d => d.v >= 0 && d.v < 250 });     // plausibility: out of range = no data
//   wind.value()   -> the parsed value, or null (never stale, never out of range, never while showing another moment)
//   info({ id: 'vento', label: 'Vento', text: () => wind.value() && '…', source: 'MeteoSvizzera', url: '…' })   // a row of the "Adesso" panel
//
// Polling runs only while the tab is visible and the map shows the present (window.__now, set by index.html); it has a
// timeout, backs off after failures (2, 4, 8, 15 min; an hour after five in a row) and never throws into the page.

export const MIN = 60000, HOUR = 60 * MIN;
const nowLive = () => { try { return !window.__now || Math.abs(window.__now() - Date.now()) < 45 * MIN; } catch { return true; } };
const era = () => document.body.classList.contains('era');
export const sources = new Map(), rows = new Map();

export function source(o) {
  const s = { id: o.id, data: null, got: 0, fails: 0, next: 0, busy: false, state: 'attesa', err: '' };
  const every = Math.max(30000, o.every || 10 * MIN), maxAge = o.maxAge || 3 * every, timeout = o.timeout || 15000;
  const live = () => nowLive() && !era() && (!o.live || o.live());
  const fail = why => { s.fails++; s.err = String(why).slice(0, 120); s.state = 'errore'; s.next = Date.now() + (s.fails >= 5 ? HOUR : [2, 4, 8, 15][Math.min(3, s.fails - 1)] * MIN); };
  async function poll() {
    if (s.busy || document.hidden || !live() || Date.now() < s.next) return;
    s.busy = true;
    const ac = new AbortController(), t = setTimeout(() => ac.abort(), timeout);
    try {
      const url = typeof o.url === 'function' ? o.url() : o.url;
      if (!url) { s.next = Date.now() + every; return; }
      const r = await fetch(url, { signal: ac.signal, cache: 'no-store', referrerPolicy: 'no-referrer', credentials: 'omit' });
      if (r.status === 429) { fail('429'); s.next = Math.max(s.next, Date.now() + 5 * MIN); return; }
      if (!r.ok) { fail('http ' + r.status); return; }
      const body = o.text ? await r.text() : await r.json();
      const d = o.parse ? o.parse(body) : body;
      if (d == null || (o.ok && !o.ok(d))) { fail('risposta non valida'); return; }
      // the measurement's own time, when the source gives one (d.at, ms): an old reading served fresh is still old
      const at = Number.isFinite(d.at) ? d.at : Date.now();
      if (at > Date.now() + 10 * MIN || Date.now() - at > maxAge) { fail('dato vecchio'); return; }
      s.data = d; s.got = at; s.fails = 0; s.err = ''; s.state = 'ok'; s.next = Date.now() + every;
      if (o.onData) try { o.onData(d); } catch { /* a consumer's mistake is not the source's failure */ }
    } catch (e) { fail(e && e.name === 'AbortError' ? 'timeout' : e); }
    finally { clearTimeout(t); s.busy = false; }
  }
  s.value = () => (s.data && live() && Date.now() - s.got <= maxAge ? s.data : null);
  s.age = () => (s.got ? Date.now() - s.got : Infinity);
  s.poll = poll;
  s.stop = () => { clearInterval(s.timer); sources.delete(o.id); };
  s.timer = setInterval(poll, 15000);
  addEventListener('visibilitychange', () => { if (!document.hidden) poll(); });
  setTimeout(poll, o.delay || 1500);                       // not in the way of the first picture
  sources.set(o.id, s);
  return s;
}

// a row of the "Adesso a Bellinzona" panel: shown only while text() returns a string
export function info(r) { rows.set(r.id, { order: 100, ...r }); }
export function infoRows() {
  const out = [];
  for (const r of [...rows.values()].sort((a, b) => a.order - b.order)) {
    let t = null; try { t = r.text(); } catch { t = null; }
    if (typeof t === 'string' && t && !/\b(undefined|NaN|null)\b/.test(t)) out.push({ id: r.id, label: r.label, text: t, source: r.source || '', url: r.url || '', group: r.group || '' });
  }
  return out;
}
if (typeof window !== 'undefined') window.__livedata = { sources, rows, infoRows };
