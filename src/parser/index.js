// Parser registry: detects the source site, splits multi-hand files, and parses
// each block into a normalized Hand. Add new site parsers to PARSERS (before the
// generic fallback) to extend support.

import { canParse as psCanParse, parsePokerStars, SITE as PS } from './pokerstars.js';
import { canParse as genCanParse, parseGeneric } from './generic.js';
import { splitHands } from './util.js';

/** Ordered list; first matching `canParse` wins. Generic must stay last. */
const PARSERS = [
  { name: PS, canParse: psCanParse, parse: parsePokerStars, startMarkers: ['PokerStars'] },
  { name: 'Generic', canParse: genCanParse, parse: parseGeneric, startMarkers: [] },
];

/** Pick the parser responsible for a raw hand/file. */
export function detectParser(text) {
  return PARSERS.find((p) => p.canParse(text)) || PARSERS[PARSERS.length - 1];
}

/** Parse a single hand block; failures degrade to an incomplete stub. */
export function parseHand(text) {
  const parser = detectParser(text);
  try {
    const hand = parser.parse(text);
    hand.warnings = hand.warnings || [];
    return hand;
  } catch (err) {
    return {
      handId: `error-${Date.now()}`,
      site: parser.name,
      gameType: 'Unknown',
      currency: 'PLAY',
      currencySymbol: '',
      isTournament: false,
      buttonSeat: 0,
      seats: [],
      actions: [],
      board: [],
      winners: {},
      incomplete: true,
      warnings: [`Parser threw: ${err.message}`],
      rawText: text,
      tags: [],
      notes: '',
    };
  }
}

/**
 * Parse a file that may contain one or many hands.
 * @returns {import('../model/hand.js').Hand[]}
 */
export function parseHandFile(text) {
  const parser = detectParser(text);
  const blocks = parser.startMarkers.length
    ? splitHands(text, parser.startMarkers)
    : text.replace(/\r\n?/g, '\n').split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean);
  return blocks.map((block) => parseHand(block));
}

export { PARSERS };
