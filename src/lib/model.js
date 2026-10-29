// Combines the synthetic base dataset with operator-console overrides and the deals posted on this device.

/** `posted` are deals the venue console added on this device (state.deals); they join the venue's demo deals. */
export function resolveVenues(baseVenues, overrides = {}, posted = []) {
  return baseVenues.map((v) => {
    const o = overrides[v.id] || {};
    const out = { ...v };
    const mine = posted.filter((d) => d.venueId === v.id);
    if (mine.length) out.deals = [...(v.deals ?? []), ...mine];
    if (o.queue !== undefined) out.queue = o.queue ? { ...o.queue } : null;
    return out;
  });
}

/** Operator update → audit entries describing what changed (for the console log). */
export function diffQueue(before, after) {
  const changes = [];
  const label = { peopleLow: 'Line (low)', peopleHigh: 'Line (high)', admitPerMin: 'Admissions/min', doorStatus: 'Door status' };
  for (const key of Object.keys(label)) {
    if ((before?.[key] ?? null) !== (after?.[key] ?? null)) changes.push(`${label[key]}: ${before?.[key] ?? '—'} → ${after?.[key] ?? '—'}`);
  }
  return changes;
}
