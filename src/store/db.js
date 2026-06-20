// Local persistence for imported hands. Uses localStorage for a zero-dependency
// start; the same interface can later be backed by IndexedDB for large libraries.

const KEY = 'phr.hands.v1';

/** Stable id for de-duplication across re-imports. */
export function handUid(hand) {
  return `${hand.site}:${hand.handId}`;
}

export function loadHands() {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveHands(hands) {
  try {
    localStorage.setItem(KEY, JSON.stringify(hands));
  } catch (err) {
    console.warn('Could not persist hands:', err);
  }
}

/**
 * Merge freshly parsed hands into the stored set, de-duplicating by uid.
 * @returns {{hands:Object[], added:number, firstNewId:string|null}}
 */
export function addHands(existing, parsed) {
  const byId = new Map(existing.map((h) => [h.id, h]));
  let added = 0;
  let firstNewId = null;
  for (const h of parsed) {
    h.id = handUid(h);
    h.createdAt = h.createdAt || Date.now() + added; // keep import order stable
    if (!byId.has(h.id)) {
      byId.set(h.id, h);
      added += 1;
      if (!firstNewId) firstNewId = h.id;
    }
  }
  return { hands: [...byId.values()], added, firstNewId };
}
