// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * Máquina de estados pura para el Entrenador Progresivo de Velocidad (Speed Trainer, Spec 009).
 * Incrementa la velocidad por etapas determinísticas al completar vueltas del bucle activo.
 */

export const MIN_PLAYBACK_SPEED_PCT = 15;
export const MAX_PLAYBACK_SPEED_PCT = 150;
export const SPEED_PRESETS_PCT = [25, 50, 75, 85, 100] as const;

export interface SpeedTrainerConfig {
  readonly initialPct: number;
  readonly targetPct: number;
  readonly stepPct: number;
  readonly loopsPerStage: number;
}

export interface SpeedTrainerState {
  readonly active: boolean;
  readonly currentPct: number;
  readonly loopsInStage: number;
  readonly stageIndex: number;
  readonly totalStages: number;
  readonly completed: boolean;
}

export function clampSpeedPct(pct: number): number {
  if (!Number.isFinite(pct)) return 100;
  return Math.min(MAX_PLAYBACK_SPEED_PCT, Math.max(MIN_PLAYBACK_SPEED_PCT, Math.round(pct)));
}

export function normalizeSpeedTrainerConfig(
  raw: Partial<SpeedTrainerConfig> = {}
): SpeedTrainerConfig {
  const initialPct = clampSpeedPct(raw.initialPct ?? 50);
  const rawTarget = clampSpeedPct(raw.targetPct ?? 100);
  const targetPct = Math.max(initialPct, rawTarget);
  const stepPct = Math.max(1, Math.min(50, Math.round(raw.stepPct ?? 5)));
  const loopsPerStage = Math.max(1, Math.min(32, Math.round(raw.loopsPerStage ?? 2)));
  return { initialPct, targetPct, stepPct, loopsPerStage };
}

export function createSpeedTrainerState(
  config: SpeedTrainerConfig,
  active: boolean = false
): SpeedTrainerState {
  const norm = normalizeSpeedTrainerConfig(config);
  const diff = norm.targetPct - norm.initialPct;
  const totalStages = diff <= 0 ? 1 : 1 + Math.ceil(diff / norm.stepPct);
  return {
    active,
    currentPct: norm.initialPct,
    loopsInStage: 0,
    stageIndex: 0,
    totalStages,
    completed: false,
  };
}

/** Avanza un ciclo tras completarse una vuelta de bucle A–B. */
export function advanceSpeedTrainerOnLoop(
  config: SpeedTrainerConfig,
  state: SpeedTrainerState
): SpeedTrainerState {
  if (!state.active || state.completed) return state;
  const norm = normalizeSpeedTrainerConfig(config);
  const nextLoop = state.loopsInStage + 1;

  if (nextLoop < norm.loopsPerStage) {
    return { ...state, loopsInStage: nextLoop };
  }

  if (state.currentPct >= norm.targetPct) {
    return {
      ...state,
      loopsInStage: norm.loopsPerStage,
      completed: true,
    };
  }

  const nextPct = Math.min(norm.targetPct, state.currentPct + norm.stepPct);
  return {
    ...state,
    currentPct: nextPct,
    loopsInStage: 0,
    stageIndex: Math.min(state.totalStages - 1, state.stageIndex + 1),
    completed: false,
  };
}

export function formatSpeedTrainerProgress(
  config: SpeedTrainerConfig,
  state: SpeedTrainerState
): string {
  if (state.completed) {
    return `Meta alcanzada · ${state.currentPct}%`;
  }
  return `Etapa ${state.stageIndex + 1}/${state.totalStages} · ${state.currentPct}% · Vuelta ${state.loopsInStage + 1}/${config.loopsPerStage}`;
}
