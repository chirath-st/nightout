// Combines the synthetic base dataset with operator-console overrides and demo passes.
// Remaining pass inventory is always capacity minus non-cancelled demo passes: no fake scarcity.

export function soldFor(passes, venueId, windowId) {
  return passes
    .filter((p) => p.venueId === venueId && p.windowId === windowId && !p.cancelledAt)
    .reduce((sum, p) => sum + p.party, 0);
}

export function resolveVenues(baseVenues, overrides = {}, passes = []) {
  return baseVenues.map((v) => {
    const o = overrides[v.id] || {};
    const out = { ...v };
    if (o.queue !== undefined) out.queue = o.queue ? { ...o.queue } : null;
    if (v.pass) {
      const po = o.pass || {};
      out.pass = {
        ...v.pass,
        enabled: po.enabled ?? v.pass.enabled,
        paused: po.paused ?? v.pass.paused,
        basePrice: po.basePrice ?? v.pass.basePrice,
        windows: v.pass.windows.map((w) => {
          const capacity = po.capacity?.[w.id] ?? w.capacity;
          const sold = soldFor(passes, v.id, w.id);
          return { ...w, capacity, sold, remaining: Math.max(0, capacity - sold) };
        }),
      };
    }
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
