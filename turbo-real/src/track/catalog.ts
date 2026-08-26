import { FIRST_TRACK, createTrackDefinition, type TrackDefinition, type TrackPoint } from './firstTrack';

const FEIRA_POINTS: readonly TrackPoint[] = [
  { x: -42, z: 72 },
  { x: 8, z: 78 },
  { x: 48, z: 64 },
  { x: 68, z: 38 },
  { x: 58, z: 10 },
  { x: 80, z: -18 },
  { x: 60, z: -50 },
  { x: 20, z: -66 },
  { x: -16, z: -58 },
  { x: -48, z: -72 },
  { x: -74, z: -40 },
  { x: -68, z: 0 },
  { x: -80, z: 36 },
  { x: -58, z: 62 },
];

const ORCAMENTO_POINTS: readonly TrackPoint[] = [
  { x: -18, z: 84 },
  { x: 28, z: 82 },
  { x: 62, z: 66 },
  { x: 74, z: 34 },
  { x: 54, z: 10 },
  { x: 80, z: -14 },
  { x: 66, z: -50 },
  { x: 32, z: -78 },
  { x: -10, z: -74 },
  { x: -44, z: -56 },
  { x: -60, z: -24 },
  { x: -84, z: 4 },
  { x: -66, z: 36 },
  { x: -44, z: 68 },
];

const FIM_DO_MES_POINTS: readonly TrackPoint[] = [
  { x: -50, z: 80 },
  { x: 14, z: 80 },
  { x: 56, z: 70 },
  { x: 84, z: 44 },
  { x: 90, z: 8 },
  { x: 72, z: -28 },
  { x: 84, z: -62 },
  { x: 46, z: -82 },
  { x: 0, z: -80 },
  { x: -34, z: -64 },
  { x: -72, z: -74 },
  { x: -94, z: -42 },
  { x: -88, z: -4 },
  { x: -100, z: 34 },
  { x: -72, z: 66 },
];

export const FEIRA_CENTRAL: TrackDefinition = createTrackDefinition({
  id: 'feira-central',
  name: 'Feira Central',
  subtitle: 'Corredores coloridos, curvas apertadas e muito movimento',
  controlPoints: FEIRA_POINTS,
  halfWidth: 7.9,
  visuals: {
    theme: 'market',
    skyColor: 0x9edfff,
    fogColor: 0xa8e4ff,
    groundColor: 0x7e9b48,
    curbPrimary: 0xf2b134,
    curbSecondary: 0x2db875,
    barrierColor: 0xf1e2c3,
    accentColor: 0xff7a59,
    ambientSkyColor: 0xf3fbff,
    ambientGroundColor: 0x51462a,
    sunColor: 0xfff0c5,
    sunIntensity: 3.0,
    exposure: 1.06,
  },
  economy: {
    checkpointIncome: 7,
    lapOperatingCost: 20,
    emergencyCost: 38,
    emergencyLabel: 'Pneu furado no acesso da feira',
    debtInterestRate: 0.05,
  },
  content: {
    cupId: 'primeiro-salario',
    cupName: 'Copa Primeiro Salário',
    cupOrder: 2,
    difficulty: 'Médio',
    concept: 'Renda variável e pequenos custos',
    financialHook: 'Ganhos por setor sobem, mas manter o ritmo também custa mais.',
  },
});

export const CIRCUITO_DO_ORCAMENTO: TrackDefinition = createTrackDefinition({
  id: 'circuito-do-orcamento',
  name: 'Circuito do Orçamento',
  subtitle: 'Distrito financeiro estilizado com sequência técnica de curvas',
  controlPoints: ORCAMENTO_POINTS,
  halfWidth: 8.1,
  visuals: {
    theme: 'budget',
    skyColor: 0x8fc6e8,
    fogColor: 0x96cbe7,
    groundColor: 0x315d49,
    curbPrimary: 0x62e0b2,
    curbSecondary: 0x7aa7ff,
    barrierColor: 0xd8e0e8,
    accentColor: 0x6c8cff,
    ambientSkyColor: 0xe7f4ff,
    ambientGroundColor: 0x183a33,
    sunColor: 0xf5fbff,
    sunIntensity: 2.85,
    exposure: 1.04,
  },
  economy: {
    checkpointIncome: 8,
    lapOperatingCost: 24,
    emergencyCost: 55,
    emergencyLabel: 'Manutenção inesperada do kart',
    debtInterestRate: 0.05,
  },
  content: {
    cupId: 'primeiro-salario',
    cupName: 'Copa Primeiro Salário',
    cupOrder: 3,
    difficulty: 'Difícil',
    concept: 'Planejamento de despesas',
    financialHook: 'Receita maior não resolve tudo quando os custos também crescem.',
  },
});

export const CORRIDA_DO_FIM_DO_MES: TrackDefinition = createTrackDefinition({
  id: 'corrida-do-fim-do-mes',
  name: 'Corrida do Fim do Mês',
  subtitle: 'Circuito crepuscular longo com pressão de caixa até a bandeirada',
  controlPoints: FIM_DO_MES_POINTS,
  halfWidth: 8.0,
  visuals: {
    theme: 'month-end',
    skyColor: 0x35456f,
    fogColor: 0x405174,
    groundColor: 0x29443d,
    curbPrimary: 0xffc857,
    curbSecondary: 0xef6f8e,
    barrierColor: 0xc9d0da,
    accentColor: 0xffb24d,
    ambientSkyColor: 0x9fb1d4,
    ambientGroundColor: 0x152b2a,
    sunColor: 0xffb86b,
    sunIntensity: 2.35,
    exposure: 0.96,
  },
  economy: {
    checkpointIncome: 5,
    lapOperatingCost: 26,
    emergencyCost: 60,
    emergencyLabel: 'Conta inesperada de fim do mês',
    debtInterestRate: 0.05,
  },
  content: {
    cupId: 'primeiro-salario',
    cupName: 'Copa Primeiro Salário',
    cupOrder: 4,
    difficulty: 'Difícil',
    concept: 'Pressão de caixa e reserva',
    financialHook: 'Menos entrada e mais despesas tornam a reserva muito mais valiosa.',
  },
});

export const TRACK_CATALOG: readonly TrackDefinition[] = Object.freeze([
  FIRST_TRACK,
  FEIRA_CENTRAL,
  CIRCUITO_DO_ORCAMENTO,
  CORRIDA_DO_FIM_DO_MES,
]);

export function getTrackById(id: string): TrackDefinition {
  return TRACK_CATALOG.find((track) => track.id === id) ?? FIRST_TRACK;
}
