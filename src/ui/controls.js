// Street-jump buttons, the action timeline, and control-bar state.
import { STREETS } from '../model/hand.js';

/** Render [PREFLOP] [FLOP] … buttons, only for streets that exist. */
export function renderStreetNav(navEl, { streetStarts, currentStreet, onJump }) {
  navEl.replaceChildren();
  for (const st of STREETS) {
    if (!(st in streetStarts)) continue;
    const btn = document.createElement('button');
    btn.textContent = st.toUpperCase();
    btn.setAttribute('aria-label', `Jump to ${st}`);
    if (st === currentStreet) btn.classList.add('cur');
    btn.addEventListener('click', () => onJump(streetStarts[st]));
    navEl.append(btn);
  }
}

/** Draw timeline ticks (colored by street) plus the playhead. */
export function renderTimeline(timelineEl, { steps, index }) {
  const n = steps.length || 1;
  timelineEl.replaceChildren();
  steps.forEach((s, i) => {
    const tick = document.createElement('div');
    tick.className = `tick ${s.street}` + (i === index - 1 ? ' cur' : '');
    tick.style.left = `${((i + 0.5) / n) * 100}%`;
    timelineEl.append(tick);
  });
  const head = document.createElement('div');
  head.className = 'playhead';
  head.style.left = `${(index / n) * 100}%`;
  timelineEl.append(head);
}

/** Map a click x-fraction on the timeline to a frame index (0..total). */
export function timelineSeekTarget(timelineEl, clientX, total) {
  const rect = timelineEl.getBoundingClientRect();
  const frac = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
  return Math.round(frac * total);
}

export function updateControlBar(els, { index, total, playing }) {
  els.counter.textContent = `${index} / ${total}`;
  els.play.textContent = playing ? '⏸' : '▶';
  els.start.disabled = els.prev.disabled = index <= 0;
  els.end.disabled = els.next.disabled = index >= total;
}
