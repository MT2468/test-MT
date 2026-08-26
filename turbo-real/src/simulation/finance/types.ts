export type FinancialTransactionKind =
  | 'income'
  | 'routine-expense'
  | 'emergency'
  | 'interest'
  | 'save'
  | 'withdraw'
  | 'prize'
  | 'decision-expense'
  | 'decision-save'
  | 'installment';

export interface FinancialTransaction {
  readonly id: number;
  readonly atSeconds: number;
  readonly kind: FinancialTransactionKind;
  readonly label: string;
  readonly amount: number;
  readonly balanceAfter: number;
  readonly reserveAfter: number;
  readonly debtAfter: number;
}

export interface FinancialCommitment {
  readonly id: number;
  readonly label: string;
  readonly amountPerLap: number;
  remainingCharges: number;
}

export interface FinancialState {
  balance: number;
  reserve: number;
  debt: number;
  readonly startingBalance: number;
  readonly startingReserve: number;
  totalIncome: number;
  totalExpenses: number;
  totalInterest: number;
  totalDecisionCosts: number;
  protectedByReserve: number;
  transferCooldown: number;
  lastMessage: string;
  messageRemaining: number;
  unexpectedExpenseHandled: boolean;
  finishAwarded: boolean;
  nextTransactionId: number;
  nextCommitmentId: number;
  transactions: FinancialTransaction[];
  commitments: FinancialCommitment[];
}

export function createInitialFinancialState(): FinancialState {
  return {
    balance: 120,
    reserve: 20,
    debt: 0,
    startingBalance: 120,
    startingReserve: 20,
    totalIncome: 0,
    totalExpenses: 0,
    totalInterest: 0,
    totalDecisionCosts: 0,
    protectedByReserve: 0,
    transferCooldown: 0,
    lastMessage: 'E guarda R$10 · Q retira R$10',
    messageRemaining: 5,
    unexpectedExpenseHandled: false,
    finishAwarded: false,
    nextTransactionId: 1,
    nextCommitmentId: 1,
    transactions: [],
    commitments: [],
  };
}

export function calculateNetWorth(state: FinancialState): number {
  return state.balance + state.reserve - state.debt;
}

export function calculateOutstandingCommitments(state: FinancialState): number {
  return state.commitments.reduce(
    (total, commitment) => total + commitment.amountPerLap * commitment.remainingCharges,
    0,
  );
}
