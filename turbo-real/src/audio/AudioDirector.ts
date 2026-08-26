import type { ItemKind } from '../simulation/items/types';
import type { GameState } from '../simulation/state';
import { VEHICLE_TUNING } from '../simulation/vehicle';

type UiSound = 'confirm' | 'back' | 'pause';

export class AudioDirector {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private engineOscillator: OscillatorNode | null = null;
  private engineGain: GainNode | null = null;
  private engineFilter: BiquadFilterNode | null = null;
  private driftSource: AudioBufferSourceNode | null = null;
  private driftGain: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private previousInventory: ItemKind | null = null;
  private previousImpact = 0;
  private previousHitFlash = 0;
  private previousCheckpoints = 0;
  private previousCompletedLaps = 0;
  private previousPhase: GameState['phase'] = 'racing';
  private previousDecisionId: string | null = null;

  async unlock(): Promise<void> {
    if (this.context === null) this.createGraph();
    const context = this.context;
    if (context?.state === 'suspended') {
      try {
        await context.resume();
      } catch {
        // Browsers can reject resume outside a user gesture. The game remains playable without audio.
      }
    }
  }

  resetSession(state: GameState): void {
    this.previousInventory = state.items.inventory;
    this.previousImpact = state.vehicle.impactStrength;
    this.previousHitFlash = state.items.hitFlashSeconds;
    this.previousCheckpoints = state.race.checkpointsPassed;
    this.previousCompletedLaps = state.race.completedLaps;
    this.previousPhase = state.phase;
    this.previousDecisionId = state.decisions.active?.id ?? null;
    this.stopSession();
  }

  stopSession(): void {
    const now = this.context?.currentTime ?? 0;
    this.engineGain?.gain.setTargetAtTime(0, now, 0.04);
    this.driftGain?.gain.setTargetAtTime(0, now, 0.04);
  }

  update(state: GameState): void {
    const context = this.context;
    if (context === null || this.engineGain === null || this.engineOscillator === null || this.engineFilter === null || this.driftGain === null) return;

    const now = context.currentTime;
    const movingPhase = state.phase === 'racing';
    const speedRatio = Math.min(Math.abs(state.vehicle.speed) / VEHICLE_TUNING.maxForwardSpeed, 1.25);
    const boost = state.vehicle.boostRemaining > 0;
    const driftIntensity = state.vehicle.drifting
      ? Math.min(Math.abs(state.vehicle.lateralSpeed) / 7.5, 1)
      : 0;

    const engineFrequency = 74 + speedRatio * 150 + (boost ? 42 : 0);
    const engineLevel = movingPhase ? 0.025 + speedRatio * 0.045 + (boost ? 0.018 : 0) : 0;
    this.engineOscillator.frequency.setTargetAtTime(engineFrequency, now, 0.035);
    this.engineFilter.frequency.setTargetAtTime(520 + speedRatio * 1450 + (boost ? 500 : 0), now, 0.06);
    this.engineGain.gain.setTargetAtTime(engineLevel, now, 0.045);
    this.driftGain.gain.setTargetAtTime(movingPhase ? driftIntensity * 0.038 : 0, now, 0.04);

    const currentInventory = state.items.inventory;
    if (currentInventory !== null && this.previousInventory === null) this.playPickup();
    if (currentInventory === null && this.previousInventory !== null) this.playItemUse(this.previousInventory);

    const impact = Math.max(state.vehicle.impactStrength, state.items.hitFlashSeconds * 1.6);
    if (impact > 0.34 && Math.max(this.previousImpact, this.previousHitFlash * 1.6) <= 0.34) {
      this.playImpact(Math.min(impact, 1));
    }

    if (state.race.checkpointsPassed !== this.previousCheckpoints && state.race.checkpointsPassed > 0) this.playCheckpoint();
    if (state.race.completedLaps > this.previousCompletedLaps && !state.race.finished) this.playLap();
    if (state.phase === 'finished' && this.previousPhase !== 'finished') this.playFinish();

    const decisionId = state.decisions.active?.id ?? null;
    if (decisionId !== null && this.previousDecisionId === null) this.playDecisionPrompt();

    this.previousInventory = currentInventory;
    this.previousImpact = state.vehicle.impactStrength;
    this.previousHitFlash = state.items.hitFlashSeconds;
    this.previousCheckpoints = state.race.checkpointsPassed;
    this.previousCompletedLaps = state.race.completedLaps;
    this.previousPhase = state.phase;
    this.previousDecisionId = decisionId;
  }

  playUi(kind: UiSound): void {
    if (kind === 'confirm') this.tone(620, 0.08, 0.035, 'triangle', 820);
    else if (kind === 'back') this.tone(360, 0.08, 0.028, 'triangle', 260);
    else this.tone(470, 0.07, 0.026, 'square', 390);
  }

  dispose(): void {
    try {
      this.engineOscillator?.stop();
      this.driftSource?.stop();
    } catch {
      // Nodes can already be stopped during page teardown.
    }
    void this.context?.close();
    this.context = null;
    this.master = null;
    this.engineOscillator = null;
    this.engineGain = null;
    this.engineFilter = null;
    this.driftSource = null;
    this.driftGain = null;
    this.noiseBuffer = null;
  }

  private createGraph(): void {
    const context = new AudioContext({ latencyHint: 'interactive' });
    const master = context.createGain();
    master.gain.value = 0.72;
    master.connect(context.destination);

    const engineOscillator = context.createOscillator();
    engineOscillator.type = 'sawtooth';
    engineOscillator.frequency.value = 74;
    const engineFilter = context.createBiquadFilter();
    engineFilter.type = 'lowpass';
    engineFilter.Q.value = 1.6;
    const engineGain = context.createGain();
    engineGain.gain.value = 0;
    engineOscillator.connect(engineFilter).connect(engineGain).connect(master);
    engineOscillator.start();

    const noiseBuffer = context.createBuffer(1, context.sampleRate, context.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let index = 0; index < data.length; index += 1) data[index] = Math.random() * 2 - 1;

    const driftSource = context.createBufferSource();
    driftSource.buffer = noiseBuffer;
    driftSource.loop = true;
    const driftFilter = context.createBiquadFilter();
    driftFilter.type = 'bandpass';
    driftFilter.frequency.value = 1850;
    driftFilter.Q.value = 0.7;
    const driftGain = context.createGain();
    driftGain.gain.value = 0;
    driftSource.connect(driftFilter).connect(driftGain).connect(master);
    driftSource.start();

    this.context = context;
    this.master = master;
    this.engineOscillator = engineOscillator;
    this.engineFilter = engineFilter;
    this.engineGain = engineGain;
    this.driftSource = driftSource;
    this.driftGain = driftGain;
    this.noiseBuffer = noiseBuffer;
  }

  private playPickup(): void {
    this.tone(760, 0.07, 0.032, 'sine', 1120);
    this.tone(1120, 0.09, 0.022, 'triangle', 1380, 0.045);
  }

  private playItemUse(kind: ItemKind): void {
    if (kind === 'turbo-solar') {
      this.tone(180, 0.2, 0.045, 'sawtooth', 520);
      this.noiseBurst(0.1, 0.018, 1100);
    } else if (kind === 'escudo-prisma') {
      this.tone(540, 0.18, 0.035, 'sine', 980);
    } else if (kind === 'pulso-repulsor') {
      this.tone(210, 0.16, 0.05, 'square', 82);
      this.noiseBurst(0.08, 0.024, 520);
    } else {
      this.tone(320, 0.12, 0.03, 'triangle', 190);
    }
  }

  private playImpact(strength: number): void {
    this.noiseBurst(0.08 + strength * 0.08, 0.025 + strength * 0.035, 280 + strength * 260);
    this.tone(92, 0.11, 0.03 + strength * 0.035, 'square', 58);
  }

  private playCheckpoint(): void {
    this.tone(860, 0.045, 0.015, 'sine', 980);
  }

  private playLap(): void {
    this.tone(520, 0.08, 0.026, 'triangle', 760);
    this.tone(760, 0.1, 0.024, 'triangle', 1040, 0.055);
  }

  private playFinish(): void {
    this.tone(440, 0.14, 0.03, 'triangle', 660);
    this.tone(660, 0.16, 0.03, 'triangle', 880, 0.09);
    this.tone(880, 0.28, 0.035, 'triangle', 1160, 0.18);
  }

  private playDecisionPrompt(): void {
    this.tone(390, 0.08, 0.022, 'sine', 520);
    this.tone(520, 0.1, 0.018, 'sine', 650, 0.05);
  }

  private tone(
    startFrequency: number,
    duration: number,
    gainValue: number,
    type: OscillatorType,
    endFrequency = startFrequency,
    delay = 0,
  ): void {
    const context = this.context;
    const master = this.master;
    if (context === null || master === null || context.state !== 'running') return;

    const start = context.currentTime + delay;
    const oscillator = context.createOscillator();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(startFrequency, start);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(20, endFrequency), start + duration);
    const gain = context.createGain();
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, gainValue), start + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    oscillator.connect(gain).connect(master);
    oscillator.start(start);
    oscillator.stop(start + duration + 0.02);
  }

  private noiseBurst(duration: number, gainValue: number, frequency: number): void {
    const context = this.context;
    const master = this.master;
    const noiseBuffer = this.noiseBuffer;
    if (context === null || master === null || noiseBuffer === null || context.state !== 'running') return;

    const source = context.createBufferSource();
    source.buffer = noiseBuffer;
    const filter = context.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = frequency;
    const gain = context.createGain();
    const now = context.currentTime;
    gain.gain.setValueAtTime(Math.max(0.0002, gainValue), now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    source.connect(filter).connect(gain).connect(master);
    source.start(now, Math.random() * 0.7, duration);
  }
}
