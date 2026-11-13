import { analyze, eventNames, kickNames, mean, measured, positive } from './metrics.js';
import { rates, timedLink } from './media.js';
import { avatar, chart, clock, date, esc, eventIcons, eventKeys, icon, metric, num, options, scatter, sexClass, sexLabel } from './ui.js';

export const nav = { studio: ['Studio', 'video'], athletes: ['Athletes', 'users'], compare: ['Compare', 'compare'] };
export const sourceLabel = run => ({ video: 'Video attempt', legacy: 'Imported sequence', summary: 'Imported summary', official: 'Official results' }[run.origin] ?? 'Attempt');
export const competitionKey = name => String(name ?? '').trim().replace(/\s+/g, ' ').normalize('NFC').toLowerCase();
const competitionNames = runs => new Map(runs.filter(run => competitionKey(run.competition))
  .map(run => [competitionKey(run.competition), run.competition]));
export const orderedRuns = (runs, competitionDate) => [...runs].sort((a, b) =>
  competitionDate(b).localeCompare(competitionDate(a)) || (b.createdAt ?? '').localeCompare(a.createdAt ?? ''));
const action = (id, label, name, style = 'secondary') => `<button type="button" class="button ${style}" data-action="${id}">${icon(name)}${label}</button>`;
const empty = (name, label, description = '') => `<div class="empty">${icon(name)}<p>${label}</p>${description ? `<small>${description}</small>` : ''}</div>`;
const titleRow = (title, subtitle = '', trailing = '', headingId = '') =>
  `<div class="section-title"><div><h2${headingId ? ` id="${headingId}" tabindex="-1"` : ''}>${title}</h2>${subtitle ? `<p>${subtitle}</p>` : ''}</div>${trailing}</div>`;
const unit = (value, suffix, digits = 2) => measured(value) ? num(value, digits) + ' ' + suffix : '—';
const sexKey = sex => `<span class="sex-key ${sexClass(sex)}">${sexLabel(sex)}</span>`;
const refRun = run => run.origin !== 'video';
const started = run => run.events.some(event => event.type === 'i');
const statusText = (run, m) => m.finished ? (refRun(run) ? sourceLabel(run) : run.manualComplete && m.videoTime === null ? 'Manually finished' : 'Finished') : started(run) ? 'Recording' : 'Ready';

export function studio(run, athletes, runs, bookmark) {
  const athlete = athletes.find(item => item.id === run.athleteId);
  return `
    <div class="workbench">
      <section class="player panel" aria-label="Video player">
        <div class="player-top">
          <span class="reel-label">${icon('video')} <b>${esc(run.videoTitle || run.videoName || 'Video')}</b></span>
          <div class="source-actions"><a class="text-button source-link" href="${esc(timedLink(run.videoUrl, bookmark))}" target="_blank" rel="noopener noreferrer" ${run.videoUrl ? '' : 'hidden'}>${icon('link')} Source</a>
            ${action('load-video', 'Local file', 'folder', 'quiet')}${action('load-link', 'Video link', 'link', 'quiet')}
          </div>
        </div>
        <div class="video-stage" id="video-stage">
          <video id="video" playsinline preload="metadata" hidden></video>
          <div class="youtube-player" id="youtube-player" hidden></div>
          <div class="video-empty" id="video-empty">
            <div class="video-message">
              <h2 id="empty-video-title">${run.videoUrl ? 'Open stream' : run.videoName ? 'Reconnect video' : 'Open video'}</h2>
              ${!run.videoUrl && !run.videoName ? '<p class="video-hint">Load a recording to mark strokes, kicks and turns.</p>' : ''}
              <div class="source-actions">
                ${run.videoUrl ? action('restore-video', 'Retry link', 'video', 'white') : action('load-video', run.videoName ? 'Reconnect file' : 'Open file', 'folder', 'white')}
                ${action('load-link', run.videoUrl ? 'Edit link' : 'Paste link', 'link', 'stage-secondary')}
              </div>
              <p id="video-note" role="status"></p>
            </div>
          </div>
          <div class="video-overlay" id="video-overlay" hidden><span id="video-elapsed"></span></div>
          <input id="video-file" type="file" accept="video/*,.mp4,.mov,.m4v,.webm,.mkv" hidden>
        </div>
        <div class="transport" id="transport">
          <div class="seekbar">
            <input type="range" id="seek" min="0" max="1" value="0" step="0.001" aria-label="Video position" disabled>
            <div id="seek-marks" aria-hidden="true"></div>
          </div>
          <div class="transport-row">
            <div class="playback-group">
              <button type="button" id="play" class="play-button" data-action="play" title="Play or pause (Space)" aria-label="Play" disabled>${icon('play')}</button>
              <button type="button" data-action="rewind" title="Back (←)" aria-label="Back" disabled>${icon('rewind')}</button>
              <button type="button" data-action="forward" title="Forward (→)" aria-label="Forward" disabled>${icon('forward')}</button>
              <output id="video-clock">00:00.00 <span>/ 00:00</span></output>
            </div>
            <div class="playback-group transport-tools">
              <select id="rate" aria-label="Playback speed" disabled>${options(rates.map(n => [n, num(n) + '×']), 1)}</select>
              <button type="button" data-action="mute" title="Mute" aria-label="Mute" disabled>${icon('sound')}</button>
              <button type="button" data-action="fullscreen" title="Full screen" aria-label="Full screen" disabled>${icon('fullscreen')}</button>
              <button type="button" data-action="transport-settings" title="Playback settings" aria-label="Playback settings" disabled>${icon('clock')}</button>
            </div>
          </div>
        </div>
      </section>
      <section class="timeline-panel" aria-labelledby="timeline-title">
        <div class="timeline-head">
          <div class="timeline-navigation">
            <h2 id="timeline-title">Timeline</h2>
            <div class="event-navigation" role="group" aria-label="Jump between events">
              <button type="button" class="icon-button" data-action="previous-event" title="Previous event (;)" aria-label="Previous event" disabled>${icon('previous')}</button>
              <button type="button" class="icon-button" data-action="next-event" title="Next event (:)" aria-label="Next event" disabled>${icon('next')}</button>
            </div>
          </div>
          <div class="timeline-tools">
            <button type="button" class="button quiet" data-action="skip-release" hidden>Skip release</button>
            ${action('add-event', 'Add event', 'plus', 'secondary')}
            ${action('restart-marking', 'Restart marking', 'reset', 'quiet')}
            <div class="timeline-scroll-controls">
              <button type="button" class="icon-button" data-action="timeline-back" aria-label="Scroll timeline backward">${icon('chevronLeft')}</button>
              <button type="button" class="icon-button" data-action="timeline-forward" aria-label="Scroll timeline forward">${icon('chevronRight')}</button>
            </div>
          </div>
        </div>
        <div id="timeline"></div>
      </section>
      <section class="capture" aria-label="Markers">
        <div class="capture-head"><h2>Markers</h2><div id="run-status"></div></div>
        <div id="markers" class="markers">
          ${Object.entries(eventKeys).map(([type, keys]) => `<button type="button" class="marker event-${type}" data-mark="${type}" aria-keyshortcuts="${keys.join(' ')}"><span class="event-icon">${icon(eventIcons[type])}</span><span><strong>${eventNames[type]}</strong><small data-mark-detail="${type}"></small></span><kbd>${keys.join('/')}</kbd></button>`).join('')}
        </div>
        <div class="capture-foot"><button type="button" class="text-button" data-action="undo">${icon('undo')} Undo</button><span id="mark-count">0 marks</span></div>
      </section>
    </div>
    <div class="studio-details">
      <section class="panel run-info">
        <div class="attempt-toolbar">
          <h2>Attempt details</h2>
          <div class="heading-actions">${action('open-run', 'Open attempt', 'folder')}${action('new-run', 'New attempt', 'plus')}</div>
          <div class="heading-actions attempt-commit">${action('run-details', 'Details', 'edit', 'quiet')}${action('save-attempt', 'Save attempt', 'check', 'primary')}</div>
        </div>
        <div class="session-fields">
          <div class="athlete-picker">
            <label for="run-athlete">Athlete name</label>
            <input id="run-athlete" maxlength="120" autocomplete="off" role="combobox" aria-autocomplete="list"
              aria-expanded="false" aria-controls="athlete-suggestions" value="${esc(run.athleteName ?? athlete?.name)}">
            <ul id="athlete-suggestions" role="listbox" aria-label="Athlete suggestions" hidden></ul>
          </div>
          <label>Country<input id="run-country" maxlength="80" autocomplete="off" value="${esc(run.athleteCountry ?? athlete?.country)}"></label>
          <div>
            <label for="run-competition">Competition</label>
            <input id="run-competition" maxlength="140" list="competitions" value="${esc(run.competition)}" aria-describedby="run-competition-date">
            <datalist id="competitions">${options([...competitionNames(runs).values()].map(name => [name, name]), '')}</datalist>
            <small id="run-competition-date"></small>
          </div>
          <label>Pool<select id="run-pool">${options([[50,'50 m'],[25,'25 m']], run.pool)}</select></label>
          <div>
            <label for="run-distance">Final distance <span>m</span></label>
            <input id="run-distance" type="number" min="0.01" step="any" value="${esc(run.distance ?? '')}" placeholder="Auto" aria-describedby="run-distance-hint run-distance-error">
            <small class="field-hint" id="run-distance-hint">Auto at checkpoint</small>
            <small class="field-error" id="run-distance-error"></small>
          </div>
          <div>
            <label for="run-time">Final time <span>mm:ss</span></label>
            <input id="run-time" value="${esc(run.manualTime == null ? '' : clock(run.manualTime))}" placeholder="Auto" aria-describedby="run-time-hint run-time-error">
            <small class="field-hint" id="run-time-hint">Auto from Start and Finish</small>
            <small class="field-error" id="run-time-error"></small>
          </div>
        </div>
        <div id="run-feedback" class="run-feedback"></div>
      </section>
      <div class="studio-data">
        <section class="panel analysis-panel" aria-label="Attempt metrics">
          ${titleRow('Attempt metrics', '', '<button type="button" class="text-button" data-action="export-run">' + icon('download') + ' Export CSV</button>')}
          <div id="live-metrics"></div>
        </section>
        <section class="panel splits-panel">
          ${titleRow('Splits', '', `<select id="studio-split-mode" aria-label="Split grouping">${options([['50','Every 50 m'],['all','All checkpoints']], '50')}</select>`)}
          <div id="studio-splits"></div>
        </section>
        <section class="panel timing-panel" id="technique-timing" aria-label="Technique timing"></section>
      </div>
    </div>
    <div class="workspace-footer"><span>${icon('folder')} <span id="archive-count">${num(runs.length, 0)} saved attempts</span></span>
      <button type="button" class="text-button" data-action="import-legacy">${icon('file')} Import Excel notation</button></div>`;
}

export function studioMetrics(run, m) {
  const s = !m.movementData;
  const main = [
    metric('Total time', clock(m.time), '', run.manualTime ? 'Manual time' : 'Start to Finish'),
    metric('Distance', num(m.distance), 'm', m.distance == null && m.lastDistance ? 'At least ' + num(m.lastDistance) + ' m' : 'Analyzed distance'),
    metric('Equivalent cycles', num(s ? null : m.eq, 1), '', '½ per movement'),
    metric('Meters per eq. cycle', num(s ? null : m.metresPerEq), 'm', 'Includes wall push-off'),
    metric('Average speed', num(m.speed, 3), 'm/s'),
    metric('Time per eq. cycle', num(s ? null : m.secondsPerEq), 's'),
  ].join('');
  const details = [
    metric('Video start (T0)', clock(m.t0), '', run.videoAnchor != null && !run.events.some(e=>e.type==='i' && measured(e.t)) ? 'Approximate bookmark' : ''),
    metric('Arm strokes', num(s ? null : m.arms, 0)),
    metric('Kicks', num(s ? null : m.kicks, 0)),
    metric('Complete cycles', num(s ? null : m.pairs, 0)),
    metric('Extra kicks', num(s ? null : m.extraCount, 0), '', s ? '' : `${m.extra.launch} after wall, ${m.extra.approach} approach, ${m.extra.extra} tagged, ${m.extra.automatic} unpaired`),
    metric('Unpaired strokes', num(s ? null : m.unpairedArms, 0)),
    metric('Stroke interval', num(m.armInterval), 's'),
    metric('Kick interval', num(m.kickInterval), 's'),
    metric('Stroke duration', num(m.armDuration), 's'),
    metric('Kick duration', num(m.kickDuration), 's'),
    metric('Complete cycle interval', num(m.cycleInterval), 's'),
    metric('Stroke → kick', num(m.coordination), 's'),
    metric('Distance between cycles', num(m.cycleDistance), 'm', 'From recorded positions'),
    metric('First stroke', num(m.firstArmTime), 's'),
    metric('First kick', num(m.firstKickTime), 's'),
    metric('Meters to first stroke', num(m.firstArmDistance), 'm'),
    metric('Last movement → finish', num(m.finalGap), 's'),
    metric('Eq. cycles per minute', num(s ? null : m.eqPerMinute), 'cycles/min'),
    metric('Eq. cycles per 50 m', num(s ? null : m.eqPer50), 'cycles/50 m'),
  ].join('');
  return `<dl class="metrics primary-metrics">${main}</dl><details class="technical"><summary>Technique and cadence</summary><dl class="metrics detail-metrics">${details}</dl></details>`;
}

export function captureFeedback(run, m) {
  const video = run.videoName ? `Linked video: ${run.videoName}` : '';
  return [video, ...m.warnings].filter(Boolean).map(label => `<span class="${m.warnings.includes(label) ? 'warning' : ''}">${esc(label)}</span>`).join('');
}
export function markerStatus(run, m) {
  return `<span class="status-pill ${m.finished ? 'done' : started(run) ? 'live' : ''}">${statusText(run, m)}</span>`;
}

export function timeline(run, m) {
  if (!run.events.length) return '<p class="timeline-empty">No events.' +
    (['video', 'legacy'].includes(run.origin) ? ' Use Add event to begin.' : '') + '</p>';
  const entries = run.events.map((event, index) => {
    const type = event.type;
    const time = m.times.get(event.id);
    const previous = run.events[index - 1];
    const absolute = measured(previous?.t) && measured(event.t);
    const from = absolute ? previous.t : m.times.get(previous?.id);
    const to = absolute ? event.t : time;
    const gap = measured(from) && measured(to) && to >= from ? to - from : null;
    const interval = measured(gap)
      ? `<time class="timeline-interval" datetime="PT${gap.toFixed(3)}S" title="Time since previous event">${num(gap, 3)} s</time>`
      : '';
    const position = m.positions.get(type === 'r' ? event.wallId : event.id);
    const timestamp = measured(event.t) ? event.t : time;
    const review = type === 'm' && !event.contactConfirmed ? 'Review contact'
      : type === 'r' && !measured(position) ? 'Unlinked release' : '';
    const info = [review, measured(position) ? num(position) + ' m' : '',
      measured(event.t) && measured(time) ? '+' + clock(time, 2) : '',
      type === 'p' ? m.classify[event.id] : ''].filter(Boolean).join(', ');
    const label = eventNames[type] + ', ' + (measured(timestamp) ? clock(timestamp, 3) : 'Untimed');
    return `<li class="event-cue event-${type}">
      ${interval}
      <button type="button" class="timeline-seek" data-seek-event="${esc(event.id)}" aria-label="Jump to ${label}">
        <span class="event-icon">${icon(eventIcons[type])}</span><strong>${eventNames[type]}</strong>
        <time>${measured(timestamp) ? clock(timestamp, 3) : 'Untimed'}</time>
        ${info ? `<small title="${esc(info)}">${esc(info)}</small>` : ''}
      </button>
      <button type="button" class="icon-button" data-edit-event="${esc(event.id)}" title="Edit event" aria-label="Edit ${label}">${icon('edit')}</button>
    </li>`;
  }).join('');
  return `<ol class="event-list" aria-label="Events in chronological order">${entries}</ol>`;
}

const markClock = event => clock(event?.t ?? event?.elapsed, 3);
const seconds = value => unit(value, 's', 3);
const lengthName = length => 'Length ' + length.number;

export function techniqueView(m, { editable = false, sex } = {}) {
  const { turns, lengths, turnRanges } = m;
  const first = lengths[0];
  const last = lengths.at(-1);
  const change = first !== last && measured(first?.average) && measured(last?.average) ? last.average - first.average : null;
  const timingKeys = ['contactToRelease', 'releaseToArm', 'releaseToKick'];
  const timingCells = row => timingKeys.map(key => `<td>${seconds(row[key])}</td>`).join('');
  const edit = (event, label) => `<button type="button" class="text-button" data-edit-event="${esc(event.id)}">${label}</button>`;
  return `
    <h2>Technique timing</h2>
    <div class="timing-block">
      <h3>Wall turns</h3>
      ${turns.length ? `<div class="table-wrap"><table><thead><tr>
        <th scope="col">Wall</th><th scope="col">Contact mark</th><th scope="col">Release mark</th>
        <th scope="col">Contact → release</th><th scope="col">Release → first S</th><th scope="col">Release → first K</th>
        ${editable ? '<th scope="col">Events</th>' : ''}
      </tr></thead><tbody>
        ${turns.map(turn => `<tr>
          <th scope="row">${turn.contact ? unit(turn.distance, 'm') : 'Unlinked release'}</th>
          <td>${markClock(turn.contact)}${turn.contact && !turn.contact.contactConfirmed ? '<small class="timing-note">Needs review</small>' : ''}</td>
          <td>${markClock(turn.release)}</td>${timingCells(turn)}
          ${editable ? `<td class="timing-actions">${turn.contact ? edit(turn.contact, turn.contact.contactConfirmed ? 'Edit contact' : 'Review contact') : ''}
            ${turn.release ? edit(turn.release, 'Edit release') : `<button type="button" class="text-button" data-add-release="${esc(turn.contact.id)}">Add release</button>`}</td>` : ''}
        </tr>`).join('')}
      </tbody><tfoot><tr><th scope="row" colspan="3">Range across turns (max − min)</th>${timingCells(turnRanges)}${editable ? '<td></td>' : ''}</tr></tfoot></table></div>
      <p class="timing-note">Contact → release uses first wall touch and feet off the wall. S is mid-stroke and K is the end of the kick.</p>`
        : '<p class="timing-note">No wall marks recorded.</p>'}
    </div>
    <div class="timing-block">
      <h3>Stroke cycles by length</h3>
      ${lengths.length ? `
        <p class="timing-note">S denotes a stroke and K denotes a kick. S–S measures the time between consecutive stroke marks within a length. CV measures spread relative to the mean. K phase is shown only when one eligible kick falls strictly between the two S marks.</p>
        <div class="table-wrap"><table><thead><tr><th scope="col">Length</th><th scope="col">Timed cycles</th><th scope="col">Mean S–S</th>
          <th scope="col">S–S CV</th><th scope="col">Mean K phase</th><th scope="col">Cycles with K phase</th></tr></thead><tbody>
          ${lengths.map(length => `<tr><th scope="row">${lengthName(length)}${length.partial ? ' · partial / open' : ''}</th>
            <td>${length.timed}</td><td>${seconds(length.average)}</td><td>${unit(length.cv, '%', 1)}</td>
            <td>${unit(length.kickPhase, '%', 1)}</td><td>${length.phased}</td></tr>`).join('')}
        </tbody></table></div>
        ${first !== last ? `<p class="timing-note">${lengthName(last)} − ${lengthName(first)} mean S–S <strong>${change > 0 ? '+' : ''}${seconds(change)}</strong></p>` : ''}
        ${lengths.some(length => length.timed) ? chart(lengths.map(length => ({label:'L'+length.number, name:lengthName(length), value:length.average})),
          {label:'Mean S–S by length', unit:'s', kind:'line', sex}) : ''}
        ${lengths.some(length => length.cycles.length) ? `<details class="technical"><summary>Individual S–S cycles</summary>
          <div class="table-wrap"><table><thead><tr><th scope="col">Cycle</th><th scope="col">First S</th><th scope="col">Next S</th>
            <th scope="col">S–S</th><th scope="col">Associated K</th><th scope="col">K phase</th></tr></thead><tbody>
            ${lengths.map(length => length.cycles.map((cycle, index) => `<tr><th scope="row">L${length.number} · ${index + 1}</th>
              <td>${markClock(cycle.from)}</td><td>${markClock(cycle.to)}</td><td>${seconds(cycle.duration)}</td>
              <td>${markClock(cycle.kick)}</td><td>${unit(cycle.kickPhase, '%', 1)}</td></tr>`).join('')).join('')}
          </tbody></table></div></details>` : ''}`
        : '<p class="timing-note">No timed lengths yet.</p>'}
    </div>`;
}

export function splitTable(rows) {
  if (!rows.length) return empty('chart', 'No splits yet', 'Splits appear when a start and a checkpoint or finish are marked.');
  return `<div class="table-wrap"><table><thead><tr><th>Split</th><th>Time</th><th>Speed</th><th title="Equivalent cycles">Eq. cycles</th><th>Complete</th><th>Extra kicks</th><th>m/eq. cycle</th></tr></thead>
    <tbody>${rows.map(s => `<tr><th scope="row">${num(s.from)}–${num(s.to)} m</th><td>${clock(s.time)}</td><td>${unit(s.speed, 'm/s', 3)}</td><td>${num(s.eq, 1)}</td><td>${num(s.pairs, 0)}</td><td>${num(s.extraCount, 0)}</td><td>${num(s.metresPerEq)}</td></tr>`).join('')}</tbody></table></div>`;
}

const historyMetrics = {
  distance: ['Final distance', 'm'], speed: ['Average speed', 'm/s'],
  metresPerEq: ['Meters per eq. cycle', 'm/cycle'], eq: ['Equivalent cycles', 'cycles'],
  t100: ['100 m time', 's'], speed100: ['100 m speed', 'm/s'],
};
const techValue = (m, key) => {
  if (key === 't100') return m.fixed[100]?.time;
  if (key === 'speed100') return m.fixed[100]?.speed;
  return !m.movementData && key === 'eq' ? null : m[key];
};
export function athletesView(athletes, runs, state, competitionDate) {
  const query = state.query.trim().toLocaleLowerCase('en');
  const list = athletes.filter(a => `${a.name} ${a.country ?? ''}`.toLocaleLowerCase('en').includes(query));
  const athlete = list.find(a => a.id === state.id) ?? list[0];
  const allRuns = runs.filter(run => run.athleteId === athlete?.id);
  const attempts = orderedRuns(allRuns.filter(run => (state.pool === 'all' || run.pool === state.pool)), competitionDate);
  const measuredAttempts = attempts.map(run => [run, analyze(run)]);
  const summary = measuredAttempts.filter(([, m]) => m.finished && !m.inconsistent);
  const disqualified = summary.filter(([r]) => r.dq).length;
  const run = attempts.find(r => r.id === state.runId) ?? summary[0]?.[0] ?? attempts[0];
  const counts = id => runs.filter(r => r.athleteId === id).length;
  return `
    <div class="profile-layout">
      <aside class="panel directory" aria-label="Athlete directory">
        ${titleRow('Directory', `${athletes.length} ${athletes.length === 1 ? 'profile' : 'profiles'}`,
          action('new-athlete', 'New athlete', 'plus'))}
        <label class="searchbox">${icon('search')}<input id="profile-search" value="${esc(state.query)}" placeholder="Find athlete…" aria-label="Find athlete"></label>
        <div id="profile-list">${list.length ? list.map(a=>`<button class="person ${a.id === athlete?.id ? 'selected' : ''}" data-athlete="${esc(a.id)}" type="button" aria-pressed="${a.id === athlete?.id}">${avatar(a)}<span><strong>${esc(a.name)}</strong><small>${esc(a.country || 'No country')} / ${counts(a.id)} ${counts(a.id)===1 ? 'attempt' : 'attempts'}</small></span>${icon('arrow')}</button>`).join('') : `<p class="directory-empty">${athletes.length ? 'No matches. Try another name or country.' : 'No matches.'}</p>`}</div>
      </aside>
      <div class="profile-body">
        ${athlete ? `
          <section class="panel profile-card">
            <div class="profile-title">${avatar(athlete, 'large')}<div><h2 id="profile-title" tabindex="-1">${esc(athlete.name)}</h2><p class="profile-meta">${esc(athlete.country || '')}${sexKey(athlete.sex)}</p></div>
              <div class="heading-actions">
                <button class="button secondary" type="button" data-choose-photo="${esc(athlete.id)}">${icon('image')} Choose photo</button>
                <button class="button quiet" type="button" data-edit-athlete="${esc(athlete.id)}">${icon('edit')} Edit profile</button>
              </div>
            </div>
          </section>
          <section class="panel profile-history">
            ${titleRow('Attempts', `${attempts.length} ${state.pool === 'all' ? 'across both pools' : 'in this pool'}`, `<div class="heading-actions">
              <select id="profile-pool" aria-label="Athlete pool">${options([[50,'50 m pool'],[25,'25 m pool'],['all','All']], state.pool)}</select>
              <button class="button secondary" type="button" data-new-for="${esc(athlete.id)}">${icon('plus')} New attempt</button>
            </div>`, 'profile-attempts-title')}
            ${attempts.length ? `<div class="attempt-list">${measuredAttempts.map(([r,m]) => `
              <div class="attempt-item">
                <button type="button" data-load-run="${esc(r.id)}" class="attempt">
                  <span><strong>${esc(r.competition || 'Untitled session')}</strong>
                    <small>${date(competitionDate(r))} / ${r.pool} m / ${m.finished ? sourceLabel(r) : 'Draft'}${r.dq ? ' / <span class="dq-label">Disqualified</span>' : ''}</small></span>
                  <span class="number">${unit(m.distance,'m')} <small>${clock(m.time,0)}</small></span>
                  ${icon('arrow')}
                </button>
                <button type="button" class="text-button attempt-chart" data-profile-run="${esc(r.id)}"
                  aria-label="Review metrics for ${esc(r.competition || 'this attempt')}" aria-pressed="${r.id === run?.id}">Review</button>
                <button type="button" class="icon-button danger" data-delete-run="${esc(r.id)}"
                  title="Delete attempt" aria-label="Delete attempt · ${esc(r.competition || 'Untitled session')}">${icon('trash')}</button>
              </div>`).join('')}</div>` : empty('folder',state.pool === 'all' ? 'No attempts yet' : 'No attempts in this pool', state.pool === 'all' ? 'Start a new attempt for this athlete.' : 'Choose another pool or start a new attempt.')}
          </section>
          <section class="panel profile-summary">
            ${titleRow('Performance history', `${summary.length} ${summary.length === 1 ? 'attempt' : 'attempts'}${disqualified ? ' / ' + disqualified + ' disqualified' : ''}`,
              `<label class="history-metric">Metric <select id="history-metric">${options(Object.entries(historyMetrics).map(([key,[label]])=>[key,label]),state.metric)}</select></label>`)}
            <dl class="metrics bio-metrics">
              ${metric('Average distance', num(mean(summary.map(([,m])=>m.distance))), 'm')}
              ${metric('Average time', clock(mean(summary.map(([,m])=>m.time))))}
              ${metric('Average speed', num(mean(summary.map(([,m])=>m.speed)), 3), 'm/s')}
              ${metric('Average eq. cycles', num(mean(summary.map(([,m])=>techValue(m,'eq'))), 1))}
              ${metric('Average 100 m time', clock(mean(summary.map(([,m])=>m.fixed[100]?.time))))}
              ${metric('Meters per eq. cycle', num(mean(summary.map(([,m])=>m.metresPerEq))), 'm')}
            </dl>
            ${chart([...summary].reverse().map(([r,m])=>({ label:competitionDate(r) || r.competition || 'Session', name: r.competition, value:techValue(m,state.metric), dq:r.dq })), {label:historyMetrics[state.metric][0],unit:historyMetrics[state.metric][1],kind:'line',sex:athlete.sex})}
          </section>
          ${run ? profileAttempt(run,state.split,athlete.sex,competitionDate(run)) : ''}
        `
        : `<section class="panel">${athletes.length
          ? empty('users', 'Select an athlete', 'Find a profile in the directory to see its attempts.')
          : empty('users', 'No athlete profiles', 'Create a profile with New athlete, or enter an athlete name in Studio.')}</section>`}
      </div>
    </div>`;
}

function profileAttempt(run, splitMode, sex, eventDate) {
  const m = analyze(run);
  const rows = splitMode === '50' ? m.splits50 : m.splits;
  const measured100 = m.fixed[100];
  return `<section class="panel attempt-detail" aria-labelledby="attempt-review-title">
    ${titleRow(esc(run.competition || 'Untitled session'), [eventDate && date(eventDate), sourceLabel(run), run.dq && '<span class="dq-label">Disqualified</span>'].filter(Boolean).join(' / '), `<div class="heading-actions">
      <button class="text-button" type="button" data-jump-to="profile-attempts-title">Back to attempts</button>
      <button class="button secondary" type="button" data-load-run="${esc(run.id)}">${icon('video')} Open in Studio</button>
    </div>`, 'attempt-review-title')}
    ${run.notes ? `<p class="profile-notes">${esc(run.notes)}</p>` : ''}
    <dl class="metrics bio-metrics">
      ${metric('Analyzed distance', num(m.distance), 'm')}
      ${metric('100 m split', clock(measured100?.time))}
      ${metric('Eq. cycles at 100 m', num(measured100?.eq,1))}
    </dl>
    <div class="sources">${run.source ? `<span>${esc(run.source)}</span>` : ''}</div>
    <div class="chart-controls"><label>Splits <select id="profile-split">${options([['50','Every 50 m'],['all','All checkpoints']],splitMode)}</select></label></div>
    ${rows.length ? `<div class="split-charts">
      <div><h3>Speed by split</h3>${chart(rows.map(s=>({ label: s.from+'–'+s.to, value:s.speed })),{label:'Speed by split',unit:'m/s',sex})}</div>
      <div><h3>Equivalent cycles by split</h3>${chart(rows.map(s=>({ label: s.from+'–'+s.to, value:s.eq })),{label:'Equivalent cycles by split',unit:'cycles',sex})}</div>
    </div>${splitTable(rows)}` : empty('chart','No splits for this attempt')}
    ${studioMetrics(run,m)}
    <section class="timing-panel">${techniqueView(m,{sex})}</section>
  </section>`;
}

const compareFields = {
  name: { label: 'Athlete', get: row => row.athlete.name },
  maxDistance: { label: 'Max distance', get: row => row.maxDistance, unit: 'm', better: 1,
    detail: 'Longest analyzed distance in the selected pool, across competitions' },
  time: { label: 'Time', get: row => row.time, unit: 's', digits: 2, time: true, better: -1, splitOnly: true },
  speed: { label: 'Speed', get: row => row.speed, unit: 'm/s', digits: 3, better: 1, splitOnly: true },
  eq: { label: 'Eq. cycles', get: row => row.eq, unit: 'cycles', digits: 1 },
  metresPerEq: { label: 'm/eq. cycle', get: row => row.metresPerEq, unit: 'm/cycle' },
  secondsPerEq: { label: 's/eq. cycle', get: row => row.secondsPerEq, unit: 's/cycle' },
};
const compareColumns = Object.entries(compareFields);
export const scatterPresets = {
  'cycles-speed': { axes: ['eq', 'speed'], scope: '100', label: 'Eq. cycles vs Speed · first 100 m',
    note: 'See who swims faster with fewer movements.' },
  'speed-distance': { axes: ['speed', 'maxDistance'], scope: '100', label: 'Speed vs Max distance · first 100 m speed',
    note: 'Compare early pace with each athlete’s longest recorded attempt.' },
  'cycle-distance-time': { axes: ['metresPerEq', 'secondsPerEq'], label: 'm/eq. cycle vs s/eq. cycle',
    note: 'Compare how far athletes travel per cycle with how long each cycle takes on average.' },
};

function qualityScale(rows, field, fixedSplit) {
  if (!field.better || field.splitOnly && !fixedSplit) return new Map();
  const values = [...new Set(rows.map(field.get).filter(measured))].sort((a,b) => field.better * (a-b));
  if (values.length < 2) return new Map();
  return new Map(values.map((value,index) => [value, 100 * index / (values.length - 1)]));
}

export function comparison(athletes, runs, state, filtersChanged, competitionDate) {
  const countries = [...new Set(athletes.map(a=>a.country).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'en'));
  const competitions = [...competitionNames(runs.filter(run => (state.pool === 'all' || run.pool === state.pool)))]
    .sort(([, a], [, b]) => a.localeCompare(b, 'en'));
  const query = state.query.trim().toLocaleLowerCase('en');
  const chartRows = athletes.flatMap(athlete => {
    if (state.country && athlete.country !== state.country || !athlete.name.toLocaleLowerCase('en').includes(query)) return [];
    const eligible = orderedRuns(runs.filter(run => run.athleteId === athlete.id && (state.pool === 'all' || run.pool === state.pool) && (state.dq || !run.dq)), competitionDate)
      .map(run => ({run, total:analyze(run)}))
      .filter(({total}) => total.finished && !total.inconsistent);
    const matched = eligible.flatMap(({run,total}) => {
      if (state.competition && competitionKey(run.competition) !== state.competition) return [];
      const m = state.scope === 'total' ? total : total.fixed[state.scope];
      if (!m || !positive(m.distance) || state.scope !== 'total' && !positive(m.time)) return [];
      return [{ ...m, eq: state.scope === 'total' && !total.movementData ? null : m.eq, distance: total.distance, run }];
    });
    if (!matched.length) return [];
    let chosen = matched[0];
    if (state.mode === 'best') chosen = matched.reduce((a,b) =>
      (state.scope === 'total' ? (b.distance ?? 0) > (a.distance ?? 0) || b.distance === a.distance && (b.time ?? Infinity) < (a.time ?? Infinity) : b.time < a.time) ? b : a);
    const keys = ['time','speed','eq','metresPerEq','secondsPerEq'];
    const values = state.mode === 'mean' ? Object.fromEntries(keys.map(key=>[key,mean(matched.map(m=>m[key]))])) : chosen;
    const distances = eligible.map(({total})=>total.distance).filter(positive);
    const disqualified = state.mode === 'mean' ? matched.filter(item => item.run.dq).length : Number(Boolean(chosen.run.dq));
    const pool = state.mode === 'mean' && matched.some(item => item.run.pool !== chosen.run.pool) ? 'mixed' : chosen.run.pool;
    return [{...values, athlete, pool, maxDistance:distances.length ? Math.max(...distances) : null, run:chosen.run, disqualified}];
  }).sort((a,b)=>a.athlete.name.localeCompare(b.athlete.name,'en') || a.athlete.id.localeCompare(b.athlete.id));
  const get = compareFields[state.sort].get;
  const rows = [...chartRows].sort((a,b) => {
    const x = get(a), y = get(b);
    if (x == null || y == null) return x == null && y == null ? 0 : x == null ? 1 : -1;
    return state.direction * (typeof x === 'string' ? x.localeCompare(y,'en') : x - y);
  });
  const scales = new Map(compareColumns.map(([key,field])=>[key,qualityScale(rows,field,state.scope !== 'total')]));
  const hasRanks = [...scales.values()].some(scale => scale.size);
  const axisFields = state.axes.map(key=>compareFields[key]);
  const points = axisFields.length === 2 ? chartRows.map(row=>({
    id: row.athlete.id, name: row.athlete.name, sex: row.athlete.sex, pool: row.pool, x: axisFields[0].get(row), y: axisFields[1].get(row),
  })).filter(point=>measured(point.x) && measured(point.y)) : [];
  const plotTitle = axisFields.length === 2 ? axisFields.map(field => field.label).join(' vs ') : 'Scatter plot';
  const [presetId, preset] = Object.entries(scatterPresets).find(([, item]) =>
    (!item.scope || item.scope === state.scope) && item.axes.every((axis, index) => axis === state.axes[index])) ?? [];
  const axisSelect = index => {
    const axis = index === 0 ? 'x' : 'y';
    const current = state.axes[index];
    const choices = compareColumns
      .filter(([key, field]) => field.unit && (current || key !== state.axes[1 - index]))
      .map(([key, field]) => [key, field.label]);
    return `<label>${axis.toUpperCase()} axis
      <select id="compare-${axis}-axis" data-compare-axis="${index}" ${index === 1 && !state.axes[0] ? 'disabled' : ''}>
        <option value="" disabled ${current ? '' : 'selected'}>Select metric</option>
        ${options(choices, current)}
      </select>
    </label>`;
  };
  return `
    <section class="panel compare-filter" aria-labelledby="compare-filters-title">
      ${titleRow('Filters', '', `<button class="text-button" type="button" data-action="reset-comparison" ${filtersChanged ? '' : 'disabled'}>${icon('reset')} Reset filters</button>`, 'compare-filters-title')}
      <div class="filters">
        <label>Distance<select id="compare-scope">${options([['25','25 m'],['50','50 m'],['100','100 m'],['150','150 m'],['200','200 m'],['total','Full attempt']],state.scope)}</select></label>
        <label>Pool<select id="compare-pool">${options([[50,'50 m'],[25,'25 m'],['all','All']],state.pool)}</select></label>
        <label>Competition<select id="compare-competition">${options([['','All'],...competitions],state.competition)}</select></label>
        <label>Country<select id="compare-country">${options([['','All'],...countries.map(v=>[v,v])],state.country)}</select></label>
        <label>Aggregation<select id="compare-mode">${options([['latest','Latest comparable'],['best','Best comparable'],['mean','Athlete average']],state.mode)}</select></label>
        <label>Name<input id="compare-query" value="${esc(state.query)}" placeholder="Search…"></label>
      </div>
      <div class="check-row"><label><input id="compare-dq" type="checkbox" ${state.dq?'checked':''}> Include disqualifications</label></div>
    </section>
    <div class="comparison-layout">
      <section class="panel compare-table">
        ${titleRow('Comparison', `${rows.length} ${rows.length === 1 ? 'athlete' : 'athletes'} / ${state.scope === 'total' ? 'full attempt' : 'first ' + state.scope + ' m'} / ${state.pool === 'all' ? 'all pools' : state.pool + ' m pool'}`,
          `<div class="heading-actions">
            <button class="text-button compare-jump" type="button" data-jump-to="compare-plot-title">${icon('chart')} View plot</button>
            <button class="text-button" type="button" data-action="export-comparison" ${rows.length ? '' : 'disabled'}>${icon('download')} Export CSV</button>
          </div>`, 'compare-table-title')}
        ${hasRanks ? '<div class="compare-key"><i></i> Lower rank <span>→</span> Higher rank</div>' : ''}
        ${rows.length ? `<div class="table-wrap" tabindex="0" role="region" aria-label="Comparison table"><table><thead><tr>${compareColumns.map(([key,field])=>{
          const sorted = state.sort === key;
          return `<th scope="col"${sorted ? ' aria-sort="' + (state.direction > 0 ? 'ascending' : 'descending') + '"' : ''}>
            <div class="column-controls"><span data-column-label${field.detail ? ` title="${esc(field.detail)}"` : ''}>${field.label}</span>
            <button type="button" class="sort-column" data-sort="${key}" aria-label="Sort by ${field.label}" title="Sort by ${field.label}">
              ${icon(sorted ? (state.direction > 0 ? 'sortUp' : 'sortDown') : 'sort')}</button></div>
          </th>`;
        }).join('')}</tr></thead>
        <tbody>${rows.map(row=>`<tr${state.pinned.has(row.athlete.id) ? ' class="plot-selected"' : ''}>${compareColumns.map(([key,field])=>{
          const value = field.get(row);
          if (key === 'name') return `<th scope="row"><button class="table-person" type="button" data-view-athlete="${esc(row.athlete.id)}"
            ${state.mode !== 'mean' ? `data-compare-run="${esc(row.run.id)}"` : ''} title="${esc(value)}">${avatar(row.athlete)}<strong>${esc(value)}</strong>${row.disqualified
              ? state.mode === 'mean'
                ? `<small title="Disqualified attempts included: ${row.disqualified}">incl. DQ</small>`
                : '<small title="Disqualified">DQ</small>'
              : ''}</button></th>`;
          const quality = scales.get(key).get(value);
          const display = field.time ? clock(value,2) : unit(value,field.unit,field.digits ?? 2);
          return `<td${quality == null ? '' : ' class="ranked-cell" style="--quality:' + quality + '%"'}>${display}</td>`;
        }).join('')}</tr>`).join('')}</tbody></table></div>` : empty('search', 'No comparable attempts', runs.length ? 'Adjust the filters to find a completed attempt.' : 'Save a completed attempt in Studio to compare its measurements.')}
      </section>
      <section class="panel chart-panel comparison-scatter">
        ${titleRow(esc(plotTitle), axisFields.length === 2 && points.length < rows.length ? `${points.length} of ${rows.length} athletes plotted` : '',
          `<button class="text-button compare-jump" type="button" data-jump-to="compare-table-title">${icon('table')} Table</button>`, 'compare-plot-title')}
        <div class="scatter-presets">
          <label>Metric pair<select id="scatter-preset"${preset ? ' aria-describedby="scatter-preset-note"' : ''}>
            <option value="" disabled${preset ? '' : ' selected'}>Custom axes</option>
            ${options(Object.entries(scatterPresets).map(([id, item]) => [id, item.label]), presetId)}
          </select></label>
          ${preset ? `<p id="scatter-preset-note">${esc(preset.note)}</p>` : ''}
        </div>
        ${points.length ? `<p class="scatter-pool-key">■ 25 m &nbsp; ● 50 m${points.some(point => point.pool === 'mixed') ? ' &nbsp; ◆ Mixed-pool average' : ''}</p>` : ''}
        ${axisFields.length === 2 ? scatter(points,axisFields,state.pinned) : empty('chart','Select an X and Y metric')}
        <div class="axis-controls">${axisSelect(0)}${axisSelect(1)}</div>
      </section>
    </div>`;
}
