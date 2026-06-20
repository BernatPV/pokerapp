// Tags & notes editor for the currently selected hand (§2.4).
// Notes save on input without re-rendering (so the textarea keeps focus);
// tag/mark changes do trigger a re-render to refresh chips and the list.

const QUICK_TAGS = ['bluff', 'bad beat', 'study', 'review', 'hero call', 'value', 'cooler'];

function escapeHtml(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

/**
 * @param {HTMLElement} el
 * @param {Object|null} hand
 * @param {{onToggleMark:Function, onAddTag:Function, onRemoveTag:Function, onNotes:Function}} cb
 */
export function renderHandEdit(el, hand, cb) {
  if (!hand) { el.hidden = true; el.replaceChildren(); return; }
  el.hidden = false;
  el.replaceChildren();

  const header = document.createElement('div');
  header.className = 'edit-header';
  const title = document.createElement('span');
  title.textContent = 'Tags & Notes';
  const mark = document.createElement('button');
  mark.className = 'mark-btn' + (hand.marked ? ' on' : '');
  mark.textContent = hand.marked ? '★ Marked' : '☆ Mark';
  mark.setAttribute('aria-pressed', String(!!hand.marked));
  mark.addEventListener('click', () => cb.onToggleMark(hand.id));
  header.append(title, mark);

  const tagList = document.createElement('div');
  tagList.className = 'tag-list';
  for (const t of hand.tags || []) {
    const chip = document.createElement('span');
    chip.className = 'chip removable';
    chip.innerHTML = `${escapeHtml(t)}<button class="x" aria-label="Remove tag ${escapeHtml(t)}">×</button>`;
    chip.querySelector('.x').addEventListener('click', () => cb.onRemoveTag(hand.id, t));
    tagList.append(chip);
  }
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'tag-input';
  input.placeholder = 'add tag…';
  input.setAttribute('aria-label', 'Add a tag');
  input.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    const v = input.value.trim();
    if (v) cb.onAddTag(hand.id, v);
    input.value = '';
  });
  tagList.append(input);

  const quick = document.createElement('div');
  quick.className = 'quick-tags';
  for (const t of QUICK_TAGS) {
    if ((hand.tags || []).includes(t)) continue;
    const b = document.createElement('button');
    b.className = 'quick';
    b.textContent = '+ ' + t;
    b.addEventListener('click', () => cb.onAddTag(hand.id, t));
    quick.append(b);
  }

  const notes = document.createElement('textarea');
  notes.className = 'notes-input';
  notes.rows = 3;
  notes.placeholder = 'Notes on this hand…';
  notes.setAttribute('aria-label', 'Hand notes');
  notes.value = hand.notes || '';
  notes.addEventListener('input', () => cb.onNotes(hand.id, notes.value));

  el.append(header, tagList, quick, notes);
}
