import { attachYouTube } from './youtube.js';
import { wireAthletePicker } from './athlete-picker.js';
import { hlsPlayer, rates, rememberedHandle, rememberFile, timedLink, videoLink } from './media.js';
import { analyze, eventNames, kickNames, measured, parseLegacy, parseTime, pendingRelease, positive, validateTimeline } from './metrics.js';
import { athleteSexes, avatar, clock, date, download, esc, eventIcons, eventKeys, icon, num, options, safeUrl, wireScatterLabels } from './ui.js';
import { athletesView, captureFeedback, comparison, competitionKey, markerStatus, nav, orderedRuns, scatterPresets, sourceLabel, splitTable, studio, studioMetrics, techniqueView, timeline } from './views.js';

const $ = selector => document.querySelector(selector);
const playbackTarget = () => media?.youtube ? media.playback : $('#video');
const content = $('#content');
const dialog = $('#dialog');
const pending = new Map();
const failed = new Map();
const inputSaves = new Map();
const identityRequests = new Map();
const competitionDateEdits = new Map();
const competitionDates = new Map();
const provisionalAthletes = new Map();
const undoStack = new Map();
const profiles = { id: '', runId: '', pool: 50, metric: 'distance', split: '50', query: '' };
const comparisonFilters = { scope: '25', pool: 'all', country: '', competition: '', mode: 'latest', query: '', dq: true };
const compare = { ...comparisonFilters, axes: ['eq','speed'], sort: 'time', direction: 1, pinned: new Set(), pair: ['', ''] };
const playback = { rate: 1, step: 5, fps: 50, muted: false };
const shortSkip = .5;
const markShortcuts = Object.fromEntries(Object.entries(eventKeys)
  .flatMap(([type, keys]) => keys.map(key => [key.toLowerCase(), type])));
let athletes = [];
let runs = [];
let run;
let activeView;
let splitMode = '50';
let media = null;
let toastTimer;
let mediaRequest = 0;
let timelineCues = [];
let currentCue = null;
let profileLinkQueue = Promise.resolve();

const newId = () => crypto.randomUUID();
const competitionDate = record => competitionDates.get(competitionKey(record.competition)) ?? '';
function newRun(fields = {}) {
  return { id: newId(), revision: 0, origin: 'video', athleteId: '', competition: '',
    pool: 50, events: [], createdAt: new Date().toISOString(), ...fields };
}

async function api(url, method = 'GET', body) {
  const response = await fetch(url, {
    method, ...(body ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error ?? 'Could not connect to the local database.');
  }
  return response.json();
}

function notify(message, error = false) {
  const node = $('#toast');
  node.className = 'toast ' + (error ? 'error' : '');
  node.innerHTML = icon(error ? 'help' : 'check') + '<span>' + esc(message) + '</span>';
  node.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { node.hidden = true; }, 4400);
}
function saveLabel(text, kind = '') {
  const el = $('#save-state');
  el.className = 'save-state ' + kind;
  el.innerHTML = `<span>${esc(text)}</span>` +
    (kind === 'error' ? '<button class="text-button" data-action="retry-save">Retry</button>' : '');
}
function remember(record) {
  if (record.revision) localStorage.setItem('dnf-active-run', record.id);
}
function updateSaveLabel() {
  if (failed.size) saveLabel('Unsaved changes', 'error');
  else if (pending.size || inputSaves.size) saveLabel('Saving…', 'saving');
  else saveLabel('Saved locally');
}

function queueSave(record, { link = false, eventDate } = {}) {
  clearTimeout(inputSaves.get(record.id));
  inputSaves.delete(record.id);
  if (link) identityRequests.set(record.id, attemptIdentity(record));
  if (eventDate === null) competitionDateEdits.delete(record.id);
  else if (eventDate !== undefined) competitionDateEdits.set(record.id, { key: competitionKey(record.competition), date: eventDate });
  const prior = pending.get(record.id) ?? Promise.resolve();
  const task = prior.catch(() => {}).then(async () => {
    try {
      const linked = identityRequests.has(record.id) && await linkAttemptAthlete(record);
      const payload = structuredClone(record);
      const edit = competitionDateEdits.get(record.id);
      if (edit?.key === competitionKey(payload.competition)) payload.competitionDate = edit.date;
      else if (edit) competitionDateEdits.delete(record.id);
      const result = await api('/api/runs/' + record.id, 'PUT', payload);
      const savedDate = result.competitionDate !== undefined;
      if (savedDate) {
        competitionDates.set(edit.key, result.competitionDate);
        if (competitionDateEdits.get(record.id) === edit) competitionDateEdits.delete(record.id);
        if (activeView === 'studio') refreshCompetitionDate();
      }
      record.revision = result.revision;
      if (!runs.includes(record)) runs.push(record);
      if ($('#archive-count')) $('#archive-count').textContent = num(runs.length, 0) + ' saved attempts';
      if (record === run) remember(record);
      failed.delete(record.id);
      const search = { athletes:'profile-search', compare:'compare-query' }[activeView];
      if ((linked || savedDate) && search) {
        if (document.activeElement?.id === search) rerenderInput('#' + search, route);
        else route();
      }
    } catch (error) {
      failed.set(record.id, record);
      notify(error.message, true);
      throw error;
    }
  });
  pending.set(record.id, task);
  updateSaveLabel();
  task.catch(() => {}).finally(() => {
    if (pending.get(record.id) === task) pending.delete(record.id);
    updateSaveLabel();
  });
  return task;
}

function deferAttemptSave(record) {
  clearTimeout(inputSaves.get(record.id));
  inputSaves.set(record.id, setTimeout(() => queueSave(record), 350));
  updateSaveLabel();
}

function route() {
  const hash = location.hash.slice(1);
  const requested = ({ estudio:'studio', deportistas:'athletes', comparar:'compare' })[hash] || hash;
  const next = Object.hasOwn(nav, requested) ? requested : 'studio';
  const changed = activeView !== next;
  if (activeView === 'studio') {
    const video = playbackTarget();
    if (media?.ready && video && (!media.youtube || video.readyState >= 2) && measured(video.currentTime)) media.position = video.currentTime;
    video?.pause();
    releasePlayers(media);
  }
  activeView = next;
  content.setAttribute('aria-label', nav[next][0]);
  $('#navigation').innerHTML = Object.entries(nav).map(([key,[label,name]]) =>
    `<a href="#${key}" class="nav-item ${key === next ? 'active' : ''}" ${key === next ? 'aria-current="page"' : ''}>${icon(name)}<span>${label}</span></a>`).join('');
  if (next === 'studio') {
    const metrics = analyze(run);
    content.innerHTML = studio(run, athletes, runs, metrics.t0);
    wireAthletePicker($('#run-athlete'), $('#athlete-suggestions'), () => athletes, selectAttemptAthlete);
    wireVideo();
    refreshStudio(metrics);
    if (!media) restoreMedia(run);
  }
  if (next === 'athletes') {
    const scrollTop = changed ? 0 : $('#profile-list')?.scrollTop ?? 0;
    content.innerHTML = athletesView(athletes, runs, profiles, competitionDate);
    $('#profile-list').scrollTop = scrollTop;
  }
  if (next === 'compare') {
    const scrollLeft = changed ? 0 : $('.compare-table .table-wrap')?.scrollLeft ?? 0;
    const filtersChanged = Object.entries(comparisonFilters).some(([key, value]) => compare[key] !== value);
    content.innerHTML = comparison(athletes, runs, compare, filtersChanged, competitionDate);
    wireScatterLabels($('.scatter'));
    const table = $('.compare-table .table-wrap');
    if (table) table.scrollLeft = scrollLeft;
  }
  content.setAttribute('aria-busy', 'false');
  if (changed && hash !== 'content') window.scrollTo(0, 0);
}
function go(view) {
  if (location.hash === '#' + view) route();
  else location.hash = view;
}

function focusHeading(id) {
  const heading = document.getElementById(id);
  if (!heading) return;
  heading.focus({ preventScroll: true });
  heading.scrollIntoView({ block: 'start' });
}

function toggleScatterLabel(point) {
  const id = point.dataset.scatterPoint;
  const pinned = !compare.pinned.delete(id);
  if (pinned) compare.pinned.add(id);
  point.setAttribute('aria-pressed', String(pinned));
  $(`.compare-table [data-view-athlete="${CSS.escape(id)}"]`)?.closest('tr').classList.toggle('plot-selected', pinned);
  point.closest('svg').dispatchEvent(new Event('scatter-pin'));
}

function rerenderInput(id, rerender) {
  const before = $(id);
  const selection = before && [before.selectionStart, before.selectionEnd];
  rerender();
  const after = $(id);
  if (after && selection) {
    after.focus();
    if (selection[0] != null) after.setSelectionRange(...selection);
  }
}
function refreshStudio(m) {
  if (activeView !== 'studio') return;
  m ??= analyze(run);
  refreshCompetitionDate();
  const open = $('#live-metrics details')?.open;
  $('#live-metrics').innerHTML = studioMetrics(run, m);
  $('#live-metrics details').open = Boolean(open);
  const cyclesOpen = $('#technique-timing details')?.open;
  $('#technique-timing').innerHTML = techniqueView(m, {
    editable: ['video','legacy'].includes(run.origin), sex: athletes.find(athlete => athlete.id === run.athleteId)?.sex,
  });
  if (cyclesOpen && $('#technique-timing details')) $('#technique-timing details').open = true;
  $('#run-feedback').innerHTML = captureFeedback(run, m);
  $('#run-status').innerHTML = markerStatus(run,m);
  $('#mark-count').textContent = run.events.length + (run.events.length === 1 ? ' mark' : ' marks');
  $('[data-action="undo"]').disabled = !(undoStack.get(run.id)?.length || run.origin === 'video' && run.events.length);
  $('[data-action="restart-marking"]').disabled = !run.events.length;
  $('[data-action="add-event"]').disabled = !['video','legacy'].includes(run.origin);
  refreshTimeline(m);
  refreshSplits(m);
  const release = pendingRelease(run.events);
  const wallType = release ? 'r' : 'm';
  const marks = { i: 'Wall push-off', b: 'Mid-stroke', p: 'End of kick', m: release ? 'Feet off wall' : 'First touch', v: 'Mid-pool', f: 'Surface' };
  for (const button of document.querySelectorAll('[data-mark]')) {
    const type = button.dataset.mark;
    button.hidden = type === 'v' && run.pool !== 50;
    button.disabled = run.origin !== 'video';
    button.querySelector('small').textContent = marks[type];
  }
  const wallButton = $('[data-mark="m"]');
  wallButton.querySelector('strong').textContent = eventNames[wallType];
  wallButton.querySelector('.event-icon').innerHTML = icon(eventIcons[wallType]);
  $('[data-action="skip-release"]').hidden = !release || run.origin !== 'video';
  $('#run-distance').placeholder = m.distance ? num(m.distance) : m.lastDistance ? '≥ ' + m.lastDistance + ' m' : 'Auto';
  $('#run-time').placeholder = m.videoTime != null ? clock(m.videoTime) : 'Auto';
  $('#studio-split-mode').value = splitMode;
  refreshVideoHeader(m.t0);
  refreshSeekMarks();
  syncVideo();
}
function refreshCompetitionDate() {
  const eventDate = competitionDate(run);
  $('#run-competition-date').textContent = eventDate ? date(eventDate)
    : competitionKey(run.competition) ? 'Date not set' : '';
}
function eventVideoTime(event) {
  return event?.t ?? (measured(run.videoAnchor) && measured(event?.elapsed) ? run.videoAnchor + event.elapsed : null);
}
function refreshTimeline(m) {
  const scroll = $('#timeline .event-list')?.scrollLeft ?? 0;
  $('#timeline').innerHTML = timeline(run, m);
  const list = $('#timeline .event-list');
  timelineCues = list ? run.events.map((event, index) => [eventVideoTime(event), list.children[index]])
    .filter(([time]) => measured(time)) : [];
  currentCue = null;
  if (list) {
    list.scrollLeft = scroll;
    list.addEventListener('scroll', updateTimelineControls, { passive: true });
  }
  updateTimelineControls();
}
function updateTimelineControls() {
  const list = $('#timeline .event-list');
  const back = $('[data-action="timeline-back"]');
  const forward = $('[data-action="timeline-forward"]');
  if (!back || !forward) return;
  back.disabled = !list || list.scrollLeft < 2;
  forward.disabled = !list || list.scrollLeft + list.clientWidth > list.scrollWidth - 2;
}
function scrollTimeline(direction) {
  const list = $('#timeline .event-list');
  if (list) list.scrollBy({ left: direction * list.clientWidth * .85, behavior: 'instant' });
}
function revealEvent(id, focus = false) {
  const edit = $('#timeline [data-edit-event="' + CSS.escape(id) + '"]');
  if (!edit) return;
  revealCue(edit.parentElement);
  if (focus) edit.focus({ preventScroll: true });
}
function revealCue(element) {
  const list = element.parentElement;
  const cue = element.getBoundingClientRect();
  const left = element.querySelector('.timeline-interval')?.getBoundingClientRect().left ?? cue.left;
  const viewport = list.getBoundingClientRect();
  if (left < viewport.left) list.scrollLeft += left - viewport.left - 4;
  if (cue.right > viewport.right) list.scrollLeft += cue.right - viewport.right + 4;
}
function highlightTimeline(position) {
  const next = measured(position) ? timelineCues.findLast(([time]) => time <= position + .0005)?.[1] : null;
  if (next === currentCue) return;
  currentCue?.classList.remove('current');
  currentCue?.querySelector('.timeline-seek').removeAttribute('aria-current');
  if (next) {
    next.classList.add('current');
    next.querySelector('.timeline-seek').setAttribute('aria-current', 'time');
    revealCue(next);
  }
  currentCue = next;
}
function refreshSplits(m = analyze(run)) {
  $('#studio-splits').innerHTML = splitTable(splitMode === '50' ? m.splits50 : m.splits);
}

function matchingVideo(file, record = run) {
  return !record.videoUrl && (!record.videoName || record.videoName === file.name
    && (!record.videoSize || record.videoSize === file.size)
    && (!record.videoModified || record.videoModified === file.lastModified));
}

function matchingMedia(source, record = run) {
  return source.file ? matchingVideo(source.file, record) : source.link === record.videoUrl;
}

function assignVideo(record, file) {
  record.videoName = file.name;
  record.videoSize = file.size;
  record.videoModified = file.lastModified;
  delete record.videoUrl;
  delete record.videoTitle;
}
function releasePlayers(source) {
  if (!source) return;
  source.hls?.destroy();
  source.youtubePlayer?.destroy();
  source.hls = source.youtubePlayer = source.playback = null;
}
function clearMedia() {
  const previous = media;
  media = null;
  releasePlayers(previous);
  if (previous?.file) URL.revokeObjectURL(previous.url);
}

function videoMessage(message, error = false) {
  const note = $('#video-note');
  if (!note) return;
  note.textContent = message;
  note.classList.toggle('error', error);
}

function pickVideo(file, handle) {
  if (!file) return;
  if (!matchingVideo(file) && run.events.length) {
    notify('Open the original video or start a new attempt.', true);
    return;
  }
  mediaRequest++;
  if (handle) rememberFile(file, handle).catch(() => {});
  clearMedia();
  if (run.videoUrl && !run.events.length) delete run.videoAnchor;
  media = { file, url: URL.createObjectURL(file), position: analyze(run).t0 ?? 0, ready: false };
  setVideoSource();
}

async function restoreMedia(record, prompt = false) {
  const request = ++mediaRequest;
  if (record.videoUrl) {
    const link = videoLink(record.videoUrl);
    return resolveLink(record, link, analyze(record).t0 ?? 0, request);
  }
  if (!record.videoName) return false;
  try {
    const handle = await rememberedHandle(record);
    if (!handle || request !== mediaRequest || run !== record || activeView !== 'studio') return false;
    let permission = await handle.queryPermission({ mode: 'read' });
    if (permission !== 'granted' && prompt) permission = await handle.requestPermission({ mode: 'read' });
    if (permission !== 'granted') return false;
    const file = await handle.getFile();
    if (request !== mediaRequest || run !== record || activeView !== 'studio' || !matchingVideo(file, record)) return false;
    pickVideo(file);
    return true;
  } catch {
    return false;
  }
}

async function selectLocalFile() {
  const record = run;
  if (!media && record.videoName && !record.videoUrl && await restoreMedia(record, true)) return;
  if (window.showOpenFilePicker) {
    try {
      const [handle] = await window.showOpenFilePicker({
        id: 'dnf-videos', multiple: false,
        types: [{ description: 'Video', accept: { 'video/*': ['.mp4', '.mov', '.m4v', '.webm', '.ogv', '.mkv'] } }],
      });
      const file = await handle.getFile();
      if (run === record && activeView === 'studio') pickVideo(file, handle);
      return;
    } catch (error) {
      if (error.name === 'AbortError') return;
    }
  }
  if (run === record) $('#video-file')?.click();
}

async function resolveLink(record, link, position, request = ++mediaRequest) {
  videoMessage('Opening stream…');
  try {
    const resolved = link.cmas ? await api('/api/video?url=' + encodeURIComponent(link.url)) :
      { source: link.url, title: link.title };
    if (request !== mediaRequest || run !== record || activeView !== 'studio') return false;
    clearMedia();
    media = { url: resolved.source, link: link.url, youtube: link.youtube, title: resolved.title, position, ready: false };
    setVideoSource();
    return resolved;
  } catch (error) {
    if (request === mediaRequest && run === record && activeView === 'studio') {
      videoMessage(error.message, true);
      notify(error.message, true);
    }
    return false;
  }
}

function loadVideoLink() {
  const current = run;
  openForm('Video link', field('url', 'YouTube, CMAS TV or video URL', current.videoUrl,
    'type="url" required placeholder="https://…"') +
    field('position', 'Start at (seconds or hh:mm:ss)', '', 'placeholder="' + (measured(current.videoAnchor) ? clock(current.videoAnchor,3) : 'From the link, if present') + '"') +
    (current.events.length ? '<label class="check-line"><input type="checkbox" name="sameRecording"> This is the same recording and timeline</label>' : ''),
  async data => {
    const link = videoLink(data.get('url'));
    const value = parseTime(data.get('position'));
    if (Number.isNaN(value)) throw new Error('Enter seconds or a time such as 02:23:08.');
    if (current.events.length && current.videoUrl !== link.url && current.videoName && !data.get('sameRecording')) {
      throw new Error('Confirm that the new link uses the same timeline as the existing markers.');
    }
    const bookmark = value ?? link.position ?? (current.videoUrl === link.url ? current.videoAnchor : null);
    const position = current.events.find(event=>event.type==='i')?.t ?? bookmark ?? 0;
    const resolved = await resolveLink(current,link,position);
    if (!resolved) throw new Error($('#video-note').textContent || 'This stream could not be opened.');
    current.videoUrl = link.url;
    current.videoAnchor = bookmark ?? null;
    current.videoName = link.cmas ? 'CMAS TV' : link.youtube ? 'YouTube' : link.title;
    current.videoTitle = resolved.title;
    delete current.videoSize;
    delete current.videoModified;
    await queueSave(current);
    refreshStudio();
  }, 'Open link');
}

async function setVideoSource() {
  const video = $('#video');
  const selected = media;
  if (!video || !selected) return;
  releasePlayers(selected);
  selected.boundVideo = video;
  selected.ready = false;
  const youtubeHost = $('#youtube-player');
  youtubeHost.hidden = !selected.youtube;
  video.hidden = Boolean(selected.youtube);
  $('#video-empty').hidden = true;
  $('#video-overlay').hidden = Boolean(selected.youtube);
  syncVideo();
  if (selected.youtube) {
    video.pause();
    video.removeAttribute('src');
    video.load();
    youtubeHost.innerHTML = '<p class="stream-loading" role="status">Opening YouTube…</p>';
    selected.youtubePlayer = attachYouTube(youtubeHost, selected.youtube, selected.position, {
      ready(target) {
        selected.playback = target;
        selected.ready = true;
        target.muted = playback.muted;
        const supported = target.availableRates;
        if (supported.includes(playback.rate)) target.playbackRate = playback.rate;
        syncVideo();
      },
      update: syncVideo,
      onPlay() {
        if (youtubeHost.contains(document.activeElement)) $('#play').focus({ preventScroll: true });
      },
      error: message => failVideo(selected, video, message),
    });
    return;
  }
  try {
    if (!/\.m3u8(?:[?#]|$)/i.test(selected.url) || video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = selected.url;
      video.load();
      return;
    }
    video.removeAttribute('src');
    video.load();
    const Hls = await hlsPlayer();
    if (media !== selected || $('#video') !== video) return;
    if (!Hls?.isSupported()) throw new Error('This browser cannot play HLS.');
    const hls = selected.hls = new Hls({ enableWorker: true, startPosition: selected.position });
    hls.on(Hls.Events.ERROR, (_event, data) => {
      if (data.fatal) failVideo(selected, video, 'This stream could not be played.');
    });
    hls.attachMedia(video);
    hls.loadSource(selected.url);
  } catch (error) {
    failVideo(selected, video, error.message);
  }
}

function failVideo(selected, video, message) {
  if (media !== selected || $('#video') !== video || selected.boundVideo !== video) return;
  clearMedia();
  video.removeAttribute('src');
  video.load();
  video.hidden = true;
  $('#youtube-player').hidden = true;
  $('#video-empty').hidden = false;
  $('#video-overlay').hidden = true;
  videoMessage(message, true);
  syncVideo();
  notify(message, true);
}

function refreshVideoHeader(bookmark) {
  const label = $('.reel-label b');
  if (label) label.textContent = run.videoTitle || run.videoName || 'Video';
  const source = $('.source-link');
  if (source) {
    source.hidden = !run.videoUrl;
    source.href = timedLink(run.videoUrl, bookmark);
  }
}

function wireVideo() {
  const video = $('#video');
  const input = $('#video-file');
  input.addEventListener('change', () => { pickVideo(input.files[0]); input.value = ''; });
  const stage = $('#video-stage');
  stage.addEventListener('dragover', event => { event.preventDefault(); stage.classList.add('dragging'); });
  stage.addEventListener('dragleave', event => { if (!stage.contains(event.relatedTarget)) stage.classList.remove('dragging'); });
  stage.addEventListener('drop', async event => {
    event.preventDefault();
    stage.classList.remove('dragging');
    const record = run;
    const file = event.dataTransfer.files[0];
    const item = [...event.dataTransfer.items].find(entry=>entry.kind==='file');
    const handle = await item?.getAsFileSystemHandle?.().catch(()=>null);
    if (record === run && activeView === 'studio') pickVideo(file, handle?.kind === 'file' ? handle : null);
  });
  video.addEventListener('loadedmetadata', () => {
    if (!media || media.youtube || media.boundVideo !== video || !positive(video.duration)) return;
    const position = media.position;
    media.ready = true;
    setRate(video, playback.rate);
    video.muted = playback.muted;
    if (Math.abs(video.currentTime - position) > .05) {
      video.currentTime = Math.min(video.duration, position);
    }
    $('#rate').value = playback.rate;
    if (media.file && run.origin === 'video' && (!matchingVideo(media.file) || !run.videoName)) {
      assignVideo(run, media.file);
      queueSave(run);
      refreshStudio();
      return;
    }
    refreshSeekMarks();
    syncVideo();
  });
  video.addEventListener('error', () => {
    if (media && !media.youtube) failVideo(media, video, 'The browser could not play this video.');
  });
  for (const type of ['timeupdate','playing','pause','ended','seeked','volumechange']) video.addEventListener(type, syncVideo);
  video.addEventListener('click', togglePlay);
  $('#seek').addEventListener('input', event => seekTo(Number(event.target.value), false));
  $('#rate').addEventListener('change', event => setRate(playbackTarget(), Number(event.target.value)));
  if (media) setVideoSource();
}

function syncVideo() {
  if (!$('#transport')) return;
  const video = playbackTarget();
  const ready = Boolean(media?.ready && video);
  const seek = $('#seek');
  const duration = ready && positive(video.duration) ? video.duration : null;
  for (const control of document.querySelectorAll('#transport button, #transport input, #transport select')) control.disabled = !ready;
  seek.disabled = !duration;
  for (const action of ['rewind','forward','transport-settings']) {
    $('[data-action="' + action + '"]').disabled = !duration;
  }
  for (const action of ['previous-event','next-event']) {
    $('[data-action="' + action + '"]').disabled = !duration || !timelineCues.length;
  }
  highlightTimeline(ready ? video.currentTime : null);
  if (!ready) return;
  const time = video.currentTime;
  if (measured(time) && (!media.youtube || video.readyState >= 2)) media.position = time;
  if (duration) {
    if (Number(seek.max) !== duration) {
      seek.max = duration;
      refreshSeekMarks();
    }
    seek.value = time;
    seek.style.setProperty('--position', 100 * time / duration + '%');
  }
  $('#video-clock').innerHTML = clock(time) + ' <span>/ ' + clock(duration,0) + '</span>';
  const play = $('#play');
  const playLabel = video.paused ? 'Play' : 'Pause';
  if (play.getAttribute('aria-label') !== playLabel) {
    play.innerHTML = icon(video.paused ? 'play' : 'pause');
    play.setAttribute('aria-label', playLabel);
  }
  const mute = $('[data-action="mute"]');
  const muteLabel = video.muted ? 'Unmute' : 'Mute';
  if (mute.getAttribute('aria-label') !== muteLabel) {
    mute.innerHTML = icon(video.muted ? 'mute' : 'sound');
    mute.setAttribute('aria-label', muteLabel);
  }
  const rate = $('#rate');
  const availableRates = video.availableRates ?? rates;
  const signature = availableRates.join(',');
  if (rate.dataset.rates !== signature) {
    rate.innerHTML = options(availableRates.map(value=>[value,num(value)+'×']), video.playbackRate);
    rate.dataset.rates = signature;
  }
  rate.value = video.playbackRate;
  playback.rate = video.playbackRate;
  const start = run.events.find(e=>e.type==='i' && measured(e.t));
  $('#video-elapsed').textContent = start ? 'DNF ' + clock(time - start.t) : '';
  $('[data-action="rewind"]').title = 'Back ' + playback.step + ' s (←)';
  $('[data-action="forward"]').title = 'Forward ' + playback.step + ' s (→)';
}
function refreshSeekMarks() {
  const video = playbackTarget();
  if (!video || !positive(video.duration)) return;
  $('#seek-marks').innerHTML = run.events.filter(e=>measured(e.t) && e.t<=video.duration)
    .map(e=>`<i class="event-${e.type}" style="left:${100*e.t/video.duration}%"></i>`).join('');
}

function togglePlay() {
  const video = playbackTarget();
  if (!media?.ready || !video) return;
  if (video.paused) video.play().catch(() => notify('Playback could not start.',true));
  else video.pause();
}
function setRate(video, rate) {
  if (!video) return;
  try {
    video.playbackRate = rate;
    if (!media?.youtube) syncVideo();
  } catch {
    $('#rate').value = video.playbackRate;
    notify('This browser does not support that playback speed.', true);
  }
}
function seekTo(seconds, pause = true) {
  const video = playbackTarget();
  if (!media?.ready || !positive(video?.duration)) return false;
  if (pause) video.pause();
  video.currentTime = Math.max(0, Math.min(video.duration, seconds));
  syncVideo();
  return true;
}
function offset(seconds, pause = false) {
  const video = playbackTarget();
  if (video) seekTo(video.currentTime + seconds, pause);
}
function jumpEvent(backwards) {
  const position = playbackTarget()?.currentTime;
  if (!measured(position)) return;
  const cue = backwards
    ? timelineCues.findLast(([time]) => time < position - .0005)
    : timelineCues.find(([time]) => time > position + .0005);
  if (cue) seekTo(cue[0]);
}

function setEvents(events, { keepUndo = true, ...fields } = {}) {
  const relative = run.origin === 'legacy';
  if (run.origin === 'video' || relative) validateTimeline(events, run.pool, relative);
  if (keepUndo) {
    const history = undoStack.get(run.id) ?? [];
    history.push({ events: run.events, ...Object.fromEntries(Object.keys(fields).map(key => [key, run[key]])) });
    undoStack.set(run.id, history);
  }
  Object.assign(run, fields, { events });
  queueSave(run);
  refreshStudio();
}
function byTimestamp(a,b) {
  return a.t - b.t || Number(b.type === 'i') - Number(a.type === 'i') || Number(a.type === 'f') - Number(b.type === 'f');
}
function addMark(type) {
  if (run.origin !== 'video') return notify('Start a new attempt to annotate this video.',true);
  const video = playbackTarget();
  if (!media?.ready || !video || video.readyState < 2 || video.seeking) {
    return notify('Open the video and wait for the frame to load.', true);
  }
  if (!matchingMedia(media)) return notify('The video does not match this attempt.',true);
  if (type !== 'i' && !run.events.some(e=>e.type==='i')) return notify('Mark the start with I first.', true);
  if ((type === 'i' || type === 'f') && run.events.some(e=>e.type===type)) {
    return notify('This marker already exists. Edit it in the timeline.',true);
  }
  if (type === 'v' && run.pool !== 50) return;
  const t = Math.round(video.currentTime * 1000) / 1000;
  try {
    const contact = type === 'm' ? pendingRelease(run.events) : null;
    const next = { id: newId(), type: contact ? 'r' : type, t };
    if (contact) next.wallId = contact.id;
    else if (type === 'm') next.contactConfirmed = true;
    setEvents([...run.events, next].sort(byTimestamp));
    revealEvent(next.id);
    const button = $('[data-mark="' + type + '"]');
    if (button?.animate && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
      button.animate([{ backgroundColor:'var(--accent-soft)' }, { backgroundColor:'transparent' }], 350);
    }
    if (type === 'f') video.pause();
  } catch (error) {
    notify(error.message, true);
  }
}

function skipRelease() {
  const contact = pendingRelease(run.events);
  if (contact) setEvents(run.events.map(event => event === contact ? { ...event, releaseSkipped: true } : event));
}

function undo() {
  const history = undoStack.get(run.id);
  const last = run.events.at(-1);
  if (history?.length) {
    const { events, ...fields } = history.at(-1);
    setEvents(events, { ...fields, keepUndo: false });
    history.pop();
    $('[data-action="undo"]').disabled = !(history.length || run.origin === 'video' && run.events.length);
  } else if (run.origin === 'video' && last) setEvents(run.events.slice(0, -1), { keepUndo: false });
}

function enterRun(record, fresh = false) {
  const video = playbackTarget();
  const current = media?.ready && (!media.youtube || video?.readyState >= 2) ? video?.currentTime ?? media.position : media?.position ?? 0;
  video?.pause();
  mediaRequest++;
  if (media) {
    if (!fresh && !matchingMedia(media, record)) clearMedia();
    else {
      media.position = fresh ? current : analyze(record).t0 ?? 0;
      if (fresh && media.ready && media.file) assignVideo(record, media.file);
      if (fresh && media.link) {
        Object.assign(record, { videoUrl: media.link, videoAnchor: current, videoName: run.videoName, videoTitle: media.title });
      }
    }
  }
  run = record;
  if (run.revision) remember(run);
  else localStorage.removeItem('dnf-active-run');
  if (activeView === 'studio') {
    activeView = null;
    route();
    window.scrollTo({ top: 0 });
  } else go('studio');
}

function openForm(title, body, submit, label = 'Save', variant = 'primary') {
  dialog.innerHTML = `<div class="dialog-head"><h2 id="dialog-title">${esc(title)}</h2><button type="button" class="icon-button" data-action="close-dialog" aria-label="Close">${icon('close')}</button></div>
    <form>${body}<p class="form-error" role="alert"></p><div class="dialog-actions"><button type="button" class="button secondary" data-action="close-dialog">Cancel</button><button class="button ${variant}" type="submit">${label}</button></div></form>`;
  if (!dialog.open) dialog.showModal();
  const form = dialog.querySelector('form');
  form.addEventListener('submit', async event => {
    event.preventDefault();
    const button = form.querySelector('[type="submit"]');
    button.disabled = true;
    button.setAttribute('aria-busy', 'true');
    form.querySelector('.form-error').textContent = '';
    try {
      const after = await submit(new FormData(form));
      dialog.close();
      if (typeof after === 'function') after();
    } catch (error) {
      form.querySelector('.form-error').textContent = error.message;
    } finally {
      button.disabled = false;
      button.removeAttribute('aria-busy');
    }
  });
}
const field = (name, label, value = '', attributes = '') =>
  `<label>${label}<input name="${name}" value="${esc(value)}" ${attributes}></label>`;
const textArea = (name,label,value='') => `<label>${label}<textarea name="${name}" rows="3" maxlength="1800">${esc(value)}</textarea></label>`;
const formNote = text => `<p class="form-note">${text}</p>`;
const fieldNumber = (data, key, allowZero = false) => {
  const raw = String(data.get(key) ?? '').trim();
  if (!raw) return null;
  const val = Number(raw.replace(',', '.'));
  if (!measured(val) || val < 0 || (!allowZero && val === 0)) throw new Error('Check the number.');
  return val;
};

async function uploadPortrait(file) {
  if (!file?.size) return null;
  if (file.size > 20_000_000) throw new Error('Choose an image under 20 MB.');
  const image = await createImageBitmap(file).catch(()=>{ throw new Error('Could not open the image.'); });
  try {
    const canvas = document.createElement('canvas');
    const scale = Math.min(1, 640 / Math.max(image.width, image.height));
    canvas.width = Math.max(1, Math.round(image.width * scale));
    canvas.height = Math.max(1, Math.round(image.height * scale));
    canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/webp', .86);
  } finally {
    image.close();
  }
}

async function saveProfile(athlete, select = true) {
  const { id, revision, name, country, photo, sex } = athlete;
  const saved = await api('/api/athletes/' + id, 'PUT', { id, revision, name, country, photo, sex });
  athletes = [...athletes.filter(item=>item.id!==id),saved].sort((a,b)=>a.name.localeCompare(b.name,'en'));
  if (select) {
    provisionalAthletes.delete(id);
    profiles.id = id;
    profiles.runId = '';
    profiles.query = '';
  }
  return saved;
}

function editAthlete(athlete) {
  const existing = athlete ?? { id:newId(), revision:0 };
  openForm(athlete ? 'Edit profile' : 'New athlete', `
    <div class="form-grid">${field('name','Name',existing.name,'required maxlength="120"')}
    ${field('country','Country',existing.country,'maxlength="80"')}</div>
    <label>Sex<select name="sex" aria-label="Sex">${options(athleteSexes, existing.sex ?? '')}</select></label>`, async data => {
      const name = data.get('name').trim();
      const country = data.get('country').trim();
      if (!name) throw new Error('Enter the athlete’s name.');
      const saved = await saveProfile({ ...existing, name, country, sex: data.get('sex') });
      route();
      return !athlete && !saved.photo ? () => choosePhoto(saved) : undefined;
    });
  dialog.querySelector('form').dataset.saveShortcut = '';
}

const identityKey = value => String(value ?? '').trim().replace(/\s+/g, ' ').normalize('NFC').toLocaleLowerCase('en');
function attemptIdentity(record) {
  const athlete = athletes.find(item => item.id === record.athleteId);
  return { name: (record.athleteName ?? athlete?.name ?? '').trim(),
    country: (record.athleteCountry ?? athlete?.country ?? '').trim() };
}

function selectAttemptAthlete(athlete) {
  run.athleteId = athlete.id;
  delete run.athleteName;
  delete run.athleteCountry;
  identityRequests.delete(run.id);
  $('#run-country').value = athlete.country ?? '';
  queueSave(run);
  refreshStudio();
}

function linkAttemptAthlete(record) {
  const task = profileLinkQueue.catch(() => {}).then(async () => {
    const request = identityRequests.get(record.id);
    if (!request) return false;
    const { name, country } = request;
    const isCurrent = () => {
      const current = attemptIdentity(record);
      return identityRequests.get(record.id) === request && current.name === name && current.country === country;
    };
    if (!name || !isCurrent()) {
      identityRequests.delete(record.id);
      return false;
    }
    const names = athletes.filter(item => identityKey(item.name) === identityKey(name));
    const linked = names.find(item => item.id === record.athleteId);
    const provisional = athletes.find(item => provisionalAthletes.get(item.id) === record.id
      && !runs.some(other => other !== record && other.athleteId === item.id));
    const countryKey = identityKey(country);
    let athlete = (linked && identityKey(linked.country) === countryKey ? linked : null)
      ?? names.find(item => identityKey(item.country) === countryKey)
      ?? (linked && (!linked.country || !country) ? linked : null);
    if (!athlete && !country && names.length === 1) athlete = names[0];
    athlete ??= provisional;
    const rename = athlete && athlete === provisional && name !== athlete.name;
    const updateCountry = country && country !== athlete?.country;
    const changed = athlete?.id !== record.athleteId || Boolean(rename || updateCountry);
    if (!athlete) {
      athlete = await saveProfile({ id:newId(), revision:0, name, country }, false);
      provisionalAthletes.set(athlete.id, record.id);
    } else if (rename || updateCountry) {
      athlete = await saveProfile({ ...athlete, name: rename ? name : athlete.name, country }, false);
    }
    if (isCurrent()) {
      record.athleteId = athlete.id;
      delete record.athleteName;
      delete record.athleteCountry;
    }
    if (identityRequests.get(record.id) === request) identityRequests.delete(record.id);
    return changed;
  });
  profileLinkQueue = task;
  return task;
}

async function saveAttempt(offerPhoto = false) {
  const record = run;
  if (document.activeElement?.closest('.session-fields')) document.activeElement.blur();
  await queueSave(record, { link:true });
  if (run !== record || activeView !== 'studio' || dialog.open) return;
  const athlete = athletes.find(item => item.id === record.athleteId);
  if (offerPhoto && athlete && !athlete.photo) choosePhoto(athlete);
  else notify('Attempt saved.');
}

async function choosePhoto(athlete) {
  if (!athlete) return;
  const query = athlete.name + ' freediving';
  dialog.classList.add('photo-dialog');
  dialog.innerHTML = `<div class="dialog-head"><div><h2 id="dialog-title">Choose photo</h2><p class="photo-query">${esc(query)}</p></div>
    <button type="button" class="icon-button" data-action="close-dialog" aria-label="Close">${icon('close')}</button></div>
    <div class="dialog-body"><div class="photo-results" aria-live="polite"><p>Searching images…</p></div>
      <div class="photo-actions"><a class="button quiet" href="https://search.brave.com/images?q=${esc(encodeURIComponent(query))}" target="_blank" rel="noopener noreferrer">${icon('link')} Open search</a>
        <button type="button" class="button secondary" id="upload-photo">${icon('upload')} Upload image</button>
        ${athlete.photo ? '<button type="button" class="button quiet danger" id="remove-photo">Remove photo</button>' : ''}
        <button type="button" class="button quiet" data-action="close-dialog">Done</button>
        <input type="file" id="portrait-file" accept="image/*" hidden>
      </div>
    </div>`;
  dialog.showModal();
  const results = $('.photo-results');
  const save = async photo => {
    if (results.dataset.saving) return;
    results.dataset.saving = '1';
    try {
      await saveProfile({ ...athlete, photo });
      dialog.close();
      if (activeView === 'athletes') route();
      notify(photo ? 'Profile photo saved.' : 'Profile photo removed.');
    } catch (error) {
      notify(error.message,true);
    } finally {
      delete results.dataset.saving;
    }
  };
  $('#upload-photo').onclick = () => $('#portrait-file').click();
  $('#portrait-file').onchange = async event => {
    try {
      const photo = await uploadPortrait(event.target.files[0]);
      if (photo && dialog.open && results.isConnected) await save(photo);
    } catch (error) { notify(error.message,true); }
  };
  if ($('#remove-photo')) $('#remove-photo').onclick = () => save('');
  try {
    const found = await api('/api/photos?name=' + encodeURIComponent(athlete.name));
    if (!dialog.open || !results.isConnected) return;
    const images = found.images.filter(image=>safeUrl(image.thumbnail));
    results.innerHTML = images.length ? `<div class="photo-grid">${images.slice(0,10).map((image,index)=>
      `<button type="button" data-result="${index}" aria-label="Choose image ${index+1}${image.title ? ' · ' + esc(image.title) : ''}" disabled><img src="${esc(safeUrl(image.thumbnail))}" alt="" referrerpolicy="no-referrer"><span>${String(index+1).padStart(2,'0')}</span></button>`).join('')}</div>` : '<p>No image results.</p>';
    for (const button of results.querySelectorAll('[data-result]')) {
      const image = button.querySelector('img');
      const fallback = safeUrl(images[Number(button.dataset.result)].original);
      const failed = () => {
        if (fallback && image.src !== fallback) image.src = fallback;
        else {
          image.hidden = true;
          button.classList.add('unavailable');
          button.querySelector('span').textContent += ' · Unavailable';
        }
      };
      image.addEventListener('load', () => { button.disabled = false; });
      image.addEventListener('error', failed);
      if (image.complete) {
        if (image.naturalWidth) button.disabled = false;
        else failed();
      }
    }
    results.addEventListener('click', event => {
      const button = event.target.closest('[data-result]');
      if (button && !button.disabled) save(button.querySelector('img').currentSrc);
    });
  } catch (error) {
    if (dialog.open && results.isConnected) results.textContent = error.message;
  }
}

function runDetails() {
  const record = run;
  const currentDate = competitionDate(record);
  const competition = competitionKey(record.competition);
  openForm('Attempt details', `
    ${competition ? field('competitionDate', 'Competition date', currentDate, 'type="date"') : ''}
    <label class="check-line"><input type="checkbox" name="dq" ${run.dq ? 'checked' : ''}> Disqualified</label>
    ${run.origin==='video' && !run.events.some(e=>e.type==='f') ? `<label class="check-line"><input type="checkbox" name="manualComplete" ${run.manualComplete ? 'checked' : ''}> Finish with manually entered distance and time</label>` : ''}
    ${textArea('notes','Attempt notes',run.notes)}
    ${run.sequence ? `<p class="form-note">Original notation: <code>${esc(run.sequence)}</code></p>` : ''}
    ${run.revision ? '<button type="button" class="text-button danger" data-action="delete-run">'+icon('trash')+' Delete attempt</button>' : ''}`, async data => {
      if (data.get('manualComplete') && (!positive(run.distance) || !positive(run.manualTime))) {
        throw new Error('Enter the final distance and time before closing the attempt manually.');
      }
      const nextDate = data.get('competitionDate');
      Object.assign(record,{
        manualComplete: Boolean(data.get('manualComplete')),
        dq:Boolean(data.get('dq')), notes:data.get('notes').trim(),
      });
      await queueSave(record, { eventDate: nextDate !== currentDate ? nextDate : null });
      refreshStudio();
    });
  dialog.querySelector('form').dataset.saveShortcut = '';
}

function commitMarkerEdits(events) {
  if (run.origin === 'video') {
    setEvents(events.sort(byTimestamp));
    return;
  }
  const isCheckpoint = event => event.type === 'm' || event.type === 'v';
  const checkpointOrder = items => items.filter(isCheckpoint).map(event => event.id + ':' + event.type).join('|');
  if (checkpointOrder(events) !== checkpointOrder(run.events)) {
    events = events.map(event => {
      if (!isCheckpoint(event) || !measured(event.distance)) return event;
      const { distance, ...marker } = event;
      return marker;
    });
  }
  setEvents(events);
}

function editEvent(id, contactId) {
  const event = run.events.find(item => item.id === id);
  if (id && !event) return;
  const relative = run.origin === 'legacy';
  const markers = run.events.filter(item => item !== event);
  const choices = Object.entries(eventNames).filter(([type]) => type !== 'v' || run.pool === 50);
  const defaultType = event?.type ?? (contactId ? 'r' : markers.length ? 'b' : 'i');
  const video = playbackTarget();
  video?.pause();
  const { t0, positions } = analyze(run);
  const defaultTime = relative ? event?.elapsed : event?.t ?? (media?.ready ? video.currentTime : t0);
  const contactIndex = contactId ? run.events.findIndex(item => item.id === contactId) : -1;
  const nextMarker = event || contactIndex >= 0
    ? run.events[(event ? run.events.indexOf(event) : contactIndex) + 1] : markers.find(item => item.type === 'f');
  const formatTime = time => measured(time) ? clock(time, 3) : '';
  const canUseVideoTime = media?.ready && video && matchingMedia(media) && (!relative || measured(run.videoAnchor));
  const videoTime = () => {
    if (!canUseVideoTime || video.seeking) return null;
    const time = video.currentTime - (relative ? run.videoAnchor : 0);
    return time >= 0 ? time : null;
  };
  const sequenceChoices = markers.map((item, index) => [
    item.id, 'Before ' + (index + 1) + ' · ' + eventNames[item.type]
      + (measured(item.elapsed) ? ' · ' + clock(item.elapsed) : ''),
  ]);
  const contacts = markers.filter(item => item.type === 'm');
  const wallChoices = [['', 'Preceding wall contact'], ...contacts.map(item => [
    item.id, num(positions.get(item.id)) + ' m · ' + (formatTime(relative ? item.elapsed : item.t) || 'Untimed'),
  ])];
  if (event?.type === 'r' && event.wallId && !contacts.some(item => item.id === event.wallId)) {
    wallChoices.push([event.wallId, 'Contact deleted']);
  }
  const currentVideoTime = videoTime();
  openForm(event ? 'Edit event' : 'Add event', `
    <div class="form-grid">
      <label>Event type<select name="eventType" aria-label="Event type">${options(choices, defaultType)}</select></label>
      ${field('time', relative ? 'Elapsed time' : 'Video time', formatTime(defaultTime),
        (relative ? '' : 'required ') + 'placeholder="Seconds or hh:mm:ss.sss"')}
    </div>
    ${canUseVideoTime ? `<div class="event-video-time">
      <button type="button" class="button secondary" data-use-video-time aria-keyshortcuts="U">${icon('clock')} Use video time <kbd aria-hidden="true">U</kbd></button>
      <time>${formatTime(currentVideoTime) || '—'}</time></div>` : ''}
    ${relative ? `<label>Position in sequence<select name="before" aria-label="Position in sequence">${options([...sequenceChoices, ['', 'At end']], nextMarker?.id ?? '')}</select></label>` : ''}
    <p class="form-note event-contact-note">Save the frame of first wall contact to confirm it as the split reference.</p>
    <label class="event-wall-link">Wall contact<select name="wallId" aria-label="Wall contact">${options(wallChoices, event?.wallId ?? contactId ?? '')}</select></label>
    <div class="form-grid event-measurements">
      ${field('distance','Distance from start (m)',event?.distance,'type="number" min="0" step="any"')}
      ${field('duration','Movement duration (s)',event?.duration,'type="number" min="0.01" step="any"')}
    </div>
    <label class="event-kick-type">Kick type<select name="kick" aria-label="Kick type">${options(Object.entries(kickNames), event?.kick || 'cycle')}</select></label>
    ${event ? `<button type="button" class="text-button danger" data-remove-event="${esc(event.id)}">${icon('trash')} Delete event</button>` : ''}`,
    data => {
      const type = data.get('eventType');
      let time = data.get('time') === formatTime(defaultTime) && measured(defaultTime) ? defaultTime : parseTime(data.get('time'));
      if (Number.isNaN(time) || !relative && (!measured(time) || media?.ready && positive(video?.duration) && time > video.duration)) {
        throw new Error(relative ? 'Enter a valid elapsed time.' : 'Enter a time within the video.');
      }
      if (relative && type === 'i') {
        if (positive(time)) throw new Error('The elapsed time at Start must be zero.');
        time = 0;
      }
      const edited = { id: event?.id ?? newId(), type, t: relative ? null : time };
      if (relative && measured(time)) edited.elapsed = time;
      if (type === 'b' || type === 'p') {
        edited.distance = fieldNumber(data, 'distance', true);
        edited.duration = fieldNumber(data, 'duration');
      } else if (['m', 'v'].includes(type) && event?.type === type && measured(event.distance)) edited.distance = event.distance;
      if (type === 'p') edited.kick = data.get('kick');
      const before = relative ? markers.findIndex(item => item.id === data.get('before')) : -1;
      const index = before < 0 ? markers.length : before;
      if (type === 'm') {
        edited.contactConfirmed = measured(time);
        if (event?.releaseSkipped) edited.releaseSkipped = true;
        if (!relative && event?.t === time && measured(event.elapsed)) edited.elapsed = event.elapsed;
      }
      if (type === 'r') {
        if (!measured(time)) throw new Error('Enter the time the feet leave the wall.');
        const preceding = relative ? markers.slice(0, index) : markers.filter(item => item.t < time);
        edited.wallId = data.get('wallId') || preceding.findLast(item => item.type === 'm')?.id;
        if (!edited.wallId) throw new Error('Add a wall contact before recording the release.');
      }
      commitMarkerEdits([...markers.slice(0, index), edited, ...markers.slice(index)]);
      return () => {
        const position = eventVideoTime(edited);
        if (measured(position) && position !== eventVideoTime(event) && media && matchingMedia(media)) {
          if (!seekTo(position)) media.position = position;
        }
        revealEvent(edited.id, true);
      };
    }, event ? 'Save event' : 'Add event');
  const typeInput = dialog.querySelector('[name="eventType"]');
  const form = typeInput.form;
  form.dataset.saveShortcut = '';
  const useVideoTime = form.querySelector('[data-use-video-time]');
  if (useVideoTime) {
    useVideoTime.addEventListener('click', () => {
      const time = videoTime();
      if (!measured(time)) return;
      const input = form.elements.time;
      input.value = formatTime(time);
      form.querySelector('.event-video-time time').textContent = input.value;
      input.focus();
    });
  }
  form.elements.time.focus();
  const updateFields = () => {
    const kick = typeInput.value === 'p';
    const movement = kick || typeInput.value === 'b';
    for (const [selector, visible] of [['.event-measurements', movement], ['.event-kick-type', kick],
      ['.event-contact-note', typeInput.value === 'm'], ['.event-wall-link', typeInput.value === 'r']]) {
      const section = dialog.querySelector(selector);
      section.hidden = !visible;
      for (const input of section.querySelectorAll('input, select')) input.disabled = !visible;
    }
  };
  typeInput.addEventListener('change', updateFields);
  updateFields();
}

function editActiveEvent() {
  const id = currentCue?.querySelector('[data-seek-event]')?.dataset.seekEvent
    ?? document.activeElement?.closest('#timeline [data-edit-event]')?.dataset.editEvent
    ?? document.activeElement?.closest('#timeline [data-seek-event]')?.dataset.seekEvent;
  if (id) editEvent(id);
  else notify('Select a timeline event or move the video to one first.', true);
}

function restartMarking() {
  if (!run.events.length) return;
  const start = analyze(run).t0;
  openForm('Restart marking',
    formNote('Clear every event in this attempt? The athlete, competition, video and manually entered results stay attached. Undo restores the cleared events while this page is open.'),
    () => {
      setEvents([], { videoAnchor: start, manualComplete: false });
      if (measured(start)) seekTo(start);
      else playbackTarget()?.pause();
      return () => $('[data-action="add-event"]').focus({ preventScroll: true });
    }, 'Clear all events', 'destructive');
}

function deleteAttempt(record) {
  if (!record?.revision) return;
  const athlete = athletes.find(item => item.id === record.athleteId);
  const eventDate = competitionDate(record);
  const label = [record.athleteName || athlete?.name, record.competition, eventDate && date(eventDate)].filter(Boolean).join(' · ');
  openForm('Delete attempt',
    (label ? `<p><strong>${esc(label)}</strong></p>` : '') + formNote('Permanently delete this attempt and its events?'),
    async () => {
      clearTimeout(inputSaves.get(record.id));
      inputSaves.delete(record.id);
      await pending.get(record.id)?.catch(() => {});
      await api('/api/runs/' + record.id, 'DELETE', { revision: record.revision });
      runs = runs.filter(item => item.id !== record.id);
      undoStack.delete(record.id);
      failed.delete(record.id);
      identityRequests.delete(record.id);
      competitionDateEdits.delete(record.id);
      if (profiles.runId === record.id) profiles.runId = '';
      if (record === run) {
        if (activeView === 'studio') enterRun(newRun(), true);
        else {
          mediaRequest++;
          clearMedia();
          run = newRun();
          localStorage.removeItem('dnf-active-run');
          route();
        }
      } else route();
      updateSaveLabel();
      notify('Attempt deleted.');
    }, 'Delete attempt', 'destructive');
}

function openRuns() {
  dialog.innerHTML = `<div class="dialog-head"><h2 id="dialog-title">Open attempt</h2><button type="button" class="icon-button" data-action="close-dialog" aria-label="Close">${icon('close')}</button></div>
    <div class="dialog-body"><label class="searchbox">${icon('search')}<input id="archive-query" placeholder="Search by athlete, competition or video…" aria-label="Find attempt"></label>
    <div class="archive-list" id="archive-list"></div></div>`;
  const render = () => {
    const query = $('#archive-query').value.toLocaleLowerCase('en').trim();
    const matching = orderedRuns(runs, competitionDate).filter(r=>[r.athleteName,athletes.find(a=>a.id===r.athleteId)?.name,r.competition,r.videoName].join(' ').toLocaleLowerCase('en').includes(query));
    $('#archive-list').innerHTML = matching.map(r=>{
      const athlete = athletes.find(a=>a.id===r.athleteId);
      return `<button type="button" class="attempt" data-load-run="${esc(r.id)}">${avatar(athlete)}<span><strong>${esc(r.athleteName || athlete?.name || 'Unnamed draft')}</strong><small>${esc(r.competition || 'Untitled session')} / ${date(competitionDate(r))} / ${r.pool} m</small></span>${icon('arrow')}</button>`;
    }).join('') || '<p class="directory-empty">No matching attempts.</p>';
  };
  $('#archive-query').addEventListener('input', render);
  render();
  dialog.showModal();
}

function importLegacy() {
  openForm('Import Excel notation', `
    <label>Athlete<select name="athlete" required>${options([['','Select…'],...athletes.map(a=>[a.id,a.name])],run.athleteId)}</select></label>
    ${field('competition','Competition',run.competition,'required maxlength="140"')}
    <div class="form-grid"><label>Pool<select name="pool">${options([[25,'25 m'],[50,'50 m']],run.pool)}</select></label>${field('competitionDate','Competition date',competitionDate(run),'type="date"')}
    ${field('distance','Final distance (m)','','type="number" min="0.01" step="any"')}${field('time','Final time (mm:ss)')}</div>
    ${textArea('sequence','Original sequence')}
    ${formNote('Paste the recorded sequence from the Technique sheet.')}`,async data=>{
      const pool = Number(data.get('pool'));
      const sequence = data.get('sequence').trim();
      const events = parseLegacy(sequence,pool);
      const time = parseTime(data.get('time'));
      const distance = fieldNumber(data,'distance');
      const last = events.findLast(e=>e.type==='m'||e.type==='v');
      if (Number.isNaN(time) || time !== null && (!positive(time) || time < (last?.elapsed ?? 0))) throw new Error('The finish time must be at or after the last checkpoint.');
      if (distance && distance < (last?.distance ?? 0)) throw new Error('The final distance must be at least the last checkpoint distance.');
      const endsAtCheckpoint = last && events.at(-1) === last && (!distance || distance===last.distance);
      const next = newRun({ origin:'legacy', athleteId:data.get('athlete'), competition:data.get('competition').trim(),
        pool, sequence, events, source:'Excel notation',
        distance:distance ?? (endsAtCheckpoint ? last.distance : null),
        manualTime:time ?? (endsAtCheckpoint ? last.elapsed : null) });
      const eventDate = data.get('competitionDate');
      await queueSave(next, { eventDate: eventDate !== competitionDate(next) ? eventDate : undefined });
      enterRun(next);
      notify('Sequence imported.');
    },'Import');
  const { competition, competitionDate: dateInput } = dialog.querySelector('form').elements;
  competition.addEventListener('change', () => { dateInput.value = competitionDate({ competition: competition.value }); });
}

function transportSettings() {
  openForm('Playback settings', `
    <div class="form-grid">${field('step','Skip interval (seconds)',playback.step,'type="number" min="0.01" max="3600" step="any" required')}
    ${media?.youtube ? '' : field('fps','Frames per second',playback.fps,'type="number" min="1" max="240" step="any" required')}</div>
    ${field('position','Jump to (hh:mm:ss.sss)',clock(playbackTarget().currentTime,3))}
    ${formNote(media?.youtube ? '← / → use the skip interval. YouTube seeks to nearby keyframes.' : '← / → use the skip interval. , and . step by the configured frame interval.')}`,data=>{
      const position = parseTime(data.get('position'));
      if (!measured(position) || position > playbackTarget().duration) throw new Error('This time is outside the video.');
      playback.step = fieldNumber(data,'step');
      if (data.has('fps')) playback.fps = fieldNumber(data,'fps');
      seekTo(position);
    },'Apply');
}

function method() {
  const markDescriptions = { i: 'Start · feet leave the wall', b: 'Stroke · intermediate position',
    p: 'Kick · end of kick', m: 'Wall · first touch, then feet off the wall', v: 'Midpoint in a 50 m pool', f: 'Finish · airway surfaces' };
  dialog.innerHTML = `<div class="dialog-head"><h2 id="dialog-title">Keyboard shortcuts</h2><button type="button" class="icon-button" data-action="close-dialog" aria-label="Close">${icon('close')}</button></div>
    <div class="dialog-body method"><dl class="shortcut-list">${[
      ['Space', 'Play / pause'], ['← / →', 'Skip backward / forward'], ['↑ / ↓', 'Increase / decrease speed'],
      ['Shift + ← / →', 'Short skip (' + shortSkip + ' s)'], ['; / :', 'Previous / next event'],
      [', / .', 'Step by frame interval (local or CMAS TV)'],
      ...Object.entries(eventKeys).map(([type, keys]) => [keys.join(' / '), markDescriptions[type]]),
      ['R', 'Edit active timeline event'], ['U', 'Use video time in the event editor'],
      ['⌘ / Ctrl + S', 'Save attempt or current edit'],
      ['⌘ / Ctrl + Z', 'Undo the last marker edit'],
    ].map(([key,label])=>`<div><dt><kbd>${key}</kbd></dt><dd>${label}</dd></div>`).join('')}</dl></div>`;
  dialog.showModal();
}

const csvNumber = new Intl.NumberFormat('en-US', { useGrouping: false, maximumFractionDigits: 8 });
function csvRow(fields) {
  return fields.map(value=>{
    const cell = measured(value) ? csvNumber.format(value) : String(value ?? '');
    const safe = typeof value === 'string' && /^[=+\-@\t\r]/.test(cell) ? "'" + cell : cell;
    return '"' + safe.replaceAll('"','""') + '"';
  }).join(';');
}
function exportRun() {
  const m = analyze(run);
  const athlete = athletes.find(a=>a.id===run.athleteId);
  const fields = [
    ['Athlete',run.athleteName ?? athlete?.name],['Competition',run.competition],['Competition date',competitionDate(run)],['Pool (m)',run.pool],
    ['Source type',sourceLabel(run)],['Source',run.source],['Video name',run.videoName],['Video URL',timedLink(run.videoUrl,m.t0)],['Video T0 (s)',m.t0],
    ['Final time (s)',m.time],['Analyzed distance (m)',m.distance],
    ['Speed (m/s)',m.speed],['Arm strokes',!m.movementData?null:m.arms],['Kicks',!m.movementData?null:m.kicks],
    ['Eq. cycles',!m.movementData?null:m.eq],['Complete cycles',!m.movementData?null:m.pairs],
    ['Meters per eq. cycle',m.metresPerEq],['Seconds per eq. cycle',m.secondsPerEq],['Stroke interval (s)',m.armInterval],
    ['Kick interval (s)',m.kickInterval],['Stroke duration (s)',m.armDuration],['Kick duration (s)',m.kickDuration],
    ['Cycle interval (s)',m.cycleInterval],['Distance between cycles (m)',m.cycleDistance],['100 m split (s)',m.fixed[100]?.time],
    ['Eq. cycles at 100 m',m.fixed[100]?.eq],['Notes',run.notes],[],
    ['Marker','Video (s)','Elapsed (s)','Distance (m)','Duration (s)','Classification'],
    ...run.events.map(e=>[eventNames[e.type],e.t,m.times.get(e.id),m.positions.get(e.id),e.duration,m.classify[e.id]]),[],
    ['From (m)','To (m)','Time (s)','Speed (m/s)','Eq. cycles','Complete cycles','Extra kicks'],
    ...m.splits.map(s=>[s.from,s.to,s.time,s.speed,s.eq,s.pairs,s.extraCount]), [],
    ['Wall (m)','Contact confirmed','Contact mark (s)','Release mark (s)','Contact → release (s)','Release → first S (s)','Release → first K (s)'],
    ...m.turns.map(turn=>[turn.distance,turn.contact ? turn.contact.contactConfirmed ? 'Yes' : 'No' : '',
      turn.contact?.t ?? turn.contact?.elapsed, turn.release?.t ?? turn.release?.elapsed,
      turn.contactToRelease,turn.releaseToArm,turn.releaseToKick]),
    ['Range across turns',null,null,null,m.turnRanges.contactToRelease,m.turnRanges.releaseToArm,m.turnRanges.releaseToKick], [],
    ['Length','Timed S–S cycles','Mean S–S (s)','S–S CV (%)','Mean K phase (%)','Cycles with K phase'],
    ...m.lengths.map(length=>[length.number,length.timed,length.average,length.cv,length.kickPhase,length.phased]), [],
    ['Length','Cycle','First S mark (s)','Next S mark (s)','S–S (s)','Associated K mark (s)','K phase (%)'],
    ...m.lengths.flatMap(length=>length.cycles.map((cycle,index)=>[length.number,index+1,
      cycle.from.t ?? cycle.from.elapsed,cycle.to.t ?? cycle.to.elapsed,cycle.duration,cycle.kick?.t ?? cycle.kick?.elapsed,cycle.kickPhase])),
  ];
  download('dnf-' + (run.athleteName ?? athlete?.name ?? 'attempt') + '.csv','\ufeff' + fields.map(csvRow).join('\r\n'),'text/csv;charset=utf-8');
}
function exportComparison() {
  const table = $('.compare-table table');
  if (!table) return notify('No rows to export.',true);
  const rows = [...table.rows].map(row=>csvRow([...row.cells].map(cell=>{
    const link = cell.querySelector('.table-person strong');
    const header = cell.querySelector('[data-column-label]');
    if (header) return header.textContent.trim();
    return link?.textContent ?? cell.textContent.trim().replace(/ [↕↑↓]$/,'');
  })));
  download('dnf-comparison-' + compare.scope + '.csv','\ufeff' + rows.join('\r\n'),'text/csv;charset=utf-8');
}

const handlers = {
  'load-video': selectLocalFile,
  'load-link': loadVideoLink,
  'restore-video': () => restoreMedia(run),
  'new-run': () => enterRun(newRun({ competition:run.competition, pool:run.pool }),true),
  'open-run': openRuns,
  play: togglePlay,
  rewind: () => offset(-playback.step),
  forward: () => offset(playback.step),
  mute: () => { const video=playbackTarget(); playback.muted=!video.muted; video.muted=playback.muted; },
  fullscreen: async () => {
    const video=playbackTarget();
    if (video.requestFullscreen) await video.requestFullscreen();
    else video.webkitEnterFullscreen?.();
  },
  'transport-settings': transportSettings,
  undo,
  'run-details': runDetails,
  'import-legacy': importLegacy,
  'new-athlete': () => editAthlete(),
  'close-dialog': () => dialog.close(),
  'export-run': exportRun,
  'export-comparison': exportComparison,
  'reset-comparison': () => {
    Object.assign(compare, comparisonFilters);
    route();
    $('#compare-scope').focus({ preventScroll: true });
  },
  'retry-save': () => Promise.allSettled([...failed.values()].filter(record=>!pending.has(record.id)).map(queueSave)),
  'delete-run': () => deleteAttempt(run),
  'add-event': () => editEvent(),
  'skip-release': skipRelease,
  'restart-marking': restartMarking,
  'timeline-back': () => scrollTimeline(-1),
  'timeline-forward': () => scrollTimeline(1),
  'previous-event': () => jumpEvent(true),
  'next-event': () => jumpEvent(false),
};

document.addEventListener('click', async event => {
  const point = event.target.closest('[data-scatter-point]');
  if (point) return toggleScatterLabel(point);
  const node = event.target.closest('button');
  if (!node || !run) return;
  const d = node.dataset;
  try {
    if (d.jumpTo) return focusHeading(d.jumpTo);
    if (d.action === 'save-attempt') {
      node.disabled = true;
      try { return await saveAttempt(true); } finally { node.disabled = false; }
    }
    if (d.action && Object.hasOwn(handlers,d.action)) return await handlers[d.action]();
    if (d.mark) return addMark(d.mark);
    if (d.editEvent) return editEvent(d.editEvent);
    if (d.addRelease) return editEvent(null, d.addRelease);
    if (d.deleteRun) return deleteAttempt(runs.find(record => record.id === d.deleteRun));
    if (d.seekEvent) {
      const mark=run.events.find(e=>e.id===d.seekEvent);
      const t=eventVideoTime(mark);
      if (!measured(t)) return notify('This imported marker has no video timestamp.',true);
      if (!seekTo(t)) return notify('Open the linked video to jump to this marker.',true);
    }
    if (d.removeEvent) {
      try {
        commitMarkerEdits(run.events.filter(e => e.id !== d.removeEvent));
        dialog.close();
        $('[data-action="add-event"]').focus({ preventScroll: true });
      } catch (error) {
        dialog.querySelector('.form-error').textContent = error.message;
      }
    }
    if (d.loadRun) {
      const record=runs.find(r=>r.id===d.loadRun);
      if (record) {
        if (dialog.open) dialog.close();
        enterRun(record);
      }
    }
    if (d.athlete || d.viewAthlete) {
      profiles.id=d.athlete || d.viewAthlete;
      profiles.runId=d.compareRun || '';
      if (d.viewAthlete) {
        profiles.pool=compare.pool;
        profiles.query='';
        go('athletes');
      } else {
        route();
        if (event.detail > 0 && matchMedia('(max-width: 43rem)').matches) focusHeading('profile-title');
        else $(`[data-athlete="${CSS.escape(d.athlete)}"]`)?.focus({ preventScroll: true });
      }
      return;
    }
    if (d.choosePhoto) return await choosePhoto(athletes.find(a=>a.id===d.choosePhoto));
    if (d.editAthlete) editAthlete(athletes.find(a=>a.id===d.editAthlete));
    if (d.newFor) enterRun(newRun({athleteId:d.newFor,pool:profiles.pool === 'all' ? run.pool : profiles.pool}),true);
    if (d.profileRun) {
      profiles.runId=d.profileRun;
      route();
      focusHeading('attempt-review-title');
      return;
    }
    if (d.sort) {
      compare.direction=compare.sort===d.sort ? -compare.direction : ['name','time'].includes(d.sort) ? 1 : -1;
      compare.sort=d.sort;
      route();
      $('[data-sort="'+d.sort+'"]')?.focus({ preventScroll: true });
    }
  } catch (error) {
    notify(error.message,true);
  }
});

const compareControls = {
  'compare-scope':'scope','compare-pool':'pool','compare-competition':'competition','compare-country':'country',
  'compare-mode':'mode','compare-dq':'dq',
};
const profileControls = { 'profile-pool':'pool','history-metric':'metric','profile-split':'split' };
const attemptInputs = new Set(['run-athlete','run-country','run-competition','run-pool','run-distance','run-time']);

document.addEventListener('change',event=>{
  if (!run) return;
  const input=event.target;
  const id=input.id;
  if (input.matches('select[data-pair-index]')) {
    const index = Number(input.dataset.pairIndex);
    if (compare.pair[1 - index] === input.value) compare.pair[1 - index] = '';
    compare.pair[index] = input.value;
    route();
    $('#' + id)?.focus({ preventScroll: true });
    return;
  }
  if (id === 'scatter-preset' && Object.hasOwn(scatterPresets, input.value)) {
    const preset = scatterPresets[input.value];
    compare.axes = [...preset.axes];
    if (preset.scope) compare.scope = preset.scope;
    route();
    $('#scatter-preset').focus({ preventScroll: true });
    return;
  }
  if (input.matches('select[data-compare-axis]')) {
    const index = Number(input.dataset.compareAxis);
    const other = 1 - index;
    if (compare.axes[other] === input.value) compare.axes[other] = compare.axes[index];
    compare.axes[index] = input.value;
    route();
    $('#' + id)?.focus({ preventScroll: true });
    return;
  }
  if (Object.hasOwn(compareControls,id)) {
    const key=compareControls[id];
    compare[key]=input.type==='checkbox' ? input.checked : key==='pool' && input.value !== 'all' ? Number(input.value) : input.value;
    if (key==='pool') compare.competition='';
    route();
    $('#'+id)?.focus();
    return;
  }
  if (Object.hasOwn(profileControls,id)) {
    const key=profileControls[id];
    profiles[key]=key==='pool' && input.value !== 'all' ? Number(input.value) : input.value;
    route();
    $('#'+id)?.focus();
    return;
  }
  if (id==='studio-split-mode') { splitMode=input.value; return refreshSplits(); }
  if (attemptInputs.has(id)) saveAttemptInput(input, true);
});

function saveAttemptInput(input, commit) {
  const id = input.id;
  try {
    if (id==='run-athlete') run.athleteName=input.value.trim();
    if (id==='run-country') run.athleteCountry=input.value.trim();
    if (id==='run-competition') {
      run.competition = input.value.trim();
      refreshCompetitionDate();
    }
    if (id==='run-pool') {
      if (run.events.some(e=>e.type==='m'||e.type==='v') && Number(input.value)!==run.pool) {
        input.value=run.pool;
        throw new Error('The pool length is fixed once a checkpoint is recorded.');
      }
      run.pool=Number(input.value);
    }
    if (id==='run-distance') {
      if (input.validity.badInput || input.value && !positive(input.valueAsNumber)) throw new Error('Enter a positive distance.');
      run.distance=input.value ? input.valueAsNumber : null;
    }
    if (id==='run-time') {
      const time=parseTime(input.value);
      if (time!==null && !positive(time)) throw new Error('Enter seconds or a time such as 03:30.');
      run.manualTime=time;
      if (commit) input.value=time===null ? '' : clock(time);
    }
    input.removeAttribute('aria-invalid');
    if (commit) {
      queueSave(run, { link: run.athleteName !== undefined || run.athleteCountry !== undefined });
      refreshStudio();
    } else deferAttemptSave(run);
  } catch(error) {
    if (!commit) return;
    if (id==='run-time'||id==='run-distance') {
      input.setAttribute('aria-invalid','true');
      $('#' + id + '-error').textContent = error.message;
    }
    notify(error.message,true);
  }
}

document.addEventListener('input',event=>{
  if (run && event.target.id !== 'run-pool' && attemptInputs.has(event.target.id)) saveAttemptInput(event.target, false);
  if (event.target.id==='profile-search') {
    profiles.query=event.target.value;
    rerenderInput('#profile-search',route);
    $('#profile-list').scrollTop = 0;
  }
  if (event.target.id==='compare-query') {
    compare.query=event.target.value;
    rerenderInput('#compare-query',route);
  }
});

document.addEventListener('keydown',event=>{
  const key=event.key.toLowerCase();
  if (event.target.closest?.('.metric-help, .metric-tooltip')) return;
  const point = event.target.closest?.('[data-scatter-point]');
  if (point && (key === 'enter' || key === ' ')) {
    event.preventDefault();
    if (!event.repeat) toggleScatterLabel(point);
    return;
  }
  if (run && (event.metaKey || event.ctrlKey) && !event.altKey && key==='s') {
    const form = dialog.open && dialog.querySelector('form[data-save-shortcut]');
    if (!form && (dialog.open || activeView !== 'studio')) return;
    event.preventDefault();
    if (event.repeat) return;
    if (form) {
      if (!form.querySelector('[type=submit]').disabled) form.requestSubmit();
    } else saveAttempt().catch(error => notify(error.message,true));
    return;
  }
  if (!run || activeView!=='studio' || dialog.open || event.altKey
    || event.target instanceof Element && event.target.closest('input:not([type=range]):not([type=checkbox]),select:not(#rate),textarea,[contenteditable="true"]')) return;
  if ((event.metaKey||event.ctrlKey) && key==='z') {
    event.preventDefault();
    if (!event.repeat) undo();
    return;
  }
  if (event.metaKey||event.ctrlKey) return;
  if (Object.hasOwn(markShortcuts,key)) {
    event.preventDefault();
    if (!event.repeat) addMark(markShortcuts[key]);
  } else if (key==='r') {
    event.preventDefault();
    if (!event.repeat) editActiveEvent();
  } else if ([';',':'].includes(key) && media?.ready) {
    event.preventDefault();
    if (!event.repeat) jumpEvent(key === ';');
  } else if (key===' ' && media?.ready && !event.target.closest?.('.topbar')) {
    event.preventDefault();
    if (!event.repeat) togglePlay();
  } else if (['arrowup','arrowdown'].includes(key) && media?.ready) {
    event.preventDefault();
    const video = playbackTarget();
    const supported = video.availableRates ?? rates;
    const index = supported.indexOf(video.playbackRate);
    const next = Math.max(0, Math.min(supported.length - 1, index + (key==='arrowup' ? 1 : -1)));
    setRate(video, supported[next]);
  } else if (['arrowleft','arrowright',',','.'].includes(key) && media?.ready) {
    event.preventDefault();
    const backwards=key==='arrowleft'||key===',';
    const frame=key===','||key==='.';
    if (frame && media.youtube) {
      if (!event.repeat) notify('YouTube does not support frame stepping.',true);
      return;
    }
    const step = frame ? 1/playback.fps : event.shiftKey ? shortSkip : playback.step;
    offset((backwards ? -1 : 1) * step,frame);
  }
});

document.addEventListener('error',event=>{
  if (event.target.matches?.('.avatar img')) event.target.hidden=true;
},true);
dialog.addEventListener('keydown', event => {
  if (event.defaultPrevented || event.isComposing || event.altKey || event.ctrlKey || event.metaKey || event.key.toLowerCase() !== 'u') return;
  const useVideoTime = dialog.querySelector('[data-use-video-time]');
  if (!useVideoTime) return;
  event.preventDefault();
  if (!event.repeat) useVideoTime.click();
});
dialog.addEventListener('close', () => { if (!dialog.open) dialog.classList.remove('photo-dialog'); });
$('.skip-link').addEventListener('click', event => {
  event.preventDefault();
  content.focus();
  content.scrollIntoView();
});
$('#method-link').innerHTML=icon('help');
$('#method-link').addEventListener('click',method);
const themeToggle = $('#theme-toggle');
function setTheme(theme) {
  const dark = theme === 'dark';
  document.documentElement.dataset.theme = theme;
  themeToggle.innerHTML = icon(dark ? 'sun' : 'moon');
  themeToggle.setAttribute('aria-pressed', String(dark));
  themeToggle.title = dark ? 'Switch to light theme' : 'Switch to dark theme';
}
setTheme(document.documentElement.dataset.theme || 'light');
themeToggle.addEventListener('click', () => {
  const theme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  localStorage.setItem('dnf-theme', theme);
  setTheme(theme);
});
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', event => {
  if (!localStorage.getItem('dnf-theme')) setTheme(event.matches ? 'dark' : 'light');
});
window.addEventListener('resize', updateTimelineControls);
window.addEventListener('hashchange',()=>{ if(run) route(); });
window.addEventListener('beforeunload',event=>{
  if (!pending.size && !failed.size && !inputSaves.size) return;
  event.preventDefault();
  event.returnValue='';
});

try {
  const data=await api('/api/data');
  athletes=data.athletes.sort((a,b)=>a.name.localeCompare(b.name,'en'));
  runs=data.runs;
  for (const [key, value] of Object.entries(data.competitionDates ?? {})) competitionDates.set(key, value);
  run=runs.find(record=>record.id===localStorage.getItem('dnf-active-run')) ?? newRun();
  saveLabel(run.revision ? 'Saved locally' : 'Autosave');
  route();
} catch(error) {
  content.setAttribute('aria-busy','false');
  content.innerHTML=`<div class="panel empty system-state error" role="alert">${icon('help')}<h1>Could not open DNF Lab</h1><p>${esc(error.message)}</p><a class="button primary" href="/">Reload</a></div>`;
  saveLabel('Local database unavailable');
}
