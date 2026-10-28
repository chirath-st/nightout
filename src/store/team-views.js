// App Store build stand-in for the team-only screens: groups, the venue console, ideas, points, passes and the team
// Profile (Plus, VIP cards). The store build never routes to them (main.js TEAM_ONLY); these keep shared code compiling.
const none = () => '';
// groups.js
export const allGroups = () => [];
export const groupCard = none;
export const membersSheet = none;
export const memberProfileSheet = none;
export const renderGroups = none;
export const nightMinutes = (hhmm) => { const [h, m] = hhmm.split(':').map(Number); return ((h < 12 ? h + 24 : h) - 18) * 60 + m; };
export const MAX_STOPS = 4;
export const renderGroupNew = none;
export const validateGroup = () => ({});
// console.js
export const currentDoor = () => null;
export const previewVenue = () => null;
export const photoPreview = none;
export const photoPanel = none;
export const renderConsole = none;
// business.js (Business view)
export const BIZ_SECTIONS = [];
export const MAX_UPLOADS = 0;
export const checkCode = () => ({ kind: 'invalid', code: null });
export const normalizeCode = () => null;
export const samplePhoto = none;
export const venueSections = () => [];
export const voucherCode = () => null;
export const countWait = none;
export const typedCount = () => null;
export const countBase = () => 0;
export const renderVenueLive = none;
// ideas.js
export const ideaCard = none;
export const renderIdeaNew = none;
export const ideaPanel = none;
export const ideasSection = none;
// points.js
export const renderPoints = none;
export const checkinSheet = none;
// passSheet.js
export const renderPassSheet = none;
// profile.js (team Profile: Plus, VIP cards)
export const vipCard = none;
export const renderProfile = none;
export const settingsSheet = none;
export const manageSubSheet = none;
export const helpSheet = none;
