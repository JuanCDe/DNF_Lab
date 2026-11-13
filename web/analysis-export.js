import { analyze, measured, positive } from './metrics.js';

const instructions = [
  'Responde en español. Analiza al atleta marcado como objetivo en target_athlete. Usa los datos de los demás atletas como referencia para proponer mejoras de técnica en apnea dinámica sin aletas.',
  'Compara primero tramos con el mismo inicio y fin, la misma longitud de piscina y la misma fase del intento. Distingue salida, tramo intermedio y final. Trata los virajes por separado. Usa los intentos descalificados solo como contexto y señala las diferencias de procedencia, cobertura y tamaño de muestra.',
  'Usa split para tramos medidos entre dos puntos y cumulative para parciales desde la salida. No mezcles ambas clases ni cuentes dos veces un tramo solapado de un mismo intento. Usa attempt como contexto del resultado total y turn para los tiempos de viraje. Separa el efecto de cada tramo de la distancia total alcanzada.',
  'El CSV usa punto y coma y punto decimal. Las celdas vacías indican que falta una medición. Las distancias están en metros y los tiempos en segundos. Los identificadores son códigos locales a este archivo. DQ significa intento descalificado.',
  'Los ciclos equivalentes son (brazadas + patadas) / 2. Un ciclo completo empareja una brazada con una patada elegible. S marca media brazada y K el fin de la patada. S–S es el tiempo entre dos marcas consecutivas S. K phase es el porcentaje de ese ciclo transcurrido al terminar la única patada elegible entre ambas marcas. timed_ss_cycles y phased_cycles son los tamaños de muestra de esas medias.',
  'Evalúa ritmo, velocidad, brazadas, patadas, ciclos y metros por ciclo. Indica si los datos apoyan probar menos ciclos, variar el ritmo o revisar la sincronización de la patada. Considera la compensación entre velocidad y metros por ciclo. Un mayor tiempo entre marcas puede ser compatible con más deslizamiento, pero no mide por sí mismo su duración, la pérdida de velocidad ni la calidad de la patada. Los intervalos desde el despegue a S o K tampoco miden todo el deslizamiento.',
  'Resume hasta tres prioridades. Para cada una, cita los intentos, los tramos, las cifras comparables y el tamaño de muestra. Distingue observación e hipótesis, y propone un cambio técnico comprobable y una métrica con la que contrastarlo en la siguiente grabación. Si faltan datos, indica qué convendría marcar en el vídeo. No inventes mediciones ni supongas que una diferencia entre atletas es causal.',
];

const columns = [
  'record_type', 'instruction', 'target_athlete', 'athlete', 'attempt', 'pool_m', 'dq', 'origin',
  'from_m', 'to_m', 'attempt_distance_m', 'time_s', 'speed_m_s', 'strokes', 'kicks', 'eq_cycles',
  'complete_cycles', 'extra_kicks', 'm_per_eq_cycle', 's_per_eq_cycle', 'mean_ss_s', 'mean_k_phase_pct',
  'timed_ss_cycles', 'phased_cycles', 'contact_to_release_s', 'release_to_first_s_s', 'release_to_first_k_s',
];

function splitFields(split) {
  return [split.time, split.speed, split.arms, split.kicks, split.eq, split.pairs, split.extraCount,
    split.metresPerEq, split.secondsPerEq, split.strokeInterval, split.kickPhase, split.timedCycles, split.phasedCycles];
}

function withoutUnmeasuredMovements(split, hasMovementData) {
  return hasMovementData || !measured(split.arms) ? split : { time: split.time, speed: split.speed };
}

export function analysisExportRows(athletes, runs, targetId) {
  if (!athletes.some(athlete => athlete.id === targetId)) throw new Error('Select an athlete to analyze.');
  const athleteCodes = new Map(athletes.map((athlete, index) => [athlete.id, 'A' + (index + 1)]));
  const target = athleteCodes.get(targetId);
  const rows = instructions.map(instruction => ['instruction', instruction, target]);
  let targetHasSplits = false;

  for (const [index, run] of runs.entries()) {
    const athlete = athleteCodes.get(run.athleteId);
    if (!athlete) continue;
    const m = analyze(run, { compareSplits: true });
    if (!m.finished || m.inconsistent) continue;
    const context = [target, athlete, 'R' + (index + 1), run.pool, run.dq ? 1 : 0, run.origin];
    const prefix = (type, from, to) => [type, null, ...context, from, to, m.distance];
    const segments = new Map();
    for (const split of m.splits) {
      if (positive(split.distance) && positive(split.time)) {
        segments.set(split.from + ':' + split.to, { ...withoutUnmeasuredMovements(split, m.movementData), from: split.from, to: split.to });
      }
    }
    for (const [to, split] of m.splits25) {
      if (positive(split.time)) segments.set((to - 25) + ':' + to, { ...split, from: to - 25, to });
    }
    const cumulative = Object.entries(m.fixed).filter(([to, split]) => positive(split.time) && !segments.has('0:' + to));
    if (athlete === target && (segments.size || cumulative.length)) targetHasSplits = true;

    rows.push([...prefix('attempt', null, null), ...splitFields(m.movementData ? m : { time: m.time, speed: m.speed })]);
    for (const split of [...segments.values()].sort((a, b) => a.from - b.from || a.to - b.to)) {
      rows.push([...prefix('split', split.from, split.to), ...splitFields(split)]);
    }
    for (const [to, split] of cumulative) {
      rows.push([...prefix('cumulative', 0, Number(to)), ...splitFields(withoutUnmeasuredMovements(split, m.movementData))]);
    }
    for (const turn of m.turns) {
      const times = [turn.contactToRelease, turn.releaseToArm, turn.releaseToKick];
      if (times.some(measured)) rows.push([...prefix('turn', turn.distance, turn.distance), ...Array(13).fill(null), ...times]);
    }
  }
  if (!targetHasSplits) throw new Error('This athlete has no completed attempts with timed splits.');
  return [columns, ...rows.map(row => Array.from({ length: columns.length }, (_, index) => row[index]))];
}
