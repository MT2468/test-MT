import type * as THREE from 'three';
import type { GameState } from '../simulation/state';
import type { TrackDefinition } from '../track/firstTrack';
import { analyzeTrackBalance, type TrackBalanceAnalysis } from './trackAnalysis';

export interface PlaytestSnapshot {
  readonly trackId: string;
  readonly trackName: string;
  readonly analysis: TrackBalanceAnalysis;
  readonly sampledSeconds: number;
  readonly averageFps: number;
  readonly averageFrameMs: number;
  readonly worstFrameMs: number;
  readonly slowFrames: number;
  readonly maxDrawCalls: number;
  readonly maxTriangles: number;
  readonly averageSpeedKmh: number;
  readonly peakSpeedKmh: number;
  readonly wrongWaySeconds: number;
  readonly boostSeconds: number;
  readonly impacts: number;
  readonly itemPickups: number;
  readonly itemUses: number;
  readonly slowsReceived: number;
  readonly shieldBlocks: number;
  readonly decisionsResolved: number;
  readonly finalPosition: number;
  readonly raceTimeSeconds: number;
  readonly bestLapTimeSeconds: number | null;
  readonly finalBalance: number;
  readonly finalReserve: number;
  readonly finalDebt: number;
  readonly protectedByReserve: number;
}

export class PlaytestTelemetry {
  readonly analysis: TrackBalanceAnalysis;
  private sampledSeconds = 0;
  private frameCount = 0;
  private worstFrameMs = 0;
  private slowFrames = 0;
  private maxDrawCalls = 0;
  private maxTriangles = 0;
  private speedIntegral = 0;
  private peakSpeedKmh = 0;
  private wrongWaySeconds = 0;
  private boostSeconds = 0;
  private impacts = 0;
  private itemPickups = 0;
  private itemUses = 0;
  private slowsReceived = 0;
  private shieldBlocks = 0;
  private previousImpact = 0;
  private previousInventory: string | null = null;
  private previousSlow = 0;
  private previousShield = 0;
  private previousHitFlash = 0;
  private previousDecisionCount = 0;

  constructor(private readonly track: TrackDefinition) {
    this.analysis = analyzeTrackBalance(track);
  }

  reset(state: GameState): void {
    this.sampledSeconds = 0;
    this.frameCount = 0;
    this.worstFrameMs = 0;
    this.slowFrames = 0;
    this.maxDrawCalls = 0;
    this.maxTriangles = 0;
    this.speedIntegral = 0;
    this.peakSpeedKmh = 0;
    this.wrongWaySeconds = 0;
    this.boostSeconds = 0;
    this.impacts = 0;
    this.itemPickups = 0;
    this.itemUses = 0;
    this.slowsReceived = 0;
    this.shieldBlocks = 0;
    this.previousImpact = state.vehicle.impactStrength;
    this.previousInventory = state.items.inventory;
    this.previousSlow = state.items.slowRemaining;
    this.previousShield = state.items.shieldRemaining;
    this.previousHitFlash = state.items.hitFlashSeconds;
    this.previousDecisionCount = state.decisions.history.length;
  }

  sample(deltaSeconds: number, state: GameState, renderer: THREE.WebGLRenderer): void {
    if (state.phase !== 'racing') return;
    const dt = Math.min(Math.max(deltaSeconds, 0), 0.1);
    if (dt <= 0) return;

    const frameMs = dt * 1000;
    this.sampledSeconds += dt;
    this.frameCount += 1;
    this.worstFrameMs = Math.max(this.worstFrameMs, frameMs);
    if (frameMs > 33.34) this.slowFrames += 1;
    this.maxDrawCalls = Math.max(this.maxDrawCalls, renderer.info.render.calls);
    this.maxTriangles = Math.max(this.maxTriangles, renderer.info.render.triangles);

    const speedKmh = Math.abs(state.vehicle.speed) * 3.6;
    this.speedIntegral += speedKmh * dt;
    this.peakSpeedKmh = Math.max(this.peakSpeedKmh, speedKmh);
    if (state.race.wrongWay) this.wrongWaySeconds += dt;
    if (state.vehicle.boostRemaining > 0) this.boostSeconds += dt;

    if (state.vehicle.impactStrength > 0.28 && this.previousImpact <= 0.28) this.impacts += 1;

    const inventory = state.items.inventory;
    if (this.previousInventory === null && inventory !== null) this.itemPickups += 1;
    if (this.previousInventory !== null && inventory === null) this.itemUses += 1;

    if (state.items.slowRemaining > this.previousSlow + 0.25) this.slowsReceived += 1;
    if (
      this.previousShield > 0 &&
      state.items.shieldRemaining <= 0 &&
      state.items.hitFlashSeconds > this.previousHitFlash
    ) this.shieldBlocks += 1;

    this.previousImpact = state.vehicle.impactStrength;
    this.previousInventory = inventory;
    this.previousSlow = state.items.slowRemaining;
    this.previousShield = state.items.shieldRemaining;
    this.previousHitFlash = state.items.hitFlashSeconds;
    this.previousDecisionCount = state.decisions.history.length;
  }

  snapshot(state: GameState): PlaytestSnapshot {
    const averageFps = this.sampledSeconds > 0 ? this.frameCount / this.sampledSeconds : 0;
    return Object.freeze({
      trackId: this.track.id,
      trackName: this.track.name,
      analysis: this.analysis,
      sampledSeconds: this.sampledSeconds,
      averageFps,
      averageFrameMs: averageFps > 0 ? 1000 / averageFps : 0,
      worstFrameMs: this.worstFrameMs,
      slowFrames: this.slowFrames,
      maxDrawCalls: this.maxDrawCalls,
      maxTriangles: this.maxTriangles,
      averageSpeedKmh: this.sampledSeconds > 0 ? this.speedIntegral / this.sampledSeconds : 0,
      peakSpeedKmh: this.peakSpeedKmh,
      wrongWaySeconds: this.wrongWaySeconds,
      boostSeconds: this.boostSeconds,
      impacts: this.impacts,
      itemPickups: this.itemPickups,
      itemUses: this.itemUses,
      slowsReceived: this.slowsReceived,
      shieldBlocks: this.shieldBlocks,
      decisionsResolved: Math.max(this.previousDecisionCount, state.decisions.history.length),
      finalPosition: state.race.position,
      raceTimeSeconds: state.race.raceTimeSeconds,
      bestLapTimeSeconds: state.race.bestLapTimeSeconds,
      finalBalance: state.finance.balance,
      finalReserve: state.finance.reserve,
      finalDebt: state.finance.debt,
      protectedByReserve: state.finance.protectedByReserve,
    });
  }

  formatReport(state: GameState): string {
    const data = this.snapshot(state);
    const line = (label: string, value: string | number): string => `${label}: ${value}`;
    return [
      'TURBO REAL · RELATÓRIO QA FASE 13',
      line('Pista', data.trackName),
      line('Posição', `${data.finalPosition}º`),
      line('Tempo', data.raceTimeSeconds.toFixed(2)),
      line('Melhor volta', data.bestLapTimeSeconds?.toFixed(2) ?? 'n/a'),
      line('FPS médio', data.averageFps.toFixed(1)),
      line('Frame médio ms', data.averageFrameMs.toFixed(2)),
      line('Pior frame ms', data.worstFrameMs.toFixed(2)),
      line('Frames >33ms', data.slowFrames),
      line('Draw calls pico', data.maxDrawCalls),
      line('Triângulos pico', data.maxTriangles),
      line('Velocidade média km/h', data.averageSpeedKmh.toFixed(1)),
      line('Velocidade pico km/h', data.peakSpeedKmh.toFixed(1)),
      line('Direção errada s', data.wrongWaySeconds.toFixed(2)),
      line('Boost s', data.boostSeconds.toFixed(2)),
      line('Impactos', data.impacts),
      line('Itens coletados', data.itemPickups),
      line('Itens usados', data.itemUses),
      line('Lentidões recebidas', data.slowsReceived),
      line('Escudos consumidos', data.shieldBlocks),
      line('Decisões resolvidas', data.decisionsResolved),
      line('Saldo final', data.finalBalance.toFixed(2)),
      line('Reserva final', data.finalReserve.toFixed(2)),
      line('Dívida final', data.finalDebt.toFixed(2)),
      line('Protegido pela reserva', data.protectedByReserve.toFixed(2)),
      line('Comprimento estimado m', data.analysis.lengthMeters.toFixed(1)),
      line('Tecnicidade', data.analysis.technicality.toFixed(3)),
      line('Escala IA', data.analysis.aiPaceScale.toFixed(3)),
      line('Pressão econômica', data.analysis.economyPressure.toFixed(3)),
    ].join('\n');
  }
}
