// Original 24×24 stroke icons drawn for this prototype (no third-party icon set).
const P = {
  search: '<circle cx="11" cy="11" r="6.5"/><path d="m16 16 4.5 4.5"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  bookmark: '<path d="M7 4.5h10a1 1 0 0 1 1 1v14.2l-6-3.6-6 3.6V5.5a1 1 0 0 1 1-1Z"/>',
  bookmarkFill: '<path d="M7 4.5h10a1 1 0 0 1 1 1v14.2l-6-3.6-6 3.6V5.5a1 1 0 0 1 1-1Z" fill="currentColor"/>',
  moon: '<path d="M19.5 14.5A7.5 7.5 0 0 1 9.5 4.5a7.5 7.5 0 1 0 10 10Z"/>',
  map: '<path d="M9 5 4 7v12l5-2 6 2 5-2V5l-5 2-6-2Z"/><path d="M9 5v12M15 7v12"/>',
  list: '<path d="M9 6h11M9 12h11M9 18h11"/><circle cx="4.5" cy="6" r="1"/><circle cx="4.5" cy="12" r="1"/><circle cx="4.5" cy="18" r="1"/>',
  clock: '<circle cx="12" cy="12" r="8"/><path d="M12 8v4.5l3 1.8"/>',
  users: '<circle cx="9" cy="9" r="3.2"/><path d="M3.5 19c.6-3 2.8-4.6 5.5-4.6s4.9 1.6 5.5 4.6"/><path d="M15.5 6.2a3 3 0 0 1 0 5.6M17.8 14.6c1.5.6 2.4 2 2.7 4.4"/>',
  ticket: '<path d="M4 7.5A1.5 1.5 0 0 1 5.5 6h13A1.5 1.5 0 0 1 20 7.5V10a2 2 0 0 0 0 4v2.5a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 16.5V14a2 2 0 0 0 0-4Z"/><path d="M14 6v12" stroke-dasharray="2 2.2"/>',
  door: '<path d="M6 20V5.5A1.5 1.5 0 0 1 7.5 4h9A1.5 1.5 0 0 1 18 5.5V20"/><path d="M4 20h16"/><circle cx="14.5" cy="12.5" r=".9" fill="currentColor"/>',
  info: '<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5.5"/><circle cx="12" cy="7.8" r=".9" fill="currentColor"/>',
  chevronLeft: '<path d="m14.5 6-6 6 6 6"/>',
  chevronRight: '<path d="m9.5 6 6 6-6 6"/>',
  chevronDown: '<path d="m6 9.5 6 6 6-6"/>',
  wifiOff: '<path d="M4 4l16 16"/><path d="M8.5 15.5a5 5 0 0 1 6.2-.6M5.5 12.2a9.5 9.5 0 0 1 4-2.2M18.5 12.2a9.6 9.6 0 0 0-2.4-1.6M2.5 9a14 14 0 0 1 4.3-2.6M21.5 9a14 14 0 0 0-9-3.4"/><circle cx="12" cy="19" r="1" fill="currentColor"/>',
  refresh: '<path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3"/><path d="M19.5 4.5V9H15"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  checkCircle: '<circle cx="12" cy="12" r="8.5"/><path d="m8 12.3 2.8 2.8L16.2 9.5"/>',
  alert: '<path d="M12 4 2.8 19.5h18.4L12 4Z"/><path d="M12 10v4.5"/><circle cx="12" cy="17" r=".9" fill="currentColor"/>',
  pause: '<circle cx="12" cy="12" r="8.5"/><path d="M10 9v6M14 9v6"/>',
  closed: '<circle cx="12" cy="12" r="8.5"/><path d="m6.2 6.2 11.6 11.6"/>',
  help: '<circle cx="12" cy="12" r="8.5"/><path d="M9.6 9.5a2.5 2.5 0 1 1 3.4 2.3c-.6.3-1 .8-1 1.5v.4"/><circle cx="12" cy="16.8" r=".9" fill="currentColor"/>',
  fresh: '<circle cx="12" cy="12" r="8.5"/><path d="m8 12.3 2.8 2.8L16.2 9.5"/>',
  aging: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  stale: '<circle cx="12" cy="12" r="8.5"/><path d="M8 12h8"/>',
  uncertain: '<path d="M4 15c2-4 4-4 6 0s4 4 6 0 3-3 4-1.5"/><path d="M4 9c2-4 4-4 6 0s4 4 6 0 3-3 4-1.5"/>',
  capacity: '<rect x="4" y="5" width="16" height="14" rx="2"/><path d="M8 9v6M12 9v6M16 9v6"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  shield: '<path d="M12 3.5 5 6.5v5.2c0 4.2 3 7.4 7 8.8 4-1.4 7-4.6 7-8.8V6.5l-7-3Z"/><path d="M12 9v4"/><circle cx="12" cy="16" r=".8" fill="currentColor"/>',
  id: '<rect x="3.5" y="5.5" width="17" height="13" rx="2"/><circle cx="9" cy="11" r="2"/><path d="M6 15.5c.5-1.4 1.6-2 3-2s2.5.6 3 2M14.5 10h3.5M14.5 13h3.5"/>',
  sliders: '<path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/>',
  arrowRight: '<path d="M5 12h13M13 6.5 18.5 12 13 17.5"/>',
  sparkle: '<path d="M12 4v4M12 16v4M4 12h4M16 12h4M6.5 6.5l2.5 2.5M15 15l2.5 2.5M17.5 6.5 15 9M9 15l-2.5 2.5"/>',
  trash: '<path d="M5 7h14M10 7V5h4v2M7 7l1 12h8l1-12"/>',
  star: '<path d="m12 3.8 2.5 5.1 5.6.8-4 3.9.9 5.6-5-2.6-5 2.6.9-5.6-4-3.9 5.6-.8L12 3.8Z"/>',
  camera: '<path d="M4 8.5A1.5 1.5 0 0 1 5.5 7h2.2l1.4-2h5.8l1.4 2h2.2A1.5 1.5 0 0 1 20 8.5v9a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 17.5v-9Z"/><circle cx="12" cy="13" r="3.5"/>',
  user: '<circle cx="12" cy="8.5" r="3.5"/><path d="M5 19.5c.8-3.6 3.6-5.5 7-5.5s6.2 1.9 7 5.5"/>',
  grid: '<rect x="4" y="4" width="7" height="7" rx="2"/><rect x="13" y="4" width="7" height="7" rx="2"/><rect x="4" y="13" width="7" height="7" rx="2"/><rect x="13" y="13" width="7" height="7" rx="2"/>',
  pin: '<path d="M12 20.5s-6-5.4-6-10.5a6 6 0 0 1 12 0c0 5.1-6 10.5-6 10.5Z"/><circle cx="12" cy="10" r="2.2"/>',
  lock: '<rect x="5" y="10.5" width="14" height="10" rx="2"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5"/>',
  at: '<circle cx="12" cy="12" r="3.5"/><path d="M15.5 12v1.3a2.2 2.2 0 0 0 4.4 0V12a7.9 7.9 0 1 0-3.1 6.3"/>',
  bolt: '<path d="M13 3 5.5 13.5H11l-1 7.5 7.5-10.5H12L13 3Z"/>',
  bell: '<path d="M6.5 16.5V11a5.5 5.5 0 0 1 11 0v5.5l1.5 2H5l1.5-2Z"/><path d="M10 20.5a2 2 0 0 0 4 0"/>',
  calendar: '<rect x="4" y="5.5" width="16" height="14" rx="2"/><path d="M4 10h16M8.5 3.5v4M15.5 3.5v4"/>',
  gift: '<rect x="4" y="9" width="16" height="11" rx="1.5"/><path d="M3 9h18M12 9v11M12 9c-1.5-3.5-5.5-4-5.5-1.5S10 9 12 9Zm0 0c1.5-3.5 5.5-4 5.5-1.5S14 9 12 9Z"/>',
  ff: '<path d="M4 6.5v11l7-5.5-7-5.5ZM12 6.5v11l7-5.5-7-5.5Z"/>',
};

export function icon(name, { label, cls = '', size = 20 } = {}) {
  const body = P[name] ?? P.info;
  const a11y = label ? `role="img" aria-label="${label}"` : 'aria-hidden="true" focusable="false"';
  // width/height attributes are the floor: CSS may resize, but an icon never balloons to fill its box.
  return `<svg class="ic ${cls}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" ${a11y}>${body}</svg>`;
}

export const TONE_ICON = { fresh: 'fresh', aging: 'aging', stale: 'stale', unknown: 'help', uncertain: 'uncertain', capacity: 'capacity', paused: 'pause', closed: 'closed' };
export const TONE_LABEL = { fresh: 'Fresh', aging: 'May have changed', stale: 'Out of date', unknown: 'No data', uncertain: 'Uncertain', capacity: 'At capacity', paused: 'Entry paused', closed: 'Closed' };
