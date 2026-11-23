/**
 * Xpress Marketing: Google Ads > Google Sheet
 *
 * Paste this in Google Ads > Tools > Bulk actions > Scripts > New script (not in Apps Script).
 * It rewrites the "Google Ads" tab of your sheet with one row per day, in the same
 * A to I layout as the Meta tab:
 *   Day | Amount spent | Impressions | Reach | Link clicks | App installs |
 *   Registrations completed | Purchases | Purchases conversion value
 *
 * SETUP
 *   1. Fill in the settings below. The conversion names must match the names in
 *      Google Ads > Goals > Conversions (case does not matter, part of a name is enough).
 *   2. Click Preview. Read the log: it lists every conversion action it found and which
 *      column each one was counted in. Adjust the lists below until they are right.
 *   3. Authorize, run it once, then set the frequency to Daily.
 *
 * Notes
 *   - Amounts are in the Google Ads account currency. Use a PHP account, or convert later.
 *   - Reach is left blank: Google Ads does not give a daily reach number for all campaign types.
 *   - Create the script inside the individual ad account, not a manager account.
 */

// The sheet ID, or the full sheet URL. Both work.
var SHEET = "1i6OFzP9b07wlZ4hY-e7AvkS8XM4WeY7h_Sv_YBBz3jo";
var TAB_NAME = "Google Ads";
var DAYS_BACK = 90;

// Part of the conversion action names to count in each column
var INSTALL = ["install"];
var REGISTRATION = ["registration", "sign up", "signup"];
var ACTIVATION = ["activation", "first ride", "purchase"];

function main() {
  var tz = AdsApp.currentAccount().getTimeZone();
  var end = new Date(), start = new Date(end.getTime() - DAYS_BACK * 864e5);
  var a = Utilities.formatDate(start, tz, "yyyy-MM-dd"), b = Utilities.formatDate(end, tz, "yyyy-MM-dd");
  var where = " FROM customer WHERE segments.date BETWEEN '" + a + "' AND '" + b + "'";
  var days = {}, seen = {};

  function day(d) { return days[d] || (days[d] = { spend: 0, impr: 0, clicks: 0, inst: 0, reg: 0, act: 0, val: 0 }); }
  function pick(o, camel, snake) { return o == null ? 0 : Number(o[camel] != null ? o[camel] : o[snake]) || 0; }
  function has(name, list) { return list.some(function (p) { return name.indexOf(p.toLowerCase()) > -1; }); }

  // 1) spend, impressions, clicks per day
  var it = AdsApp.search("SELECT segments.date, metrics.cost_micros, metrics.impressions, metrics.clicks" + where);
  while (it.hasNext()) {
    var r = it.next(), o = day(r.segments.date);
    o.spend += pick(r.metrics, "costMicros", "cost_micros") / 1e6;
    o.impr += pick(r.metrics, "impressions", "impressions");
    o.clicks += pick(r.metrics, "clicks", "clicks");
  }

  // 2) conversions per day, split by conversion action
  it = AdsApp.search("SELECT segments.date, segments.conversion_action_name, metrics.conversions, metrics.conversions_value" + where);
  while (it.hasNext()) {
    var x = it.next(), d = day(x.segments.date);
    var raw = String(x.segments.conversionActionName != null ? x.segments.conversionActionName : x.segments.conversion_action_name);
    var name = raw.toLowerCase(), n = pick(x.metrics, "conversions", "conversions"), v = pick(x.metrics, "conversionsValue", "conversions_value"), col = "not counted";
    if (has(name, INSTALL)) { d.inst += n; col = "App installs"; }
    else if (has(name, REGISTRATION)) { d.reg += n; col = "Registrations"; }
    else if (has(name, ACTIVATION)) { d.act += n; d.val += v; col = "Purchases"; }
    seen[raw] = col;
  }
  Object.keys(seen).forEach(function (k) { Logger.log("Conversion action \"" + k + "\" -> " + seen[k]); });

  // 3) write the sheet
  var keys = Object.keys(days).sort(), rows = keys.map(function (k) {
    var o = days[k];
    return [k, Math.round(o.spend * 100) / 100, o.impr, "", o.clicks, Math.round(o.inst), Math.round(o.reg), Math.round(o.act), Math.round(o.val * 100) / 100];
  });
  var id = (String(SHEET).match(/[-\w]{25,}/) || [SHEET])[0];
  var ss = SpreadsheetApp.openById(id), sh = ss.getSheetByName(TAB_NAME) || ss.insertSheet(TAB_NAME);
  var header = ["Day", "Amount spent (PHP)", "Impressions", "Reach", "Link clicks", "App installs", "Registrations completed", "Purchases", "Purchases conversion value"];
  sh.clearContents();
  sh.getRange(1, 1, 1, 9).setValues([header]).setFontWeight("bold");
  if (rows.length) {
    sh.getRange(2, 1, rows.length, 1).setNumberFormat("@");
    sh.getRange(2, 1, rows.length, 9).setValues(rows);
  }
  Logger.log("Wrote " + rows.length + " days to the \"" + TAB_NAME + "\" tab.");
}
