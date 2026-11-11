import { esc } from './ui.js';

const searchKey = text => text.normalize('NFD').replace(/\p{M}/gu, '').trim().replace(/\s+/g, ' ').toLowerCase();

export function wireAthletePicker(input, list, getAthletes, select) {
  let matches = [];
  let active = -1;

  function close() {
    list.hidden = true;
    input.setAttribute('aria-expanded', 'false');
    input.removeAttribute('aria-activedescendant');
    active = -1;
  }

  function show() {
    const query = searchKey(input.value);
    matches = getAthletes().filter(athlete => searchKey(athlete.name).includes(query)).slice(0, 8);
    close();
    if (!matches.length) return;
    list.innerHTML = matches.map((athlete, index) => `
      <li id="athlete-option-${index}" role="option" aria-selected="false" data-index="${index}">
        <strong>${esc(athlete.name)}</strong>${athlete.country ? '<span>' + esc(athlete.country) + '</span>' : ''}
      </li>`).join('');
    list.scrollTop = 0;
    list.hidden = false;
    input.setAttribute('aria-expanded', 'true');
  }

  function choose(index) {
    const athlete = matches[index];
    if (!athlete) return;
    input.value = athlete.name;
    close();
    select(athlete);
  }

  input.addEventListener('focus', show);
  input.addEventListener('input', show);
  input.addEventListener('blur', close);
  list.addEventListener('pointerdown', event => {
    if (event.target.closest('[role="option"]')) event.preventDefault();
  });
  list.addEventListener('click', event => {
    const option = event.target.closest('[data-index]');
    if (option) choose(Number(option.dataset.index));
  });
  input.addEventListener('keydown', event => {
    if (event.isComposing || event.altKey || event.ctrlKey || event.metaKey) return;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      if (list.hidden) show();
      if (list.hidden) return;
      event.preventDefault();
      list.children[active]?.setAttribute('aria-selected', 'false');
      if (event.key === 'ArrowDown') active = Math.min(active + 1, matches.length - 1);
      else active = active < 0 ? matches.length - 1 : Math.max(active - 1, 0);
      const option = list.children[active];
      option.setAttribute('aria-selected', 'true');
      input.setAttribute('aria-activedescendant', option.id);
      option.scrollIntoView({ block: 'nearest' });
    } else if (!list.hidden && event.key === 'Enter' && active >= 0) {
      event.preventDefault();
      choose(active);
    } else if (!list.hidden && event.key === 'Escape') {
      event.preventDefault();
      close();
    }
  });
}
