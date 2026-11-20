// The map's languages: Italian (the source), German, French, English.
//
// Which one: ?lingua=it|de|fr|en, else the visitor's own choice (saved on this device), else the first of the browser's languages
// that is one of the four, else Italian. index.html's <head> works it out before anything else (window.__lang) and asks for the
// files at once (window.__pre.ui, .text), so that they come in with world.json; this module waits for the interface strings
// (top-level await: whatever imports it can use t() at once) and offers the content strings as `textReady`.
//   i18n/ui.<lang>.json   interface strings, grouped by area ("card.indicazioni"); a value {one, other} has plural forms
//   i18n/<lang>.json      content strings (places.json, itinerari.json; pipeline/22_i18n_extract.py); none for Italian
//
//   t(key, vars)        an interface string; {name} is replaced by vars.name; vars.n picks the plural form
//   tc(key, italian)    a content string, or the Italian text when it has no translation
//   num(v, d)           a number with the language's decimal sign (d decimals; none given: as many as it has, up to 3)
//   date(ymd)           "2026-11-19" as the language writes a date (19.11.2026, 19/11/2026)
//   dt(ms, opts)        Intl.DateTimeFormat in Bellinzona's time zone, in the language's locale
//   switchLang(code)    keeps the choice and opens the same page (view, card, itinerary, moment) in that language
export const LANGS = ['it', 'de', 'fr', 'en'];
export const NAMES = { it: 'Italiano', de: 'Deutsch', fr: 'Français', en: 'English' };
const LOCALE = { it: 'it-CH', de: 'de-CH', fr: 'fr-CH', en: 'en-GB' };
// numbers: it-CH writes 4.5 in Intl's data, while this map has always written 4,5 (as the Canton does): Italian numbers keep the comma
const NUMLOC = { it: 'it-IT', de: 'de-CH', fr: 'fr-CH', en: 'en-GB' };
const SPEECH = { it: 'it-IT', de: 'de-DE', fr: 'fr-FR', en: 'en-GB' };
const V = '20261121b', KEY = 'bz-lingua';

const pick = s => { s = String(s || '').toLowerCase().slice(0, 2); return LANGS.includes(s) ? s : ''; };
function detect() {                                       // the same rule as index.html's <head>, for a page without it
  let saved = ''; try { saved = pick(localStorage.getItem(KEY)); } catch { /* no storage */ }
  const nav = typeof navigator !== 'undefined' ? navigator : {}, auto = pick([...(nav.languages || []), nav.language].find(pick)) || 'it';
  const url = pick(typeof location !== 'undefined' ? new URLSearchParams(location.search).get('lingua') : '');
  return { lang: url || saved || auto, auto, src: url ? 'url' : saved ? 'saved' : 'auto' };
}
const L = (typeof window !== 'undefined' && window.__lang) || detect();
export const lang = L.lang, auto = L.auto, locale = LOCALE[lang], speechLang = SPEECH[lang];

const getJ = u => fetch(u, { priority: 'high' }).then(r => (r.ok ? r.json() : null)).catch(() => null);
const pre = (typeof window !== 'undefined' && window.__pre) || {};
const again = (p, u) => Promise.resolve(p).then(d => d || getJ(u));   // a file that did not come is asked for once more
let UI = (await again(pre.ui || getJ(`i18n/ui.${lang}.json?v=${V}`), `i18n/ui.${lang}.json?v=${V}`)) || null;
if (!UI && lang !== 'it') UI = await getJ(`i18n/ui.it.json?v=${V}`);   // still nothing: the Italian one
UI = UI || {};
let TX = {};
export const textReady = (lang === 'it' ? Promise.resolve({}) : again(pre.text || getJ(`i18n/${lang}.json?v=${V}`), `i18n/${lang}.json?v=${V}`))
  .then(d => { TX = d && typeof d === 'object' ? d : {}; return TX; }).catch(() => TX);

const PR = new Intl.PluralRules(lang === 'it' ? 'it' : locale), missed = new Set();
export const has = key => typeof UI[key] === 'string' || (UI[key] && typeof UI[key] === 'object');
export function t(key, vars) {
  let s = UI[key];
  if (s && typeof s === 'object') s = s[vars && typeof vars.n === 'number' ? PR.select(vars.n) : 'other'] ?? s.other;
  if (typeof s !== 'string') { if (!missed.has(key)) { missed.add(key); console.warn('i18n: no text for', key); } return ''; }
  return vars ? s.replace(/\{(\w+)\}/g, (m, k) => (vars[k] != null ? String(vars[k]) : '')) : s;
}
// an interface string that may be absent: the given text then (a data value with an Italian original, e.g. an era's note)
export const tu = (key, fallback) => (has(key) ? t(key) : fallback);
export const tc = (key, fallback) => { const v = TX[key]; return typeof v === 'string' && v.trim() ? v : fallback; };

const NF = new Map(), DF = new Map();
export function num(v, d) {
  const k = d ?? -1;
  if (!NF.has(k)) NF.set(k, new Intl.NumberFormat(NUMLOC[lang], { useGrouping: false, minimumFractionDigits: d ?? 0, maximumFractionDigits: d ?? 3 }));
  return NF.get(k).format(v);
}
export const int = v => new Intl.NumberFormat(NUMLOC[lang]).format(Math.round(v));   // with the thousands sign (13’895)
export function dt(ms, opts) {
  const k = JSON.stringify(opts);
  if (!DF.has(k)) DF.set(k, new Intl.DateTimeFormat(locale, { timeZone: 'Europe/Zurich', ...opts }));
  return DF.get(k).format(new Date(ms));
}
export const hm = ms => dt(ms, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
export function date(ymd) {
  const m = /^(\d{4})-(\d\d)-(\d\d)/.exec(ymd || '');
  if (!m) return String(ymd || '');
  return new Intl.DateTimeFormat(locale, { timeZone: 'UTC', day: '2-digit', month: '2-digit', year: 'numeric' }).format(Date.UTC(+m[1], m[2] - 1, +m[3]));
}

// the language in a link that is built from scratch (an event's link, the embed code): only when the page carries one
export const linkLang = () => { const q = pick(new URLSearchParams(location.search).get('lingua')); return q ? 'lingua=' + q : ''; };

// another language: the choice is kept on this device; the link says it only when it differs from what this browser would
// pick on its own (so that a shared link carries a language its sharer chose, and nothing otherwise). The page opens again on the
// same view, card or itinerary (all in the address); window.__beforeLang adds what is only in the page (another moment, an era)
export function switchLang(code) {
  if (!LANGS.includes(code)) return;
  try { localStorage.setItem(KEY, code); } catch { /* no storage: the link alone carries it */ }
  const u = new URL(location.href);
  u.searchParams.delete('lingua');
  if (code !== auto) u.searchParams.set('lingua', code);
  try { if (typeof window.__beforeLang === 'function') window.__beforeLang(u); } catch { /* the view alone */ }
  const href = u.href.replace(/%2C/gi, ',').replace(/%3A/gi, ':');
  if (href === location.href) location.reload(); else location.replace(href);
}

if (typeof window !== 'undefined') window.__t = t;
