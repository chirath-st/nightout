// Hash router. Hash routes keep browser Back and deep links working on a plain static server.
// Search/filter state lives in the query so returning restores the same decision context.

/** decodeURIComponent that returns null for a malformed escape (a hand-typed or truncated link like #/venue/%). */
const safeDecode = (s) => { try { return decodeURIComponent(s); } catch { return null; } };

export function parseHash(hash) {
  const raw = (hash || '').replace(/^#/, '') || '/';
  const [path, qs = ''] = raw.split('?');
  const parts = path.split('/').filter(Boolean).map(safeDecode);
  if (parts.includes(null)) return { name: 'notfound', params: {}, query: {} };
  const query = Object.fromEntries(new URLSearchParams(qs));
  if (parts.length === 0) return { name: 'tonight', params: {}, query };
  const [head, id, sub] = parts;
  switch (head) {
    case 'venue':
      if (!id) return { name: 'tonight', params: {}, query };
      return { name: sub === 'pass' ? 'pass' : 'venue', params: { id }, query };
    case 'saved':
      return { name: 'saved', params: {}, query };
    case 'passes':
      return id ? { name: 'passDetail', params: { id }, query } : { name: 'passes', params: {}, query };
    case 'console':
      return { name: 'console', params: {}, query };
    case 'about':
      return { name: 'about', params: {}, query };
    case 'events':
      return id === 'new' ? { name: 'ideaNew', params: {}, query } : { name: 'events', params: {}, query };
    case 'groups':
      return id === 'new' ? { name: 'groupNew', params: {}, query } : { name: 'groups', params: {}, query };
    case 'scan':
      return { name: 'scan', params: {}, query };
    case 'points':
      return { name: 'points', params: {}, query };
    case 'profile':
      return { name: 'profile', params: {}, query };
    default:
      return { name: 'notfound', params: {}, query };
  }
}

export function buildHash(name, params = {}, query = {}) {
  const enc = encodeURIComponent;
  let path;
  switch (name) {
    case 'venue': path = `/venue/${enc(params.id)}`; break;
    case 'pass': path = `/venue/${enc(params.id)}/pass`; break;
    case 'saved': path = '/saved'; break;
    case 'passes': path = '/passes'; break;
    case 'passDetail': path = `/passes/${enc(params.id)}`; break;
    case 'console': path = '/console'; break;
    case 'about': path = '/about'; break;
    case 'events': path = '/events'; break;
    case 'ideaNew': path = '/events/new'; break;
    case 'groups': path = '/groups'; break;
    case 'groupNew': path = '/groups/new'; break;
    case 'scan': path = '/scan'; break;
    case 'points': path = '/points'; break;
    case 'profile': path = '/profile'; break;
    default: path = '/';
  }
  const clean = Object.entries(query).filter(([, v]) => v !== '' && v != null);
  const qs = new URLSearchParams(clean).toString();
  return `#${path}${qs ? `?${qs}` : ''}`;
}

/** Explore query <-> state. Filters are a comma list; unknown ids are dropped. */
export const AREA_IDS = Object.freeze(['easton', 'side', 'hamilton']);

/** Nearest first by default (team mockup: cards ordered 0.2, 0.3, 0.4 mi…). */
export const DEFAULT_SORT = 'near';

export function exploreStateFromQuery(query, validFilters, validSorts) {
  const filters = (query.f || '').split(',').filter((f) => validFilters.includes(f));
  const sort = validSorts.includes(query.sort) ? query.sort : DEFAULT_SORT;
  const view = query.view === 'map' ? 'map' : 'list';
  const area = AREA_IDS.includes(query.area) ? query.area : '';
  return { q: query.q || '', filters, sort, view, area };
}

export function exploreQuery({ q, filters, sort, view, area }) {
  return {
    q: q || '',
    f: filters.length ? filters.join(',') : '',
    sort: sort && sort !== DEFAULT_SORT ? sort : '',
    view: view === 'map' ? 'map' : '',
    area: area || '',
  };
}
