/* Night Out for Bars, demo dashboard: the ONE sample fixture every page reads (so the pages always agree).
   Sample Bar is made up. Every number here is sample data. Nothing here is about a real bar or a real person.
   Shapes follow the server functions the live dashboard would call (venue_report, venue_deals, venue_ideas,
   event_counts, get_bar_status, get_bars); see PROPOSAL.md section 3. Totals only: no person, no account, no name. */
(function () {
  'use strict';

  // One row per night (a night runs noon to noon, New York time).
  // [date, longest line counted (people in line; null = no count posted), line counts posted, guest line reports,
  //  codes redeemed: free non-alcoholic drink, codes redeemed: cover on us]
  var ROWS = [
    ['2026-10-05', null, 0, 1, 0, 0], ['2026-10-06', null, 0, 2, 0, 0], ['2026-10-07', 35, 1, 3, 1, 0],
    ['2026-10-08', 80, 3, 11, 2, 1], ['2026-10-09', 110, 4, 15, 3, 1], ['2026-10-10', 125, 4, 17, 3, 2],
    ['2026-10-11', 30, 1, 3, 0, 0],
    ['2026-10-12', null, 0, 1, 0, 0], ['2026-10-13', null, 0, 1, 0, 0], ['2026-10-14', 40, 1, 4, 1, 0],
    ['2026-10-15', 85, 3, 12, 2, 1], ['2026-10-16', 120, 4, 16, 3, 1], ['2026-10-17', 150, 5, 22, 4, 2],
    ['2026-10-18', 25, 1, 2, 0, 0],
    ['2026-10-19', null, 0, 0, 0, 0], ['2026-10-20', null, 0, 2, 0, 0], ['2026-10-21', 30, 1, 3, 0, 1],
    ['2026-10-22', 75, 2, 10, 1, 1], ['2026-10-23', 115, 4, 14, 3, 1], ['2026-10-24', 130, 4, 18, 3, 2],
    ['2026-10-25', null, 0, 2, 0, 0],
    ['2026-10-26', null, 0, 1, 0, 0], ['2026-10-27', null, 0, 1, 0, 0], ['2026-10-28', 45, 1, 5, 1, 0],
    ['2026-10-29', 90, 3, 13, 2, 1], ['2026-10-30', 135, 5, 19, 3, 2], ['2026-10-31', 210, 6, 38, 5, 4],
    ['2026-11-01', 40, 2, 4, 0, 0],
    ['2026-11-02', null, 0, 1, 0, 0], ['2026-11-03', null, 0, 2, 0, 0], ['2026-11-04', 35, 1, 3, 1, 0],
    ['2026-11-05', 95, 3, 14, 2, 1],
    ['2026-11-06', 95, 3, 9, 2, 1] // tonight in the Friday demo time (a night still running at 10:40 PM)
  ];

  var nights = ROWS.map(function (r) {
    return { date: r[0], peak: r[1], counts: r[2], reports: r[3], na: r[4], cover: r[5], codes: r[4] + r[5] };
  });

  // Public calendar context and the bar's own dates, drawn as notes on the nights chart. No guest data.
  var notes = {
    '2026-10-17': { text: 'Home game (sample note)', kind: 'calendar' },
    '2026-10-31': { text: 'Halloween', kind: 'calendar' }
  };

  var rewards = [
    { id: 'na-drink', title: 'Free non-alcoholic drink', perNight: 10, active: true },
    { id: 'cover', title: 'Cover on us', perNight: 5, active: true }
  ];

  // The bar's promotions (deals), as api.venue_deals would return them at each demo time. The server's model: each
  // deal is ONE night (at most 12 hours, inside one night), it can start at most 7 days ahead, a bar has at most 5 live
  // or pending deals, a drink special's title is made from its item and price, and the review states are pending,
  // approved, rejected and withdrawn (no reviewer note). Ended deals are returned for 7 days, then drop off.
  // Promotions are the bar's own; they do NOT produce codes.
  var deals = {
    monday: [
      { id: 'm1', title: 'Half-price wings', kind: 'Food', date: '2026-10-29', time: '9 PM – 11 PM', state: 'approved' },
      { id: 'm2', title: 'No cover before 10 PM', kind: 'Entry or cover', date: '2026-10-30', time: '7 PM – 10 PM', state: 'approved' },
      { id: 'm3', title: 'Costume contest, 21+ entrants', kind: 'Event or contest', date: '2026-10-31', time: '9 PM – 1 AM', state: 'approved' },
      { id: 'm4', title: 'Free mocktail with any entry', kind: 'Non-alcoholic drink', date: '2026-11-04', time: '8 PM – 11 PM', state: 'rejected' },
      { id: 'm5', title: 'Half-price wings', kind: 'Food', date: '2026-11-05', time: '9 PM – 11 PM', state: 'approved' },
      { id: 'm6', title: 'No cover before 10 PM', kind: 'Entry or cover', date: '2026-11-06', time: '7 PM – 10 PM', state: 'approved' },
      { id: 'm7', title: '$2 late-night pizza slice', kind: 'Food', date: '2026-11-07', time: '11 PM – 2 AM', state: 'pending' }
    ],
    friday: [
      { id: 'f1', title: 'Costume contest, 21+ entrants', kind: 'Event or contest', date: '2026-10-31', time: '9 PM – 1 AM', state: 'approved' },
      { id: 'f2', title: 'Half-price wings', kind: 'Food', date: '2026-11-05', time: '9 PM – 11 PM', state: 'approved' },
      { id: 'f3', title: 'No cover before 10 PM', kind: 'Entry or cover', date: '2026-11-06', time: '7 PM – 10 PM', state: 'approved' },
      { id: 'f4', title: '$2 late-night pizza slice', kind: 'Food', date: '2026-11-07', time: '11 PM – 2 AM', state: 'pending' },
      { id: 'f5', title: 'Free mocktail with any entry', kind: 'Non-alcoholic drink', date: '2026-11-11', time: '8 PM – 11 PM', state: 'rejected' },
      { id: 'f6', title: 'Half-price wings', kind: 'Food', date: '2026-11-12', time: '9 PM – 11 PM', state: 'pending' }
    ]
  };

  // Events at the bar, as api.get_events_and_deals lists them: upcoming events, and events that ended at most 12 hours
  // ago. Going / Interested totals come from api.event_counts for those events only. Older events have no list to ask
  // about yet (a per-bar events list is coming next), so the demo shows no totals for them.
  var events = {
    monday: [
      { title: 'Trivia Thursday', date: '2026-11-05', going: 9, interested: 22 },
      { title: 'Karaoke Saturday', date: '2026-11-07', going: 6, interested: 19 }
    ],
    friday: [
      { title: 'Karaoke Saturday', date: '2026-11-07', going: 14, interested: 31 },
      { title: 'Trivia Thursday', date: '2026-11-12', going: 4, interested: 11 }
    ]
  };
  // Theme nights guests proposed for this bar. Never the proposer's name or account.
  var ideas = [
    { id: 'i1', title: 'Board game night', date: '2026-11-11', interested: 18, going: 7 },
    { id: 'i2', title: '90s throwback night', date: '2026-11-13', interested: 26, going: 9 }
  ];

  // get_bar_status: what guests see now, and the most recent earlier night (within 7 days), hour by hour
  // (largest door count in each hour, 8 PM to 2 AM).
  var status = {
    monday: {
      now: null,
      lastNight: { date: '2026-11-01', hourly: [null, 15, 25, 40, 30, null, null], peakLow: 35, peakHigh: 45, peakAt: '11:10 PM', source: 'door count' }
    },
    friday: {
      now: { level: 'Packed', wait: '20-30 min', people: '80-100', source: 'a door count', age: '6 min ago', unconfirmed: 1 },
      lastNight: { date: '2026-11-05', hourly: [null, 30, 60, 95, 80, 40, null], peakLow: 90, peakHigh: 100, peakAt: '11:20 PM', source: 'door count' }
    }
  };

  // Tonight's codes (Friday demo time only): reward, time, last 4 characters. No account. The one per-code list the
  // privacy policy names for bars.
  var tonightCodes = [
    { reward: 'Free non-alcoholic drink', at: '10:31 PM', hint: 'K7Q2' },
    { reward: 'Cover on us', at: '10:02 PM', hint: '5HV9' },
    { reward: 'Free non-alcoholic drink', at: '9:48 PM', hint: 'R3ZD' }
  ];

  var listing = {
    name: 'Sample Bar', address: '1 Sample Street, New Brunswick, NJ (sample)', hoursChecked: 'Oct 20, 2026',
    hours: [['Mon', 'Closed'], ['Tue', 'Closed'], ['Wed', '8 PM - 2 AM'], ['Thu', '8 PM - 2 AM'], ['Fri', '7 PM - 2 AM'], ['Sat', '7 PM - 2 AM'], ['Sun', '8 PM - 12 AM']],
    // Changes to the listing (sample). "Asked by" is a role, never a person.
    changes: [
      { date: '2026-10-20', what: 'Hours checked against your website: no change', by: 'Our hours check', status: 'Done' },
      { date: '2026-10-14', what: 'Sunday closing time 1 AM to 12 AM', by: 'Your bar (email)', status: 'Done' },
      { date: '2026-10-08', what: 'Promotion "Half-price wings" approved and listed', by: 'Your bar', status: 'Done' },
      { date: '2026-11-01', what: 'Side entrance for the line (map pin)', by: 'Your bar (email)', status: 'In review' }
    ]
  };

  var demoTimes = {
    monday: { key: 'monday', label: 'Mon Nov 2, 3:00 PM', short: 'Mon 3 PM', today: '2026-11-02', live: false },
    friday: { key: 'friday', label: 'Fri Nov 6, 10:40 PM', short: 'Fri 10:40 PM', today: '2026-11-06', live: true }
  };

  window.SAMPLE = Object.freeze({
    bar: { name: 'Sample Bar', area: 'Sample area', sample: true },
    nights: nights, notes: notes, rewards: rewards, deals: deals, events: events, ideas: ideas, status: status,
    tonightCodes: tonightCodes, listing: listing, demoTimes: demoTimes,
    smallNumber: 5 // any NEW breakdown (by hour, wait, line mix) under 5 shows "fewer than 5"
  });
})();
