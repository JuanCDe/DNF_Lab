export const eventNames = {
  i: 'Start', b: 'Stroke', p: 'Kick', m: 'Wall contact', r: 'Wall release', v: 'Midpoint', f: 'Finish',
};
export const kickNames = {
  cycle: 'Auto', extra: 'Extra between cycles', launch: 'After wall push-off', approach: 'Wall approach',
};

export const measured = value => typeof value === 'number' && Number.isFinite(value);
export const positive = value => measured(value) && value > 0;
export const ratio = (numerator, denominator) =>
  measured(numerator) && positive(denominator) ? numerator / denominator : null;
export const mean = values => {
  const known = values.filter(measured);
  return known.length ? known.reduce((sum, value) => sum + value, 0) / known.length : null;
};
const elapsed = (a, b) => measured(a) && measured(b) && a >= b ? a - b : null;
const isStroke = event => event.type === 'b' || event.type === 'p';
const cycleKick = event => !['extra', 'launch', 'approach'].includes(event.kick);
const markerTime = event => event?.t ?? event?.elapsed;
const duration = (from, to) => {
  const seconds = elapsed(markerTime(to), markerTime(from));
  return positive(seconds) ? seconds : null;
};

export function pendingRelease(events) {
  const last = events.at(-1);
  return last?.type === 'm' && !last.releaseSkipped && !events.some(e => e.type === 'r' && e.wallId === last.id)
    ? last : null;
}

export function parseTime(input) {
  const value = String(input).trim().replace(',', '.');
  if (!value) return null;
  if (!/^\d+(?::\d{1,2}){0,2}(?:\.\d{1,3})?$/.test(value)) return NaN;
  const parts = value.split(':').map(Number);
  if (parts.slice(1).some(part => part >= 60)) return NaN;
  return parts.reduce((seconds, part) => seconds * 60 + part, 0);
}

export function parseLegacy(sequence, pool) {
  const clean = sequence.toLowerCase().replace(/\s/g, '');
  const tokens = clean.match(/[bp]|[vf]\d{3}/g) ?? [];
  if (!clean || tokens.join('') !== clean) throw new Error('Use b/p for movements and v/f followed by mss for checkpoints.');
  let lastDistance = 0;
  let lastTime = 0;
  const events = [{ id: crypto.randomUUID(), type: 'i', t: null, elapsed: 0 }];
  for (const token of tokens) {
    const code = token[0];
    const event = { id: crypto.randomUUID(), type: code, t: null };
    if (token.length > 1) {
      const seconds = Number(token.slice(2));
      const time = Number(token[1]) * 60 + seconds;
      const distance = lastDistance + 25;
      if (seconds > 59 || time <= lastTime || (code === 'f') !== (distance % 50 === 0)) {
        throw new Error('Alternate v (25, 75… m) and f (50, 100… m) with increasing elapsed times.');
      }
      event.type = distance % pool === 0 ? 'm' : 'v';
      event.elapsed = time;
      event.distance = distance;
      lastTime = time;
      lastDistance = distance;
    }
    events.push(event);
  }
  return events;
}

function movementStats(events, times, positions) {
  let arms = 0;
  let kicks = 0;
  let pairs = 0;
  let unpairedArms = 0;
  let pending = null;
  let previousArm = null;
  let previousKick = null;
  let previousPairedArm = null;
  const armIntervals = [];
  const kickIntervals = [];
  const cycleIntervals = [];
  const cycleDistances = [];
  const coordination = [];
  const armDurations = [];
  const kickDurations = [];
  const extra = { automatic: 0, extra: 0, launch: 0, approach: 0 };
  const classify = {};
  for (const event of events) {
    const t = times.get(event.id);
    if (['m', 'r', 'f'].includes(event.type)) {
      if (pending) unpairedArms++;
      pending = previousArm = previousKick = previousPairedArm = null;
    } else if (event.type === 'b') {
      arms++;
      if (previousArm) armIntervals.push(elapsed(t, times.get(previousArm.id)));
      if (positive(event.duration)) armDurations.push(event.duration);
      if (pending) unpairedArms++;
      pending = previousArm = event;
    } else if (event.type === 'p') {
      kicks++;
      if (previousKick) kickIntervals.push(elapsed(t, times.get(previousKick.id)));
      if (positive(event.duration)) kickDurations.push(event.duration);
      previousKick = event;
      if (pending && cycleKick(event)) {
        pairs++;
        classify[event.id] = 'In cycle';
        coordination.push(elapsed(t, times.get(pending.id)));
        if (previousPairedArm) {
          cycleIntervals.push(elapsed(times.get(pending.id), times.get(previousPairedArm.id)));
          cycleDistances.push(elapsed(positions.get(pending.id), positions.get(previousPairedArm.id)));
        }
        previousPairedArm = pending;
        pending = null;
      } else {
        const tag = Object.hasOwn(extra, event.kick) ? event.kick : 'automatic';
        extra[tag]++;
        classify[event.id] = tag === 'automatic' ? 'Unpaired kick' : kickNames[tag];
      }
    }
  }
  if (pending) unpairedArms++;
  return {
    arms, kicks, pairs, unpairedArms, eq: (arms + kicks) / 2, extra, classify,
    extraCount: kicks - pairs,
    armInterval: mean(armIntervals), kickInterval: mean(kickIntervals),
    cycleInterval: mean(cycleIntervals), cycleDistance: mean(cycleDistances),
    coordination: mean(coordination), armDuration: mean(armDurations), kickDuration: mean(kickDurations),
  };
}

function timingVariation(values) {
  const samples = values.filter(measured);
  return samples.length < 2 ? null : Math.max(...samples) - Math.min(...samples);
}

function techniqueTiming(events, positions) {
  const turns = [];
  const lengths = [];
  const pairedContacts = new Set(events.filter(event => event.type === 'r' && event.wallId).map(event => event.wallId));
  let contact = null;
  let release = null;
  let firstArm = null;
  let firstKick = null;
  let previousArm = null;
  let candidateKicks = [];
  let cycles = [];
  let hasMovement = false;

  function closeLength(end) {
    if (!hasMovement && end?.type !== 'm') return;
    const durations = cycles.map(cycle => cycle.duration).filter(measured);
    const phase = cycles.map(cycle => cycle.kickPhase).filter(measured);
    const average = mean(durations);
    const sd = durations.length >= 2 ? Math.sqrt(mean(durations.map(value => (value - average) ** 2))) : null;
    lengths.push({
      number: lengths.length + 1, partial: end?.type !== 'm', cycles,
      timed: durations.length, phased: phase.length, average, cv: sd === null ? null : 100 * sd / average,
      kickPhase: mean(phase),
    });
  }

  function closeTurn() {
    if (!contact && !release) return;
    turns.push({
      contact, release, distance: positions.get(contact?.id),
      contactToRelease: contact?.contactConfirmed ? duration(contact, release) : null,
      releaseToArm: elapsed(markerTime(firstArm), markerTime(release)),
      releaseToKick: elapsed(markerTime(firstKick), markerTime(release)),
    });
  }

  for (const event of events) {
    if (event.type === 'm' || event.type === 'f') {
      closeLength(event);
      closeTurn();
      contact = event.type === 'm' ? event : null;
      release = firstArm = firstKick = previousArm = null;
      candidateKicks = [];
      cycles = [];
      hasMovement = false;
    } else if (event.type === 'r') {
      if (!contact || event.wallId !== contact.id) {
        closeTurn();
        contact = null;
      }
      release = event;
      firstArm = firstKick = previousArm = null;
      candidateKicks = [];
    } else if (!release && pairedContacts.has(contact?.id)) {
      continue;
    } else if (event.type === 'b') {
      hasMovement = true;
      if (release) firstArm ??= event;
      if (previousArm) {
        const seconds = duration(previousArm, event);
        const kick = candidateKicks.length === 1 ? candidateKicks[0] : null;
        const offset = duration(previousArm, kick);
        const kickPhase = positive(offset) && offset < seconds ? 100 * offset / seconds : null;
        cycles.push({ from: previousArm, to: event, duration: seconds, kick: kickPhase === null ? null : kick, kickPhase });
      }
      previousArm = event;
      candidateKicks = [];
    } else if (event.type === 'p') {
      hasMovement = true;
      if (release) firstKick ??= event;
      if (previousArm && cycleKick(event)) candidateKicks.push(event);
    }
  }
  closeLength();
  closeTurn();
  const turnRanges = Object.fromEntries(['contactToRelease', 'releaseToArm', 'releaseToKick'].map(key => [
    key, timingVariation(turns.map(turn => turn[key])),
  ]));
  return { turns, lengths, turnRanges };
}

function effort(distance, time, stats) {
  return {
    ...stats, distance, time, speed: ratio(distance, time),
    metresPerEq: ratio(distance, stats.eq), secondsPerEq: ratio(time, stats.eq),
    eqPerMinute: ratio(stats.eq * 60, time), eqPer50: ratio(stats.eq * 50, distance),
  };
}

export function analyze(run, { compareSplits = false } = {}) {
  const events = run.events ?? [];
  const start = events.find(event => event.type === 'i');
  const finish = events.find(event => event.type === 'f');
  const t0 = start?.t ?? run.videoAnchor ?? null;
  const times = new Map(events.map(event => [
    event.id, measured(event.elapsed) ? event.elapsed : elapsed(event.t, start?.t),
  ]));
  const positions = new Map();
  const anchors = [];
  const walls = [];
  let lastWall = 0;
  let lastDistance = 0;
  for (const [index, event] of events.entries()) {
    if (event.type === 'm' || event.type === 'v') {
      const distance = positive(event.distance) ? event.distance :
        event.type === 'm' ? lastWall + run.pool : lastWall + 25;
      lastDistance = Math.max(distance, lastDistance);
      if (event.type === 'm') {
        lastWall = distance;
        walls.push(event);
      }
      positions.set(event.id, distance);
      anchors.push({ index, distance, time: times.get(event.id), type: event.type });
    } else if (measured(event.distance)) {
      positions.set(event.id, event.distance);
    }
  }
  const videoTime = times.get(finish?.id) ?? null;
  const time = positive(run.manualTime) ? run.manualTime : videoTime;
  const lastMove = events.findLast(isStroke);
  const lastCheckpoint = anchors.at(-1);
  const atCheckpoint = finish && lastCheckpoint && measured(videoTime)
    && measured(lastCheckpoint.time) && videoTime - lastCheckpoint.time <= 0.5
    && videoTime >= lastCheckpoint.time
    && lastCheckpoint.index > events.findLastIndex(isStroke);
  const distance = positive(run.distance) ? run.distance : atCheckpoint ? lastDistance : null;
  const stats = movementStats(events, times, positions);
  const movementData = events.some(isStroke);
  const finishedManually = run.manualComplete && positive(run.distance) && positive(run.manualTime);
  const firstArm = events.find(event => event.type === 'b');
  const firstKick = events.find(event => event.type === 'p');
  const segment = (a, b) => {
    const movements = events.slice(a.index + 1, b.index + 1);
    return {
      from: a.distance, to: b.distance, endTime: b.time, type: b.type,
      ...effort(b.distance - a.distance, elapsed(b.time, a.time), movementStats(movements, times, positions)),
    };
  };
  const zero = { index: -1, distance: 0, time: 0 };
  const last = lastCheckpoint ?? zero;
  const hasFinishSegment = distance > last.distance && positive(time)
    && (finish || run.origin === 'legacy' || finishedManually && movementData);
  const endAnchor = hasFinishSegment ? { index: events.length - 1, distance, time: videoTime ?? time, type: 'f' } : null;
  const splitAnchors = [...anchors, ...(endAnchor ? [endAnchor] : [])];
  const splits = splitAnchors.map((anchor, index) => segment(splitAnchors[index - 1] ?? zero, anchor));
  const fullAnchors = [zero, ...splitAnchors.filter(anchor => anchor.distance % 50 === 0)];
  const splits50 = fullAnchors.slice(1).flatMap((anchor, index) =>
    anchor.distance - fullAnchors[index].distance === 50 ? [segment(fullAnchors[index], anchor)] : []);
  const fixed = {};
  for (const goal of [25, 50, 100, 150, 200]) {
    const anchor = splitAnchors.find(item => item.distance === goal);
    if (anchor) fixed[goal] = segment(zero, anchor);
  }
  for (const [goal, summary] of Object.entries(run.checkpoints ?? {})) {
    if (!fixed[goal]) fixed[goal] = effort(Number(goal), summary.time, { eq: summary.eq });
  }
  const warnings = [];
  const invalidDistance = positive(run.distance) && lastDistance > run.distance;
  const invalidTime = positive(run.manualTime) && lastCheckpoint?.time > run.manualTime;
  if (run.origin === 'video' && events.length && !start) warnings.push('Add a Start event to calculate elapsed times.');
  if (invalidDistance) warnings.push('Final distance is shorter than the last checkpoint.');
  if (finish && !distance) warnings.push('Enter the final distance for a finish between checkpoints.');
  if (invalidTime) warnings.push('Manual finish time is earlier than the last checkpoint.');
  const technique = techniqueTiming(events, positions);
  const splits25 = new Map();
  if (compareSplits) {
    const checkpoints = new Map();
    for (const [goal, summary] of Object.entries(run.checkpoints ?? {})) checkpoints.set(Number(goal), summary);
    checkpoints.set(0, { ...zero, eq: 0 });
    for (const anchor of splitAnchors) {
      const summary = checkpoints.get(anchor.distance);
      checkpoints.set(anchor.distance, { ...summary, ...anchor, time: anchor.time ?? summary?.time });
    }
    if (positive(distance) && !checkpoints.has(distance) && positive(time)) checkpoints.set(distance, { time });

    const eventIndices = new Map(events.map((event, index) => [event.id, index]));
    const cycles = technique.lengths.flatMap(length => length.cycles);
    for (const [to, end] of checkpoints) {
      if (to <= 0 || to % 25 !== 0) continue;
      const from = to - 25;
      const begin = checkpoints.get(from);
      if (!begin) continue;
      const splitTime = elapsed(end.time, begin.time);
      const recorded = Number.isInteger(end.index) && Number.isInteger(begin.index) && end.index > begin.index;
      const stats = recorded && movementData
        ? movementStats(events.slice(begin.index + 1, end.index + 1), times, positions)
        : { eq: elapsed(end.eq, begin.eq) };
      if (!positive(splitTime) && !measured(stats.eq)) continue;
      const splitCycles = recorded ? cycles.filter(cycle =>
        eventIndices.get(cycle.from.id) > begin.index && eventIndices.get(cycle.to.id) <= end.index) : [];
      splits25.set(to, {
        ...effort(25, positive(splitTime) ? splitTime : null, stats),
        strokeInterval: mean(splitCycles.map(cycle => cycle.duration)),
        kickPhase: mean(splitCycles.map(cycle => cycle.kickPhase)),
      });
    }
  }
  return {
    ...effort(distance, time, stats), t0, videoTime, lastDistance, videoEnd: finish?.t ?? null,
    movementData, inconsistent: invalidDistance || invalidTime,
    finished: Boolean(finish && start || finishedManually || run.origin === 'legacy' && events.length > 1
      || run.origin === 'summary' || run.origin === 'official'),
    fixed, splits, splits50, splits25, positions, times, walls, warnings, ...technique,
    firstArmTime: times.get(firstArm?.id) ?? null,
    firstKickTime: times.get(firstKick?.id) ?? null,
    firstArmDistance: positions.get(firstArm?.id) ?? null,
    finalGap: elapsed(videoTime, times.get(lastMove?.id)),
  };
}

export function validateTimeline(events, pool, relative = false) {
  if (!events.length) return;
  const starts = events.filter(event => event.type === 'i');
  if (starts.length > 1 || (starts.length && events[0].type !== 'i')) {
    throw new Error('Start (I), when present, must be the first marker.');
  }
  const ends = events.filter(event => event.type === 'f');
  if (ends.length > 1 || (ends.length && events.at(-1).type !== 'f')) {
    throw new Error('Finish (E) must be the last marker.');
  }
  const timeOf = event => relative ? event?.elapsed : event?.t;
  if (measured(timeOf(ends[0])) && measured(timeOf(starts[0])) && timeOf(ends[0]) <= timeOf(starts[0])) {
    throw new Error('Finish must be after the start.');
  }
  let wallDistance = 0;
  let middleRecorded = false;
  let lastPosition = 0;
  let lastTime = 0;
  const timestamps = new Set();
  const contacts = new Set(events.filter(event => event.type === 'm').map(event => event.id));
  let contact = null;
  let hasRelease = false;
  for (const event of events) {
    const time = timeOf(event);
    if (measured(time)) {
      if (time < lastTime) throw new Error('Marker times must follow the sequence.');
      const key = event.type + ':' + time;
      if (timestamps.has(key)) throw new Error('A marker of this type already exists at that time.');
      timestamps.add(key);
      lastTime = time;
    }
    if (event.type === 'm') {
      wallDistance += pool;
      middleRecorded = false;
      contact = event;
      hasRelease = false;
    }
    if (event.type === 'r' && contacts.has(event.wallId)) {
      if (event.wallId !== contact?.id || hasRelease || measured(markerTime(contact)) && !duration(contact, event)) {
        throw new Error('A release must follow its contact and precede the next wall. Record one release per contact.');
      }
      hasRelease = true;
    }
    if (event.type === 'v') {
      if (pool !== 50 || middleRecorded) throw new Error('Record one midpoint per 50 m length.');
      middleRecorded = true;
    }
    const position = event.type === 'm' ? wallDistance : event.type === 'v' ? wallDistance + 25 : event.distance;
    if (measured(position)) {
      if (position < lastPosition) throw new Error('Recorded distances must increase along the timeline.');
      if (isStroke(event) && (position < wallDistance || position > wallDistance + pool)) {
        throw new Error('The movement position must be within the current length.');
      }
      lastPosition = position;
    }
  }
}
