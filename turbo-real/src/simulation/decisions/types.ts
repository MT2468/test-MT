export type DecisionId = 'reserva-expressa' | 'credito-turbo' | 'atalho-premium';
export type DecisionChoice = 1 | 2;

export interface DecisionOption {
  readonly choice: DecisionChoice;
  readonly title: string;
  readonly detail: string;
  readonly accent: 'safe' | 'risk' | 'neutral';
}

export interface ActiveDecision {
  readonly id: DecisionId;
  readonly kicker: string;
  readonly title: string;
  readonly context: string;
  readonly options: readonly [DecisionOption, DecisionOption];
}

export interface DecisionRecord {
  readonly id: DecisionId;
  readonly atSeconds: number;
  readonly choice: DecisionChoice;
  readonly optionTitle: string;
  readonly outcome: string;
}

export interface DecisionState {
  active: ActiveDecision | null;
  resolvedIds: DecisionId[];
  history: DecisionRecord[];
  lastOutcome: string;
  outcomeRemaining: number;
}

export function createInitialDecisionState(): DecisionState {
  return {
    active: null,
    resolvedIds: [],
    history: [],
    lastOutcome: '',
    outcomeRemaining: 0,
  };
}
