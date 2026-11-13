import { measured } from './metrics.js';

const icons = {
  video: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m10 9 5 3-5 3z"/>',
  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2m20 0v-2a4 4 0 0 0-3-4m-3-12a4 4 0 0 1 0 8"/><circle cx="9" cy="7" r="4"/>',
  compare: '<path d="M4 19h16M7 15V9m5 6V5m5 10v-4"/><circle cx="7" cy="9" r="1"/><circle cx="12" cy="5" r="1"/><circle cx="17" cy="11" r="1"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.8.4-1 1-1 1.7m0 3h.01"/>',
  moon: '<path d="M20.8 15.6A9.2 9.2 0 0 1 8.4 3.2a9.2 9.2 0 1 0 12.4 12.4Z"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4m0-14.2-1.4 1.4M6.3 17.7l-1.4 1.4"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  upload: '<path d="M12 16V4m-5 5 5-5 5 5M4 15v4a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-4"/>',
  download: '<path d="M12 4v12m-5-5 5 5 5-5M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3"/>',
  play: '<path d="m8 5 12 7-12 7z" fill="currentColor" stroke="none"/>',
  pause: '<path d="M9 5v14m6-14v14" stroke-width="3"/>',
  rewind: '<path d="M3 11a9 9 0 1 1 2.4 6M3 5v6h6"/><path d="M12 8v4l2 1"/>',
  forward: '<path d="M21 11a9 9 0 1 0-2.4 6M21 5v6h-6"/><path d="M12 8v4l-2 1"/>',
  previous: '<path d="M5 5v14m13-13-9 6 9 6z"/>',
  next: '<path d="M19 5v14M6 6l9 6-9 6z"/>',
  fullscreen: '<path d="M8 4H4v4m12-4h4v4M4 16v4h4m12-4v4h-4"/>',
  mute: '<path d="M11 5 6 9H3v6h3l5 4zm5 5 5 5m0-5-5 5"/>',
  sound: '<path d="M11 5 6 9H3v6h3l5 4zm5 4a4 4 0 0 1 0 6m2-8a7 7 0 0 1 0 10"/>',
  start: '<path d="M7 5l12 7-12 7z" fill="currentColor" stroke="none"/>',
  arm: '<path d="M19 6C12 6 6 9 6 16m0 0-3-4m3 4 5-1" stroke-width="2"/>',
  kick: '<path d="m4 7 5 5-5 5m8-10 5 5-5 5" stroke-width="2"/>',
  wall: '<path d="M17 4v16M21 4v16M3 12h10m-3-3 3 3-3 3" stroke-width="2"/>',
  release: '<path d="M17 4v16M21 4v16M13 12H3m4-3-4 3 4 3" stroke-width="2"/>',
  midpoint: '<path d="M12 5l7 7-7 7-7-7z" stroke-width="2"/>',
  finish: '<rect x="6" y="6" width="12" height="12" rx="1" fill="currentColor" stroke="none"/>',
  undo: '<path d="M8 5 3 10l5 5m-5-5h12a5 5 0 0 1 0 10h-3"/>',
  reset: '<path d="M4 11a8 8 0 1 1 2 6M4 5v6h6"/>',
  chevronLeft: '<path d="m15 5-7 7 7 7"/>',
  chevronRight: '<path d="m9 5 7 7-7 7"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  folder: '<path d="M3 6h7l2 2h9v11H3z"/>',
  edit: '<path d="m15 5 4 4M4 20l4-1L20 7l-4-4L4 15z"/>',
  close: '<path d="m6 6 12 12M18 6 6 18"/>',
  arrow: '<path d="M4 12h15m-6-6 6 6-6 6"/>',
  chart: '<path d="M4 4v16h16M7 15l4-5 4 2 5-6"/>',
  file: '<path d="M5 3h9l5 5v13H5zM14 3v5h5M8 13h8m-8 4h8"/>',
  check: '<path d="m4 12 5 5L20 6"/>',
  link: '<path d="M14 4h6v6m0-6-9 9m7 0v6H5V6h6"/>',
  trash: '<path d="M4 6h16M7 6v14h10V6m-8 0V3h6v3m-5 4v6m4-6v6"/>',
  search: '<circle cx="10.5" cy="10.5" r="5.5"/><path d="m15 15 5 5"/>',
  image: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m3 17 5-4 4 3 4-5 5 5"/>',
  sort: '<path d="m8 10 4-4 4 4m-8 4 4 4 4-4"/>',
  sortUp: '<path d="M12 19V5m-5 5 5-5 5 5"/>',
  sortDown: '<path d="M12 5v14m-5-5 5 5 5-5"/>',
  table: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18M3 14h18M10 9v11"/>',
};
export const icon = name => '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (icons[name] ?? '') + '</svg>';
export const eventIcons = { i: 'start', b: 'arm', p: 'kick', m: 'wall', r: 'release', v: 'midpoint', f: 'finish' };
export const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
export const options = (items, chosen) => items.map(([value, label]) =>
  '<option value="' + esc(value) + '"' + (String(value) === String(chosen) ? ' selected' : '') + '>' + esc(label) + '</option>').join('');
const numberFormats = new Map();
export function num(value, digits = 2) {
  if (!measured(value)) return '—';
  if (!numberFormats.has(digits)) numberFormats.set(digits, new Intl.NumberFormat('en-US', { maximumFractionDigits: digits }));
  return numberFormats.get(digits).format(value);
}
export function clock(value, precision = 2) {
  if (!measured(value)) return '—';
  const multiplier = 10 ** precision;
  const whole = Math.round(Math.abs(value) * multiplier);
  const s = Math.floor(whole / multiplier);
  const pad = n => String(n).padStart(2, '0');
  const hours = Math.floor(s / 3600);
  const fraction = precision ? '.' + String(whole % multiplier).padStart(precision, '0') : '';
  return (value < 0 ? '−' : '') + (hours ? pad(hours) + ':' : '') + pad(Math.floor(s / 60) % 60) + ':' + pad(s % 60) + fraction;
}
export const date = value => value ? new Date(value + 'T12:00:00').toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' }) : 'Undated';
export function safeUrl(value, images = false) {
  if (images && /^\/assets\/[a-z0-9._-]+$/i.test(value ?? '')) return value;
  if (images && /^data:image\/(?:jpeg|png|webp|gif);base64,[a-z0-9+/=]+$/i.test(value ?? '')) return value;
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password ? url.href : '';
  } catch {
    return '';
  }
}
export function avatar(athlete, className = '') {
  const photo = safeUrl(athlete?.photo, true);
  const name = athlete?.name ?? 'Athlete';
  const initials = name.trim().split(/\s+/).slice(0, 2).map(part => part[0]).join('').toUpperCase();
  return '<span class="avatar ' + className + '"><span aria-hidden="true">' + esc(initials) + '</span>' +
    (photo ? '<img alt="" src="' + esc(photo) + '" loading="lazy" referrerpolicy="no-referrer">' : '') + '</span>';
}

export function metric(label, value, unit = '', foot = '') {
  return `<div class="metric"><dt>${esc(label)}</dt><dd>${esc(value)}${unit && value !== '—' ? ` <span>${esc(unit)}</span>` : ''}</dd>${foot ? `<small>${esc(foot)}</small>` : ''}</div>`;
}

export const eventKeys = { i: ['I'], b: ['B', 'F'], p: ['P', 'J'], m: ['M'], v: ['V'], f: ['E'] };
export const athleteSexes = [['', 'Not specified'], ['woman', 'Woman'], ['man', 'Man']];
export const sexLabel = sex => athleteSexes.find(([value]) => value === sex)?.[1] ?? athleteSexes[0][1];
export const sexClass = sex => sex === 'woman' ? 'sex-woman' : sex === 'man' ? 'sex-man' : 'sex-unspecified';

export function chart(items, { label, unit, kind = 'bar', sex = '' }) {
  const data = items.filter(point => measured(point.value));
  if (!data.length) return '<div class="empty compact">' + icon('chart') + '<p>No data to plot.</p></div>';
  const compact = items.length <= 3;
  const width = compact ? 360 : Math.max(560, Math.min(items.length, 40) * 75);
  const left = 59, right = 28, top = 26, bottom = 188;
  const max = Math.max(...data.map(point => point.value), .01);
  const stepBase = 10 ** Math.floor(Math.log10(max / 4));
  const step = Math.ceil(max / (4 * stepBase)) * stepBase;
  const ceiling = step * 4;
  const dy = value => bottom - value / ceiling * (bottom - top);
  const slot = (width - left - right) / items.length;
  const dx = index => left + slot * (index + .5);
  const barWidth = Math.min(42, slot * .54);
  let path = '';
  let inLine = false;
  const lines = [0, 1, 2, 3, 4].map(i => {
    const y = dy(i * step);
    return `<line x1="${left}" x2="${width - right}" y1="${y}" y2="${y}" class="grid-line"/><text x="${left - 9}" y="${y + 4}" text-anchor="end">${num(i * step, 2)}</text>`;
  }).join('');
  const points = items.map((point, index) => {
    const x = dx(index);
    const axis = items.length <= 12 || index % Math.ceil(items.length / 12) === 0;
    const category = point.sex ?? sex;
    const title = esc(`${point.name ?? point.label}, ${sexLabel(category)}, ${num(point.value)} ${unit}${point.dq ? ', Disqualified' : ''}`);
    const xLabel = axis ? `<text x="${x}" y="${bottom + 22}" text-anchor="middle">${esc(point.label.slice(0, 13))}</text>` : '';
    if (!measured(point.value)) {
      inLine = false;
      return xLabel;
    }
    const y = dy(point.value);
    path += (inLine ? ' L' : ' M') + x + ',' + y;
    inLine = true;
    const shape = kind === 'line'
      ? `<circle cx="${x}" cy="${y}" r="5"/>`
      : `<rect x="${x - barWidth / 2}" y="${y}" width="${barWidth}" height="${Math.max(1, bottom - y)}" rx="3"/>`;
    return `<g class="chart-point ${sexClass(category)}${point.dq ? ' disqualified' : ''}" tabindex="0" role="img" aria-label="${title}"><title>${title}</title>${shape}${items.length <= 10 ? `<text class="value" x="${x}" y="${y - 9}" text-anchor="middle">${num(point.value)}</text>` : ''}</g>${xLabel}`;
  }).join('');
  return `<div class="chart-scroll"><svg class="chart series${compact ? ' compact-series' : ''}"
    style="--series-width:${width}px" viewBox="0 0 ${width} 224" role="img" aria-label="${esc(label)} (${esc(unit)})"><text x="${left}" y="13">${esc(unit)}</text>${lines}${kind === 'line' ? `<path d="${path}" class="trend ${sexClass(sex)}"/>` : ''}${points}</svg></div>`;
}

function plotScale(values, minPixel, maxPixel) {
  const low = Math.min(...values);
  const high = Math.max(...values);
  const pad = (high - low || Math.max(high * .2, .02)) * .14;
  const min = Math.max(0, low - pad);
  const max = high + pad;
  const rawStep = (max - min) / 4;
  const magnitude = 10 ** Math.floor(Math.log10(rawStep));
  const step = [1, 2, 2.5, 5, 10].find(value => value * magnitude >= rawStep) * magnitude;
  const first = Math.floor(min / step);
  const last = Math.ceil(max / step);
  return {
    at: value => minPixel + (maxPixel - minPixel) * (value / step - first) / (last - first),
    ticks: Array.from({ length: last - first + 1 }, (_, index) => (first + index) * step),
  };
}

function plotNameLines(name, fits) {
  const lines = [];
  let line = '';
  for (const word of name.trim().split(/\s+/u)) {
    const next = line ? line + ' ' + word : word;
    if (fits(next)) {
      line = next;
      continue;
    }
    if (line) lines.push(line);
    line = '';
    for (const letter of word) {
      if (line && !fits(line + letter)) {
        lines.push(line);
        line = '';
      }
      line += letter;
    }
  }
  if (line || !lines.length) lines.push(line);
  return lines;
}

function scatterDot(x, y, index, count, pool) {
  if (pool === 25) return `<rect class="scatter-dot" x="${x - 5}" y="${y - 5}" width="10" height="10"/>`;
  if (pool === 'mixed') return `<path class="scatter-dot" d="M${x} ${y - 6} l6 6 -6 6 -6 -6 Z"/>`;
  if (count === 1) return `<circle class="scatter-dot" cx="${x}" cy="${y}" r="5"/>`;
  const radius = Math.min(11, 6 + count);
  const edge = part => {
    const angle = part * 2 * Math.PI / count - Math.PI / 2;
    return [x + radius * Math.cos(angle), y + radius * Math.sin(angle)].join(' ');
  };
  return `<path class="scatter-dot" d="M${x} ${y} L${edge(index)} A${radius} ${radius} 0 0 1 ${edge(index + 1)} Z"/>`;
}

export function scatter(items, [xField, yField], pinned) {
  if (!items.length) return '<div class="empty compact">' + icon('chart') + '<p>No athletes have both selected metrics.</p></div>';
  const width = 466, left = 56, right = 440, top = 26, bottom = 226;
  const context = document.createElement('canvas').getContext('2d');
  if (context) context.font = '650 12px ' + getComputedStyle(document.documentElement).getPropertyValue('--font-body').trim();
  const measure = line => context?.measureText(line).width ?? line.length * 12;
  const groups = new Map();
  for (const item of items) {
    const key = item.x + ':' + item.y;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  }
  const x = plotScale(items.map(item=>item.x), left, right);
  const y = plotScale(items.map(item=>item.y), bottom, top);
  const tick = (field, value) => field.time ? clock(value, Number.isInteger(value) ? 0 : 2) : num(value, Math.max(2,field.digits ?? 2));
  const title = field => field.label + (field.time ? ' (mm:ss)' : ' (' + field.unit + ')');
  const grid = y.ticks.map(value => {
    const py = y.at(value);
    return `<line x1="${left}" x2="${right}" y1="${py}" y2="${py}" class="grid-line"/>
      <text x="${left - 9}" y="${py + 4}" text-anchor="end">${tick(yField,value)}</text>`;
  }).join('') + x.ticks.map(value => {
    const px = x.at(value);
    return `<line x1="${px}" x2="${px}" y1="${top}" y2="${bottom}" class="grid-line"/>
      <text x="${px}" y="${bottom + 18}" text-anchor="middle">${tick(xField,value)}</text>`;
  }).join('');
  const dots = [...groups.values()].map(group => group.map((item,index) => {
    const poolLabel = item.pool === 'mixed' ? 'Mixed-pool average' : item.pool + ' m pool';
    const text = esc(`${item.name}, ${sexLabel(item.sex)}, ${poolLabel}, ${xField.label} ${tick(xField,item.x)}, ${yField.label} ${tick(yField,item.y)}`);
    // Fan out coincident points when their shapes need to remain recognizable.
    const separate = group.length > 1 && group.some(point => point.pool !== 50);
    const angle = index * 2 * Math.PI / group.length;
    const offset = separate ? 6 / Math.sin(Math.PI / group.length) : 0;
    const px = x.at(item.x) + offset * Math.cos(angle);
    const py = y.at(item.y) + offset * Math.sin(angle);
    return `<g class="chart-point scatter-point ${sexClass(item.sex)}" tabindex="0" role="button" aria-label="${text}"
      aria-pressed="${pinned.has(item.id)}" data-scatter-point="${esc(item.id)}" data-x="${px}" data-y="${py}">
      ${scatterDot(px,py,index,separate ? 1 : group.length,item.pool)}</g>`;
  }).join('')).join('');
  const labels = items.map(item => {
    const lines = plotNameLines(item.name, line => measure(line) <= 168);
    const labelWidth = Math.ceil(Math.max(...lines.map(measure))) + 12;
    const name = lines.map((line,index) => `<tspan x="6" y="${15 + index * 15}">${esc(line)}</tspan>`).join('');
    return `<g class="scatter-label" data-scatter-label="${esc(item.id)}" hidden>
      <rect width="${labelWidth}" height="${lines.length * 15 + 7}" rx="4"/><text>${name}</text></g>`;
  }).join('');
  return `<div class="chart-scroll"><svg class="chart scatter" viewBox="0 0 ${width} ${bottom + 44}" role="group" aria-label="${esc(xField.label)} vs ${esc(yField.label)}">
    <text x="${left}" y="14">${esc(title(yField))}</text>${grid}${dots}
    <text x="${right}" y="${bottom + 38}" text-anchor="end">${esc(title(xField))}</text><g aria-hidden="true">${labels}</g></svg></div>`;
}

export function wireScatterLabels(svg) {
  if (!svg) return;
  const points = [...svg.querySelectorAll('[data-scatter-point]')];
  const labels = new Map([...svg.querySelectorAll('[data-scatter-label]')].map(label => [label.dataset.scatterLabel,label]));
  let hovered = null, focused = null;
  const refresh = () => {
    const visible = new Set(points.filter(point => point.getAttribute('aria-pressed') === 'true'));
    if (hovered) visible.add(hovered);
    if (focused) visible.add(focused);
    for (const label of labels.values()) label.setAttribute('hidden', '');
    const placed = [];
    for (const point of visible) {
      const label = labels.get(point.dataset.scatterPoint);
      const { width, height } = label.firstElementChild;
      const w = width.baseVal.value, h = height.baseVal.value;
      const { x, y } = point.dataset;
      const px = Number(x), py = Number(y), gap = 12;
      const bounds = svg.viewBox.baseVal;
      const right = px + gap, left = px - gap - w, above = py - gap - h, below = py + gap;
      const center = px - w/2;
      const besideLabels = placed.flatMap(box => [box.y-h-4, box.y+box.h+4])
        .sort((a,b) => Math.abs(a+h/2-py) - Math.abs(b+h/2-py));
      const candidates = [
        [right, py - h/2], [left, py - h/2], [center, above], [center, below],
        [right, above], [left, above], [right, below], [left, below],
        ...besideLabels.flatMap(y => [[center,y], [right,y], [left,y]]),
      ].map(([x,y]) => ({
        x: Math.max(54, Math.min(x,bounds.width-w-4)),
        y: Math.max(20, Math.min(y,bounds.height-h-42)),
      }));
      const clearOfPoint = candidates.filter(({x,y}) => x+w+6 <= px || x-6 >= px || y+h+6 <= py || y-6 >= py);
      const location = clearOfPoint.find(({x,y}) => placed.every(box =>
        x+w+3 <= box.x || box.x+box.w+3 <= x || y+h+3 <= box.y || box.y+box.h+3 <= y)) ?? clearOfPoint[0] ?? candidates[0];
      placed.push({ ...location, w, h });
      label.setAttribute('transform', `translate(${location.x} ${location.y})`);
      label.removeAttribute('hidden');
    }
  };
  for (const point of points) {
    point.addEventListener('pointerenter', event => { if (event.pointerType !== 'touch') { hovered = point; refresh(); } });
    point.addEventListener('pointerleave', () => { if (hovered === point) { hovered = null; refresh(); } });
    point.addEventListener('focus', () => { if (point.matches(':focus-visible')) { focused = point; refresh(); } });
    point.addEventListener('blur', () => { if (focused === point) { focused = null; refresh(); } });
  }
  svg.addEventListener('scatter-pin', refresh);
  refresh();
}

export function download(name, data, type) {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
