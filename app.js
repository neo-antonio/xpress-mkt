/* Xpress Marketing: one view of ad channels and data tools.
   Meta Ads data comes from a Google Sheet through the Apps Script in Code.gs (Integrations).
   Other channels use manual daily entry until their connections are built. */
(function () {
"use strict";

/* ---------- config ---------- */
var CH = [["google","Google Ads"],["meta","Meta Ads"],["tiktok","TikTok Ads"],["pokkt","Pokkt"],["applovin","AppLovin"],["apple","Apple Ads"]];
var DT = [["appsflyer","AppsFlyer"],["amplitude","Amplitude"],["databricks","Databricks"],["segment","Segment"]];
var NAME = {}; CH.concat(DT).forEach(function (x) { NAME[x[0]] = x[1]; }); NAME.webengage = "WebEngage";
var TM = [["regs","Account registrations a month","","","≥"],["cpi","CPI (cost per install)","₱","","≤"],["cpr","CPR (cost per registration)","₱","","≤"],["cpa","CPA (cost per activated Passenger)","₱","","≤"],["drv","Cost per activated Driver","₱","","≤"],["c1","Click to install rate","","%","≥"],["c2","Install to registration rate","","%","≥"],["c3","Registration to activation rate","","%","≥"],["cvr","Overall conversion rate (install to activation)","","%","≥"],["d7","D7 retention","","%","≥"],["roas","ROAS","","x","≥"],["fraud","Fraud rate (flagged installs)","","%","≤"],["tests","Test velocity (tests read out a month)","","","≥"],["content","Content output vs calendar","","%","≥"]];
var TD = {regs:50000,cpi:40,cpr:70,cpa:500,c1:null,c2:null,c3:null,cvr:null,drv:null,d7:null,roas:null,fraud:null,tests:null,content:null};
var KPIS = [["CPI",["appsflyer"],"cpi","cpi"],["CPR (cost per registration)",["appsflyer","databricks"],"cpr","cpr"],["CPA (cost per activated Passenger)",["appsflyer","databricks"],"cpa","cpa"],["Cost per activated Driver",["appsflyer","databricks"],"drv"],["D7 retention",["amplitude"],"d7"],["ROAS / payback",["databricks"],"roas"],["Fraud rate (flagged installs)",["appsflyer"],"fraud"],["Test velocity (tests read out a month)",[],"tests"],["Content output vs calendar",[],"content"]];
var ROLE = {appsflyer:"Attribution and install data. Source of truth for CPI and fraud (Protect360).",amplitude:"Product analytics in place of GA4. Source for D7 retention and user journeys rebuilt from events.",databricks:"Data warehouse queried with SQL. Source for registrations, activations, ROAS and payback.",segment:"Event hub. App events (organic and non-organic) land here, then fan out to every other tool."};
var RANGES = [["last7","Last 7 days"],["last14","Last 14 days"],["last30","Last 30 days"],["last90","Last 90 days"],["thisMonth","This month"],["lastMonth","Last month"],["all","All time"],["custom","Custom"]];
var CMPS = [["off","No comparison"],["prev","Previous period"],["wow","Week over week"],["mom","Month over month"],["custom","Custom period"]];
var ORDER = ["spend","impressions","reach","freq","cpm","clicks","installs","regs","acts","value","cpc","cpi","cpr","cpa","roas","ctr","c1","c2","c3","cvr"];
var ADD = ["cpi","cpr","cpa","cpm","cpc","ctr","freq","roas","c1","c2","c3","cvr"];
var BASE = {spend:"bar",impressions:"bar",reach:"line",freq:"line",cpm:"line",clicks:"bar",installs:"bar",regs:"bar",acts:"bar",value:"bar",cpc:"line",cpi:"line",cpr:"line",cpa:"line",roas:"line",ctr:"line",c1:"line",c2:"line",c3:"line",cvr:"line"};
var CHDEF = [
  {id:"spend", title:"Spending & Conversions", m:["spend","acts","cpa"], def:["spend","acts"], max:2},
  {id:"traffic", title:"Traffic Performance", m:["impressions","reach","cpm"], def:["impressions","cpm"], max:2},
  {id:"click", title:"Click Performance", m:["clicks","ctr","cpc"], def:["clicks","ctr"], max:2},
  {id:"revenue", title:"Revenue", m:["acts","value","roas"], def:["value","roas"], max:2},
  {id:"conv", title:"Conversion Rate", fun:1}
];
var PAL = ["#5b8def","#f2a65a","#5fc4a1"];
var AUDS = [["all","Combined"],["driver","Driver"],["passenger","Passenger"]];

/* ---------- storage ---------- */
function ld(k, d) { try { var v = JSON.parse(localStorage.getItem(k)); return v == null ? d : v; } catch (e) { return d; } }
var rows = ld("xpm_rows", []).filter(function (r) { return !r.s; }); /* drops any sample rows saved earlier */
var acc = ld("xpm_access", {google:1, meta:1, appsflyer:1});
var T = Object.assign({}, TD, ld("xpm_targets", {}));
var theme = ld("xpm_theme", "system");
var S = Object.assign({metaUrl:"", metaToken:"", range:"last30", cmp:"prev", aud:"all", rs:"", re:"", cs:"", ce:"", afc:{}}, ld("xpm_prefs", {}));
var SY = ld("xpm_sync", {});
var AFROWS = ld("xpm_afrows", []);
if ("at" in SY) SY = {meta: SY};
function sy(c) { return SY[c] || (SY[c] = {at:0, n:0, err:""}); }
var TC = ld("xpm_chtargets", {});
var CS = Object.assign({types:{}, ct:{}, sel:{}, view:{}, custom:[{id:"k1", title:"Custom chart", sel:["spend","installs"]}]}, ld("xpm_charts", {}));
function sv() { try { localStorage.setItem("xpm_rows", JSON.stringify(rows)); localStorage.setItem("xpm_access", JSON.stringify(acc)); localStorage.setItem("xpm_targets", JSON.stringify(T)); localStorage.setItem("xpm_theme", JSON.stringify(theme)); localStorage.setItem("xpm_prefs", JSON.stringify(S)); localStorage.setItem("xpm_sync", JSON.stringify(SY)); localStorage.setItem("xpm_chtargets", JSON.stringify(TC)); localStorage.setItem("xpm_charts", JSON.stringify(CS)); localStorage.setItem("xpm_afrows", JSON.stringify(AFROWS)); } catch (e) {} }

/* ---------- helpers ---------- */
function $(s) { return document.querySelector(s); }
function on(sel, fn) { document.querySelectorAll(sel).forEach(fn); }
function pad(n) { return n < 10 ? "0" + n : "" + n; }
function N(n) { return Math.round(n).toLocaleString("en-US"); }
function P(n) { return "₱" + N(n); }
function has(v) { return v != null && v !== "" && !isNaN(v); }
function short(n) { return n >= 1e6 ? (n / 1e6).toFixed(1).replace(".0", "") + "M" : n >= 1e3 ? (n / 1e3).toFixed(n % 1e3 ? 1 : 0) + "K" : "" + n; }
function fT(k) { var m = TM.filter(function (x) { return x[0] === k; })[0]; return has(T[k]) ? m[4] + " " + m[2] + (+T[k]).toLocaleString("en-US") + m[3] : "To be decided"; }
function GOAL() { return has(T.regs) && T.regs > 0 ? +T.regs : 50000; }

/* dates (all as UTC midnight ms so time zones never shift a day) */
var DAYMS = 864e5, now = new Date();
var TODAY = now.getFullYear() + "-" + pad(now.getMonth() + 1) + "-" + pad(now.getDate());
var YM = TODAY.slice(0, 7), DAY = now.getDate(), DIM = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
function pd(s) { var a = s.split("-"); return Date.UTC(+a[0], +a[1] - 1, +a[2]); }
function fd(ms) { return new Date(ms).toISOString().slice(0, 10); }
function addM(ms, n) { var d = new Date(ms), y = d.getUTCFullYear(), m = d.getUTCMonth() + n, dim = new Date(Date.UTC(y, m + 1, 0)).getUTCDate(); return Date.UTC(y, m, Math.min(d.getUTCDate(), dim)); }
function lab(key, g) { return new Date(pd(key)).toLocaleDateString("en-US", g === "month" ? {month:"short", year:"2-digit", timeZone:"UTC"} : {month:"short", day:"numeric", timeZone:"UTC"}); }
function fr(s, e) { var o = {month:"short", day:"numeric", timeZone:"UTC"}; return new Date(s).toLocaleDateString("en-US", o) + " – " + new Date(e).toLocaleDateString("en-US", Object.assign({year:"numeric"}, o)); }
function mtd(l) { return l.filter(function (r) { return r.d.slice(0, 7) === YM; }); }

/* selected range and comparison, shared by every channel */
function rng(list) {
  var t = pd(TODAY), s, e = t, k = S.range;
  if (k === "last7") s = t - 6 * DAYMS; else if (k === "last14") s = t - 13 * DAYMS; else if (k === "last90") s = t - 89 * DAYMS;
  else if (k === "thisMonth") s = pd(YM + "-01");
  else if (k === "lastMonth") { s = addM(pd(YM + "-01"), -1); e = pd(YM + "-01") - DAYMS; }
  else if (k === "all") { var ds = list.map(function (r) { return r.d; }).sort(); s = ds.length ? pd(ds[0]) : t - 29 * DAYMS; }
  else if (k === "custom" && S.rs && S.re) { s = pd(S.rs); e = pd(S.re); }
  else s = t - 29 * DAYMS;
  if (s > e) { var x = s; s = e; e = x; }
  return [s, e];
}
function cmpRng(s, e) {
  var len = (e - s) / DAYMS + 1;
  if (S.cmp === "prev") return [s - len * DAYMS, s - DAYMS];
  if (S.cmp === "wow") return [s - 7 * DAYMS, e - 7 * DAYMS];
  if (S.cmp === "mom") return [addM(s, -1), addM(e, -1)];
  if (S.cmp === "custom" && S.cs && S.ce) { var a = pd(S.cs), b = pd(S.ce); return a <= b ? [a, b] : [b, a]; }
  return null;
}
/* granularity is automatic: daily, weekly or monthly depending on how long the range is */
function gran(s, e) { var n = (e - s) / DAYMS + 1; return n <= 62 ? "day" : n <= 200 ? "week" : "month"; }
function bkey(ms, g) { if (g === "day") return fd(ms); if (g === "week") return fd(ms - ((new Date(ms).getUTCDay() + 6) % 7) * DAYMS); return fd(ms).slice(0, 7) + "-01"; }
function Z() { return {spend:0, impressions:0, reach:0, clicks:0, installs:0, regs:0, acts:0, value:0, afi:0, afr:0, afb:0, afs:0, afv:0, ina:0, ins:0, rga:0, rgs:0, aca:0, acs:0, vaa:0, vas:0}; }
function add(a, r) { for (var k in a) a[k] += r[k] || 0; return a; }
function series(list, s, e, g) {
  var keys = [], seen = {}, map = {}, ms, a = fd(s), b = fd(e);
  for (ms = s; ms <= e; ms += DAYMS) { var k = bkey(ms, g); if (!seen[k]) { seen[k] = 1; keys.push(k); map[k] = Z(); } }
  list.forEach(function (r) { if (r.d >= a && r.d <= b) add(map[bkey(pd(r.d), g)], r); });
  return {keys: keys, aggs: keys.map(function (k) { return map[k]; })};
}
function total(aggs) { var t = Z(); aggs.forEach(function (a) { add(t, a); }); return t; }

/* ---------- AppsFlyer (SSOT 7 day) ----------
   AF rows live in AFROWS: afi installs, afr signup_completed, afb booking_created, afs ride_completed, afv revenue.
   Activation = booking created. Completed Ride = bookings actually completed. Failed = created minus completed. */
var AFK = ["installs","regs","acts","value","cpi","cpr","cpa","roas","c1","c2","c3","cvr"];
function afCan(ch) { return ch === "google" || ch === "meta"; }
function shCan(ch) { return ch === "google" || ch === "meta" || ch === "tiktok"; }
/* TikTok: app = Android, SKAN = iOS. Totals are app + SKAN; the split sits next to the number. */
var SPL = {installs:["ina","ins"], regs:["rga","rgs"], acts:["aca","acs"], value:["vaa","vas"]};
var AND = "<svg class='pi' viewBox='0 0 24 24' aria-hidden='true'><path fill='currentColor' d='M17.6 9.48l1.84-3.18c.16-.31.04-.69-.26-.85a.64.64 0 0 0-.83.22l-1.88 3.24a11.46 11.46 0 0 0-8.94 0L5.65 5.67a.64.64 0 0 0-.87-.2c-.28.18-.37.54-.22.83L6.4 9.48A10.78 10.78 0 0 0 1 18h22a10.78 10.78 0 0 0-5.4-8.52zM7 15.25a1.25 1.25 0 1 1 0-2.5 1.25 1.25 0 0 1 0 2.5zm10 0a1.25 1.25 0 1 1 0-2.5 1.25 1.25 0 0 1 0 2.5z'/></svg>";
var IOS = "<svg class='pi' viewBox='0 0 24 24' aria-hidden='true'><path fill='currentColor' d='M12.15 6.9c-.95 0-2.42-1.08-3.96-1.04-2.04.03-3.91 1.18-4.96 3.01-2.12 3.68-.55 9.1 1.52 12.09 1.01 1.45 2.21 3.09 3.79 3.04 1.52-.07 2.09-.99 3.94-.99 1.83 0 2.35.99 3.96.95 1.64-.03 2.68-1.48 3.68-2.95 1.16-1.69 1.64-3.33 1.66-3.42-.04-.01-3.18-1.22-3.22-4.86-.03-3.04 2.48-4.49 2.6-4.56-1.43-2.09-3.62-2.32-4.39-2.38-2-.16-3.68 1.09-4.61 1.09zM15.53 3.83c.84-1.01 1.4-2.43 1.25-3.83-1.21.05-2.66.81-3.53 1.82-.78.9-1.45 2.34-1.27 3.71 1.34.1 2.72-.69 3.55-1.7z'/></svg>";
function splOn(k) { return CHN() === "tiktok" && !!SPL[k]; }
function splHtml(a, k, u) { var s = SPL[k]; return "<small class='spl'><span title='Android (app)'>" + AND + fm(u, a[s[0]] || 0) + "</span><span title='iOS (SKAN)'>" + IOS + fm(u, a[s[1]] || 0) + "</span></small>"; }
function afOn(k) { var c = CHN(); return !!(c && afCan(c) && AFK.indexOf(k) > -1 && (S.afc[c] || {})[k]); }
function afView(a) { return {spend:a.spend, impressions:a.impressions, reach:a.reach, clicks:a.clicks, installs:a.afi, regs:a.afr, acts:a.afb, value:a.afv, rides:a.afs}; }
function mv(k, a) { var f = MT[k].f; return afOn(k) ? f(afView(a)) : f(a); }
function na(k) { return CHN() === "google" && (k === "reach" || k === "freq"); }
function afState(ch) { var o = S.afc[ch] || {}, n = AFK.filter(function (k) { return o[k]; }).length; return !afCan(ch) || !n ? "off" : n === AFK.length ? "on" : "part"; }
function swBtn(attr, st, dis, tip) { return "<button type='button' class='swt " + st + "' " + attr + " role='switch' aria-checked='" + (st !== "off") + "'" + (dis ? " disabled title='" + tip + "'" : "") + "><span class='trk'><i></i></span><span class='st'>" + (st === "on" ? "On" : st === "part" ? "Partial" : "Off") + "</span></button>"; }
function swSet(b, st) { b.className = "swt " + st; b.setAttribute("aria-checked", st !== "off"); b.querySelector(".st").textContent = st === "on" ? "On" : st === "part" ? "Partial" : "Off"; }
function afBtn(ch) { return swBtn("data-afm='1'", afState(ch), !afCan(ch), "No AppsFlyer tab for this channel yet"); }
var AFI = "<img class='afi' src='appsflyer-dark.png' alt='AppsFlyer'>";
var AFB = "<img class='afi l' src='appsflyer-light.png' alt=''><img class='afi d' src='appsflyer-dark.png' alt=''>";
function aflogo(id) { return "<span class='afl' id='afl-" + id + "' title='Showing AppsFlyer data' hidden>" + AFB + "</span>"; }
function fmFull(u, v) {
  if (v == null) return "—";
  var s = v.toLocaleString("en-US", u === "p2" ? {minimumFractionDigits:2, maximumFractionDigits:2} : u === "pc" || u === "x" ? {maximumFractionDigits:4} : {maximumFractionDigits:2});
  return u === "p0" || u === "p2" ? "₱" + s : u === "pc" ? s + "%" : u === "x" ? s + "x" : s;
}
function afSet(ch, fn) { var o = S.afc[ch] = S.afc[ch] || {}; fn(o); sv(); afRefresh(ch); }
function afRefresh(ch) {
  var s = afState(ch), m = $("[data-afm]");
  if (m) swSet(m, s);
  STILL = 1; dirty.acct = 1; paintTab(); STILL = 0; note();
}
function cardClick(e) { var b = e.target.closest("[data-afk]"), c = CHN(); if (!b || !afCan(c)) return; afSet(c, function (o) { o[b.dataset.afk] = o[b.dataset.afk] ? 0 : 1; }); }


/* ---------- metrics ---------- */
function div(a, b, m) { return b ? a / b * (m || 1) : null; }
var MT = {
  spend:{l:"Spend", f:function (a) { return a.spend; }, u:"p0"},
  installs:{l:"Installs", f:function (a) { return a.installs; }, u:"n"},
  regs:{l:"Registrations", f:function (a) { return a.regs; }, u:"n"},
  acts:{l:"Activations", f:function (a) { return a.acts; }, u:"n"},
  cpi:{l:"CPI", f:function (a) { return div(a.spend, a.installs); }, u:"p2", lo:1, t:"cpi"},
  cpr:{l:"CPR", f:function (a) { return div(a.spend, a.regs); }, u:"p2", lo:1, t:"cpr"},
  cpa:{l:"CPA (cost per activation)", f:function (a) { return div(a.spend, a.acts); }, u:"p2", lo:1, t:"cpa"},
  impressions:{l:"Impressions", f:function (a) { return a.impressions; }, u:"n"},
  reach:{l:"Reach", f:function (a) { return a.reach; }, u:"n"},
  freq:{l:"Frequency", f:function (a) { return div(a.impressions, a.reach); }, u:"x", lo:1},
  cpm:{l:"CPM", f:function (a) { return div(a.spend, a.impressions, 1000); }, u:"p2", lo:1},
  clicks:{l:"Clicks", f:function (a) { return a.clicks; }, u:"n"},
  ctr:{l:"CTR", f:function (a) { return div(a.clicks, a.impressions, 100); }, u:"pc"},
  cpc:{l:"CPC", f:function (a) { return div(a.spend, a.clicks); }, u:"p2", lo:1},
  c1:{l:"Click to install", f:function (a) { return div(a.installs, a.clicks, 100); }, u:"pc", t:"c1"},
  c2:{l:"Install to registration", f:function (a) { return div(a.regs, a.installs, 100); }, u:"pc", t:"c2"},
  c3:{l:"Registration to activation", f:function (a) { return div(a.acts, a.regs, 100); }, u:"pc", t:"c3"},
  rides:{l:"Completed Ride", f:function (a) { return a.afs; }, u:"n"},
  value:{l:"Conversion value", f:function (a) { return a.value; }, u:"p0"},
  roas:{l:"ROAS", f:function (a) { return div(a.value, a.spend); }, u:"x", t:"roas"},
  cvr:{l:"Overall conversion", f:function (a) { return div(a.acts, a.installs, 100); }, u:"pc", t:"cvr"}
};
function fm(u, v) {
  if (v == null) return "—";
  if (Math.abs(v) >= 1e6 && (u === "p0" || u === "n")) return (u === "p0" ? "₱" : "") + (v / 1e6).toFixed(2) + "M";
  if (u === "p0") return P(v);
  if (u === "p2") return "₱" + v.toLocaleString("en-US", {minimumFractionDigits:2, maximumFractionDigits:2});
  if (u === "pc") return v.toFixed(2) + "%";
  if (u === "x") return v.toFixed(2) + "x";
  return N(v);
}
function tk(u, v) { var s = v >= 1e6 ? +(v / 1e6).toFixed(1) + "M" : v >= 1e3 ? +(v / 1e3).toFixed(1) + "K" : +v.toFixed(2); return u === "p0" || u === "p2" ? "₱" + s : u === "pc" ? s + "%" : s; }

function CHN() { return route.indexOf("ch-") === 0 ? route.slice(3) : null; }
function tgt(k) { var c = CHN(), m = MT[k]; if (c && TC[c] && has(TC[c][k])) return +TC[c][k]; return m.t && has(T[m.t]) ? +T[m.t] : null; }
function card(k, cur, prev) {
  var m = MT[k], c = CHN();
  if (na(k)) return "<div class='kpi na'><span>" + m.l + "</span><b title='Not available for Google Ads'>—</b><em class='dl'>Not available for Google Ads</em><div class='bm'><small>Not available for Google Ads</small></div></div>";
  var on = afOn(k), sp = splOn(k), mix = k === "acts" && on, okb = cur.afs || 0, miss = Math.max(0, (cur.afb || 0) - okb), v = mv(k, cur), p = prev ? mv(k, prev) : null, t = tgt(k), can = m.t || ADD.indexOf(k) > -1, hasAf = afCan(c) && AFK.indexOf(k) > -1;
  var h = "<div class='kpi" + (on ? " af" : "") + (hasAf ? " hasaf" : "") + "'>" + (hasAf ? "<button type='button' class='afb' data-afk='" + k + "' aria-pressed='" + on + "' title='" + (on ? "AppsFlyer data. Click to show " + NAME[c] + " data" : "Click to show AppsFlyer data") + "'>" + (on ? AFI : AFB) + "</button>" : "") + "<span>" + m.l + "</span>" + "<b" + (mix || sp ? " class='mix'" : "") + " title='" + fmFull(m.u, v) + (mix ? " (success " + fmFull("n", okb) + ", failed " + fmFull("n", miss) + ")" : "") + "'>" + (mix ? "<span class='n'>" + fm(m.u, v) + "</span> <small>(success " + N(okb) + ", failed " + N(miss) + ")</small>" : sp ? "<span class='n'>" + fm(m.u, v) + "</span> " + splHtml(cur, k, m.u) : fm(m.u, v)) + "</b>";
  if (prev && v != null && p) {
    var d = (v - p) / p * 100, good = m.lo ? d <= 0 : d >= 0;
    h += "<em class='dl " + (Math.abs(d) < 0.05 ? "" : good ? "good" : "bad") + "'>" + (d > 0 ? "▲" : d < 0 ? "▼" : "–") + " " + Math.abs(d).toFixed(1) + "% · was " + fm(m.u, p) + "</em>";
  } else h += "<em class='dl'>" + (prev ? "No comparison data" : "") + "</em>";
  h += "<div class='bm'>";
  if (can) {
    if (t == null) h += "<small>No target set</small>";
    else if (v == null) h += "<small>Target " + fm(m.u, t) + "</small>";
    else {
      var mx = Math.max(v, t) * 1.2, ok = m.lo ? v <= t : v >= t;
      h += "<div class='bt'><i class='" + (ok ? "" : "no") + "' style='width:" + (v / mx * 100) + "%'></i><u style='left:" + (t / mx * 100) + "%'></u></div><small>Target " + fm(m.u, t) + " · " + (m.lo ? (ok ? "under by " : "over by ") : (ok ? "above by " : "below by ")) + fm(m.u, Math.abs(v - t)) + "</small>";
    }
  } else h += "<small>No target for this metric</small>";
  return h + "</div></div>";
}
function cardsHtml(cur, prev) { return ORDER.map(function (k) { return card(k, cur, prev); }).join(""); }
function countUp(el) {
  var txt = el.textContent, m = txt.match(/\d[\d,]*\.?\d*/);
  if (!m) return;
  var raw = m[0], end = parseFloat(raw.replace(/,/g, ""));
  if (!isFinite(end) || end === 0) return;
  var dec = (raw.split(".")[1] || "").length, comma = raw.indexOf(",") > -1, pre = txt.slice(0, m.index), post = txt.slice(m.index + raw.length);
  function f(v) { var s = v.toFixed(dec); if (comma) { var q = s.split("."); s = q[0].replace(/\B(?=(\d{3})+(?!\d))/g, ",") + (q[1] ? "." + q[1] : ""); } return pre + s + post; }
  var start = performance.now();
  (function tick(now) { var k = Math.min(1, (now - start) / 900), e = 1 - Math.pow(1 - k, 4); el.textContent = k < 1 ? f(end * e) : txt; if (k < 1) requestAnimationFrame(tick); })(start);
}

/* ---------- charts (Chart.js, styled like the Rapide dashboard) ---------- */
var charts = {}, LAST = null, RED = "#ec1f27", CMP = "#8a9bab", ACC = "#0b4060", GRID = "#dde3e9", TXT = "#5b6b7a";
var reduce = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
function cdef() {
  if (!window.Chart) return;
  var cs = getComputedStyle(document.documentElement), g = function (n) { return cs.getPropertyValue(n).trim(); };
  GRID = g("--line"); TXT = g("--mut"); ACC = g("--accent"); CMP = g("--mut");
  var D = Chart.defaults;
  D.font.family = "Inter, system-ui, sans-serif"; D.font.size = 12; D.color = TXT; D.borderColor = GRID;
  D.maintainAspectRatio = false; D.animation.duration = reduce ? 0 : 900; D.animation.easing = "easeOutQuart";
  D.elements.line.cubicInterpolationMode = "monotone"; D.elements.line.tension = 0.4; D.elements.line.borderCapStyle = "round";
  D.elements.point.radius = 0; D.elements.point.hoverRadius = 5; D.elements.point.hitRadius = 14; D.elements.point.borderWidth = 2;
  var t = D.plugins.tooltip; t.backgroundColor = "#02111d"; t.titleColor = "#fff"; t.bodyColor = "#dbe6ee"; t.padding = 12; t.cornerRadius = 10; t.boxPadding = 5; t.usePointStyle = true; t.caretSize = 0;
  D.plugins.legend.labels.usePointStyle = true; D.plugins.legend.labels.boxWidth = 8;
}
function killCharts() { Object.keys(charts).forEach(function (k) { charts[k].destroy(); }); charts = {}; LAST = null; }
function lineChart(id, labels, sets, m, leg, mode) {
  var cv = $("#" + id); if (!cv || !window.Chart) return;
  var ch = charts[id];
  if (ch) {
    ch._h.m = m; ch.options.plugins.legend.display = !!leg; ch.data.labels = labels;
    if (ch.data.datasets.length === sets.length) sets.forEach(function (s, i) { Object.assign(ch.data.datasets[i], s); }); else ch.data.datasets = sets;
    ch.update(mode); return;
  }
  var h = {m: m};
  ch = new Chart(cv, {type:"line", data:{labels:labels, datasets:sets}, options:{
    responsive:true, interaction:{mode:"index", intersect:false},
    plugins:{legend:{display:!!leg}, tooltip:{callbacks:{label:function (c) { var d = c.dataset, extra = d._l ? " (" + d._l[c.dataIndex] + ")" : ""; return d.label + extra + ": " + fm(h.m.u, c.parsed.y); }}}},
    scales:{x:{grid:{display:false}, ticks:{maxTicksLimit:7, maxRotation:0}}, y:{beginAtZero:true, grid:{color:GRID}, border:{display:false}, ticks:{maxTicksLimit:5, callback:function (v) { return tk(h.m.u, v); }}}}
  }});
  ch._h = h; charts[id] = ch;
}
function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]; }); }
function rgba(hex, a) { var n = parseInt(hex.slice(1), 16); return "rgba(" + (n >> 16) + "," + ((n >> 8) & 255) + "," + (n & 255) + "," + a + ")"; }
function cat(u) { return u === "p0" || u === "p2" ? "p" : u; }
function selOf(d, cust) { return cust ? d.sel : (CS.sel[d.id] || d.def); }
var LV = ["day","week","month"], LNAME = {day:"Daily", week:"Weekly", month:"Monthly"};
var GEARSVG = "<svg viewBox='0 0 24 24' width='15' height='15' fill='none' stroke='currentColor' stroke-width='1.8' stroke-linecap='round' stroke-linejoin='round'><circle cx='12' cy='12' r='3'/><path d='M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z'/></svg>";
function cl(k) { return k === "cpa" ? "CPA" : MT[k].l; }
function typeOf(d, k) { return (CS.ct[d.id] || {})[k] || BASE[k]; }
function chList() { var c = CHN(); return rows.filter(function (r) { return r.c === c; }).concat(AFROWS.filter(function (r) { return r.c === c; })); }
function curLv(d) { var v = CS.view[d.id] || "auto"; if (v !== "auto") return v; var R = rng(chList()); return gran(R[0], R[1]); }
function drillHtml(d) {
  var v = CS.view[d.id] || "auto", lv = curLv(d), i = LV.indexOf(lv);
  return "<button type='button' class='dlab' data-cd='" + d.id + "|auto' title='" + (v === "auto" ? "Automatic detail for the date range" : "Back to automatic detail") + "'>" + (v === "auto" ? "Auto" : LNAME[lv]) + "</button>" +
    "<button type='button' data-cd='" + d.id + "|up' title='Drill up (" + (i < 2 ? LNAME[LV[i + 1]] : "") + ")'" + (i >= 2 ? " disabled" : "") + ">▲</button>" +
    "<button type='button' data-cd='" + d.id + "|down' title='Drill down (" + (i > 0 ? LNAME[LV[i - 1]] : "") + ")'" + (i <= 0 ? " disabled" : "") + ">▼</button>";
}
function chipsInner(d) { var sel = selOf(d, 0); return d.m.map(function (k) { if (na(k)) return "<button type='button' class='chip na' disabled data-cm='" + d.id + "|" + k + "' title='Not available for Google Ads'>" + cl(k) + " —</button>"; return "<button type='button' class='chip" + (sel.indexOf(k) > -1 ? " on" : "") + "' data-cm='" + d.id + "|" + k + "'>" + cl(k) + "</button>"; }).join(""); }
function ccHtml(d, cust) {
  var h = "<div class='chart-card' id='cc-" + d.id + "'><div class='chart-head'><h3>" + esc(d.title) + "</h3>" + aflogo(d.id);
  if (d.fun) return h + "</div><div class='fn' id='fn-conv'></div></div>";
  h += "<button type='button' class='gear' data-cg='" + d.id + "' aria-label='Chart settings' title='Chart settings'>" + GEARSVG + "</button></div>";
  if (cust) h += "<div class='chart-row'><span class='note'>X axis: days</span><button type='button' class='chip' data-cx='" + d.id + "'>Remove chart</button></div>";
  else h += "<div class='chart-row'><div class='chips'>" + chipsInner(d) + "</div><div class='drill' id='dr-" + d.id + "'>" + drillHtml(d) + "</div></div>";
  return h + "<div class='legend' id='lg-" + d.id + "'></div><div class='chart-body'><canvas id='cv-" + d.id + "'></canvas></div></div>";
}
function chartsHtml() {
  return CHDEF.map(function (d) { return ccHtml(d, 0); }).join("") + CS.custom.map(function (c) { return ccHtml(c, 1); }).join("") +
    "<div class='chart-card soon'><button type='button' class='btn' data-cadd='1'>+ Add custom chart</button><p class='note'>Pick any metrics. The x axis is always days.</p></div>";
}
function drawAllCharts() { CHDEF.forEach(function (d) { if (d.fun) drawFunnel(); else drawChart(d, 0); }); CS.custom.forEach(function (c) { drawChart(c, 1); }); }

/* Conversion funnel: clicks > installs > registrations > activations */
var FUN = [["clicks","Clicks"],["installs","Installs"],["regs","Registrations"],["acts","Activations"],["rides","Completed Ride"]];
var FCOL = ["#5b8def","#4aa3d8","#3fb8b0","#6cc59a","#8ccf7e"];
var FRATE = ["Click to install","Install to registration","Registration to activation","Activation to completed ride (AppsFlyer)"];
function sumR(list, s, e) { var a = fd(s), b = fd(e), t = Z(); list.forEach(function (r) { if (r.d >= a && r.d <= b) add(t, r); }); return t; }
function drawFunnel() {
  var el = $("#fn-conv"); if (!el) return;
  var fun = FUN.filter(function (f) { return f[0] !== "rides" || afCan(CHN()); });
  var lg0 = $("#afl-conv"); if (lg0) lg0.hidden = !fun.some(function (f) { return afOn(f[0]); });
  var list = chList(), R = rng(list), C = cmpRng(R[0], R[1]), cur = sumR(list, R[0], R[1]), pv = C ? sumR(list, C[0], C[1]) : null, mx = 0, h = "";
  fun.forEach(function (f) { mx = Math.max(mx, mv(f[0], cur), pv ? mv(f[0], pv) : 0); });
  function w(v) { return mx ? Math.max(6, v / mx * 100) : 6; }
  fun.forEach(function (f, i) {
    var v = mv(f[0], cur);
    if (i) {
      var q = fun[i - 1][0], rd = f[0] === "rides", r = div(v, rd ? cur.afb : mv(q, cur), 100), pr = pv ? div(mv(f[0], pv), rd ? pv.afb : mv(q, pv), 100) : null;
      h += "<div class='fn-step'><b>" + (r == null ? "—" : r.toFixed(2) + "%") + "</b> " + FRATE[i - 1] + (pv && r != null && pr != null ? " <em class='" + (r >= pr ? "good" : "bad") + "'>" + (r >= pr ? "▲ " : "▼ ") + Math.abs(r - pr).toFixed(2) + " pts · was " + pr.toFixed(2) + "%</em>" : "") + "</div>";
    }
    h += "<div class='fn-row'><span>" + f[1] + "</span><div class='fn-track'><div class='fn-bar' style='width:" + w(v) + "%;background:" + FCOL[i] + "'></div>" + (pv ? "<div class='fn-bar ghost' style='width:" + w(mv(f[0], pv)) + "%'></div>" : "") + "</div><b>" + fm("n", v) + "</b></div>";
  });
  var ov = mv("cvr", cur), op = pv ? mv("cvr", pv) : null;
  h += "<div class='fn-foot'>Overall conversion (install to activation): <b>" + (ov == null ? "—" : ov.toFixed(2) + "%") + "</b>" + (op != null && ov != null ? " · was " + op.toFixed(2) + "%" : "") + (pv ? "<br>Grey bars show the comparison period" : "") + "</div>";
  el.innerHTML = h;
}

function drawChart(d, cust) {
  var cv = $("#cv-" + d.id); if (!cv || !window.Chart) return;
  var key = "ch_" + d.id; if (charts[key]) { charts[key].destroy(); delete charts[key]; }
  var sel = selOf(d, cust).filter(function (k) { return !na(k); }), list = chList(), view = cust ? "day" : (CS.view[d.id] || "auto"), R, g, C, note = "";
  if (!sel.length) sel = [cust ? "spend" : d.def[0]];
  var lg0 = $("#afl-" + d.id); if (lg0) lg0.hidden = !sel.some(afOn);
  R = rng(list); C = cmpRng(R[0], R[1]); g = view === "auto" ? gran(R[0], R[1]) : view;
  var cur = series(list, R[0], R[1], g), cp = C ? series(list, C[0], C[1], g) : null, sets = [], first = null, lg = "";
  sel.forEach(function (k, i) {
    var m = MT[k], bar = typeOf(d, k) === "bar", col = PAL[i % 3], one = sel.length === 1;
    if (first == null) first = m.u;
    var ax = cat(m.u) === cat(first) ? "y" : "y1";
    var o = {type: bar ? "bar" : "line", label: cl(k), data: cur.aggs.map(function (a) { return mv(k, a); }), yAxisID: ax, order: bar ? 2 + i : i, borderColor: col, backgroundColor: bar ? rgba(col, .88) : (one ? rgba(col, .14) : col), borderWidth: bar ? 0 : 2.5, borderCapStyle: "round", pointRadius: 0, pointHoverRadius: 5, tension: .4, cubicInterpolationMode: "monotone", fill: !bar && one ? "origin" : false, _u: m.u};
    if (bar) { o.borderRadius = 5; o.borderSkipped = false; o.barPercentage = .85; o.categoryPercentage = .8; o.maxBarThickness = 30; }
    sets.push(o);
    lg += "<span><i class='" + (bar ? "bar" : "") + "' style='background:" + col + "'></i>" + cl(k) + "</span>";
    if (cp) {
      var gh = {type: o.type, label: cl(k) + " (comparison)", data: cur.keys.map(function (_, j) { return cp.aggs[j] ? mv(k, cp.aggs[j]) : null; }), yAxisID: ax, order: 10 + o.order, borderColor: rgba(col, .45), backgroundColor: rgba(col, .3), borderWidth: bar ? 0 : 1.75, borderDash: bar ? [] : [5, 4], pointRadius: 0, pointHoverRadius: 3, tension: .4, cubicInterpolationMode: "monotone", fill: false, _u: m.u};
      if (bar) { gh.borderRadius = 5; gh.borderSkipped = false; gh.barPercentage = .85; gh.categoryPercentage = .8; gh.maxBarThickness = 30; }
      sets.push(gh);
    }
  });
  if (cp) lg += "<span><i class='ghost' style='background:" + CMP + "'></i>Comparison period</span>";
  if (note) lg += "<span>" + note + "</span>";
  var lgEl = $("#lg-" + d.id); if (lgEl) lgEl.innerHTML = lg;
  var axes = {}; sets.forEach(function (s) { if (!axes[s.yAxisID]) axes[s.yAxisID] = s._u; });
  var scales = {x: {grid: {display: false}, ticks: {maxTicksLimit: 7, maxRotation: 0}}};
  Object.keys(axes).forEach(function (a) { scales[a] = {position: a === "y1" ? "right" : "left", beginAtZero: true, grid: {color: GRID, drawOnChartArea: a === "y"}, border: {display: false}, ticks: {maxTicksLimit: 5, callback: function (v) { return tk(axes[a], v); }}}; });
  function ttl(keys, i) { return keys[i] == null ? "" : (g === "week" ? "Week of " : "") + lab(keys[i], g); }
  charts[key] = new Chart(cv, {data: {labels: cur.keys.map(function (x) { return lab(x, g); }), datasets: sets}, options: {
    responsive: true, interaction: {mode: "index", intersect: false},
    animation: reduce ? false : {duration: 900, easing: "easeOutQuart"},
    plugins: {legend: {display: false}, tooltip: {callbacks: {
      title: function (it) { return it.length ? ttl(cur.keys, it[0].dataIndex) : ""; },
      afterTitle: function (it) { return cp && it.length ? "Comparison: " + (ttl(cp.keys, it[0].dataIndex) || "no matching period") : ""; },
      label: function (c) { return c.dataset.label + ": " + fm(c.dataset._u, c.parsed.y); }}}},
    scales: scales}});
}
function chartClick(e) {
  var b = e.target.closest("button"); if (!b || b.disabled) return;
  var p, def;
  if (b.dataset.cm) {
    p = b.dataset.cm.split("|"); def = CHDEF.filter(function (x) { return x.id === p[0]; })[0];
    var sel = selOf(def).filter(function (x) { return !na(x); }), i = sel.indexOf(p[1]);
    if (i > -1) { if (sel.length > 1) sel.splice(i, 1); } else { sel.push(p[1]); if (sel.length > def.max) sel.shift(); }
    CS.sel[def.id] = sel; sv();
    b.parentNode.querySelectorAll(".chip").forEach(function (x) { x.classList.toggle("on", sel.indexOf(x.dataset.cm.split("|")[1]) > -1); });
    drawChart(def, 0);
  } else if (b.dataset.cd) {
    p = b.dataset.cd.split("|"); def = CHDEF.filter(function (x) { return x.id === p[0]; })[0];
    if (p[1] === "auto") delete CS.view[p[0]];
    else CS.view[p[0]] = LV[Math.max(0, Math.min(2, LV.indexOf(curLv(def)) + (p[1] === "up" ? 1 : -1)))];
    sv(); $("#dr-" + p[0]).innerHTML = drillHtml(def); drawChart(def, 0);
  } else if (b.dataset.cg) chartForm(b.dataset.cg);
  else if (b.dataset.cadd) chartForm(null);
  else if (b.dataset.cx) { CS.custom = CS.custom.filter(function (x) { return x.id !== b.dataset.cx; }); sv(); rebuildCharts(); }
}
function rebuildCharts() { killCharts(); var c = $("#charts"); if (c) { c.innerHTML = chartsHtml(); drawAllCharts(); } }

/* Per-chart settings: which metric each series shows, and whether it is a bar or a line */
function chartForm(id) {
  var c = CS.custom.filter(function (x) { return x.id === id; })[0], b = CHDEF.filter(function (x) { return x.id === id; })[0], cust = !b, isNew = !c && !b;
  var d = b || c || {id: "k" + Date.now(), title: "Custom chart " + (CS.custom.length + 1), sel: ["clicks"]};
  var n = cust ? 3 : b.max, opts = (cust ? ORDER : b.m).filter(function (x) { return !na(x); }), sel = selOf(d, cust).filter(function (x) { return !na(x); }), h = "";
  for (var i = 0; i < n; i++) {
    var k = sel[i] || null, list = opts.map(function (x) { return [x, cl(x)]; });
    if (i) list.unshift(["none", "None"]);
    var t = k ? typeOf(d, k) : "line";
    h += "<div class='srow'><span class='note'>Series " + (i + 1) + "</span>" + dd("sm" + i, list, k || "none") + "<span class='seg' data-i='" + i + "'><button type='button' data-ty='bar' class='" + (t === "bar" ? "on" : "") + "'>Bar</button><button type='button' data-ty='line' class='" + (t === "line" ? "on" : "") + "'>Line</button></span></div>";
  }
  $("#modal").innerHTML = "<div class='modal'><form id='cf'><h2>" + (cust ? "Custom chart" : esc(d.title)) + "</h2>" + (cust ? "<label>Name<input type='text' id='cn' value='" + esc(d.title) + "'></label>" : "") + "<p class='note'>Choose what each series shows and whether it is drawn as a bar or a line. Two bars sit side by side." + (cust ? " The x axis is always days." : "") + "</p>" + h + "<div class='btns'><button class='btn pri' type='submit'>Save</button><button class='btn' type='button' id='x'>Cancel</button></div></form></div>";
  $("#x").onclick = function () { $("#modal").innerHTML = ""; };
  $("#cf").onclick = function (e) { var bt = e.target.closest(".seg button"); if (!bt) return; bt.parentNode.querySelectorAll("button").forEach(function (x) { x.classList.toggle("on", x === bt); }); };
  $("#cf").onsubmit = function (e) {
    e.preventDefault();
    var ks = [], ty = {};
    for (var j = 0; j < n; j++) {
      var kk = $("#sm" + j).dataset.val; if (kk === "none" || ks.indexOf(kk) > -1) continue;
      ks.push(kk); var bt = document.querySelector(".seg[data-i='" + j + "'] button.on"); ty[kk] = bt ? bt.dataset.ty : BASE[kk];
    }
    if (!ks.length) return;
    if (cust) { d.title = $("#cn").value.trim() || "Custom chart"; d.sel = ks; if (isNew) CS.custom.push(d); } else CS.sel[d.id] = ks;
    CS.ct[d.id] = ty; sv(); $("#modal").innerHTML = "";
    if (cust) rebuildCharts(); else { var ch = $("#cc-" + d.id + " .chips"); if (ch) ch.innerHTML = chipsInner(d); drawChart(d, 0); }
  };
}

/* ---------- dropdown ---------- */
function dd(id, opts, val) {
  var c = opts.filter(function (o) { return o[0] === val; })[0] || opts[0];
  return "<div class='dd' id='" + id + "' data-val='" + c[0] + "'><button type='button' class='ddb'><span>" + c[1] + "</span><i>▾</i></button><div class='ddl'>" + opts.map(function (o) { return "<button type='button' class='ddo" + (o[0] === c[0] ? " on" : "") + "' data-v='" + o[0] + "'>" + o[1] + "</button>"; }).join("") + "</div></div>";
}
document.addEventListener("click", function (e) {
  var b = e.target.closest(".ddb"), o = e.target.closest(".ddo");
  document.querySelectorAll(".dd.open").forEach(function (d) { if (!b || d !== b.parentNode) d.classList.remove("open"); });
  if (b) { b.parentNode.classList.toggle("open"); return; }
  if (!o) return;
  var d = o.closest(".dd"), v = o.dataset.v;
  d.dataset.val = v; d.querySelector(".ddb span").textContent = o.textContent;
  d.querySelectorAll(".ddo").forEach(function (x) { x.classList.toggle("on", x === o); }); d.classList.remove("open");
  if (d.id === "fAud") { S.aud = v; sv();
  } else if (d.id === "tScope") { tsc = v; drawTg();
  } else if (d.id === "fRange") {
    S.range = v; if (v === "custom" && !S.rs) { S.rs = fd(pd(TODAY) - 29 * DAYMS); S.re = TODAY; setDates(); }
    $("#rc").hidden = v !== "custom"; sv(); paint();
  } else if (d.id === "fCmp") {
    S.cmp = v; if (v === "custom" && !S.cs) { var r = rng(rows.filter(function (x) { return x.c === route.slice(3); })), c = cmpRng.call(null, r[0], r[1]); S.cmp = "prev"; c = cmpRng(r[0], r[1]); S.cmp = "custom"; S.cs = fd(c[0]); S.ce = fd(c[1]); setDates(); }
    $("#cc").hidden = v !== "custom"; sv(); paint();
  }
});
document.addEventListener("keydown", function (e) { if (e.key === "Escape") document.querySelectorAll(".dd.open").forEach(function (d) { d.classList.remove("open"); }); });
function setDates() { on("[data-f]", function (i) { i.value = S[i.dataset.f] || ""; }); }

/* ---------- sidebar ---------- */
var route = "home", tab = "acct", tsc = "all", sk = "d", sd = -1;
function nav() {
  var h = "<button class='nav' data-r='home'>Home</button><button class='nav' data-r='targets'>Targets</button><div class='grp'>Ad Channels</div>";
  CH.forEach(function (c) { h += "<button class='nav' data-r='ch-" + c[0] + "'>" + c[1] + "</button>"; });
  h += "<div class='grp'>Data</div>";
  DT.forEach(function (c) { h += "<button class='nav' data-r='d-" + c[0] + "'>" + c[1] + "</button>"; });
  $("#nav").innerHTML = h;
  $("#sbf").innerHTML = "<button class='nav' data-r='integrations'>Integrations</button><button class='nav' data-r='settings'>Settings</button><button class='nav so' id='so'>Sign out</button>";
  on(".nav", function (b) { if (b.id === "so") { b.onclick = signOut; return; } b.classList.toggle("on", b.dataset.r === route); b.onclick = function () { location.hash = b.dataset.r; if (innerWidth <= 860) closeSb(); }; });
}
function closeSb() { $("#sb").classList.remove("open"); $("#scrim").classList.remove("open"); }
function setCol(v) { document.body.classList.toggle("col", v); try { localStorage.setItem("xpm_col", v ? "1" : ""); } catch (e) {} }
$("#burger").onclick = function () { if (innerWidth > 860) setCol(false); else { $("#sb").classList.add("open"); $("#scrim").classList.add("open"); } };
$("#col").onclick = function () { if (innerWidth > 860) setCol(true); else closeSb(); };
$("#scrim").onclick = closeSb;
try { if (localStorage.getItem("xpm_col")) document.body.classList.add("col"); } catch (e) {}

/* ---------- pages ---------- */
function tools() { return "<div class='btns'><button class='btn pri' data-a='add'>Add daily data</button><button class='btn' data-a='csv'>Export CSV</button></div>"; }

function blank() { return "<h1>Home</h1>"; }

/* Targets: month to date across every channel */
function targets() {
  var l = mtd(rows), a = total(l.length ? [l.reduce(function (t, r) { return add(t, r); }, Z())] : []), hv = l.length > 0, G = GOAL(), pct = Math.min(100, a.regs / G * 100), left = Math.max(0, G - a.regs), dleft = Math.max(1, DIM - DAY + 1);
  var cpr = MT.cpr.f(a), cprT = has(T.cpr) ? +T.cpr : null, proj = hv ? a.regs / DAY * DIM : 0;
  var h = "<div class='top'><div><h1>Targets</h1><p class='sub'>" + now.toLocaleString("en-US", {month:"long", year:"numeric"}) + ", day " + DAY + " of " + DIM + ". All channels, month to date.</p></div>" + tools() + "</div>";
  h += "<div class='card hero'><div><small>Account registrations, paid and organic</small><div class='big'>" + N(a.regs) + " <small style='font-size:18px;font-weight:600'>/ " + N(G) + "</small></div><div class='track'><div class='fill' style='width:" + pct + "%'></div></div><small>" + pct.toFixed(1) + "% of goal · " + N(left) + " to go · needs " + N(left / dleft) + " a day from today</small></div>";
  h += "<div class='side'><small>Cost per registration goal " + fT("cpr") + "</small><div class='big'>" + (cpr ? fm("p2", cpr) : "—") + "</div><small>" + (cpr ? (cprT == null ? "No target set" : cpr <= cprT ? "On target" : "Over target by " + fm("p2", cpr - cprT)) : "Add spend and registrations to see it") + "<br>Month-end pace: " + (hv ? N(proj) + " registrations" : "—") + (cprT ? "<br>Full goal budget: about ₱" + short(G * cprT) + " (" + short(G) + " × ₱" + cprT + ")" : "") + "</small></div></div>";
  h += "<div class='card'><h2>KPIs and where each one comes from</h2><div class='wrap'><table><tr><th>KPI</th><th>Source</th><th>Target</th><th>Month to date</th><th>Status</th></tr>";
  KPIS.forEach(function (k) {
    var v = k[3] ? MT[k[3]].f(a) : null, t = T[k[2]], st, val = "—";
    if (!k[3]) st = "<span class='chip'>" + (has(t) ? "Target set" : "Target TBD") + "</span>";
    else if (!v) st = "<span class='chip'>No data yet</span>";
    else { val = fm("p2", v); st = !has(t) ? "<span class='chip'>No target</span>" : v <= t ? "<span class='chip good'>On target</span>" : "<span class='chip bad'>Over target</span>"; }
    var src = k[1].length ? k[1].map(function (s) { return "<i class='" + (acc[s] ? "ok" : "no") + "'>" + (acc[s] ? "●" : "○") + " " + NAME[s] + "</i>"; }).join("") : "<i class='no'>Manual tracker</i>";
    h += "<tr><td>" + k[0] + "</td><td class='src'>" + src + "</td><td>" + fT(k[2]) + "</td><td>" + val + "</td><td>" + st + "</td></tr>";
  });
  h += "</table></div><p class='note'>● access ready, ○ waiting on access. Change targets and access in Settings.</p></div>";
  h += "<div class='card'><h2>Registrations vs pace to " + short(G) + "</h2>" + (hv ? "<div class='cv'><canvas id='c_pace'></canvas></div>" : "<div class='empty'>No data this month. Use Add daily data or sync a channel sheet.</div>") + "</div>";
  var mxs = 0, by = CH.map(function (c) { var s = add(Z(), {spend:0}).spend; l.filter(function (r) { return r.c === c[0]; }).forEach(function (r) { s += r.spend || 0; }); mxs = Math.max(mxs, s); return [c[1], s]; });
  h += "<div class='card'><h2>Spend by channel</h2>" + (hv ? by.map(function (b) { return "<div class='hb'><span>" + b[0] + "</span><div class='t'><div style='width:" + (mxs ? b[1] / mxs * 100 : 0) + "%'></div></div><b>" + P(b[1]) + "</b></div>"; }).join("") : "<div class='empty'>Spend appears here once you add data.</div>") + "</div>";
  h += "<div class='card'><h2>How data flows</h2><div class='flow'><span class='node r'>App events</span><span class='arr'>›</span><span class='node'>Segment</span><span class='arr'>›</span><div class='stack'><span class='node'>AppsFlyer</span><span class='node'>Amplitude</span><span class='node'>Databricks</span><span class='node'>WebEngage</span></div></div></div>";
  return h;
}
function drawPace() {
  var l = mtd(rows); if (!l.length) return; var G = GOAL(), cum = 0, labels = [], act = [], tg = [];
  for (var i = 1; i <= DAY; i++) { var d = YM + "-" + pad(i); l.forEach(function (r) { if (r.d === d) cum += r.regs || 0; }); labels.push(lab(d, "day")); act.push(cum); tg.push(G * i / DIM); }
  lineChart("c_pace", labels, [{label:"Actual", data:act, borderColor:RED, backgroundColor:"rgba(236,31,39,.10)", fill:true, borderWidth:2.5}, {label:"Target pace", data:tg, borderColor:ACC, borderDash:[5, 4], borderWidth:2, fill:false}], {u:"n"}, true);
}

/* Ad channel page */
function afText(ch) { if (!afCan(ch) || !S.metaUrl) return ""; var s = sy(ch + "_af"); return s.err ? " · AppsFlyer: " + s.err : s.at ? " · AppsFlyer " + s.n + " days" : ""; }
function syText(ch) { return syBase(ch) + afText(ch); }
function syBase(ch) {
  ch = ch || "meta"; var st = sy(ch);
  if (!S.metaUrl) return "Not connected. Add the Apps Script web app URL in Integrations to pull the Google Sheet.";
  if (st.err) return st.err;
  return st.at ? "Google Sheet synced " + new Date(st.at).toLocaleString("en-US", {month:"short", day:"numeric", hour:"numeric", minute:"2-digit"}) + " · " + st.n + " days of data" : "Connected. Press Sync sheet to load data.";
}
function chan(id) {
  var h = "<div class='top'><div><h1>" + NAME[id] + "</h1><p class='sub'>" + (acc[id] ? "Access ready" : "Waiting on access") + "</p></div>" + tools() + "</div>";
  h += "<div class='tabs'>" + [["acct","Account"],["perf","Performance"],["raw","Raw"]].map(function (t) { return "<button data-t='" + t[0] + "' class='" + (tab === t[0] ? "on" : "") + "'>" + t[1] + "</button>"; }).join("") + "</div>";
  if (shCan(id)) h += "<div class='card sync" + (sy(id).err ? " err" : "") + "'><span id='sy-" + id + "'>" + syText(id) + "</span><button class='btn' data-a='sync' data-ch='" + id + "'>Sync sheet</button></div>";
  h += "<div class='filters'><div class='f'><span>Date range</span>" + dd("fRange", RANGES, S.range) + "</div><div class='dates' id='rc'" + (S.range === "custom" ? "" : " hidden") + "><input type='date' data-f='rs' value='" + (S.rs || "") + "' aria-label='Range start'><input type='date' data-f='re' value='" + (S.re || "") + "' aria-label='Range end'></div>";
  h += "<div class='fx' data-only='acct'" + (tab === "acct" ? "" : " hidden") + "><div class='f'><span>Compare to</span>" + dd("fCmp", CMPS, S.cmp) + "</div><div class='dates' id='cc'" + (S.cmp === "custom" ? "" : " hidden") + "><input type='date' data-f='cs' value='" + (S.cs || "") + "' aria-label='Comparison start'><input type='date' data-f='ce' value='" + (S.ce || "") + "' aria-label='Comparison end'></div>";
  h += "<div class='f'><span>Audience</span>" + dd("fAud", AUDS, S.aud) + "</div><div class='f'><span>Targets</span>" + swBtn("data-vt='1'", S.vt ? "on" : "off") + "</div><div class='f'><span>AppsFlyer data</span>" + afBtn(id) + "</div></div></div>";
  h += "<p class='rnote' id='note'></p>";
  h += "<div data-p='acct'" + (tab === "acct" ? "" : " hidden") + "><div id='cards' class='grid g5'></div><div class='charts' id='charts'>" + chartsHtml() + "</div><p class='note'>Reach is added up across days, so frequency is an estimate on ranges longer than one day. Audience (Driver / Passenger) is not connected yet." + (id === "tiktok" ? " TikTok totals combine app and SKAN: the Android figure is app events and the iOS figure is SKAN." : "") + "</p></div>";
  h += "<div data-p='perf'" + (tab === "perf" ? "" : " hidden") + "><div class='empty'><b>Performance</b><br>Nothing here yet. Campaign, ad set and ad tables will go in this tab.</div></div>";
  h += "<div data-p='raw'" + (tab === "raw" ? "" : " hidden") + "><div class='card' id='raw'></div></div>";
  h += "<p class='note chnote'>AppsFlyer uses classic attribution.</p>";
  return h;
}
/* Tabs only swap panes, so nothing re-renders or replays when switching */
var dirty = {}, STILL = 0;
function setTab(t) {
  tab = t;
  on("[data-t]", function (x) { x.classList.toggle("on", x.dataset.t === t); });
  on("[data-p]", function (p) { p.hidden = p.dataset.p !== t; });
  on("[data-only]", function (f) { f.hidden = f.dataset.only !== t; });
  note(); paintTab();
}
function note() {
  var n = $("#note"); if (!n || route.indexOf("ch-") !== 0) return;
  var R = rng(chList()), C = tab === "acct" ? cmpRng(R[0], R[1]) : null;
  n.textContent = fr(R[0], R[1]) + (C ? " vs " + fr(C[0], C[1]) : "");
  var cc = route.slice(3), ao = S.afc[cc] || {};
  if (afCan(cc) && Object.keys(ao).some(function (k) { return ao[k]; }) && !AFROWS.some(function (r) { return r.c === cc; })) n.textContent += " · No AppsFlyer rows yet. Press Sync sheet.";
}
function paint() { if (route.indexOf("ch-") !== 0) return; dirty = {acct: 1, raw: 1}; note(); paintTab(); }
function paintTab() {
  if (route.indexOf("ch-") !== 0 || !dirty[tab]) return;
  dirty[tab] = 0;
  if (tab === "raw") { drawRaw(); return; }
  if (tab !== "acct") return;
  var list = chList(), R = rng(list), g = gran(R[0], R[1]), C = cmpRng(R[0], R[1]);
  var cur = series(list, R[0], R[1], g), cp = C ? series(list, C[0], C[1], g) : null, c = $("#cards");
  c.classList.toggle("cmp", !!cp); c.classList.toggle("vt", !!S.vt); c.classList.toggle("still", !!STILL);
  c.innerHTML = cardsHtml(total(cur.aggs), cp ? total(cp.aggs) : null);
  if (!reduce && !STILL) c.querySelectorAll(".kpi b").forEach(function (b) { countUp(b.querySelector(".n") || b); });
  drawAllCharts();
}
/* Raw tab: daily entries inside the selected date range, click a header to sort */
var RC = [["d","Day"],["spend","Amount spent"],["impressions","Impressions"],["reach","Reach"],["clicks","Link clicks"],["installs","App installs"],["regs","Registrations"],["acts","Activations"],["value","Activation value"]];
function drawRaw() {
  function rc(r, k, u, t) { return route === "ch-tiktok" ? t + " " + splHtml(r, k, u) : t; }
  var id = route.slice(3), all = rows.filter(function (r) { return r.c === id; }), R = rng(all), a = fd(R[0]), b = fd(R[1]);
  var ls = all.filter(function (r) { return r.d >= a && r.d <= b; }).sort(function (x, y) {
    var p = x[sk], q = y[sk]; if (sk !== "d") { p = p || 0; q = q || 0; } return (p < q ? -1 : p > q ? 1 : 0) * sd;
  });
  $("#raw").innerHTML = "<h2>Raw data<span class='mu'>" + ls.length + " days in range</span></h2>" + (ls.length ? "<div class='wrap rw'><table><tr>" + RC.map(function (c) { return "<th><button type='button' class='sort' data-sk='" + c[0] + "'>" + c[1] + (sk === c[0] ? (sd < 0 ? " ▼" : " ▲") : "") + "</button></th>"; }).join("") + "</tr>" + ls.map(function (r) {
    return "<tr><td>" + r.d + "</td><td>" + P(r.spend || 0) + "</td><td>" + N(r.impressions || 0) + "</td><td>" + N(r.reach || 0) + "</td><td>" + N(r.clicks || 0) + "</td><td>" + rc(r, "installs", "n", N(r.installs || 0)) + "</td><td>" + rc(r, "regs", "n", N(r.regs || 0)) + "</td><td>" + rc(r, "acts", "n", N(r.acts || 0)) + "</td><td>" + rc(r, "value", "p0", has(r.value) ? P(r.value) : "—") + "</td></tr>";
  }).join("") + "</table></div>" : "<div class='empty'>No data in this range. " + (shCan(id) ? "Change the date range, sync the sheet in Integrations, or use Add daily data." : "Change the date range or use Add daily data.") + "</div>");
  on("[data-sk]", function (x) { x.onclick = function () { var k = x.dataset.sk; if (sk === k) sd = -sd; else { sk = k; sd = k === "d" ? 1 : -1; } drawRaw(); }; });
}

/* Data tool page */
function data(id) {
  var h = "<div class='top'><div><h1>" + NAME[id] + "</h1><p class='sub'>" + ROLE[id] + "</p></div></div>";
  var f = KPIS.filter(function (k) { return k[1].indexOf(id) > -1; });
  if (f.length) h += "<div class='card'><h2>KPIs sourced here</h2>" + f.map(function (k) { return "<div class='hb' style='grid-template-columns:1fr auto'><span>" + k[0] + "</span><span class='chip'>" + fT(k[2]) + "</span></div>"; }).join("") + "</div>";
  if (id === "segment") h += "<div class='card'><h2>Feeds</h2><div class='flow'><span class='node r'>Segment</span><span class='arr'>›</span><span class='node'>AppsFlyer</span><span class='node'>Amplitude</span><span class='node'>Databricks</span><span class='node'>WebEngage (CRM)</span></div></div>";
  return h + "<div class='empty'>Live tables and charts from " + NAME[id] + " will go here once the connection is built.</div>";
}

/* Settings */
function tgHtml() {
  if (tsc === "all") return "<p class='note'>Defaults for every channel. Leave a box empty for To be decided. Lower is better for ₱ costs and fraud; higher is better for the rest.</p><div class='tg'>" + TM.map(function (m) { return "<label>" + m[1] + "<span class='u'><span>" + (m[2] || m[4]) + "</span><input type='number' step='any' min='0' data-tk='" + m[0] + "' value='" + (has(T[m[0]]) ? T[m[0]] : "") + "' placeholder='TBD'>" + (m[3] ? "<span>" + m[3] + "</span>" : "") + "</span></label>"; }).join("") + "</div><div class='btns' style='margin-top:14px'><button class='btn' data-a='reset'>Reset to onboarding targets</button></div>";
  var o = TC[tsc] || {}, ks = Object.keys(o), left = ADD.filter(function (k) { return !(k in o); });
  var h = "<p class='note'>Targets for " + NAME[tsc] + " only. They replace the defaults on this channel's page and charts. Leave a box empty to use the default.</p>";
  h += ks.length ? "<div class='tg'>" + ks.map(function (k) { var m = MT[k]; return "<label>" + m.l + "<span class='u'><span>" + (m.lo ? "≤ " : "≥ ") + (m.u === "p2" ? "₱" : "") + "</span><input type='number' step='any' min='0' data-ck='" + k + "' value='" + (has(o[k]) ? o[k] : "") + "' placeholder='Default'>" + (m.u === "pc" ? "<span>%</span>" : m.u === "x" ? "<span>x</span>" : "") + "<button class='ic' type='button' data-rm='" + k + "' aria-label='Remove target'>×</button></span></label>"; }).join("") + "</div>" : "<div class='empty'>No custom targets for " + NAME[tsc] + " yet.</div>";
  if (left.length) h += "<div class='sel' style='margin-top:14px'>" + dd("tAdd", left.map(function (k) { return [k, MT[k].l]; }), left[0]) + "<button class='btn pri' type='button' data-a='tadd'>Add target</button></div>";
  return h;
}
function drawTg() { var b = $("#tgb"); if (b) { b.innerHTML = tgHtml(); wire(); } }
function tadd() { var d = $("#tAdd"); if (!d || tsc === "all") return; TC[tsc] = TC[tsc] || {}; TC[tsc][d.dataset.val] = null; sv(); drawTg(); }
function settings() {
  var h = "<div class='top'><div><h1>Settings</h1><p class='sub'>Saved automatically in this browser.</p></div></div>";
  h += "<div class='card'><h2>Appearance</h2><div class='tabs' style='margin:0'>" + [["system","System"],["light","Light"],["dark","Dark"]].map(function (t) { return "<button data-th='" + t[0] + "' class='" + (theme === t[0] ? "on" : "") + "'>" + t[1] + "</button>"; }).join("") + "</div></div>";
  h += "<div class='card'><h2>Targets</h2><div class='sel'><span class='note'>Applies to</span>" + dd("tScope", [["all","All channels"]].concat(CH), tsc) + "</div><div id='tgb'>" + tgHtml() + "</div></div>";
  h += "<div class='card'><h2>Tool access</h2><p class='note' style='margin-top:-6px'>Marks each tool as ready or waiting on the Targets page. Tap to switch.</p><div class='btns'>" + CH.concat(DT, [["webengage","WebEngage"]]).map(function (c) { return "<button class='chip " + (acc[c[0]] ? "good" : "") + "' data-acc='" + c[0] + "'>" + c[1] + ": " + (acc[c[0]] ? "ready" : "waiting") + "</button>"; }).join("") + "</div></div>";
  return h;
}
function lamp(c, t) { return "<span class='lamp " + c + "'><i></i>" + t + "</span>"; }
function afAllText() {
  if (!S.metaUrl) return "Not connected. Add the Apps Script web app URL above.";
  return ["google", "meta"].map(function (c) { var q = sy(c + "_af"); return NAME[c] + ": " + (q.err ? q.err : q.at ? q.n + " days, synced " + new Date(q.at).toLocaleString("en-US", {month:"short", day:"numeric", hour:"numeric", minute:"2-digit"}) : "not synced yet"); }).join(" · ");
}
function afSy() { var a = $("#sy-appsflyer"); if (a) { a.textContent = afAllText(); a.closest(".sync").classList.toggle("err", !!(sy("google_af").err || sy("meta_af").err)); } }
function integrations() {
  var h = "<div class='top'><div><h1>Integrations</h1><p class='sub'>Where the data comes from. Google Sheets today, direct APIs later.</p></div></div>";
  h += "<h2 class='gt'>Google Sheets</h2><div class='card'><h2>Connection<span class='mu'>one web app for every sheet</span></h2><div class='cf'><label>Apps Script web app URL<input type='text' data-s='metaUrl' value='" + (S.metaUrl || "").replace(/'/g, "&#39;") + "' placeholder='https://script.google.com/macros/s/.../exec' autocomplete='off'></label><label>Token (only if you set one in Code.gs)<input type='password' data-s='metaToken' value='" + (S.metaToken || "").replace(/'/g, "&#39;") + "' autocomplete='off'></label></div><div class='btns'><button class='chip " + (S.autoSync !== false ? "good" : "") + "' data-auto='1'>Sync when the app opens: " + (S.autoSync !== false ? "on" : "off") + "</button></div></div>";
  h += "<h2 class='gt'>Channels</h2>";
  [["google", "Google Ads", "green", "Automatic via Script"], ["meta", "Meta Ads", "orange", "Manual Update"], ["tiktok", "TikTok Ads", "orange", "Manual Update"]].forEach(function (c) {
    h += "<div class='card sync" + (sy(c[0]).err ? " err" : "") + "'><div><b>" + c[1] + "</b>" + lamp(c[2], c[3]) + "<p class='note' style='margin:2px 0' id='sy-" + c[0] + "'>" + syText(c[0]) + "</p></div><button class='btn pri' data-a='sync' data-ch='" + c[0] + "'>Sync now</button></div>";
  });
  h += "<div class='card sync'><div><b>AppsFlyer</b>" + lamp("orange", "Manual Update") + "<p class='note' style='margin:2px 0' id='sy-appsflyer'>" + afAllText() + "</p></div><button class='btn pri' data-a='sync' data-ch='appsflyer'>Sync now</button></div>";
  CH.filter(function (c) { return !shCan(c[0]); }).forEach(function (c) {
    h += "<div class='card sync off'><div><b>" + c[1] + "</b>" + lamp("gray", "Not Connected") + "</div></div>";
  });
  h += "<h2 class='gt'>Advanced</h2><div class='card sync'><div><b>Access backend Google Sheet</b><p class='note' style='margin:2px 0'>Opens the sheet the app reads from.</p></div><a class='btn' href='https://docs.google.com/spreadsheets/d/1i6OFzP9b07wlZ4hY-e7AvkS8XM4WeY7h_Sv_YBBz3jo/edit?usp=sharing' target='_blank' rel='noopener'>Open sheet</a></div>";
  h += "<h2 class='gt'>APIs</h2><div class='card'><p class='note' style='margin:0'>APIs coming soon.</p></div>";
  return h;
}

/* ---------- render ---------- */
function render() {
  route = (location.hash || "#home").slice(1); killCharts(); cdef();
  var v = route.indexOf("ch-") === 0 ? chan(route.slice(3)) : route.indexOf("d-") === 0 ? data(route.slice(2)) : route === "settings" ? settings() : route === "integrations" ? integrations() : route === "targets" ? targets() : blank();
  $("#main").innerHTML = "<div class='view'>" + v + "</div>"; nav(); wire();
  if (route === "targets") drawPace(); else paint();
}
function wire() {
  on("[data-a]", function (b) { b.onclick = function () {
    var a = b.dataset.a;
    if (a === "add") form(); else if (a === "csv") csv(); else if (a === "sync") sync(b.dataset.ch || "meta"); else if (a === "tadd") tadd();
    else if (a === "reset") { T = Object.assign({}, TD); sv(); render(); }
  }; });
  on("[data-t]", function (b) { b.onclick = function () { setTab(b.dataset.t); }; });
  on("[data-th]", function (b) { b.onclick = function () { theme = b.dataset.th; applyTheme(); sv(); render(); }; });
  on("[data-acc]", function (b) { b.onclick = function () { var k = b.dataset.acc; acc[k] = acc[k] ? 0 : 1; sv(); b.className = "chip " + (acc[k] ? "good" : ""); b.textContent = NAME[k] + ": " + (acc[k] ? "ready" : "waiting"); }; });
  on("[data-tk]", function (i) { i.oninput = function () { T[i.dataset.tk] = i.value === "" ? null : +i.value; sv(); }; });
  on("[data-s]", function (i) { i.oninput = function () { S[i.dataset.s] = i.value.trim(); sv(); ["meta", "google", "tiktok"].forEach(setSy); }; });
  on("[data-vt]", function (b) { b.onclick = function () { S.vt = !S.vt; sv(); swSet(b, S.vt ? "on" : "off"); var c = $("#cards"); if (c) c.classList.toggle("vt", !!S.vt); }; });
  on("[data-bt]", function (b) { b.onclick = function () { var p = b.dataset.bt.split("|"); CS.types[p[0]] = p[1]; sv(); b.parentNode.querySelectorAll("button").forEach(function (x) { x.classList.toggle("on", x === b); }); }; });
  var chs = $("#charts"); if (chs) chs.onclick = chartClick;
  var cds = $("#cards"); if (cds) cds.onclick = cardClick;
  on("[data-afm]", function (b) { b.onclick = function () { var c = CHN(); if (!afCan(c)) return; afSet(c, function (o) { var all = afState(c) === "on"; AFK.forEach(function (k) { o[k] = all ? 0 : 1; }); }); }; });
  on("[data-ck]", function (i) { i.oninput = function () { TC[tsc] = TC[tsc] || {}; TC[tsc][i.dataset.ck] = i.value === "" ? null : +i.value; sv(); }; });
  on("[data-rm]", function (b) { b.onclick = function (e) { e.preventDefault(); if (TC[tsc]) delete TC[tsc][b.dataset.rm]; sv(); drawTg(); }; });
  on("[data-auto]", function (b) { b.onclick = function () { S.autoSync = S.autoSync === false; sv(); b.className = "chip " + (S.autoSync !== false ? "good" : ""); b.textContent = "Sync when the app opens: " + (S.autoSync !== false ? "on" : "off"); }; });
  on("[data-f]", function (i) { i.onchange = function () { S[i.dataset.f] = i.value; sv(); paint(); }; });
}
function applyTheme() { var h = document.documentElement; if (theme === "system") h.removeAttribute("data-theme"); else h.setAttribute("data-theme", theme); }

/* ---------- data: entry form, CSV, Google Sheet ---------- */
function form() {
  var cur = route.indexOf("ch-") === 0 ? route.slice(3) : "google";
  function num(id, l, req) { return "<label>" + l + "<input type='number' id='" + id + "' min='0' step='any' " + (req ? "required" : "value='0'") + "></label>"; }
  $("#modal").innerHTML = "<div class='modal'><form id='f'><h2>Add daily data</h2><label>Channel" + dd("fc", CH, cur) + "</label><label>Date<input type='date' id='fd' value='" + TODAY + "' required></label><div class='two'>" + num("fs", "Spend (₱)", 1) + num("fi", "Installs", 1) + num("fr", "Registrations", 1) + num("fa", "Activations") + num("fm", "Impressions") + num("fe", "Reach") + "</div>" + num("fk", "Link clicks") + "<div class='btns'><button class='btn pri' type='submit'>Save</button><button class='btn' type='button' id='x'>Cancel</button></div><p class='note'>Saving the same channel and date again replaces the entry.</p></form></div>";
  $("#x").onclick = function () { $("#modal").innerHTML = ""; };
  $("#f").onsubmit = function (e) {
    e.preventDefault();
    var r = {c:$("#fc").dataset.val, d:$("#fd").value, spend:+$("#fs").value, installs:+$("#fi").value, regs:+$("#fr").value, acts:+$("#fa").value, impressions:+$("#fm").value, reach:+$("#fe").value, clicks:+$("#fk").value};
    rows = rows.filter(function (x) { return !(x.c === r.c && x.d === r.d); }); rows.push(r); sv(); $("#modal").innerHTML = ""; render();
  };
}
function csv() {
  var t = "channel,date,spend,impressions,reach,clicks,installs,registrations,activations\n" + rows.map(function (r) { return [r.c, r.d, r.spend, r.impressions || 0, r.reach || 0, r.clicks || 0, r.installs, r.regs, r.acts].join(","); }).join("\n");
  var a = document.createElement("a"); a.href = "data:text/csv;charset=utf-8," + encodeURIComponent(t); a.download = "xpress-marketing-data.csv"; a.click();
}
function syncAf(ch) {
  if (!S.metaUrl) return;
  var k = ch + "_af", u = S.metaUrl + (S.metaUrl.indexOf("?") > -1 ? "&" : "?") + "source=" + k + "&t=" + Date.now() + (S.metaToken ? "&token=" + encodeURIComponent(S.metaToken) : "");
  fetch(u).then(function (r) { return r.json(); }).then(function (j) {
    if (!j || !j.ok) throw new Error((j && j.error) || "The script returned an error");
    if (j.source !== k) throw new Error("Redeploy Code.gs as a new version so it can read the AF tabs");
    AFROWS = AFROWS.filter(function (r) { return r.c !== ch; });
    j.rows.forEach(function (x) { AFROWS.push({c: ch, d: x.day, afi: x.installs, afr: x.registrations, afb: x.bookings, afs: x.rides, afv: x.revenue}); });
    SY[k] = {at: Date.now(), n: j.rows.length, err: ""}; sv(); setSy(ch); if (route === "ch-" + ch) paint();
  }).catch(function (e) { sy(k).err = e.message; sv(); setSy(ch); });
}
function sync(ch) {
  if (ch === "appsflyer") { var as = $("#sy-appsflyer"); if (as) as.textContent = "Syncing…"; syncAf("google"); syncAf("meta"); return; }
  ch = ch || "meta";
  if (afCan(ch)) syncAf(ch);
  if (!S.metaUrl) { sy(ch).err = "Add the Apps Script web app URL in Integrations first."; sv(); setSy(ch); return; }
  var s = $("#sy-" + ch); if (s) s.textContent = "Syncing…";
  var u = S.metaUrl + (S.metaUrl.indexOf("?") > -1 ? "&" : "?") + "source=" + ch + "&t=" + Date.now() + (S.metaToken ? "&token=" + encodeURIComponent(S.metaToken) : "");
  fetch(u).then(function (r) { return r.json(); }).then(function (j) {
    if (!j || !j.ok) throw new Error((j && j.error) || "The script returned an error");
    if (j.source !== ch) throw new Error("Redeploy Code.gs as a new version so it can read the " + NAME[ch] + " tab");
    rows = rows.filter(function (r) { return !(r.c === ch && r.sh); });
    j.rows.forEach(function (x) { rows.push({c:ch, sh:1, d:x.day, spend:x.spend, impressions:x.impressions, reach:x.reach, clicks:x.clicks, installs:x.installs, regs:x.registrations, acts:x.purchases, value:x.purchasesValue, ina:x.installsApp, ins:x.installsSkan, rga:x.registrationsApp, rgs:x.registrationsSkan, aca:x.purchasesApp, acs:x.purchasesSkan, vaa:x.purchasesValueApp, vas:x.purchasesValueSkan}); });
    SY[ch] = {at:Date.now(), n:j.rows.length, err:""}; sv();
    if (route === "targets") render(); else { setSy(ch); if (route === "ch-" + ch) paint(); }
  }).catch(function (e) { sy(ch).err = "Could not load the sheet (" + e.message + "). In Apps Script, deploy as a web app with access set to Anyone, and paste the /exec URL."; sv(); setSy(ch); });
}
function setSy(ch) { afSy(); var s = $("#sy-" + ch); if (s) { s.textContent = syText(ch); var c = s.closest(".sync"); if (c) c.classList.toggle("err", !!sy(ch).err); } }

/* ---------- start ---------- */
/* ---------- login gate ----------
   The app stays hidden until the Apps Script accepts the token (action=ping). Signing out clears the token
   and the data cached in this browser. This guards the data feed, not the page source itself. */
var locked = true, fails = 0, lockUntil = 0;
function verify(url, token) {
  var u = url + (url.indexOf("?") > -1 ? "&" : "?") + "action=ping&source=meta&t=" + Date.now() + "&token=" + encodeURIComponent(token);
  return fetch(u).then(function (r) { return r.json(); }).then(function (j) {
    if (!j || !j.ok) throw new Error(j && /token/i.test(j.error || "") ? "Incorrect token." : ((j && j.error) || "The script returned an error."));
  }, function () { throw new Error("Could not reach the server. Check the web app URL and your connection."); });
}
function unlock() {
  locked = false; document.body.classList.remove("locked"); $("#login").innerHTML = "";
  render();
  if (S.metaUrl && S.autoSync !== false) { sync("meta"); sync("google"); sync("tiktok"); }
}
function signOut() {
  S.metaToken = ""; rows = []; AFROWS = []; SY = {};
  try { localStorage.removeItem("xpm_rows"); localStorage.removeItem("xpm_afrows"); localStorage.removeItem("xpm_sync"); } catch (e) {}
  sv(); killCharts(); locked = true; $("#main").innerHTML = ""; $("#modal").innerHTML = "";
  document.body.classList.add("locked"); showLogin("");
}
function showLogin(msg, busy) {
  var needUrl = !S.metaUrl;
  $("#login").innerHTML = "<form class='lg' id='lgf' autocomplete='off'><img class='logo l' src='xpress-logo.png' alt='Xpress'><img class='logo d' src='xpress-logo-dark.png' alt='Xpress'><h1>Xpress Marketing</h1><p>" + (busy ? "Checking access…" : "Enter your access token to continue.") + "</p>" +
    (needUrl ? "<label>Apps Script web app URL<input type='text' id='lgu' placeholder='https://script.google.com/macros/s/.../exec' autocapitalize='off' spellcheck='false'></label>" : "") +
    "<label>Access token<span class='pw'><input type='password' id='lgt' autocapitalize='off' spellcheck='false'" + (busy ? " disabled" : "") + "><button type='button' id='lgs'>Show</button></span></label>" +
    "<div class='err' id='lge' role='alert'>" + esc(msg || "") + "</div><button class='btn pri' type='submit' id='lgb'" + (busy ? " disabled" : "") + ">" + (busy ? "Checking…" : "Sign in") + "</button>" +
    (needUrl ? "<p class='fine'>Saved on this device after you sign in.</p>" : "") + "</form>";
  var t = $("#lgt"); if (t && !busy) t.focus();
  $("#lgs").onclick = function () { var show = t.type === "password"; t.type = show ? "text" : "password"; this.textContent = show ? "Hide" : "Show"; };
  $("#lgf").onsubmit = function (e) {
    e.preventDefault();
    var wait = Math.ceil((lockUntil - Date.now()) / 1000), url = needUrl ? $("#lgu").value.trim() : S.metaUrl, tok = t.value.trim(), er = $("#lge"), btn = $("#lgb");
    if (wait > 0) { er.textContent = "Too many attempts. Try again in " + wait + "s."; return; }
    if (needUrl && !/^https:\/\//.test(url)) { er.textContent = "Enter the https:// web app URL from Apps Script."; return; }
    if (!tok) { er.textContent = "Enter the access token."; return; }
    btn.disabled = true; btn.textContent = "Checking…"; er.textContent = "";
    verify(url, tok).then(function () {
      fails = 0; S.metaUrl = url; S.metaToken = tok; sv(); unlock();
    }, function (err) {
      if (err.message === "Incorrect token." && ++fails >= 5) { lockUntil = Date.now() + 30000; fails = 0; err = new Error("Too many attempts. Try again in 30s."); }
      btn.disabled = false; btn.textContent = "Sign in"; er.textContent = err.message; t.value = ""; t.focus();
    });
  };
}
addEventListener("hashchange", function () { if (!locked) { render(); scrollTo(0, 0); } });
applyTheme();
if (S.metaUrl && S.metaToken) {
  showLogin("", true);
  verify(S.metaUrl, S.metaToken).then(unlock, function (err) { S.metaToken = ""; sv(); showLogin(err.message); });
} else showLogin("");
if ("serviceWorker" in navigator && /^https?:/.test(location.protocol)) navigator.serviceWorker.register("sw.js").catch(function () {});
})();
