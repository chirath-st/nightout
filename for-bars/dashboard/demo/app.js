/* The demo of the bar-owner dashboard website (/dashboard/demo/). Plain JavaScript, no framework, no network.
   Every number comes from data.js (window.SAMPLE). Totals only: no page shows a person, an account or a name. */
(function () {
  'use strict';
  var S = window.SAMPLE;
  // The brand comes from the page's application-name meta (Night Out in site/, filled at deploy). Until it is filled
  // the demo shows the working name, so a local run never shows a raw placeholder.
  var APP = (function () { var m = document.querySelector('meta[name="application-name"]'); var v = m ? m.getAttribute('content') : ''; return !v || v.indexOf('{{') >= 0 ? 'Night Out' : v; })();
  document.querySelectorAll('[data-app]').forEach(function (e) { e.textContent = APP; });
  var DAY = 86400000;
  var WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  var MO = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  // ---------- state ----------
  var params = new URLSearchParams(location.search);
  var state = {
    time: params.get('t') === 'friday' ? 'friday' : 'monday',
    range: null,          // weekend | 7 | 28 | custom
    custom: null,         // { from, to } when range is 'custom' (the calendar, or the ‹ › step buttons)
    compare: 'on',
    metric: 'peak',
    lineMetric: 'peak',
    sorts: { nights: { col: 0, dir: -1 } }, // table id -> { col, dir }: kept across re-renders (resize, range)
    showAll: {},          // table id -> true once "Show all" was pressed
    decided: {}
  };
  // The theme comes from ?theme=light only. The demo stores nothing in the browser (the strip says "Nothing is saved").
  if (params.get('theme') === 'light') document.documentElement.setAttribute('data-theme', 'light');

  // ---------- dates ----------
  var t0 = function (iso) { return Date.parse(iso + 'T00:00:00Z'); };
  var iso = function (ms) { return new Date(ms).toISOString().slice(0, 10); };
  var add = function (d, n) { return iso(t0(d) + n * DAY); };
  var wd = function (d) { return new Date(t0(d)).getUTCDay(); };
  var fmt = function (d) { var x = new Date(t0(d)); return WD[x.getUTCDay()] + ' ' + MO[x.getUTCMonth()] + ' ' + x.getUTCDate(); };
  var fmtS = function (d) { var x = new Date(t0(d)); return MO[x.getUTCMonth()] + ' ' + x.getUTCDate(); };
  var span = function (a, b) { return fmtS(a) + ' – ' + fmtS(b); };
  var night = function (d) { for (var i = 0; i < S.nights.length; i++) if (S.nights[i].date === d) return S.nights[i]; return null; };
  var between = function (a, b) { return S.nights.filter(function (n) { return n.date >= a && n.date <= b; }); };
  var dt = function () { return S.demoTimes[state.time]; };
  var today = function () { return dt().today; };

  function ranges() {
    var y = add(today(), -1);
    var sat = y; while (wd(sat) !== 6 || add(sat, 0) > y) sat = add(sat, -1);
    return {
      weekend: { key: 'weekend', label: 'Last weekend', from: add(sat, -2), to: sat, cmpLabel: 'the weekend before', cmp: { from: add(sat, -9), to: add(sat, -7) } },
      7: { key: '7', label: 'Last 7 nights', from: add(y, -6), to: y, cmpLabel: 'previous 7 nights', cmp: { from: add(y, -13), to: add(y, -7) } },
      28: { key: '28', label: 'Last 28 nights', from: add(y, -27), to: y, cmpLabel: null, cmp: null }
    };
  }
  // The demo holds 28 nights before today (the server keeps 28 nights of totals): every range stays inside them.
  function windowEdges() { var y = add(today(), -1); return { min: add(y, -27), max: y }; }
  function nightsBetween(a, b) { return Math.round((t0(b) - t0(a)) / DAY) + 1; }
  function customRange(from, to) {
    var n = nightsBetween(from, to), inside = add(from, -n) >= windowEdges().min; // compare only with nights the server still keeps
    return { key: 'custom', label: n === 1 ? fmt(from) : 'Custom · ' + n + ' nights', from: from, to: to,
      cmpLabel: inside ? 'the ' + n + ' night' + (n === 1 ? '' : 's') + ' before' : null, cmp: inside ? { from: add(from, -n), to: add(from, -1) } : null };
  }
  function curRange() {
    if (state.range === 'custom' && state.custom) return customRange(state.custom.from, state.custom.to);
    var r = ranges();
    var k = state.range || (state.time === 'friday' ? '7' : 'weekend');
    return r[k];
  }
  // ‹ › move the current range by its own length, never past the 28 nights the demo holds.
  function stepRange(dir) {
    var r = curRange(), n = nightsBetween(r.from, r.to), e = windowEdges();
    var from = add(r.from, dir * n), to = add(r.to, dir * n);
    if (from < e.min || to > e.max) return;
    state.range = 'custom'; state.custom = { from: from, to: to };
  }

  // ---------- sums ----------
  function agg(list) {
    var a = { peak: null, peakDate: null, reports: 0, codes: 0, na: 0, cover: 0, counts: 0, withCount: 0, nights: list.length };
    list.forEach(function (n) {
      if (n.peak != null && (a.peak == null || n.peak > a.peak)) { a.peak = n.peak; a.peakDate = n.date; }
      a.reports += n.reports; a.codes += n.codes; a.na += n.na; a.cover += n.cover; a.counts += n.counts;
      if (n.counts > 0) a.withCount++;
    });
    return a;
  }
  function eventsIn(a, b) { return S.events[state.time].filter(function (e) { return e.date >= a && e.date <= b; }); }

  // ---------- html helpers ----------
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  var SAMPLE_TAG = '<span class="tag-s" title="Sample data">Sample</span>';
  function delta(cur, prev, vsLabel) {
    if (prev == null || cur == null) return '<span class="delta flat"><span class="vs">' + esc(vsLabel || 'No comparison') + '</span></span>';
    var d = cur - prev;
    var cls = d > 0 ? 'up' : d < 0 ? 'down' : 'flat';
    var arrow = d > 0 ? '&#9650;' : d < 0 ? '&#9660;' : '&#8211;';
    var txt = (d > 0 ? '+' : d < 0 ? '−' : '') + Math.abs(d);
    var pct = prev >= 20 && d !== 0 ? ' (' + (d > 0 ? '+' : '−') + Math.round(Math.abs(d) / prev * 100) + '%)' : '';
    return '<span class="delta ' + cls + '"><span aria-hidden="true">' + arrow + '</span>' + txt + pct + ' <span class="vs">vs ' + prev + '</span></span>';
  }
  var I = {
    overview: 'M2 2h5v5H2zM9 2h5v3H9zM9 7h5v7H9zM2 9h5v5H2z',
    tonight: 'M10.5 2.5a5.5 5.5 0 1 0 3 9.8A6 6 0 0 1 10.5 2.5z',
    line: 'M2 13V8M5.5 13V4M9 13V6.5M12.5 13V2.5',
    codes: 'M2 5h12v2a1.5 1.5 0 0 0 0 3v2H2v-2a1.5 1.5 0 0 0 0-3zM10 5v7',
    promos: 'M2 2h6l6 6-6 6-6-6zM5 5h.01',
    events: 'M2.5 3.5h11v10h-11zM2.5 6.5h11M5.5 2v3M10.5 2v3',
    listing: 'M8 14s5-4.5 5-8.2A5 5 0 0 0 3 5.8C3 9.5 8 14 8 14zM8 7.5h.01',
    reports: 'M4 2h6l3 3v9H4zM10 2v3h3M6 9h5M6 11.5h5',
    settings: 'M8 10a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM8 1.5v2M8 12.5v2M1.5 8h2M12.5 8h2M3.4 3.4l1.4 1.4M11.2 11.2l1.4 1.4M3.4 12.6l1.4-1.4M11.2 4.8l1.4-1.4',
    help: 'M8 14.5a6.5 6.5 0 1 0 0-13 6.5 6.5 0 0 0 0 13zM6.2 6.2a1.9 1.9 0 1 1 2.6 1.8c-.5.2-.8.6-.8 1.2v.3M8 11.5h.01',
    ext: 'M9 3h4v4M13 3L7 9M11 9.5V13H3V5h3.5',
    info: 'M8 14.5a6.5 6.5 0 1 0 0-13 6.5 6.5 0 0 0 0 13zM8 7.5v4M8 5h.01',
    dots: 'M3.5 8h.01M8 8h.01M12.5 8h.01',
    cal: 'M2.5 3.5h11v10h-11zM2.5 6.5h11M5.5 2v3M10.5 2v3',
    chev: 'M4 6l4 4 4-4',
    idea: 'M6 12.5h4M6.5 14.5h3M8 1.5a4.5 4.5 0 0 0-2.5 8.2V11h5V9.7A4.5 4.5 0 0 0 8 1.5z',
    fix: 'M8 2l6.5 11.5h-13zM8 6.5v3.5M8 12h.01',
    check: 'M3 8.5l3 3 7-7',
    down: 'M8 2v9M4 7.5l4 4 4-4M2.5 14h11',
    print: 'M4 6V2h8v4M4 11.5H2.5v-5.5h11v5.5H12M4 9.5h8V14H4z',
    link: 'M7 9a3 3 0 0 0 4.2 0l2-2A3 3 0 0 0 9 2.8l-.8.8M9 7a3 3 0 0 0-4.2 0l-2 2A3 3 0 0 0 7 13.2l.8-.8',
    plus: 'M8 3v10M3 8h10',
    x: 'M4 4l8 8M12 4l-8 8'
  };
  function icon(n, s) { s = s || 16; return '<svg width="' + s + '" height="' + s + '" viewBox="0 0 16 16" aria-hidden="true"><path d="' + I[n] + '" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>'; }

  // ---------- navigation ----------
  var NAV = [
    { id: 'overview', label: 'Overview', ic: 'overview' },
    { id: 'tonight', label: 'Tonight', ic: 'tonight' },
    { group: 'Measure' },
    { id: 'line', label: 'Line & door', ic: 'line' },
    { id: 'codes', label: 'Codes & rewards', ic: 'codes' },
    { id: 'events', label: 'Events & ideas', ic: 'events', count: function () { return S.ideas.filter(function (i) { return !state.decided[i.id]; }).length || ''; } },
    { group: 'Manage' },
    { id: 'promotions', label: 'Promotions', ic: 'promos', count: function () { return deals().filter(function (d) { return dstat(d) === 'fix'; }).length || ''; } },
    { id: 'listing', label: 'Listing', ic: 'listing' },
    { id: 'reports', label: 'Reports & email', ic: 'reports' }
  ];
  var NAV2 = [
    { id: 'settings', label: 'Settings & privacy', ic: 'settings' },
    { id: 'help', label: 'Help', ic: 'help', href: '../../bars.html#faq' },
    { id: 'public', label: 'Public listing', ic: 'ext', later: 'n/a in demo' }
  ];
  function drawNav(route) {
    function one(n) {
      if (n.group) return '<h4>' + n.group + '</h4>';
      if (n.later) return '<a href="#/' + route + '" aria-disabled="true" title="Sample Bar has no public listing">' + icon(n.ic) + '<span class="lbl">' + n.label + '</span><span class="later">' + n.later + '</span></a>';
      var c = n.count ? n.count() : '';
      var cur = route === n.id || (route === 'night' && n.id === 'line') ? ' aria-current="page"' : '';
      return '<a href="' + (n.href || '#/' + n.id) + '"' + cur + ' title="' + n.label + '">' + icon(n.ic) + '<span class="lbl">' + n.label + '</span>' + (c ? '<span class="count" aria-label="' + c + ' waiting">' + c + '</span>' : '') + '</a>';
    }
    document.getElementById('nav').innerHTML = NAV.map(one).join('');
    document.getElementById('nav2').innerHTML = NAV2.map(one).join('');
  }

  // ---------- header tools ----------
  function rangeTools(opts) {
    opts = opts || {};
    var r = curRange();
    var all = ranges();
    var h = '';
    if (dt().live) h += '<span class="updated hide-sm">Updated 10:40 PM</span>';
    else h += '<span class="updated hide-sm">Updated 3:00 PM</span>';
    var e = windowEdges(), n = nightsBetween(r.from, r.to);
    var canPrev = add(r.from, -n) >= e.min, canNext = add(r.to, n) <= e.max;
    h += '<span class="stepper"><button class="btn icon" type="button" data-step="-1" aria-label="Previous ' + n + ' night' + (n === 1 ? '' : 's') + '" title="Previous ' + n + ' night' + (n === 1 ? '' : 's') + '"' + (canPrev ? '' : ' disabled') + '>‹</button>' +
      '<div class="dd"><button class="btn" type="button" data-pop="rangePop" aria-haspopup="true" aria-expanded="false">' + icon('cal') + '<span>' + r.label + '</span><span class="k hide-sm">' + span(r.from, r.to) + '</span>' + icon('chev') + '</button>' +
      '<div class="pop pop-range" id="rangePop" role="dialog" aria-label="Date range" hidden><div class="pr-cols"><div class="pr-list">' +
      ['weekend', '7', '28'].map(function (k) { var x = all[k]; return '<button type="button" role="menuitemradio" aria-checked="' + (x.key === r.key) + '" data-range="' + k + '"><span>' + x.label + ' <span class="faint">' + span(x.from, x.to) + '</span></span></button>'; }).join('') +
      '<button type="button" role="menuitemradio" aria-checked="' + (r.key === 'custom') + '" data-range-custom><span>Custom range <span class="faint">pick on the calendar</span></span></button>' +
      '<hr><button type="button" disabled>Last 12 weeks · planned</button>' +
      '<div class="hint">The server keeps 28 nights of totals, so the calendar stops there. Longer ranges need the planned nightly totals table.</div></div>' +
      '<div class="pr-cal" id="prCal">' + calendar(r) + '</div></div></div></div>' +
      '<button class="btn icon" type="button" data-step="1" aria-label="Next ' + n + ' night' + (n === 1 ? '' : 's') + '" title="Next ' + n + ' night' + (n === 1 ? '' : 's') + '"' + (canNext ? '' : ' disabled') + '>›</button></span>';
    if (!opts.noCompare) {
      var on = state.compare === 'on' && r.cmp;
      h += '<div class="dd hide-sm"><button class="btn" type="button" data-pop="cmpPop" aria-haspopup="true" aria-expanded="false"><span>' + (on ? 'vs ' + r.cmpLabel : 'Compare: off') + '</span>' + icon('chev') + '</button>' +
        '<div class="pop" id="cmpPop" role="menu" hidden>' +
        '<button type="button" role="menuitemradio" data-cmp="on" aria-checked="' + !!on + '"' + (r.cmp ? '' : ' disabled') + '>' + (r.cmp ? (r.key === 'custom' ? 'The same number of nights just before' : 'Same nights, one week earlier') : 'Not available: the nights before are past the 28 kept') + '</button>' +
        '<button type="button" role="menuitemradio" data-cmp="off" aria-checked="' + !on + '">Off</button>' +
        '<button type="button" disabled>Average of last 4 same weekdays · planned</button></div></div>';
    }
    h += moreMenu();
    return h;
  }
  // Two-month calendar for a custom range: the first click picks the first night, the second the last. Only the 28
  // nights the demo holds can be picked.
  var pickFrom = null;
  function calendar(r) {
    var e = windowEdges(), out = '';
    var m0 = new Date(t0(e.min)), m1 = new Date(t0(e.max));
    for (var y = m0.getUTCFullYear(), mo = m0.getUTCMonth(); y < m1.getUTCFullYear() || (y === m1.getUTCFullYear() && mo <= m1.getUTCMonth()); mo === 11 ? (mo = 0, y++) : mo++) {
      var first = iso(Date.UTC(y, mo, 1)), days = new Date(Date.UTC(y, mo + 1, 0)).getUTCDate(), lead = (wd(first) + 6) % 7; // weeks start Monday
      out += '<div class="cal-m"><div class="cal-t">' + MO[mo] + ' ' + y + '</div><div class="cal-g" role="grid"><span>Mo</span><span>Tu</span><span>We</span><span>Th</span><span>Fr</span><span>Sa</span><span>Su</span>';
      for (var i = 0; i < lead; i++) out += '<i></i>';
      for (var d = 1; d <= days; d++) {
        var ds = iso(Date.UTC(y, mo, d)), ok = ds >= e.min && ds <= e.max;
        var sel = pickFrom ? ds === pickFrom : ds >= r.from && ds <= r.to;
        var cls = (sel ? ' sel' : '') + (!pickFrom && ds === r.from ? ' a' : '') + (!pickFrom && ds === r.to ? ' b' : '');
        out += ok ? '<button type="button" class="cal-d' + cls + '" data-day="' + ds + '" aria-pressed="' + sel + '" aria-label="' + fmt(ds) + '">' + d + '</button>' : '<i class="off">' + d + '</i>';
      }
      out += '</div></div>';
    }
    return out + '<div class="cal-h">' + (pickFrom ? 'First night ' + fmt(pickFrom) + '. Now pick the last night.' : 'Pick the first night, then the last.') + '</div>';
  }
  function pickDay(ds) {
    if (!pickFrom) { pickFrom = ds; var c = document.getElementById('prCal'); if (c) { c.innerHTML = calendar(curRange()); var f = c.querySelector('[data-day="' + ds + '"]'); if (f) f.focus(); } return; }
    var a = pickFrom < ds ? pickFrom : ds, b = pickFrom < ds ? ds : pickFrom;
    pickFrom = null; state.range = 'custom'; state.custom = { from: a, to: b }; render();
  }
  function moreMenu(extra) {
    return '<div class="dd"><button class="btn icon" type="button" data-pop="morePop" aria-label="More: download, print, copy link" aria-haspopup="true" aria-expanded="false">' + icon('dots') + '</button>' +
      '<div class="pop" id="morePop" role="menu" hidden>' + (extra || '') +
      '<button type="button" data-act="csv"><span>' + icon('down') + ' Download CSV</span><span class="faint">SAMPLE</span></button>' +
      '<button type="button" data-act="print"><span>' + icon('print') + ' Print one page</span></button>' +
      '<button type="button" data-act="link"><span>' + icon('link') + ' Copy link to this view</span></button></div></div>';
  }

  // ---------- charts ----------
  var tip = document.getElementById('tip');
  function showTip(e, html) {
    tip.innerHTML = html; tip.hidden = false;
    var x = e.clientX + 14, y = e.clientY + 14;
    var w = tip.offsetWidth, h = tip.offsetHeight;
    if (x + w > innerWidth - 8) x = e.clientX - w - 14;
    if (y + h > innerHeight - 8) y = e.clientY - h - 14;
    tip.style.left = x + 'px'; tip.style.top = y + 'px';
  }
  function hideTip() { tip.hidden = true; }
  function tipAt(el, html) { var b = el.getBoundingClientRect(); showTip({ clientX: b.left + b.width / 2, clientY: b.top }, html); }
  function nice(max) {
    // a top value that splits into 4 whole-number steps (no 62.5 or 187.5 on the axis)
    if (max <= 4) return 4;
    var raw = max / 4, p = Math.pow(10, Math.floor(Math.log10(raw)));
    var steps = [1, 2, 2.5, 3, 4, 5, 6, 8, 10];
    for (var i = 0; i < steps.length; i++) { var st = steps[i] * p; if (st >= raw && Math.round(st) === st) return st * 4; }
    return 10 * p * 4;
  }
  var METRICS = {
    peak: { label: 'Longest line counted', short: 'Longest line', unit: 'people in line', get: function (n) { return n.peak; } },
    reports: { label: 'Guest line reports', short: 'Line reports', unit: 'reports', get: function (n) { return n.reports; } },
    codes: { label: 'Codes redeemed', unit: 'codes', get: function (n) { return n.codes; } },
    counts: { label: 'Line counts posted', short: 'Counts posted', unit: 'counts posted', get: function (n) { return n.counts; } }
  };
  function tipFor(n) {
    var cmpN = night(add(n.date, -7));
    var row = function (k, v) { return '<div><span>' + k + '</span><span>' + v + '</span></div>'; };
    return '<b>' + fmt(n.date) + (S.notes[n.date] ? ' · ' + esc(S.notes[n.date].text) : '') + '</b>' +
      row('Longest line counted', n.peak == null ? 'no count' : n.peak) + row('Guest line reports', n.reports) +
      row('Codes redeemed', n.codes) + row('Line counts posted', n.counts) +
      (cmpN ? '<div><span class="faint">Same night last week</span><span class="faint">' + (cmpN.peak == null ? '–' : cmpN.peak) + ' · ' + cmpN.reports + ' · ' + cmpN.codes + '</span></div>' : '') +
      '<div><span class="faint">Click to open this night</span><span></span></div>';
  }
  /* Column chart of nights. opts: el, list (nights), metric, hiFrom, hiTo, compare (bool), height */
  function columns(opts) {
    var el = opts.el; if (!el) return;
    var W = Math.max(280, el.clientWidth), H = Math.max(opts.height || 240, opts.fill ? el.clientHeight : 0);
    var padL = 36, padR = 8, padT = 22, padB = 24;
    var m = METRICS[opts.metric];
    var list = opts.list;
    var vals = list.map(m.get);
    var cmpVals = list.map(function (n) { var c = night(add(n.date, -7)); return c ? m.get(c) : null; });
    var mx = nice(Math.max.apply(null, vals.concat(opts.compare ? cmpVals : []).map(function (v) { return v || 0; }).concat([1])));
    var pw = W - padL - padR, ph = H - padT - padB;
    var bw = pw / list.length;
    var colW = Math.max(3, Math.min(28, bw * 0.62));
    var y = function (v) { return padT + ph - (v / mx) * ph; };
    var s = '<svg width="' + W + '" height="' + H + '" role="img" aria-label="' + esc(m.label) + ' per night, ' + span(list[0].date, list[list.length - 1].date) + '">';
    // weekend shading Thu-Sat
    list.forEach(function (n, i) { if ([4, 5, 6].indexOf(wd(n.date)) >= 0) s += '<rect class="shade" x="' + (padL + i * bw) + '" y="' + padT + '" width="' + bw + '" height="' + ph + '"/>'; });
    for (var g = 0; g <= 4; g++) {
      var gv = mx * g / 4, gy = y(gv);
      s += '<line class="' + (g ? 'gridline' : 'baseline') + '" x1="' + padL + '" x2="' + (W - padR) + '" y1="' + gy + '" y2="' + gy + '"/>';
      s += '<text class="lbl" x="' + (padL - 8) + '" y="' + (gy + 4) + '" text-anchor="end">' + (Math.round(gv * 10) / 10) + '</text>';
    }
    list.forEach(function (n, i) {
      var cx = padL + i * bw + bw / 2, v = vals[i];
      var hi = !opts.hiFrom || (n.date >= opts.hiFrom && n.date <= opts.hiTo);
      var note = S.notes[n.date];
      if (note) {
        s += '<line class="note-line" x1="' + cx + '" x2="' + cx + '" y1="' + (padT - 6) + '" y2="' + (padT + ph) + '"/>';
        var anchor = i > list.length - 4 ? 'end' : i < 3 ? 'start' : 'middle';
        s += '<text class="note-txt" x="' + cx + '" y="' + (padT - 10) + '" text-anchor="' + anchor + '">' + esc(note.text) + '</text>';
      }
      if (v == null) {
        s += '<rect class="none-mark" x="' + (cx - colW / 2) + '" y="' + (padT + ph - 6) + '" width="' + colW + '" height="6" data-d="' + n.date + '"><title>' + fmt(n.date) + ': no count posted</title></rect>';
      } else {
        var top = y(v);
        s += '<rect class="col' + (hi ? '' : ' out') + '" tabindex="0" x="' + (cx - colW / 2) + '" y="' + top + '" width="' + colW + '" height="' + Math.max(1, padT + ph - top) + '" rx="2" data-d="' + n.date + '"/>';
      }
      if (opts.compare && hi && cmpVals[i] != null) {
        var cy = y(cmpVals[i]);
        s += '<line class="cmp" x1="' + (cx - colW / 2 - 3) + '" x2="' + (cx + colW / 2 + 3) + '" y1="' + cy + '" y2="' + cy + '"/>';
      }
      var lab = '';
      if (list.length <= 10) lab = WD[wd(n.date)] + ' ' + new Date(t0(n.date)).getUTCDate();
      else if (wd(n.date) === 1 || i === 0) lab = fmtS(n.date);
      if (lab) s += '<text class="lbl" x="' + (list.length <= 10 ? cx : padL + i * bw + 2) + '" y="' + (H - 6) + '" text-anchor="' + (list.length <= 10 ? 'middle' : 'start') + '">' + lab + '</text>';
    });
    s += hitLayer(list, padL, padT, bw, ph);
    s += '</svg>';
    el.innerHTML = s;
    var cols = [].slice.call(el.querySelectorAll('rect.col[data-d]'));
    cols.forEach(function (r) { r.setAttribute('aria-label', fmt(r.getAttribute('data-d')) + ': ' + m.get(night(r.getAttribute('data-d'))) + ' ' + m.unit); });
    wireChart(el, cols, function (d) { return tipFor(night(d)); });
  }
  /* A transparent full-height column per night on top of the chart, plus a guide line: the tooltip and the click work
     anywhere in a night's column (short bars and "no count" nights included), as in Stripe, GA4 or Plausible. */
  function hitLayer(list, padL, padT, bw, ph) {
    var s = '<line class="guide" x1="0" x2="0" y1="' + padT + '" y2="' + (padT + ph) + '" visibility="hidden"/>';
    list.forEach(function (n, i) { s += '<rect class="hit" x="' + (padL + i * bw) + '" y="' + padT + '" width="' + bw + '" height="' + ph + '" data-hit="' + n.date + '"/>'; });
    return s;
  }
  /* Mouse: the hit columns (tooltip, highlight, guide, click opens the night). Keyboard: one tab stop per chart, the last
     night with a value; Left/Right/Home/End move between nights with the tooltip shown, Enter or Space opens one. */
  function wireChart(el, cols, tipHtml) {
    var guide = el.querySelector('.guide');
    var lit = function (d) { el.querySelectorAll('rect.col').forEach(function (c) { c.classList.toggle('hov', c.getAttribute('data-d') === d); }); };
    el.querySelectorAll('rect.hit').forEach(function (h) {
      var d = h.getAttribute('data-hit'), x = +h.getAttribute('x') + +h.getAttribute('width') / 2;
      h.addEventListener('mousemove', function (e) { showTip(e, tipHtml(d)); lit(d); guide.setAttribute('x1', x); guide.setAttribute('x2', x); guide.setAttribute('visibility', 'visible'); });
      h.addEventListener('mouseleave', function () { hideTip(); lit(null); guide.setAttribute('visibility', 'hidden'); });
      h.addEventListener('click', function () { hideTip(); location.hash = '#/night/' + d; });
    });
    var seen = {};
    cols = cols.filter(function (r) { var d = r.getAttribute('data-d'); if (seen[d]) { r.removeAttribute('tabindex'); return false; } seen[d] = 1; return true; });
    cols.forEach(function (r, i) {
      var d = r.getAttribute('data-d');
      r.setAttribute('tabindex', i === cols.length - 1 ? '0' : '-1'); r.setAttribute('role', 'button');
      r.addEventListener('focus', function () { tipAt(r, tipHtml(d)); lit(d); });
      r.addEventListener('blur', function () { hideTip(); lit(null); });
      r.addEventListener('keydown', function (e) {
        var j = null;
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); location.hash = '#/night/' + d; return; }
        if (e.key === 'ArrowRight') j = Math.min(cols.length - 1, i + 1); else if (e.key === 'ArrowLeft') j = Math.max(0, i - 1);
        else if (e.key === 'Home') j = 0; else if (e.key === 'End') j = cols.length - 1;
        if (j == null) return;
        e.preventDefault(); r.setAttribute('tabindex', '-1'); cols[j].setAttribute('tabindex', '0'); cols[j].focus();
      });
    });
  }
  function stacked(el, list) {
    var W = Math.max(280, el.clientWidth), H = Math.max(220, el.clientHeight), padL = 32, padR = 8, padT = 12, padB = 24;
    var mx = nice(Math.max.apply(null, list.map(function (n) { return n.codes; }).concat([1])));
    var pw = W - padL - padR, ph = H - padT - padB, bw = pw / list.length, cw = Math.max(3, Math.min(28, bw * 0.62));
    var y = function (v) { return padT + ph - v / mx * ph; };
    var s = '<svg width="' + W + '" height="' + H + '" role="img" aria-label="Codes redeemed per night by reward">';
    list.forEach(function (n, i) { if ([4, 5, 6].indexOf(wd(n.date)) >= 0) s += '<rect class="shade" x="' + (padL + i * bw) + '" y="' + padT + '" width="' + bw + '" height="' + ph + '"/>'; });
    for (var g = 0; g <= 4; g++) { var gv = mx * g / 4; s += '<line class="' + (g ? 'gridline' : 'baseline') + '" x1="' + padL + '" x2="' + (W - padR) + '" y1="' + y(gv) + '" y2="' + y(gv) + '"/><text class="lbl" x="' + (padL - 8) + '" y="' + (y(gv) + 4) + '" text-anchor="end">' + Math.round(gv * 10) / 10 + '</text>'; }
    list.forEach(function (n, i) {
      var cx = padL + i * bw + bw / 2;
      if (n.na) s += '<rect class="col" x="' + (cx - cw / 2) + '" y="' + y(n.na) + '" width="' + cw + '" height="' + (padT + ph - y(n.na)) + '" data-d="' + n.date + '"/>';
      if (n.cover) s += '<rect class="col col2" x="' + (cx - cw / 2) + '" y="' + y(n.na + n.cover) + '" width="' + cw + '" height="' + (y(n.na) - y(n.na + n.cover)) + '" data-d="' + n.date + '"/>';
      if (wd(n.date) === 1 || i === 0) s += '<text class="lbl" x="' + (padL + i * bw + 2) + '" y="' + (H - 6) + '">' + fmtS(n.date) + '</text>';
    });
    el.innerHTML = s + hitLayer(list, padL, padT, bw, ph) + '</svg>';
    var cols = [].slice.call(el.querySelectorAll('rect.col[data-d]'));
    cols.forEach(function (r) { var n = night(r.getAttribute('data-d')); r.setAttribute('aria-label', fmt(n.date) + ': ' + n.na + ' free non-alcoholic drink, ' + n.cover + ' cover on us'); });
    wireChart(el, cols, function (d) { var n = night(d); return '<b>' + fmt(n.date) + '</b><div><span>Free non-alcoholic drink</span><span>' + n.na + '</span></div><div><span>Cover on us</span><span>' + n.cover + '</span></div><div><span class="faint">Click to open this night</span><span></span></div>'; });
  }
  function hourly(el, hrs) {
    var W = Math.max(240, el.clientWidth), H = 150, padL = 28, padB = 22, padT = 10;
    var labels = ['8 PM', '9 PM', '10 PM', '11 PM', '12 AM', '1 AM', '2 AM'];
    var mx = nice(Math.max.apply(null, hrs.map(function (v) { return v || 0; }).concat([1])));
    var pw = W - padL - 4, ph = H - padT - padB, bw = pw / 7, cw = Math.min(44, bw * 0.6);
    var y = function (v) { return padT + ph - v / mx * ph; };
    var s = '<svg width="' + W + '" height="' + H + '" role="img" aria-label="Largest door count in each hour: ' + hrs.map(function (v, i) { return labels[i] + ' ' + (v == null ? 'no count' : v); }).join(', ') + '">';
    for (var g = 0; g <= 2; g++) { var gv = mx * g / 2; s += '<line class="' + (g ? 'gridline' : 'baseline') + '" x1="' + padL + '" x2="' + W + '" y1="' + y(gv) + '" y2="' + y(gv) + '"/><text class="lbl" x="' + (padL - 6) + '" y="' + (y(gv) + 4) + '" text-anchor="end">' + gv + '</text>'; }
    hrs.forEach(function (v, i) {
      var cx = padL + i * bw + bw / 2;
      if (v == null) s += '<rect class="none-mark" x="' + (cx - cw / 2) + '" y="' + (padT + ph - 6) + '" width="' + cw + '" height="6"><title>' + labels[i] + ': no count</title></rect>';
      else s += '<rect class="col" x="' + (cx - cw / 2) + '" y="' + y(v) + '" width="' + cw + '" height="' + (padT + ph - y(v)) + '" rx="2"><title>' + labels[i] + ': ' + v + ' in line</title></rect><text class="lbl" x="' + cx + '" y="' + (y(v) - 4) + '" text-anchor="middle">' + v + '</text>';
      s += '<text class="lbl" x="' + cx + '" y="' + (H - 6) + '" text-anchor="middle">' + labels[i] + '</text>';
    });
    el.innerHTML = s + '</svg>';
  }
  /* Horizontal paired bars (Going / Interested per event), with a value axis and tooltips. rows: { label, sub, a, b } */
  function hbars(el, rows) {
    if (!el || !rows.length) return;
    var W = Math.max(280, el.clientWidth), labW = Math.min(190, W * 0.42), padR = 28, rowH = 44, padT = 4, padB = 22;
    var H = padT + rows.length * rowH + padB, mx = nice(Math.max.apply(null, rows.map(function (r) { return Math.max(r.a, r.b); }).concat([1])));
    var pw = W - labW - padR, x = function (v) { return labW + v / mx * pw; };
    var s = '<svg width="' + W + '" height="' + H + '" role="img" aria-label="Going and Interested totals by event: ' + esc(rows.map(function (r) { return r.label + ' ' + r.sub + ', ' + r.a + ' Going, ' + r.b + ' Interested'; }).join('; ')) + '">';
    for (var g = 0; g <= 4; g++) { var gx = x(mx * g / 4); s += '<line class="' + (g ? 'gridline' : 'baseline') + '" x1="' + gx + '" x2="' + gx + '" y1="' + padT + '" y2="' + (H - padB) + '"/><text class="lbl" x="' + gx + '" y="' + (H - 6) + '" text-anchor="middle">' + mx * g / 4 + '</text>'; }
    rows.forEach(function (r, i) {
      var y0 = padT + i * rowH;
      s += '<text class="note-txt" x="0" y="' + (y0 + 17) + '">' + esc(r.label.length > 26 ? r.label.slice(0, 25) + '…' : r.label) + '</text><text class="lbl" x="0" y="' + (y0 + 32) + '">' + esc(r.sub) + '</text>';
      s += '<g data-i="' + i + '"><rect class="col" x="' + labW + '" y="' + (y0 + 8) + '" width="' + Math.max(1, x(r.a) - labW) + '" height="12" rx="2"/><rect class="col col2" x="' + labW + '" y="' + (y0 + 22) + '" width="' + Math.max(1, x(r.b) - labW) + '" height="12" rx="2"/>' +
        '<text class="lbl" x="' + (x(r.a) + 4) + '" y="' + (y0 + 18) + '">' + r.a + '</text><text class="lbl" x="' + (x(r.b) + 4) + '" y="' + (y0 + 32) + '">' + r.b + '</text></g>';
    });
    el.innerHTML = s + '</svg>';
    el.querySelectorAll('g[data-i]').forEach(function (gr) {
      var r = rows[+gr.getAttribute('data-i')];
      gr.addEventListener('mousemove', function (e) { showTip(e, '<b>' + esc(r.label) + ' · ' + esc(r.sub) + '</b><div><span>Going</span><span>' + r.a + '</span></div><div><span>Interested</span><span>' + r.b + '</span></div>'); });
      gr.addEventListener('mouseleave', hideTip);
    });
  }
  function spark(vals, hiMask) {
    var w = 120, h = 32, mx = Math.max.apply(null, vals.map(function (v) { return v || 0; }).concat([1]));
    var bw = w / vals.length;
    var s = '<svg class="spark" viewBox="0 0 ' + w + ' ' + h + '" preserveAspectRatio="none" width="100%" height="32" aria-hidden="true">';
    vals.forEach(function (v, i) {
      var bh = v == null ? 0 : Math.max(1, (v / mx) * (h - 2));
      s += '<rect class="col' + (hiMask[i] ? '' : ' out') + '" x="' + (i * bw + bw * 0.15) + '" y="' + (h - bh) + '" width="' + (bw * 0.7) + '" height="' + bh + '"/>';
    });
    return s + '</svg>';
  }
  function hourlySkeleton() {
    // Flat, equal outlines: a planned view must not draw a shape (a peak at 11 PM) that no data backs.
    return '<div class="skel flat" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i><i></i><i></i></div>' +
      '<div class="skel-x" aria-hidden="true"><span>8 PM</span><span>9</span><span>10</span><span>11</span><span>12 AM</span><span>1</span><span>2</span></div>';
  }

  // ---------- shared bits ----------
  function kpi(o) {
    return '<a class="card kpi" href="' + o.href + '"><span class="lab">' + o.label + SAMPLE_TAG + '</span>' +
      '<span class="val"><b>' + o.value + '</b>' + (o.unit ? '<small>' + o.unit + '</small>' : '') + '</span>' +
      '<span class="ctx">' + o.delta + '</span>' + (o.spark || '') + '<span class="ctx' + (o.wrap ? ' wrap' : '') + '">' + (o.ctx || '') + '</span></a>';
  }
  function last28() { var y = add(today(), -1); return between(add(y, -27), y); }
  function card(title, body, o) {
    o = o || {};
    return '<section class="card ' + (o.cls || '') + '"' + (o.id ? ' id="' + o.id + '"' : '') + '><div class="card-h"><h2>' + title + '</h2>' + (o.sub ? '<span class="sub">' + o.sub + '</span>' : '') +
      '<span class="end">' + (o.end || '') + (o.noSample ? '' : SAMPLE_TAG) + '</span></div>' + body + (o.foot ? '<div class="card-f">' + o.foot + '</div>' : '') + '</section>';
  }
  function plannedCard(title, body, cls) {
    return '<section class="card planned ' + (cls || '') + '"><div class="card-h"><h2>' + title + '</h2><span class="end"><span class="tag-plan">Coming next</span></span></div>' + body + '</section>';
  }
  // Promotions follow the server's model (data.js): one night each; states pending, approved, rejected, withdrawn.
  function deals() { return S.deals[state.time]; }
  function dstat(d) {
    if (d.state === 'pending') return 'review';
    if (d.state === 'rejected') return 'fix';
    if (d.state === 'withdrawn') return 'withdrawn';
    if (d.date < today()) return 'ended';
    if (d.date === today() && dt().live) return 'live';
    return 'approved';
  }
  function chip(st) {
    var m = { live: 'Live tonight', approved: 'Approved', review: 'In review', fix: 'Not approved', ended: 'Ended', withdrawn: 'Withdrawn' };
    return '<span class="chip ' + st + '">' + m[st] + '</span>';
  }
  // The line level guests see, by people in line (app/src/ui/components.js levelForPeople: under 10 Quiet, 10-29
  // Lively, 30 or more Packed), with a 3-step meter so colour is never the only cue.
  function lvl(level) {
    var n = { Quiet: 1, Lively: 2, Packed: 3 }[level] || 0;
    return '<span class="lvl lvl-' + level.toLowerCase() + '"><span class="meter" aria-hidden="true">' + [1, 2, 3].map(function (i) { return '<i' + (i <= n ? ' class="on"' : '') + '></i>'; }).join('') + '</span>' + level + '</span>';
  }
  var STATUS_ORDER = { fix: 0, review: 1, live: 2, approved: 3, ended: 4, withdrawn: 5 };
  function mins(t) { var m = /^(\d+):(\d+) (AM|PM)$/.exec(t); if (!m) return 0; var h = +m[1] % 12 + (m[3] === 'PM' ? 12 : 0); if (h < 12) h += 24; return h * 60 + +m[2]; } // a night runs noon to noon

  // ---------- sortable tables (every table.sortable: header buttons, aria-sort, the order kept in state.sorts) ----------
  function cellVal(td) {
    var v = td.getAttribute('data-v');
    if (v != null) return isFinite(Number(v)) && v !== '' ? Number(v) : v;
    var t = td.textContent.replace(/\s+/g, ' ').trim();
    var m = /^[−-]?\d[\d,]*(\.\d+)?/.exec(t);
    return m ? Number(m[0].replace(/,/g, '').replace('−', '-')) : t.toLowerCase();
  }
  function applySort(t, col, dir) {
    var tb = t.tBodies[0]; if (!tb) return;
    var rows = [].slice.call(tb.rows);
    rows.sort(function (a, b) { var x = cellVal(a.cells[col]), y = cellVal(b.cells[col]); if (typeof x !== typeof y) { x = String(x); y = String(y); } return (x < y ? -1 : x > y ? 1 : 0) * dir; });
    rows.forEach(function (r) { tb.appendChild(r); });
    [].forEach.call(t.tHead.rows[0].cells, function (h, i) {
      if (!h.hasAttribute('aria-sort')) return;
      h.setAttribute('aria-sort', i === col ? (dir > 0 ? 'ascending' : 'descending') : 'none');
    });
  }
  function enhanceTables() {
    document.querySelectorAll('#page table.sortable').forEach(function (t) {
      [].forEach.call(t.tHead.rows[0].cells, function (h, ci) {
        if (h.hasAttribute('data-nosort') || !h.textContent.trim()) return;
        h.innerHTML = '<button type="button" data-tsort="' + t.id + ':' + ci + '" title="Sort by ' + esc(h.textContent.trim()) + '">' + h.innerHTML + '<span class="sort-ic" aria-hidden="true"></span></button>';
        h.setAttribute('aria-sort', 'none');
      });
      var st = state.sorts[t.id]; if (st) applySort(t, st.col, st.dir);
    });
  }
  function sortBy(key) {
    var id = key.split(':')[0], col = +key.split(':')[1], t = document.getElementById(id); if (!t) return;
    var cur = state.sorts[id], first = t.tBodies[0].rows[0];
    var numeric = first && typeof cellVal(first.cells[col]) === 'number';
    var dir = cur && cur.col === col ? -cur.dir : (numeric ? -1 : 1);
    state.sorts[id] = { col: col, dir: dir };
    applySort(t, col, dir);
  }

  function shortName(t) { return t.replace(/, .*$/, ''); }
  function upcoming() { return S.events[state.time].filter(function (e) { return e.date >= today(); }); }
  // What ran on a night, as far as the server still knows: approved promotions (kept 7 days after they end) and events it
  // still lists (upcoming, or ended at most 12 hours ago). Older nights show only calendar notes until a history exists.
  function ranOn(d) {
    var out = [];
    deals().forEach(function (x) { if (x.state === 'approved' && x.date === d) out.push(x.title); });
    S.events[state.time].forEach(function (e) { if (e.date === d) out.push(e.title); });
    return out;
  }

  // ---------- pages ----------
  var pages = {};

  pages.overview = function () {
    var r = curRange(), cur = agg(between(r.from, r.to));
    var cmpOn = state.compare === 'on' && r.cmp;
    var prev = cmpOn ? agg(between(r.cmp.from, r.cmp.to)) : null;
    var evs = upcoming(); // totals exist only for events the server still lists (upcoming, or ended at most 12 hours ago)
    var going = evs.reduce(function (a, e) { return a + e.going; }, 0), interested = evs.reduce(function (a, e) { return a + e.interested; }, 0);
    var l28 = last28(), mask = l28.map(function (n) { return n.date >= r.from && n.date <= r.to; });
    var vsTxt = cmpOn ? '' : 'Compare is off';
    var top = '';
    top += '<p class="summary"><span class="badge-sample">Sample</span><span><strong>' + r.label + ' (' + span(r.from, r.to) + '):</strong> your longest line counted was <strong>' + cur.peak + ' people</strong> on ' + fmt(cur.peakDate) +
      (S.notes[cur.peakDate] ? ' (' + esc(S.notes[cur.peakDate].text) + ')' : '') + '. Guests reported your line <strong>' + cur.reports + ' times</strong>' + (prev ? ' (' + prev.reports + ' ' + r.cmpLabel + ')' : '') +
      ', and <strong>' + cur.codes + ' ' + APP + ' codes</strong> were redeemed at your door. Totals only; never who.</span></p>';
    top += '<p class="note computer-note">' + icon('info') + '<span>This dashboard is made for a computer. On a phone, door staff use the staff page.</span></p>';
    top += '<div class="kpis">' +
      kpi({ href: '#/line', label: 'Longest line counted', value: cur.peak == null ? '–' : cur.peak, unit: 'people in line', delta: prev ? delta(cur.peak, prev.peak) : delta(null, null, vsTxt), spark: spark(l28.map(METRICS.peak.get), mask), ctx: cur.peakDate ? fmt(cur.peakDate) + ' · from door counts' : '' }) +
      kpi({ href: '#/line', label: 'Guest line reports', value: cur.reports, delta: prev ? delta(cur.reports, prev.reports) : delta(null, null, vsTxt), spark: spark(l28.map(METRICS.reports.get), mask), ctx: 'Every report guests sent, including ones that didn’t change your estimate', wrap: true }) +
      kpi({ href: '#/events', label: 'Going to upcoming events', value: going, unit: evs.length ? 'Going · ' + interested + ' Interested' : '', delta: '<span class="delta flat"><span class="vs">As listed now, not compared</span></span>', spark: '<div class="spark evlist">' + (evs.map(function (e) { return '<span><em>' + esc(e.title) + ' · ' + fmtS(e.date) + '</em><b>' + e.going + '</b></span>'; }).join('') || 'No upcoming events') + '</div>', ctx: 'Past events’ totals: coming next' }) +
      kpi({ href: '#/codes', label: 'Codes redeemed', value: cur.codes, unit: 'at your door', delta: prev ? delta(cur.codes, prev.codes) : delta(null, null, vsTxt), spark: spark(l28.map(METRICS.codes.get), mask), ctx: 'A floor, not a count of people' }) +
      '</div>';

    var seg = '<span class="seg2" role="group" aria-label="Measure">' + ['peak', 'reports', 'codes'].map(function (k) { return '<button type="button" data-metric="' + k + '" aria-pressed="' + (state.metric === k) + '">' + (METRICS[k].short || METRICS[k].label) + '</button>'; }).join('') + '</span>';
    var mainChart = card('Each night, last 28 nights', '<div class="chart" id="mainChart"></div>',
      { cls: 'c8 mainchart', end: seg, foot: '<span class="legend"><span><i></i>' + r.label + '</span><span><i class="out"></i>Other nights</span>' + (cmpOn ? '<span><i class="cmp"></i>Same night a week earlier</span>' : '') + '<span><i class="shade"></i>Thu–Sat</span></span><span class="end"><a href="#/line" title="Click a night in the chart to open it">View as table</a></span>' });

    var side;
    if (dt().live) {
      var st = S.status.friday.now, tn = night(today());
      side = card('Tonight, so far', '<div class="kv">' +
        '<dt>What guests see now</dt><dd>' + lvl(st.level) + ' ' + st.wait + '<br><small>' + st.people + ' in line · from ' + st.source + ', ' + st.age + '</small></dd>' +
        '<dt>Longest line counted</dt><dd>' + tn.peak + '</dd><dt>Guest line reports</dt><dd>' + tn.reports + '</dd>' +
        '<dt>Codes redeemed</dt><dd>' + tn.codes + ' <small>of 15 nightly limit</small></dd><dt>Line counts posted</dt><dd>' + tn.counts + '</dd></div>',
        { cls: 'c4 sidepanel', sub: fmt(today()) + ', 10:40 PM', foot: '<a href="#/tonight">Open Tonight</a><span class="end"><a href="#/tonight">Report a wrong estimate</a></span>' });
    } else {
      var ds = [r.from, add(r.from, 1), add(r.from, 2)];
      if (r.key !== 'weekend') { var w = ranges().weekend; ds = [w.from, add(w.from, 1), w.to]; }
      var ns = ds.map(night);
      var cell = function (f) { return ns.map(function (n) { return '<div>' + f(n) + '</div>'; }).join(''); };
      side = card('Last weekend, night by night', '<div class="wk">' +
        '<div class="h top"></div>' + ds.map(function (d) { return '<div class="top"><a href="#/night/' + d + '">' + WD[wd(d)] + '</a><span>' + fmtS(d) + '</span></div>'; }).join('') +
        '<div class="h">Longest line</div>' + cell(function (n) { return '<b>' + (n.peak == null ? '–' : n.peak) + '</b>'; }) +
        '<div class="h">Line reports</div>' + cell(function (n) { return n.reports; }) +
        '<div class="h">Codes redeemed</div>' + cell(function (n) { return n.codes; }) +
        '<div class="h">Counts posted</div>' + cell(function (n) { return n.counts; }) +
        '</div><div class="ranlist"><div class="h3">What ran</div>' + ns.map(function (n) { var x = ranOn(n.date).map(shortName); if (S.notes[n.date]) x.unshift(S.notes[n.date].text); return '<div><span>' + WD[wd(n.date)] + '</span>' + (x.map(esc).join(' · ') || '–') + '</div>'; }).join('') + '</div>',
        { cls: 'c4 sidepanel', foot: '<a href="#/night/' + ds[2] + '">Open ' + fmt(ds[2]) + '</a><span class="end">Peak time per night: coming next</span>' });
    }

    var ahead = upcoming();
    var weekAhead = card(dt().live ? 'Coming up' : 'This week ahead', '<div class="tasks">' +
      ahead.map(function (e) { return '<div class="task"><span class="ic">' + icon('events') + '</span><span class="tx"><b>' + esc(e.title) + '</b><span>' + fmt(e.date) + '</span></span><span class="num"><b>' + e.going + '</b> <span class="faint">Going</span> · <b>' + e.interested + '</b> <span class="faint">Interested</span></span></div>'; }).join('') +
      deals().filter(function (d) { var x = dstat(d); return x === 'live' || x === 'approved'; }).map(function (d) { return '<div class="task"><span class="ic">' + icon('promos') + '</span><span class="tx"><b>' + esc(d.title) + '</b><span>' + fmt(d.date) + ', ' + d.time + ' · promotion</span></span>' + chip(dstat(d)) + '</div>'; }).join('') +
      '</div>', { cls: 'c4 flex3', foot: '<a href="#/events">Events & ideas</a><span class="end"><a href="#/events">Send us your event</a></span>' });

    var open = S.ideas.filter(function (i) { return !state.decided[i.id]; });
    var fix = deals().filter(function (d) { return dstat(d) === 'fix'; });
    var needs = card('Needs your answer', '<div class="tasks">' +
      open.map(function (i) { return '<div class="task"><span class="ic">' + icon('idea') + '</span><span class="tx"><b>Guest idea: ' + esc(i.title) + '</b><span>For ' + fmt(i.date) + ' · ' + i.interested + ' Interested · ' + i.going + ' Going</span></span><a class="btn sm" href="#/events">Answer</a></div>'; }).join('') +
      fix.map(function (d) { return '<div class="task"><span class="ic">' + icon('fix') + '</span><span class="tx"><b>Promotion not approved</b><span>' + esc(d.title) + ' · ' + fmt(d.date) + '</span></span><a class="btn sm" href="#/promotions">Edit</a></div>'; }).join('') +
      '<div class="task"><span class="ic">' + icon('check') + '</span><span class="tx"><b>Finish setup: 3 of 5 done <span class="tag-plan">Planned</span></b><span>Next: submit your first promotion</span><div class="progress"><i data-w="60"></i></div></span><a class="btn sm" href="#/settings">Open</a></div>' +
      '</div>', { cls: 'c4 flex3', sub: (open.length + fix.length + 1) + ' items' });

    var saw = plannedCard('What guests saw, hour by hour', '<p>Friday and Saturday, hour by hour: the wait guests were shown and how fresh it was. Needs the planned nightly snapshot of your public estimate (no new data collected).</p>' + hourlySkeleton() + '<p class="faint">No numbers until it’s approved. Today only last night is kept: see Line &amp; door.</p>', 'c4 flex3');

    var rw = agg(between(r.from, r.to));
    var rewardsCard = card('Codes by reward', '<div class="blist">' +
      [['Free non-alcoholic drink', rw.na], ['Cover on us', rw.cover]].map(function (x) { return '<div class="it"><span>' + x[0] + '</span><b>' + x[1] + '</b><span class="track"><i data-w="' + (rw.codes ? Math.round(x[1] / rw.codes * 100) : 0) + '"></i></span></div>'; }).join('') +
      '</div>', { cls: 'c6 keep', sub: r.label, foot: '<span>Codes come from ' + APP + ' rewards. Your promotions don’t produce codes.</span><span class="end"><a href="#/codes">Details</a></span>' });
    var promos = '<section class="card flush c6 keep"><div class="card-h"><h2>Promotions</h2><span class="end"><a class="btn sm" href="#/promotions/new">' + icon('plus', 14) + 'New promotion</a>' + SAMPLE_TAG + '</span></div><div class="tbl-wrap"><table class="sortable" id="ovPromos" data-csv="promotions"><thead><tr><th>Promotion</th><th>Night</th><th>Status</th></tr></thead><tbody>' +
      deals().filter(function (d) { return d.date >= today(); }).slice(0, 4).map(function (d) { return '<tr><td><a class="rowlink" href="#/promotions">' + esc(d.title) + '</a></td><td class="muted" data-v="' + d.date + '">' + fmt(d.date) + '</td><td data-v="' + STATUS_ORDER[dstat(d)] + '">' + chip(dstat(d)) + '</td></tr>'; }).join('') + '</tbody></table></div><div class="card-f pad"><a href="#/promotions">All ' + deals().length + ' promotions</a><span class="end">Each promotion is one night</span></div></section>';

    return { title: 'Overview', tools: rangeTools(), html: top + '<div class="grid row-gap">' + mainChart + side + '</div><div class="grid row-gap">' + weekAhead + needs + saw + '</div><div class="grid row-gap">' + rewardsCard + promos + '</div>',
      after: function () { columns({ el: document.getElementById('mainChart'), list: l28, metric: state.metric, hiFrom: r.from, hiTo: r.to, compare: !!cmpOn, height: 240, fill: true }); } };
  };

  pages.tonight = function () {
    var TQ = 'What are guests told about your line right now, and how close are tonight’s rewards to their nightly limits?';
    if (!dt().live) {
      // Before the night starts: what is already known (hours, tonight's and this week's promotions and events, reward
      // limits, last night as a recap). No live numbers yet.
      var hrs = S.listing.hours, todayHrs = hrs[(wd(today()) + 6) % 7][1], closed = todayHrs === 'Closed';
      var nextOpen = null; for (var k = 1; k <= 7 && !nextOpen; k++) { var dd = add(today(), k), hh = hrs[(wd(dd) + 6) % 7][1]; if (hh !== 'Closed') nextOpen = { d: dd, h: hh }; }
      var ln0 = S.status.monday.lastNight, last = night(ln0.date);
      var soon = deals().filter(function (d) { var x = dstat(d); return d.date >= today() && (x === 'approved' || x === 'live' || x === 'review'); }).map(function (d) { return { date: d.date, html: '<div class="task"><span class="ic">' + icon('promos') + '</span><span class="tx"><b>' + esc(d.title) + '</b><span>' + fmt(d.date) + ', ' + d.time + ' · promotion</span></span>' + chip(dstat(d)) + '</div>' }; })
        .concat(upcoming().map(function (e) { return { date: e.date, html: '<div class="task"><span class="ic">' + icon('events') + '</span><span class="tx"><b>' + esc(e.title) + '</b><span>' + fmt(e.date) + ' · event</span></span><span class="num"><b>' + e.going + '</b> <span class="faint">Going</span></span></div>' }; }))
        .sort(function (x, y) { return x.date < y.date ? -1 : x.date > y.date ? 1 : 0; });
      var limits0 = S.rewards.map(function (rw) { return '<div class="it"><span>' + rw.title + '</span><b>0 of ' + rw.perNight + '</b><span class="track"><i data-w="0"></i></span></div>'; }).join('');
      return { title: 'Tonight', q: TQ, tools: '<span class="updated hide-sm">Updated 3:00 PM</span>' + moreMenu(), html: '<div class="grid"><section class="card c8"><div class="card-h"><h2>' + (closed ? 'Closed tonight' : 'Nothing live yet tonight') + '</h2><span class="sub">' + dt().label + '</span><span class="end">' + SAMPLE_TAG + '</span></div>' +
        '<p class="muted">' + (closed ? 'Your listed hours say Sample Bar is closed on ' + WD[wd(today())] + 'days, so guests see “Closed”. ' : '') + 'Tonight’s numbers start when your door staff post a line count or a guest reports your line. Most managers check this page from about 6 PM.' + (nextOpen ? ' Next open night: <b>' + fmt(nextOpen.d) + ', ' + nextOpen.h + '</b>.' : '') + '</p>' +
        '<p class="row-gap"><button class="btn primary" type="button" data-time-go="friday">See a busy night: switch the demo to Friday 10:40 PM</button></p></section>' +
        card('At the door?', '<p class="muted">Door staff count the line and redeem codes on the staff page, on a phone: <b>the ' + APP + ' staff page</b>. This dashboard is for the office.</p>', { cls: 'c4', noSample: true }) + '</div>' +
        '<div class="grid row-gap">' +
        card('Last night, hour by hour', '<div class="chart" id="hrChart"></div>', { cls: 'c8', sub: fmt(ln0.date) + ' · largest door count each hour', foot: '<span>Peak ' + ln0.peakLow + '–' + ln0.peakHigh + ' around ' + ln0.peakAt + ' · public, as guests saw it</span><span class="end"><a href="#/night/' + ln0.date + '">Open ' + fmt(ln0.date) + '</a></span>' }) +
        card('Last night in numbers', '<div class="kv"><dt>Longest line counted</dt><dd>' + (last.peak == null ? '–' : last.peak) + '</dd><dt>Guest line reports</dt><dd>' + last.reports + '</dd><dt>Codes redeemed</dt><dd>' + last.codes + '</dd><dt>Line counts posted</dt><dd>' + last.counts + '</dd></div>', { cls: 'c4', sub: fmt(ln0.date) }) +
        '</div><div class="grid row-gap">' +
        card('Coming up', '<div class="tasks">' + (soon.map(function (x) { return x.html; }).join('') || '<p class="muted">Nothing listed for the next 7 days.</p>') + '</div>', { cls: 'c8', sub: 'promotions and events, next 7 days', foot: '<a href="#/promotions">Promotions</a><span class="end"><a href="#/events">Events & ideas</a></span>' }) +
        card(closed ? 'Reward limits, next open night' : 'Reward limits tonight', '<div class="blist">' + limits0 + '</div>', { cls: 'c4', foot: '<span>Limits reset at noon. A reward stops showing to guests once its nightly limit is reached.</span>' }) +
        '</div>', after: function () { hourly(document.getElementById('hrChart'), ln0.hourly); } };
    }
    var st = S.status.friday.now, tn = night(today());
    var meters = S.rewards.map(function (rw) { var used = rw.id === 'na-drink' ? tn.na : tn.cover; return '<div class="it"><span>' + rw.title + '</span><b>' + used + ' of ' + rw.perNight + '</b><span class="track"><i data-w="' + Math.round(used / rw.perNight * 100) + '"></i></span></div>'; }).join('');
    var html = '<div class="kpis">' +
      kpi({ href: '#/line', label: 'Longest line counted', value: tn.peak, unit: 'people in line', delta: '<span class="delta flat"><span class="vs">' + S.status.friday.lastNight.peakLow + '–' + S.status.friday.lastNight.peakHigh + ' at the peak last night</span></span>' }) +
      kpi({ href: '#/line', label: 'Guest line reports', value: tn.reports, delta: '<span class="delta flat"><span class="vs">since the night began</span></span>' }) +
      kpi({ href: '#/codes', label: 'Codes redeemed', value: tn.codes, unit: 'at your door', delta: '<span class="delta flat"><span class="vs">' + tn.na + ' drink · ' + tn.cover + ' cover</span></span>' }) +
      kpi({ href: '#/line', label: 'Line counts posted', value: tn.counts, delta: '<span class="delta flat"><span class="vs">last one 6 min ago</span></span>' }) +
      '</div><div class="grid row-gap">' +
      card('What guests see right now', '<div class="big">' + lvl(st.level) + ' · ' + st.wait + '</div><p class="muted row-gap">' + st.people + ' people in line · from ' + st.source + ', ' + st.age + '. This is the same estimate every guest sees. Nobody can pay to change or hide it.</p>' +
        (st.unconfirmed ? '<p class="note row-gap">' + icon('info') + '<span><b>' + st.unconfirmed + ' guest report in the last 20 min is not confirmed yet.</b> One report alone doesn’t change the estimate: it counts once a second guest reports an overlapping line, or a door count agrees. It is in your Guest line reports total either way.</span></p>' : '') +
        '<p class="faint row-gap">The estimate is worked out again about every minute, and guests’ apps check for a new one about every 45 seconds. Not live to the second.</p>',
        { cls: 'c6', foot: '<button class="btn sm" type="button" data-act="wrong">Report a wrong estimate</button><span class="end">We check it, as the For bars page says</span>' }) +
      card('Reward limits tonight', '<div class="blist">' + meters + '</div><p class="faint row-gap">A reward stops showing to guests when its nightly limit is reached.</p>' +
        '<div class="h3 row-gap">On tonight</div><div class="tasks">' + deals().filter(function (d) { return dstat(d) === 'live'; }).map(function (d) { return '<div class="task"><span class="ic">' + icon('promos') + '</span><span class="tx"><b>' + esc(d.title) + '</b><span>' + d.time + ' · promotion</span></span>' + chip('live') + '</div>'; }).join('') +
        S.events[state.time].filter(function (e) { return e.date === today(); }).map(function (e) { return '<div class="task"><span class="ic">' + icon('events') + '</span><span class="tx"><b>' + esc(e.title) + '</b><span>event</span></span><span class="num"><b>' + e.going + '</b> <span class="faint">Going</span></span></div>'; }).join('') +
        '</div>', { cls: 'c6', foot: '<a href="#/promotions">Promotions</a><span class="end"><a href="#/events">Events & ideas</a></span>' }) +
      '</div><div class="grid row-gap">' +
      '<section class="card flush c6"><div class="card-h"><h2>Codes redeemed tonight</h2><span class="sub">No account, no name</span><span class="end">' + SAMPLE_TAG + '</span></div><div class="tbl-wrap"><table class="sortable" id="tonightCodes" data-csv="codes-tonight"><thead><tr><th>Time</th><th>Reward</th><th>Code ends</th></tr></thead><tbody>' +
      S.tonightCodes.map(function (c) { return '<tr><td data-v="' + mins(c.at) + '">' + c.at + '</td><td>' + c.reward + '</td><td class="num">…' + c.hint + '</td></tr>'; }).join('') + '</tbody></table></div><div class="card-f pad">Reward, time and the last 4 characters: enough to settle a question at the door.</div></section>' +
      card('Last night, hour by hour', '<div class="chart" id="hrChart"></div>', { cls: 'c6', sub: fmt(S.status.friday.lastNight.date) + ' · largest door count each hour', foot: '<span>Peak ' + S.status.friday.lastNight.peakLow + '–' + S.status.friday.lastNight.peakHigh + ' around ' + S.status.friday.lastNight.peakAt + ' · public, as guests saw it</span>' }) +
      '</div><p class="note row-gap">' + icon('info') + '<span>At the door? Door staff use <b>the ' + APP + ' staff page</b> on a phone to count the line and redeem codes.</span></p>';
    return { title: 'Tonight', q: TQ, crumb: '', tools: '<span class="updated">Updated 10:40 PM</span><button class="btn" type="button" data-act="refresh">Refresh</button>' + moreMenu(), html: html,
      after: function () { hourly(document.getElementById('hrChart'), S.status.friday.lastNight.hourly); } };
  };

  pages.line = function () {
    if (!state.range) state.range = '28';
    var r = curRange(), cur = agg(between(r.from, r.to));
    var cmpOn = state.compare === 'on' && r.cmp, prev = cmpOn ? agg(between(r.cmp.from, r.cmp.to)) : null;
    var l28 = last28();
    var ln = S.status[state.time].lastNight;
    var seg = '<span class="seg2" role="group" aria-label="Measure">' + ['peak', 'reports', 'counts'].map(function (k) { return '<button type="button" data-lmetric="' + k + '" aria-pressed="' + (state.lineMetric === k) + '">' + (METRICS[k].short || METRICS[k].label) + '</button>'; }).join('') + '</span>';
    var list = between(r.from, r.to).slice();
    var html = '<div class="kpis">' +
      kpi({ href: '#/line', label: 'Longest line counted', value: cur.peak, unit: 'people in line', delta: prev ? delta(cur.peak, prev.peak) : delta(null, null, 'No compare for 28 nights'), ctx: fmt(cur.peakDate) }) +
      kpi({ href: '#/line', label: 'Guest line reports', value: cur.reports, delta: prev ? delta(cur.reports, prev.reports) : delta(null, null, 'No compare for 28 nights'), ctx: 'Average ' + Math.round(cur.reports / cur.nights * 10) / 10 + ' a night' }) +
      kpi({ href: '#/line', label: 'Nights with a line count', value: cur.withCount + ' of ' + cur.nights, delta: '<span class="delta flat"><span class="vs">' + cur.counts + ' line counts posted by your staff</span></span>', ctx: 'More counts, better estimates' }) +
      kpi({ href: '#/line', label: 'Busy nights covered', value: between(r.from, r.to).filter(function (n) { return [4, 5, 6].indexOf(wd(n.date)) >= 0 && n.counts > 0; }).length + ' of ' + between(r.from, r.to).filter(function (n) { return [4, 5, 6].indexOf(wd(n.date)) >= 0; }).length, delta: '<span class="delta flat"><span class="vs">Thu–Sat nights with at least one count</span></span>', ctx: 'Coverage, not people' }) +
      '</div><div class="grid row-gap">' +
      card('Each night', '<div class="chart" id="lineChart"></div>', { cls: 'c12', end: seg, foot: '<span class="legend"><span><i></i>' + r.label + '</span>' + (cmpOn ? '<span><i class="cmp"></i>Same night a week earlier</span>' : '') + '<span><i class="shade"></i>Thu–Sat</span><span><i class="nonebox"></i>No count posted</span></span><span class="end">Click a night to open its report</span>' }) +
      '</div><div class="grid row-gap">' +
      card('Last night, hour by hour', '<div class="chart" id="hrChart"></div>', { cls: 'c6', sub: fmt(ln.date) + ' · largest door count each hour', foot: '<span>Peak ' + ln.peakLow + '–' + ln.peakHigh + ' around ' + ln.peakAt + ' · from your ' + ln.source + 's. Only the most recent night is kept today.</span>' }) +
      plannedCard('Shape of a usual night', '<p>Guest reports and door counts by weekday and hour, averaged over recent nights, so you can see when to put a second person on the door. Needs a new totals-only report; any hour with fewer than ' + S.smallNumber + ' reports shows “fewer than ' + S.smallNumber + '”.</p>' + hourlySkeleton(), 'c6') +
      '</div><section class="card flush row-gap"><div class="card-h"><h2>Nights</h2><span class="sub">' + r.label + ' · ' + span(r.from, r.to) + '</span><span class="end"><button class="btn sm" type="button" data-act="csv">' + icon('down', 14) + 'Download CSV</button>' + SAMPLE_TAG + '</span></div>' +
      '<div class="tbl-wrap tall"><table class="sortable" id="nights" data-csv="nights"><thead><tr><th>Night</th><th class="r">Longest line counted</th><th class="r">Line counts posted</th><th class="r">Guest line reports</th><th class="r">Codes redeemed</th><th title="Promotions are kept 7 days after their night; events 12 hours">What ran</th><th data-nosort><span class="sr">Open</span></th></tr></thead><tbody>' +
      list.map(function (n) { var x = ranOn(n.date); if (S.notes[n.date]) x.unshift(S.notes[n.date].text); return '<tr><td data-v="' + n.date + '"><a class="rowlink" href="#/night/' + n.date + '">' + fmt(n.date) + '</a></td><td class="r" data-v="' + (n.peak == null ? -1 : n.peak) + '"><span class="barcell" data-w2="' + (n.peak || 0) + '"></span>' + (n.peak == null ? '<span class="faint">no count</span>' : n.peak) + '</td><td class="r">' + n.counts + '</td><td class="r">' + n.reports + '</td><td class="r">' + n.codes + '</td><td class="muted clip"' + (x.length ? ' title="' + esc(x.join(' · ')) + '"' : '') + '>' + (x.map(esc).join(' · ') || '') + '</td><td class="r"><a class="link" href="#/night/' + n.date + '">Open</a></td></tr>'; }).join('') +
      '</tbody></table></div><div class="card-f pad">' + list.length + ' nights · a night runs noon to noon, New York time · click a column to sort · “What ran” shows promotions from the last 7 days and calendar notes</div></section>';
    return { title: 'Line & door', q: 'How long was your line each night, and did your door staff post counts on the busy nights?', tools: rangeTools(), html: html, after: function () {
      columns({ el: document.getElementById('lineChart'), list: l28, metric: state.lineMetric, hiFrom: r.from, hiTo: r.to, compare: !!cmpOn, height: 260 });
      hourly(document.getElementById('hrChart'), ln.hourly);
      document.querySelectorAll('[data-w2]').forEach(function (e) { e.style.width = Math.round(+e.getAttribute('data-w2') / 210 * 48) + 'px'; });
    } };
  };

  pages.codes = function () {
    if (!state.range) state.range = '28';
    var r = curRange(), cur = agg(between(r.from, r.to));
    var cmpOn = state.compare === 'on' && r.cmp, prev = cmpOn ? agg(between(r.cmp.from, r.cmp.to)) : null;
    var list = last28();
    var byWd = [0, 1, 2, 3, 4, 5, 6].map(function (d) { var ns = list.filter(function (n) { return wd(n.date) === d; }); return { d: d, avg: ns.reduce(function (a, n) { return a + n.codes; }, 0) / (ns.length || 1) }; });
    var order = [1, 2, 3, 4, 5, 6, 0];
    var mx = Math.max.apply(null, byWd.map(function (x) { return x.avg; }));
    var html = '<div class="kpis">' +
      kpi({ href: '#/codes', label: 'Codes redeemed', value: cur.codes, unit: 'at your door', delta: prev ? delta(cur.codes, prev.codes) : delta(null, null, 'No compare for 28 nights'), ctx: 'A floor, not a count of people' }) +
      kpi({ href: '#/codes', label: 'Free non-alcoholic drink', value: cur.na, delta: prev ? delta(cur.na, prev.na) : delta(null, null, ''), ctx: 'Drinks given' }) +
      kpi({ href: '#/codes', label: 'Cover on us', value: cur.cover, delta: prev ? delta(cur.cover, prev.cover) : delta(null, null, ''), ctx: 'Covers waived (no dollar figures)' }) +
      kpi({ href: '#/codes', label: 'Nights with a code', value: between(r.from, r.to).filter(function (n) { return n.codes > 0; }).length + ' of ' + cur.nights, delta: '<span class="delta flat"><span class="vs">' + r.label + '</span></span>', ctx: '' }) +
      '</div><div class="grid row-gap">' +
      card('Codes per night, by reward', '<div class="chart" id="stackChart"></div>', { cls: 'c8 mainchart', foot: '<span class="legend"><span><i></i>Free non-alcoholic drink</span><span><i class="c2"></i>Cover on us</span><span><i class="shade"></i>Thu–Sat</span></span>' }) +
      card('Codes by weekday', '<div class="blist">' + order.map(function (d) { var x = byWd[d]; return '<div class="it"><span>' + WD[d] + '</span><b>' + (Math.round(x.avg * 10) / 10) + '</b><span class="track"><i data-w="' + Math.round(x.avg / (mx || 1) * 100) + '"></i></span></div>'; }).join('') + '</div>', { cls: 'c4', sub: 'average, last 4 weeks' }) +
      '</div><div class="grid row-gap">' +
      '<section class="card flush c8"><div class="card-h"><h2>Your reward offers</h2><span class="end">' + SAMPLE_TAG + '</span></div><div class="tbl-wrap"><table class="sortable" id="rewardOffers" data-csv="rewards"><thead><tr><th>Reward</th><th>Offered</th><th class="r">Nightly limit</th><th class="r">' + r.label + '</th><th class="r">Share</th><th class="r">Best night</th></tr></thead><tbody>' +
      S.rewards.map(function (rw) { var key = rw.id === 'na-drink' ? 'na' : 'cover'; var best = between(r.from, r.to).reduce(function (a, n) { return n[key] > (a ? a[key] : -1) ? n : a; }, null); return '<tr><td>' + rw.title + '</td><td>' + '<span class="chip live">Offered</span>' + '</td><td class="r">' + rw.perNight + '</td><td class="r">' + cur[key] + '</td><td class="r" data-v="' + (cur.codes ? Math.round(cur[key] / cur.codes * 100) : 0) + '">' + (cur.codes ? Math.round(cur[key] / cur.codes * 100) + '%' : '–') + '</td><td class="r" data-v="' + best[key] + '">' + best[key] + ' · ' + fmt(best.date) + '</td></tr>'; }).join('') +
      '</tbody></table></div></section>' +
      card('How codes work', '<ul class="ticks"><li>Guests earn points in the app and trade them for a reward at a bar that offers it.</li><li>Your staff redeem the code at the door; it counts once.</li><li>Codes come from ' + APP + ' rewards. Your promotions are separate and don’t produce codes.</li><li>One guest can hold more than one code, so codes aren’t people.</li></ul>', { cls: 'c4', noSample: true }) +
      '</div>';
    return { title: 'Codes & rewards', q: 'How many ' + APP + ' codes did your door redeem, for which reward, and on which nights?', tools: rangeTools(), html: html, after: function () { stacked(document.getElementById('stackChart'), list); } };
  };

  pages.night = function (d) {
    var n = night(d) || night('2026-10-31');
    d = n.date;
    var c = night(add(d, -7));
    var y = add(today(), -1);
    var isLast = d === S.status[state.time].lastNight.date;
    var evs = S.events[state.time].filter(function (e) { return e.date === d; });
    var prevD = add(d, -1), nextD = add(d, 1);
    var ran = ranOn(d);
    // The same weekday in the 4 weeks before, as far back as the 28 kept nights go.
    var same = [4, 3, 2, 1].map(function (k) { return night(add(d, -7 * k)); }).filter(function (x) { return x && x.date >= windowEdges().min; });
    var avg = same.length ? (function () { var r1 = function (v) { return Math.round(v * 10) / 10; }, wp = same.filter(function (x) { return x.peak != null; });
      return { peak: wp.length ? r1(wp.reduce(function (t, x) { return t + x.peak; }, 0) / wp.length) : '–', reports: r1(same.reduce(function (t, x) { return t + x.reports; }, 0) / same.length), codes: r1(same.reduce(function (t, x) { return t + x.codes; }, 0) / same.length) }; })() : null;
    var wrongTxt = '<p class="muted">If the estimate guests saw that night looked wrong, tell us. We check it against the reports and counts, as the For bars page says. Nobody can pay to change or hide an estimate.</p>';
    var wrongBtn = '<button class="btn sm" type="button" data-act="wrong">Report a wrong estimate for this night</button>';
    var html = '<div class="kpis">' +
      kpi({ href: '#/line', label: 'Longest line counted', value: n.peak == null ? '–' : n.peak, unit: 'people in line', delta: c ? delta(n.peak, c.peak) : '', ctx: 'vs ' + (c ? fmt(c.date) : '–') }) +
      kpi({ href: '#/line', label: 'Guest line reports', value: n.reports, delta: c ? delta(n.reports, c.reports) : '', ctx: 'vs ' + (c ? fmt(c.date) : '–') }) +
      kpi({ href: '#/codes', label: 'Codes redeemed', value: n.codes, delta: c ? delta(n.codes, c.codes) : '', ctx: n.na + ' non-alcoholic drink · ' + n.cover + ' cover on us' }) +
      kpi({ href: '#/line', label: 'Line counts posted', value: n.counts, delta: '<span class="delta flat"><span class="vs">by your staff and ours</span></span>', ctx: n.counts ? '' : 'No count: guests saw an estimate from reports only' }) +
      '</div><div class="grid row-gap">' +
      card('This ' + WD[wd(d)] + ' next to the ' + same.length + ' before it', '<div class="split"><div class="chart" id="sameChart"></div><div class="tbl-wrap"><table class="sortable" id="sameNights" data-csv="same-weekdays"><thead><tr><th>Night</th><th class="r" title="Longest line counted">Longest</th><th class="r" title="Guest line reports">Reports</th><th class="r" title="Codes redeemed">Codes</th><th class="r" title="Line counts posted">Counts</th></tr></thead><tbody>' +
        same.concat([n]).map(function (x) { return '<tr' + (x.date === d ? ' class="cur"' : '') + '><td data-v="' + x.date + '">' + (x.date === d ? '<b>' + fmt(x.date) + '</b>' : '<a class="rowlink" href="#/night/' + x.date + '">' + fmt(x.date) + '</a>') + '</td><td class="r" data-v="' + (x.peak == null ? -1 : x.peak) + '">' + (x.peak == null ? '<span class="faint">no count</span>' : x.peak) + '</td><td class="r">' + x.reports + '</td><td class="r">' + x.codes + '</td><td class="r">' + x.counts + '</td></tr>'; }).join('') +
        '</tbody></table></div></div>' +
        (avg ? '<p class="muted row-gap">Average of the ' + same.length + ' before: longest line ' + avg.peak + ', ' + avg.reports + ' line reports, ' + avg.codes + ' codes. This night: ' + (n.peak == null ? 'no count' : n.peak) + ', ' + n.reports + ', ' + n.codes + '.</p>' : ''),
        { cls: 'c8', sub: 'longest line counted, from the 28 nights the server keeps', foot: '<span class="legend"><span><i></i>' + fmt(d) + '</span><span><i class="out"></i>Same weekday, earlier weeks</span><span><i class="nonebox"></i>No count posted</span></span><span class="end"><a href="#/night/' + (c ? c.date : d) + '">Same night a week earlier</a></span>' }) +
      card('What ran that night', '<div class="tasks">' +
        (S.notes[d] ? '<div class="task"><span class="ic">' + icon('cal') + '</span><span class="tx"><b>' + esc(S.notes[d].text) + '</b><span>Calendar note</span></span></div>' : '') +
        ran.map(function (t) { var ev = evs.filter(function (e) { return e.title === t; })[0]; return '<div class="task"><span class="ic">' + icon(ev ? 'events' : 'promos') + '</span><span class="tx"><b>' + esc(t) + '</b><span>' + (ev ? ev.going + ' Going · ' + ev.interested + ' Interested' : 'Promotion ran that night') + '</span></span></div>'; }).join('') +
        (!ran.length && !S.notes[d] ? '<p class="muted">' + (d >= add(today(), -7) ? 'No promotion or event that night.' : 'Nothing kept for this night. Promotions are kept 7 days after their night and events 12 hours, so older nights show only calendar notes. A history per bar is coming next.') + '</p>' : '') +
        '</div>', { cls: 'c4', foot: '<span>Promotions and events are shown next to the night, not credited with it.</span>' }) +
      '</div><div class="grid row-gap">' +
      (isLast ? card('Hour by hour', '<div class="chart" id="hrChart"></div>', { cls: 'c8', sub: 'largest door count each hour, as guests saw it' }) :
        card('Something look wrong?', wrongTxt, { cls: 'c6', noSample: true, foot: wrongBtn })) +
      (isLast ? card('Something look wrong?', wrongTxt, { cls: 'c4', noSample: true, foot: wrongBtn }) :
        plannedCard('Hour by hour, as guests saw it', '<p>The wait guests were shown each hour on ' + fmt(d) + ', and how fresh it was. Today the server keeps only the most recent night (within 7 days); this view needs the planned nightly snapshot of your public estimate. No numbers until it’s built.</p>', 'c6')) +
      '</div>';
    var tools = '<a class="btn" href="#/night/' + prevD + '"' + (night(prevD) ? '' : ' aria-disabled="true"') + '>‹ ' + fmtS(prevD) + '</a>' + (nextD <= y ? '<a class="btn" href="#/night/' + nextD + '">' + fmtS(nextD) + ' ›</a>' : '') + moreMenu();
    return { title: fmt(d), q: 'How did this one night go, next to the same weekday in the weeks before?', crumb: '<a href="#/line">Line &amp; door</a> /', tools: tools, html: html, after: function () {
      columns({ el: document.getElementById('sameChart'), list: same.concat([n]), metric: 'peak', hiFrom: d, hiTo: d, compare: false, height: 200 });
      if (isLast) hourly(document.getElementById('hrChart'), S.status[state.time].lastNight.hourly);
    } };
  };

  pages.promotions = function (sub) {
    var ds = deals().slice().sort(function (x, y) { return x.date < y.date ? -1 : x.date > y.date ? 1 : 0; });
    var cnt = function (st) { return ds.filter(function (d) { return dstat(d) === st; }).length; };
    var open = ds.filter(function (d) { return d.state === 'pending' || (d.state === 'approved' && d.date >= today()); }).length;
    var acts = function (d) {
      var st = dstat(d), first = '';
      if (st === 'fix') first = '<button class="btn sm primary" type="button" data-act="saved">Edit and resend</button>';
      else if (st === 'review' || st === 'approved' || st === 'live') first = '<button class="btn sm" type="button" data-act="saved">Withdraw</button>';
      return '<span class="acts"><span class="a1">' + first + '</span><span class="dd"><button class="btn sm icon ghost" type="button" data-pop="rp-' + d.id + '" aria-haspopup="true" aria-expanded="false" aria-label="More for ' + esc(d.title) + ', ' + fmt(d.date) + '">' + icon('dots') + '</button>' +
        '<span class="pop pop-fixed" id="rp-' + d.id + '" role="menu" hidden><button type="button" data-act="saved">Duplicate for another night</button><button type="button" disabled>Repeat weekly · coming next</button></span></span></span>';
    };
    var html = '<div class="kpis">' +
      kpi({ href: '#/promotions', label: dt().live ? 'Live tonight' : 'Approved, coming up', value: dt().live ? cnt('live') : cnt('approved'), delta: '<span class="delta flat"><span class="vs">' + (dt().live ? cnt('approved') + ' more approved for later nights' : 'guests see each on its night') + '</span></span>' }) +
      kpi({ href: '#/promotions', label: 'In review', value: cnt('review'), delta: '<span class="delta flat"><span class="vs">checked against our listing rules</span></span>' }) +
      kpi({ href: '#/promotions', label: 'Not approved', value: cnt('fix'), delta: '<span class="delta flat"><span class="vs">' + (cnt('fix') ? 'edit and resend' : 'nothing to fix') + '</span></span>' }) +
      kpi({ href: '#/promotions', label: 'Live or pending', value: open + ' of 5', delta: '<span class="delta flat"><span class="vs">a bar can have 5 at once</span></span>' }) +
      '</div><div class="grid row-gap"><section class="card flush c12"><div class="card-h"><h2>Your promotions</h2><span class="sub">One night each. Ended ones stay here for 7 days.</span><span class="end">' + SAMPLE_TAG + '</span></div><div class="tbl-wrap"><table class="sortable" id="promos" data-csv="promotions"><thead><tr><th>Promotion</th><th>Kind</th><th>Night</th><th>Time</th><th>Status</th><th class="r" data-nosort>Actions</th></tr></thead><tbody>' +
      ds.map(function (d) { var st = dstat(d); return '<tr><td class="clip" title="' + esc(d.title) + '"><b>' + esc(d.title) + '</b></td><td class="muted">' + d.kind + '</td><td data-v="' + d.date + '">' + fmt(d.date) + '</td><td class="muted" data-v="' + d.date + ' ' + mins(d.time.split(' – ')[0].replace(/^(\d+) /, '$1:00 ')) + '">' + d.time + '</td><td data-v="' + STATUS_ORDER[st] + '"' + (st === 'fix' ? ' title="Not approved. We email you the reason; a note shown here is coming next."' : '') + '>' + chip(st) + '</td><td class="r">' + acts(d) + '</td></tr>'; }).join('') +
      '</tbody></table></div><div class="card-f pad">Guests see a promotion only after ' + APP + ' checks it against our listing rules (the For bars page), and only on its night.</div></section>' +
      card('How promotions work', '<ul class="ticks"><li>One night each, up to 12 hours, starting at most 7 days ahead.</li><li>Up to 5 live or waiting for review at once.</li><li>A drink special is listed as its item and price, like “$4 draft beer”.</li><li>States: in review, approved, not approved, withdrawn.</li></ul><ul class="ticks no row-gap"><li>Codes per promotion: codes come from ' + APP + ' rewards, not from promotions.</li><li>“Your deal brought N people”: we don’t track people.</li></ul><p class="faint row-gap">Coming next: repeat a promotion weekly, and see our note when one isn’t approved (today we email you why).</p>', { cls: 'c6', noSample: true }) +
      plannedCard('Nights with this promotion vs without', '<p>For each promotion: the nights it ran next to the same weekdays without it (guest line reports, longest line counted), with a note that other things change too (weather, games, exams). Needs promotion history beyond 7 days. No numbers until it’s built.</p>', 'c6') + '</div>';
    return { title: 'Promotions', q: 'Which promotions are live, which wait for review, and which weren’t approved?', tools: '<a class="btn primary" href="#/promotions/new">' + icon('plus', 14) + 'New promotion</a>' + moreMenu(), html: html, after: function () { if (sub === 'new') openBuilder(); } };
  };

  function openBuilder() {
    var bg = document.createElement('div'); bg.className = 'drawer-bg';
    var dr = document.createElement('aside'); dr.className = 'drawer'; dr.setAttribute('role', 'dialog'); dr.setAttribute('aria-modal', 'true'); dr.setAttribute('aria-label', 'New promotion');
    // The server's model: one night (at most 7 days ahead), a time window of at most 12 hours inside that night, and a
    // drink special's title made from its item and price (the bar doesn't write it).
    var nights7 = [0, 1, 2, 3, 4, 5, 6, 7].map(function (k) { return add(today(), k); }).filter(function (x) { return x > today() || !dt().live; });
    dr.innerHTML = '<header><h2>New promotion</h2><span class="tag-s">Sample</span><button class="btn icon ghost" type="button" data-x aria-label="Close">' + icon('x') + '</button></header>' +
      '<div class="body"><div class="form"><label>Kind<select id="pKind"><option value="food">Food</option><option value="entry">Entry or cover</option><option value="na">Non-alcoholic drink</option><option value="event">Event or contest (21+ entrants)</option><option value="drink">Drink special (21+)</option></select></label>' +
      '<label id="pHeadL">Headline<input type="text" id="pTitle" value="" maxlength="60" placeholder="Like “Half-price wings”"></label>' +
      '<div id="pDrinkL" class="row2" hidden><label>Item<select id="pItem"><option>Draft beer</option><option>House wine</option><option>Well drink</option><option>Hard cider</option></select></label><label>Price<select id="pPrice"><option>$3</option><option>$4</option><option>$5</option><option>$6</option></select></label></div>' +
      '<div id="pMsg"></div>' +
      '<div class="row2"><label>Night<select id="pNight">' + nights7.map(function (x) { return '<option value="' + x + '">' + fmt(x) + '</option>'; }).join('') + '</select></label>' +
      '<label>Time<select id="pTime"><option>9 PM – 11 PM</option><option>10 PM – 12 AM</option><option>7 PM – 10 PM</option><option>11 PM – 2 AM</option></select></label></div>' +
      '<label class="check"><input type="checkbox" disabled> Repeat weekly <span class="tag-plan">Coming next</span></label>' +
      '<div><div class="h3">Preview of the guest card</div><div class="preview"><b id="pPrev">Your headline</b><span class="faint" id="pPrevSub"></span></div></div>' +
      '<p class="note">' + icon('info') + '<span>One night per promotion, up to 7 days ahead; a bar can have 5 live or waiting at once. ' + APP + ' reviews every promotion before guests see it. In the demo nothing is saved or sent.</span></p></div></div>' +
      '<footer><button class="btn" type="button" data-x>Cancel</button><button class="btn primary" type="button" id="pSend">Send for review</button></footer>';
    document.body.appendChild(bg); document.body.appendChild(dr);
    var t = dr.querySelector('#pTitle'), msg = dr.querySelector('#pMsg'), prev = dr.querySelector('#pPrev'), send = dr.querySelector('#pSend');
    var kind = dr.querySelector('#pKind'), item = dr.querySelector('#pItem'), price = dr.querySelector('#pPrice'), nt = dr.querySelector('#pNight'), tm = dr.querySelector('#pTime');
    function check() {
      var drink = kind.value === 'drink';
      dr.querySelector('#pHeadL').hidden = drink; dr.querySelector('#pDrinkL').hidden = !drink;
      var v = drink ? price.value + ' ' + item.value.toLowerCase() : t.value;
      prev.textContent = v || 'Your headline';
      dr.querySelector('#pPrevSub').textContent = 'Sample Bar · ' + fmt(nt.value) + ', ' + tm.value;
      var bad = null;
      if (!drink) {
        if (/\b(2|two)\s*[-‑ ]?\s*(for|4)\s*[-‑ ]?\s*(1|one)\b|\bbogo\b|buy\s+\w+\s+get/i.test(v) && /beer|pint|wine|shot|cocktail|drink|vodka|whiskey|tequila|rum|cider|margarita/i.test(v)) bad = 'New Jersey doesn’t allow 2-for-1 or multi-drink deals on alcohol. Buy 1, get 1 works for food, entry and non-alcoholic drinks.';
        else if (/unlimited|bottomless|all you can drink|free (shot|beer|drink)|ladies/i.test(v)) bad = 'New Jersey doesn’t allow unlimited, free-drink, upsized or gender-based deals.';
        else if (/beer|pint|wine|shot|cocktail|vodka|whiskey|tequila|rum|margarita/i.test(v) && kind.value !== 'event') bad = 'For an alcohol deal, choose Drink special (21+): it is listed as its item and price.';
        else if (v.trim().length < 4) bad = 'Add a short headline, like “No cover before 11”.';
      }
      msg.innerHTML = bad ? '<span class="err">' + icon('fix') + '<span>' + bad + '</span></span>' : '<span class="ok">' + icon('check', 14) + ' Looks fine to send for review.' + (drink ? ' The title is made from the item and price.' : '') + '</span>';
      send.disabled = !!bad;
    }
    [kind, item, price, nt, tm].forEach(function (x) { x.addEventListener('change', check); });
    t.addEventListener('input', check); check();
    function close() { bg.remove(); dr.remove(); if (location.hash === '#/promotions/new') history.replaceState(null, '', location.pathname + location.search + '#/promotions'); }
    bg.addEventListener('click', close);
    dr.querySelectorAll('[data-x]').forEach(function (b) { b.addEventListener('click', close); });
    send.addEventListener('click', function () { toast('Demo only: this isn’t saved or sent for review.'); close(); });
    document.addEventListener('keydown', function esc(e) { if (e.key === 'Escape') { close(); document.removeEventListener('keydown', esc); } });
  }

  pages.events = function () {
    var evs = S.events[state.time];
    var row = function (e) { return '<tr><td><b>' + esc(e.title) + '</b></td><td data-v="' + e.date + '">' + fmt(e.date) + '</td><td class="r">' + e.going + '</td><td class="r">' + e.interested + '</td><td><span class="chip live">Listed</span></td></tr>'; };
    var up = upcoming(), waiting = S.ideas.filter(function (i) { return !state.decided[i.id]; }).length;
    var sum = function (l, k) { return l.reduce(function (t, e) { return t + e[k]; }, 0); };
    var html = '<div class="kpis">' +
      kpi({ href: '#/events', label: 'Upcoming events', value: up.length, delta: '<span class="delta flat"><span class="vs">' + (up[0] ? 'next: ' + esc(up[0].title) + ', ' + fmt(up[0].date) : 'none listed') + '</span></span>' }) +
      kpi({ href: '#/events', label: 'Going (upcoming)', value: sum(up, 'going'), delta: '<span class="delta flat"><span class="vs">guests who chose Going</span></span>', ctx: 'Not a ticket: guests can change it' }) +
      kpi({ href: '#/events', label: 'Interested (upcoming)', value: sum(up, 'interested'), delta: '<span class="delta flat"><span class="vs">guests who chose Interested</span></span>', ctx: 'Totals only, never who' }) +
      kpi({ href: '#/events', label: 'Guest ideas waiting', value: waiting, delta: '<span class="delta flat"><span class="vs">' + (waiting ? 'need your yes or no' : 'all answered') + '</span></span>', ctx: S.ideas.length + ' proposed for your bar' }) +
      '</div><div class="grid row-gap"><section class="card flush c7"><div class="card-h"><h2>Events at your bar</h2><span class="sub">Going and Interested are totals guests chose in the app. Never who.</span><span class="end">' + SAMPLE_TAG + '</span></div><div class="tbl-wrap"><table class="sortable" id="events" data-csv="events"><thead><tr><th>Event</th><th>Night</th><th class="r">Going</th><th class="r">Interested</th><th>Status</th></tr></thead><tbody>' +
      up.map(row).join('') + '</tbody></table></div><div class="card-f pad">Past events: once an event has ended, its totals leave this list after 12 hours. Totals for past events need a per-bar events list: coming next.</div></section>' +
      card('Going and Interested, by event', '<div class="chart" id="evChart"></div>', { cls: 'c5', foot: '<span class="legend"><span><i></i>Going</span><span><i class="c2"></i>Interested</span></span><span class="end">Upcoming events</span>' }) +
      '</div><div class="grid row-gap">' +

      '<section class="card c8"><div class="card-h"><h2>Guest ideas for your bar</h2><span class="sub">Theme nights guests proposed. You see the idea and the totals, never who proposed it or who is interested.</span><span class="end">' + SAMPLE_TAG + '</span></div><div class="tasks">' +
      S.ideas.map(function (i) { var dcd = state.decided[i.id]; return '<div class="task"><span class="ic">' + icon('idea') + '</span><span class="tx"><b>' + esc(i.title) + '</b><span>Proposed for ' + fmt(i.date) + ' · ' + i.interested + ' Interested · ' + i.going + ' Going</span></span>' +
        (dcd ? '<span class="chip ' + (dcd === 'yes' ? 'live' : 'ended') + '">' + (dcd === 'yes' ? 'Approved (demo, not saved)' : 'Declined (demo, not saved)') + '</span>' :
          '<label class="faint">Cover <select class="btn sm" aria-label="Cover for ' + esc(i.title) + '"><option>No cover</option><option>$5 cover</option><option>$10 cover</option></select></label><button class="btn sm primary" type="button" data-idea="' + i.id + '" data-v="yes">Approve</button><button class="btn sm" type="button" data-idea="' + i.id + '" data-v="no">Decline</button>') + '</div>'; }).join('') +
      '</div></section>' +
      card('Add an event', '<p class="muted">Events are added by ' + APP + ' for now. Send us the name, night and time; we review it against the same rules as promotions and list it, usually within 2 working days.</p><p class="row-gap"><button class="btn primary" type="button" data-act="saved">Send us your event</button></p><p class="faint row-gap">Planned: submit events here yourself, reviewed like promotions.</p>', { cls: 'c4', noSample: true }) + '</div>';
    return { title: 'Events & ideas', q: 'How many guests plan to come to your events, and which guest ideas need your answer?', tools: '<button class="btn primary" type="button" data-act="saved">Send us your event</button>' + moreMenu(), html: html, after: function () {
      document.querySelectorAll('[data-px]').forEach(function (e) { e.style.width = e.getAttribute('data-px') + 'px'; if (e.hasAttribute('data-soft')) e.style.background = 'var(--data-soft)'; });
      hbars(document.getElementById('evChart'), up.map(function (e) { return { label: e.title, sub: fmt(e.date), a: e.going, b: e.interested }; }));
    } };
  };

  pages.listing = function () {
    var L = S.listing;
    var live = deals().filter(function (d) { var x = dstat(d); return x === 'live' || x === 'approved'; }).length;
    var html = '<div class="grid">' + card('What your page shows guests', '<div class="kv"><dt>Name</dt><dd>' + L.name + '</dd><dt>Address</dt><dd>' + L.address + '</dd><dt>Hours last checked</dt><dd>' + L.hoursChecked + ' <small>source: your website</small></dd>' +
        '<dt>Line estimate</dt><dd>Shown with its source and age</dd><dt>Promotions shown</dt><dd>' + live + ' approved <small>each on its own night</small></dd><dt>Events shown</dt><dd>' + upcoming().length + ' upcoming</dd><dt>Picture</dt><dd>Our drawing <small>no logo or photo without written permission</small></dd></div>',
        { cls: 'c5', foot: '<button class="btn sm" type="button" data-act="saved">Email us to fix</button><span class="end">Edit hours yourself (reviewed): planned</span>' }) +
      '<section class="card flush c3"><div class="card-h"><h2>Hours</h2><span class="end">' + SAMPLE_TAG + '</span></div><table><thead><tr><th>Day</th><th class="r">Open</th></tr></thead><tbody>' + L.hours.map(function (h) { return '<tr><td>' + h[0] + '</td><td class="r">' + h[1] + '</td></tr>'; }).join('') + '</tbody></table></section>' +
      card('How your estimate reaches guests', '<ol class="steps"><li><b>A door count leads</b> (ours or your staff’s) while it is 10 minutes old or less; from 10 to 20 minutes, only if no newer guest report disagrees.</li>' +
        '<li><b>A guest report counts once it is confirmed:</b> a second guest reports an overlapping line within 15 minutes, or a door count within 15 minutes agrees. One report alone doesn’t change the estimate.</li>' +
        '<li><b>Disagreement is shown, not hidden:</b> 2 or more reports that disagree, or a very different count within 10 minutes, mark the estimate uncertain.</li>' +
        '<li><b>Nothing in the last 20 minutes:</b> guests see the newest input from the last 12 hours, marked out of date.</li></ol><ul class="ticks no row-gap"><li>You can’t edit, hide or pay to change it, and neither can anyone else.</li></ul>',
        { cls: 'c4', noSample: true, foot: '<a href="#/tonight">See it now on Tonight</a><span class="end"><button class="btn sm" type="button" data-act="wrong">Report a wrong estimate</button></span>' }) +
      '</div><div class="grid row-gap"><section class="card flush c8"><div class="card-h"><h2>Your change requests</h2><span class="sub">Today: our record of what you emailed us. Shown here once the real dashboard is built.</span><span class="end"><span class="tag-plan">Coming next</span>' + SAMPLE_TAG + '</span></div><div class="tbl-wrap"><table class="sortable" id="changes" data-csv="listing-changes"><thead><tr><th>Date</th><th>What changed</th><th>Asked by</th><th>Status</th></tr></thead><tbody>' +
      L.changes.map(function (c) { return '<tr><td data-v="' + c.date + '">' + fmt(c.date) + '</td><td class="wrap">' + esc(c.what) + '</td><td>' + c.by + '</td><td data-v="' + c.status + '"><span class="chip ' + (c.status === 'Done' ? 'live' : 'review') + '">' + c.status + '</span></td></tr>'; }).join('') +
      '</tbody></table></div><div class="card-f pad">No server feed yet: this table is what the page would show. Fixes we confirm go live within 1 business day, faster on busy nights (the For bars page).</div></section>' +
      card('Ask for a change', '<div class="tasks"><div class="task"><span class="ic">' + icon('fix') + '</span><span class="tx"><b>Fix your details</b><span>Hours, a moved entrance, a closure</span></span><a class="btn sm" href="../../bars.html#corrections">How</a></div>' +
        '<div class="task"><span class="ic">' + icon('promos') + '</span><span class="tx"><b>Events and deals rules</b><span>What we list and what we turn down</span></span><a class="btn sm" href="../../bars.html#rules">Rules</a></div>' +
        '<div class="task"><span class="ic">' + icon('x') + '</span><span class="tx"><b>Ask to be removed</b><span>Events and deals down the same day</span></span><a class="btn sm" href="../../bars.html#removal">How</a></div></div>', { cls: 'c4', noSample: true }) +
      '</div><p class="note row-gap">' + icon('info') + '<span>Being listed doesn’t mean a bar is affiliated with ' + APP + '. Sample Bar is made up and has no public page.</span></p>';
    return { title: 'Listing', q: 'Is what guests see about your bar right, and how do you get it fixed?', tools: moreMenu(), html: html };
  };

  pages.reports = function () {
    var r = ranges().weekend, w = agg(between(r.from, r.to)), p = agg(between(r.cmp.from, r.cmp.to));
    var html = '<div class="grid"><div class="c8"><section class="card"><div class="card-h"><h2>The Monday email</h2><span class="sub">What every bar team would get, numbers in the body</span><span class="end"><span class="tag-plan">Planned</span>' + SAMPLE_TAG + '</span></div>' +
      '<div class="email"><span class="em-s">Sample</span><h3>Sample Bar · your weekend</h3><div class="em-sub">' + span(r.from, r.to) + ' compared with ' + span(r.cmp.from, r.cmp.to) + '</div>' +
      '<table><thead><tr><th></th><th class="r">This weekend</th><th class="r">Weekend before</th></tr></thead><tbody>' +
      '<tr><td>Longest line counted</td><td class="r"><b>' + w.peak + '</b> (' + fmt(w.peakDate) + ')</td><td class="r">' + p.peak + '</td></tr>' +
      '<tr><td>Guest line reports</td><td class="r"><b>' + w.reports + '</b></td><td class="r">' + p.reports + '</td></tr>' +
      '<tr><td>Codes redeemed at your door</td><td class="r"><b>' + w.codes + '</b></td><td class="r">' + p.codes + '</td></tr>' +
      '<tr><td>Line counts posted</td><td class="r"><b>' + w.counts + '</b></td><td class="r">' + p.counts + '</td></tr></tbody></table>' +
      '<p><b>Needs your answer:</b> 2 guest ideas (Board game night, 90s throwback night) and 1 promotion that wasn’t approved.</p><p><b>Coming up:</b> Trivia Thursday (9 Going) and Karaoke Saturday (6 Going).</p>' +
      '<div class="foot">Totals only; we never share who. No tracking pixels, no tracked links. Stop these emails with one click.</div></div></section></div>' +
      '<div class="c4">' + card('Print and download', '<div class="tasks"><div class="task"><span class="ic">' + icon('print') + '</span><span class="tx"><b>One-page summary</b><span>Light theme, for a co-owner or an accountant</span></span><button class="btn sm" type="button" data-act="print">Print</button></div>' +
      '<div class="task"><span class="ic">' + icon('down') + '</span><span class="tx"><b>Nights as CSV</b><span>Every row says SAMPLE in the demo</span></span><button class="btn sm" type="button" data-act="csv">Download</button></div></div>', { noSample: true }) +
      card('Email settings', '<div class="kv"><dt>Send on</dt><dd>Mondays, 11 AM</dd><dt>Only in weeks with data</dt><dd>Yes</dd><dt>Recipients</dt><dd>Your managers</dd></div>', { cls: 'row-gap', noSample: true, foot: '<span>Needs an email service: owner decision 10.</span>' }) + '</div></div>';
    return { title: 'Reports & email', q: 'What does the Monday email say, and how do you print or download the numbers?', tools: moreMenu(), html: html };
  };

  pages.settings = function () {
    var dark = document.documentElement.getAttribute('data-theme') !== 'light';
    var html = '<div class="grid">' + card('What bars can and cannot see', '<div class="cols2"><div><h3>You see</h3><ul class="ticks"><li>Totals per night: longest line counted, line counts posted, guest line reports, codes redeemed</li><li>Tonight’s codes: reward, time and the last 4 characters</li><li>Going and Interested totals for your upcoming events</li><li>Guest ideas for your bar, without who proposed them</li><li>Your public estimate, as every guest sees it</li></ul></div>' +
      '<div><h3>The dashboard never shows</h3><ul class="ticks no"><li>Names, emails, accounts or handles</li><li>Who chose Going or Interested, or who proposed an idea</li><li>Repeat guests or any one guest’s history</li><li>Locations, ages, schools or photos of people</li><li>Other bars’ numbers</li></ul></div></div>', { cls: 'c8', noSample: true, foot: '<span>Any new breakdown (by hour, wait or line mix) under ' + S.smallNumber + ' shows “fewer than ' + S.smallNumber + '”.</span>' }) +
      card('Appearance', '<span class="seg2" role="group" aria-label="Theme"><button type="button" data-theme-set="dark" aria-pressed="' + dark + '">Dark</button><button type="button" data-theme-set="light" aria-pressed="' + !dark + '">Light</button></span><p class="faint row-gap">Printing is always light.</p>', { cls: 'c4', noSample: true }) +
      '</div><div class="grid row-gap">' + card('Your account', '<div class="kv"><dt>Signed in as</dt><dd>Sample manager</dd><dt>Two-step sign-in</dt><dd>On · authenticator app</dd><dt>Keep me signed in on this computer</dt><dd><small>Off (signs out when the tab closes)</small></dd><dt>Idle sign-out</dt><dd>12 hours <small>planned, in this browser</small></dd></div>', { cls: 'c6' }) +
      card('Finish setup', '<div class="tasks"><div class="task"><span class="ic">' + icon('check') + '</span><span class="tx"><b>Check your listing and hours</b></span><span class="chip live">Done</span></div><div class="task"><span class="ic">' + icon('check') + '</span><span class="tx"><b>Get door staff accounts</b><span>We create them</span></span><span class="chip live">Done</span></div><div class="task"><span class="ic">' + icon('check') + '</span><span class="tx"><b>Post your first line count</b><span>On the staff page</span></span><span class="chip live">Done</span></div><div class="task"><span class="ic">' + icon('promos') + '</span><span class="tx"><b>Submit your first promotion</b></span><a class="btn sm" href="#/promotions/new">Start</a></div><div class="task"><span class="ic">' + icon('idea') + '</span><span class="tx"><b>Answer your first guest idea</b></span><a class="btn sm" href="#/events">Open</a></div></div>', { cls: 'c6', end: '<span class="tag-plan">Planned</span>' }) +
      '</div><div class="grid row-gap">' + plannedCard('Team', '<p>A list of who at your bar has access. We create every account by hand today. A team list needs a new server function and a notice to staff, so it comes later. With today’s roles, door staff accounts would also be able to read the dashboard; a separate door-only role is an open decision.</p>', 'c12') + '</div>';
    return { title: 'Settings & privacy', q: 'What can your team see, what can it never see, and how is the account protected?', tools: '', html: html };
  };

  // ---------- router ----------
  function route() {
    var h = (location.hash || '#/overview').replace(/^#\/?/, '');
    var parts = h.split('/');
    var id = parts[0] || 'overview';
    if (!pages[id]) id = 'overview';
    return { id: id, arg: parts[1] };
  }
  var lastId = null;
  function render() {
    var rt = route();
    hideTip(); // the chart under the pointer is about to be replaced, so its mouseleave never comes
    if (rt.id !== lastId && ['overview', 'line', 'codes'].indexOf(rt.id) >= 0 && lastId !== null) { state.range = null; }
    lastId = rt.id;
    var p = pages[rt.id](rt.arg);
    document.getElementById('title').textContent = p.title;
    document.getElementById('crumb').innerHTML = p.crumb || '';
    document.title = p.title + ' · Demo · ' + APP + ' for Bars';
    document.getElementById('tools').innerHTML = p.tools || '';
    document.getElementById('page').innerHTML = (p.q ? '<p class="pageq">' + p.q + '</p>' : '') + p.html;
    drawNav(rt.id);
    document.querySelectorAll('[data-w]').forEach(function (e) { e.style.width = e.getAttribute('data-w') + '%'; });
    document.querySelectorAll('.skel i[data-h]').forEach(function (e) { e.style.height = e.getAttribute('data-h') + '%'; });
    document.querySelectorAll('.seg [data-time]').forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-time') === state.time)); });
    if (p.after) p.after();
    enhanceTables();
    closeSide();
  }
  function closeSide() {
    document.getElementById('side').classList.remove('open');
    document.getElementById('sideBg').hidden = true;
    document.getElementById('menuBtn').setAttribute('aria-expanded', 'false');
  }
  var toastT;
  function toast(t) { var el = document.getElementById('toast'); el.textContent = t; el.hidden = false; clearTimeout(toastT); toastT = setTimeout(function () { el.hidden = true; }, 2600); }
  function setTime(t) {
    state.time = t; state.range = null;
    var u = new URL(location.href); u.searchParams.set('t', t); history.replaceState(null, '', u.pathname + u.search + u.hash);
    render();
  }

  document.getElementById('sideBg').addEventListener('click', closeSide);
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    var open = document.querySelector('.pop:not([hidden])');
    if (open) { open.hidden = true; var o = document.querySelector('[data-pop="' + open.id + '"]'); if (o) { o.setAttribute('aria-expanded', 'false'); o.focus(); } return; }
    if (document.getElementById('side').classList.contains('open')) { closeSide(); document.getElementById('menuBtn').focus(); }
  });
  document.addEventListener('click', function (e) {
    var b = e.target.closest('button, a');
    // close open menus when clicking elsewhere
    document.querySelectorAll('.pop:not([hidden])').forEach(function (p) { if (!b || b.getAttribute('data-pop') !== p.id) { if (!p.contains(e.target)) { p.hidden = true; var o = document.querySelector('[data-pop="' + p.id + '"]'); if (o) o.setAttribute('aria-expanded', 'false'); } } });
    if (!b) return;
    if (b.getAttribute('aria-disabled') === 'true') { e.preventDefault(); return; }
    var a;
    if ((a = b.getAttribute('data-pop'))) {
      var p = document.getElementById(a); p.hidden = !p.hidden; b.setAttribute('aria-expanded', String(!p.hidden));
      // Row menus inside a table open as a fixed layer next to their button, so the table's scroll box can't clip them.
      if (!p.hidden && p.classList.contains('pop-fixed')) { var br = b.getBoundingClientRect(), ph = p.offsetHeight; p.style.left = Math.max(8, br.right - p.offsetWidth) + 'px'; p.style.top = (br.bottom + 6 + ph > innerHeight - 8 ? br.top - 6 - ph : br.bottom + 6) + 'px'; }
      return;
    }
    if ((a = b.getAttribute('data-range'))) { state.range = a; pickFrom = null; render(); return; }
    if (b.hasAttribute('data-range-custom')) { pickFrom = null; var c0 = document.querySelector('#prCal .cal-d'); if (c0) c0.focus(); return; }
    if ((a = b.getAttribute('data-day'))) { pickDay(a); return; }
    if ((a = b.getAttribute('data-step'))) { stepRange(+a); render(); return; }
    if ((a = b.getAttribute('data-cmp'))) { state.compare = a; render(); return; }
    if ((a = b.getAttribute('data-metric'))) { state.metric = a; render(); return; }
    if ((a = b.getAttribute('data-lmetric'))) { state.lineMetric = a; render(); return; }
    if ((a = b.getAttribute('data-tsort'))) { sortBy(a); return; }
    if ((a = b.getAttribute('data-time')) || (a = b.getAttribute('data-time-go'))) { setTime(a); return; }
    if ((a = b.getAttribute('data-idea'))) { state.decided[a] = b.getAttribute('data-v'); render(); toast('In the demo this isn’t saved.'); return; }
    if ((a = b.getAttribute('data-theme-set'))) { if (a === 'light') document.documentElement.setAttribute('data-theme', 'light'); else document.documentElement.removeAttribute('data-theme'); try { localStorage.setItem('nob-theme', a); } catch (x) { /* ignore */ } render(); return; }
    if (b.id === 'resetDemo') { e.preventDefault(); state.decided = {}; state.range = null; state.compare = 'on'; state.metric = 'peak'; setTime('monday'); location.hash = '#/overview'; toast('Demo reset.'); return; }
    if (b.id === 'menuBtn') { var sd = document.getElementById('side'); sd.classList.toggle('open'); document.getElementById('sideBg').hidden = !sd.classList.contains('open'); b.setAttribute('aria-expanded', String(sd.classList.contains('open'))); if (sd.classList.contains('open')) { var f = sd.querySelector('.nav a'); if (f) f.focus(); } return; }
    if (b.id === 'venueBtn') { toast('Groups with more than one bar switch venues here. The demo has one bar.'); return; }
    if ((a = b.getAttribute('data-act'))) {
      if (a === 'csv') downloadCsv();
      else if (a === 'print') window.print();
      else if (a === 'link') toast('Link copied (demo).');
      else if (a === 'wrong') toast('Sent to ' + APP + ' for review (demo, not sent).');
      else if (a === 'refresh') toast('Updated (sample data).');
      else toast('In the demo this isn’t saved or sent.');
      document.querySelectorAll('.pop').forEach(function (p) { p.hidden = true; });
    }
  });
  // CSV of what the page shows: its sortable tables in their current order, or else the 28 nights. Totals only, and the
  // first row and the file name say SAMPLE.
  function csvCell(v) { v = String(v).replace(/\s+/g, ' ').trim(); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }
  function downloadCsv() {
    var rows = [['SAMPLE DATA: Sample Bar is made up; numbers are not real']], name = 'nights';
    var tables = [].slice.call(document.querySelectorAll('#page table[data-csv]'));
    if (tables.length) {
      name = tables[0].getAttribute('data-csv');
      tables.forEach(function (t, i) {
        if (i) rows.push([]);
        var keep = [].map.call(t.tHead.rows[0].cells, function (h) { return !h.hasAttribute('data-nosort'); });
        rows.push([].map.call(t.tHead.rows[0].cells, function (h) { return h.textContent; }).filter(function (x, j) { return keep[j]; }));
        [].forEach.call(t.tBodies[0].rows, function (r) { rows.push([].map.call(r.cells, function (c) { return c.textContent; }).filter(function (x, j) { return keep[j]; })); });
      });
    } else {
      rows.push(['night', 'longest_line_counted', 'line_counts_posted', 'guest_line_reports', 'codes_redeemed', 'free_non_alcoholic_drink', 'cover_on_us']);
      last28().forEach(function (n) { rows.push([n.date, n.peak == null ? '' : n.peak, n.counts, n.reports, n.codes, n.na, n.cover]); });
    }
    var blob = new Blob([rows.map(function (r) { return r.map(csvCell).join(','); }).join('\n')], { type: 'text/csv' });
    var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'sample-bar-' + name + '-SAMPLE.csv'; document.body.appendChild(a); a.click(); a.remove();
    toast('Downloaded a sample CSV (' + (rows.length - 1) + ' rows).');
  }
  window.addEventListener('hashchange', function () { pickFrom = null; render(); window.scrollTo(0, 0); });
  window.addEventListener('scroll', function () { document.querySelectorAll('.pop-fixed:not([hidden])').forEach(function (p) { p.hidden = true; var o = document.querySelector('[data-pop="' + p.id + '"]'); if (o) o.setAttribute('aria-expanded', 'false'); }); }, { passive: true });
  var rz; window.addEventListener('resize', function () { clearTimeout(rz); rz = setTimeout(render, 120); });
  render();
})();
