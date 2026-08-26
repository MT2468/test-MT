import type { FinanceController } from '../finance/FinanceController';
import type { RaceState } from '../RaceController';
import type { VehicleState } from '../vehicle';
import type { ActiveDecision, DecisionChoice, DecisionId, DecisionState } from './types';

const OUTCOME_SECONDS = 4.2;

interface DecisionTrigger {
  readonly id: DecisionId;
  readonly completedLaps: number;
  readonly checkpointsPassed: number;
  readonly card: ActiveDecision;
}

const DECISIONS: readonly DecisionTrigger[] = [
  {
    id: 'reserva-expressa',
    completedLaps: 0,
    checkpointsPassed: 1,
    card: {
      id: 'reserva-expressa',
      kicker: 'LIQUIDEZ × PROTEÇÃO',
      title: 'Reserva Expressa',
      context: 'Ainda há bastante corrida pela frente. Você pode separar R$20 agora para a reserva ou manter tudo disponível no saldo.',
      options: [
        { choice: 1, title: 'Separar R$20', detail: 'Menos dinheiro livre agora, mais proteção para um imprevisto.', accent: 'safe' },
        { choice: 2, title: 'Manter no saldo', detail: 'Preserva liquidez imediata, mas a reserva continua menor.', accent: 'neutral' },
      ],
    },
  },
  {
    id: 'credito-turbo',
    completedLaps: 0,
    checkpointsPassed: 3,
    card: {
      id: 'credito-turbo',
      kicker: 'DESEMPENHO AGORA × CUSTO FUTURO',
      title: 'Crédito Turbo',
      context: 'Um serviço fictício oferece 7 segundos de turbo: R$30 agora e mais 2 cobranças de R$12 nos fechamentos das próximas voltas.',
      options: [
        { choice: 1, title: 'Ativar Crédito Turbo', detail: 'Turbo imediato. Custo total programado: R$54.', accent: 'risk' },
        { choice: 2, title: 'Recusar', detail: 'Sem turbo extra e sem compromisso financeiro futuro.', accent: 'neutral' },
      ],
    },
  },
  {
    id: 'atalho-premium',
    completedLaps: 1,
    checkpointsPassed: 4,
    card: {
      id: 'atalho-premium',
      kicker: 'OPORTUNIDADE × CAIXA',
      title: 'Atalho Premium',
      context: 'Na segunda volta aparece uma rota rápida fictícia. Ela custa R$25 agora e rende 4 segundos de turbo, sem parcelas depois.',
      options: [
        { choice: 1, title: 'Pagar R$25', detail: 'Ganha desempenho agora e reduz seu saldo imediatamente.', accent: 'risk' },
        { choice: 2, title: 'Seguir na pista', detail: 'Mantém o dinheiro e abre mão da vantagem de tempo.', accent: 'neutral' },
      ],
    },
  },
];

export class DecisionController {
  constructor(private readonly state: DecisionState) {}

  advance(deltaSeconds: number, race: RaceState): void {
    const dt = Math.min(Math.max(deltaSeconds, 0), 0.1);
    this.state.outcomeRemaining = Math.max(0, this.state.outcomeRemaining - dt);
    if (this.state.active !== null || race.finished) return;

    for (const definition of DECISIONS) {
      if (this.state.resolvedIds.includes(definition.id)) continue;
      if (race.completedLaps !== definition.completedLaps) continue;
      if (race.checkpointsPassed < definition.checkpointsPassed) continue;
      this.state.active = definition.card;
      return;
    }
  }

  resolve(
    choice: DecisionChoice,
    finance: FinanceController,
    vehicle: VehicleState,
    race: RaceState,
  ): void {
    const active = this.state.active;
    if (active === null) return;
    const option = active.options.find((candidate) => candidate.choice === choice);
    if (!option) return;

    const outcome = this.applyChoice(active.id, choice, finance, vehicle, race);
    this.state.resolvedIds.push(active.id);
    this.state.history.push({
      id: active.id,
      atSeconds: race.raceTimeSeconds,
      choice,
      optionTitle: option.title,
      outcome,
    });
    this.state.lastOutcome = outcome;
    this.state.outcomeRemaining = OUTCOME_SECONDS;
    this.state.active = null;
  }

  private applyChoice(
    id: DecisionId,
    choice: DecisionChoice,
    finance: FinanceController,
    vehicle: VehicleState,
    race: RaceState,
  ): string {
    const atSeconds = race.raceTimeSeconds;

    if (id === 'reserva-expressa') {
      if (choice === 2) {
        const outcome = 'Você manteve os R$20 no saldo. A liquidez ficou maior, mas a reserva não cresceu.';
        finance.announce(outcome);
        return outcome;
      }

      const moved = finance.moveToReserve(20, 'Reserva Expressa', atSeconds);
      if (!moved) return 'O saldo não tinha R$20 disponíveis; a transferência para a reserva não aconteceu.';
      return 'R$20 saíram do saldo e foram para a reserva. O dinheiro continua seu, mas com outra função.';
    }

    if (id === 'credito-turbo') {
      if (choice === 2) {
        const outcome = 'Crédito Turbo recusado. Nenhum custo futuro foi criado.';
        finance.announce(outcome);
        return outcome;
      }

      finance.chargeDecisionExpense(30, 'Ativação do Crédito Turbo', atSeconds);
      finance.scheduleLapCommitment('Parcela do Crédito Turbo', 12, 2);
      vehicle.boostRemaining = Math.max(vehicle.boostRemaining, 7);
      finance.announce('Crédito Turbo ativo · 2 cobranças futuras de R$12');
      return 'Você ganhou 7 s de turbo e assumiu duas cobranças futuras de R$12, além dos R$30 pagos agora.';
    }

    if (choice === 2) {
      const outcome = 'Atalho Premium ignorado. O saldo foi preservado e não houve vantagem extra de velocidade.';
      finance.announce(outcome);
      return outcome;
    }

    finance.chargeDecisionExpense(25, 'Atalho Premium', atSeconds);
    vehicle.boostRemaining = Math.max(vehicle.boostRemaining, 4);
    finance.announce('Atalho Premium · R$25 por 4 s de turbo');
    return 'Você trocou R$25 de caixa por 4 s de turbo, sem criar parcelas futuras.';
  }
}
