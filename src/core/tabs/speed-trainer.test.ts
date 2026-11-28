// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import {
  advanceSpeedTrainerOnLoop,
  clampSpeedPct,
  createSpeedTrainerState,
  formatSpeedTrainerProgress,
  normalizeSpeedTrainerConfig,
} from './speed-trainer';

describe('SpeedTrainer determinístico (Spec 009)', () => {
  it('respeta los límites 15%–150% y normaliza objetivo >= inicial', () => {
    expect(clampSpeedPct(5)).toBe(15);
    expect(clampSpeedPct(220)).toBe(150);
    const cfg = normalizeSpeedTrainerConfig({ initialPct: 90, targetPct: 70, stepPct: 5 });
    expect(cfg.targetPct).toBe(90);
    expect(createSpeedTrainerState(cfg, true).totalStages).toBe(1);
  });

  it('avanza etapas en incrementos exactos cada N vueltas hasta alcanzar el objetivo', () => {
    const cfg = normalizeSpeedTrainerConfig({
      initialPct: 70,
      targetPct: 80,
      stepPct: 5,
      loopsPerStage: 2,
    });
    let st = createSpeedTrainerState(cfg, true);
    expect(st.totalStages).toBe(3); // 70, 75, 80
    expect(formatSpeedTrainerProgress(cfg, st)).toBe('Etapa 1/3 · 70% · Vuelta 1/2');

    st = advanceSpeedTrainerOnLoop(cfg, st);
    expect(st.currentPct).toBe(70);
    expect(st.loopsInStage).toBe(1);
    expect(formatSpeedTrainerProgress(cfg, st)).toBe('Etapa 1/3 · 70% · Vuelta 2/2');

    st = advanceSpeedTrainerOnLoop(cfg, st);
    expect(st.currentPct).toBe(75);
    expect(st.stageIndex).toBe(1);
    expect(st.loopsInStage).toBe(0);

    st = advanceSpeedTrainerOnLoop(cfg, st); // vuelta 2 de 75%
    st = advanceSpeedTrainerOnLoop(cfg, st); // pasa a 80%
    expect(st.currentPct).toBe(80);
    expect(st.stageIndex).toBe(2);
    expect(st.completed).toBe(false);

    st = advanceSpeedTrainerOnLoop(cfg, st); // vuelta 2 de 80%
    st = advanceSpeedTrainerOnLoop(cfg, st); // completa objetivo
    expect(st.currentPct).toBe(80);
    expect(st.completed).toBe(true);
  });
});
