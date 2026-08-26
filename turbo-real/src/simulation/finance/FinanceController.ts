import type { TrackEconomyConfig } from '../../track/firstTrack';
import type { RaceState } from '../RaceController';
import type { FinancialState, FinancialTransactionKind } from './types';

export type FinanceInputAction = 'save' | 'withdraw';

const TRANSFER_AMOUNT = 10;
const TRANSFER_COOLDOWN = 0.28;
const MESSAGE_SECONDS = 2.8;
const FINISH_PRIZES = [80, 68, 58, 48, 40, 34, 28, 24] as const;

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

export class FinanceController {
  private lastCheckpointsPassed: number;
  private lastCompletedLaps: number;

  constructor(
    private readonly state: FinancialState,
    race: RaceState,
    private readonly economy: TrackEconomyConfig,
  ) {
    this.lastCheckpointsPassed = race.checkpointsPassed;
    this.lastCompletedLaps = race.completedLaps;
  }

  advance(deltaSeconds: number, action: FinanceInputAction | null, race: RaceState): void {
    const dt = Math.min(Math.max(deltaSeconds, 0), 0.1);
    this.state.transferCooldown = Math.max(0, this.state.transferCooldown - dt);
    this.state.messageRemaining = Math.max(0, this.state.messageRemaining - dt);

    if (!race.finished && action !== null) this.handleTransfer(action, race.raceTimeSeconds);

    if (race.completedLaps === this.lastCompletedLaps && race.checkpointsPassed > this.lastCheckpointsPassed) {
      const passed = race.checkpointsPassed - this.lastCheckpointsPassed;
      this.addIncome(
        passed * this.economy.checkpointIncome,
        'Renda por setor',
        'income',
        race.raceTimeSeconds,
      );
    }

    if (race.completedLaps > this.lastCompletedLaps) {
      const completedNow = race.completedLaps - this.lastCompletedLaps;
      for (let index = 0; index < completedNow; index += 1) {
        this.payRoutineExpense(
          this.economy.lapOperatingCost,
          'Custo operacional da volta',
          race.raceTimeSeconds,
        );
        this.processCommitments(race.raceTimeSeconds);
        this.applyDebtInterest(race.raceTimeSeconds);
      }
    }

    if (!this.state.unexpectedExpenseHandled && race.completedLaps === 1 && race.checkpointsPassed >= 2) {
      this.payEmergencyExpense(
        this.economy.emergencyCost,
        this.economy.emergencyLabel,
        race.raceTimeSeconds,
      );
      this.state.unexpectedExpenseHandled = true;
    }

    if (race.finished && !this.state.finishAwarded) {
      const prize = FINISH_PRIZES[Math.min(Math.max(race.position, 1), FINISH_PRIZES.length) - 1];
      this.addIncome(prize, `Prêmio de ${race.position}º lugar`, 'prize', race.raceTimeSeconds);
      this.state.finishAwarded = true;
    }

    this.lastCheckpointsPassed = race.checkpointsPassed;
    this.lastCompletedLaps = race.completedLaps;
  }

  moveToReserve(amount: number, label: string, atSeconds: number): boolean {
    const safeAmount = roundMoney(Math.max(0, amount));
    if (safeAmount <= 0) return true;
    if (this.state.balance < safeAmount) {
      this.message(`Saldo insuficiente para ${label.toLowerCase()}`);
      return false;
    }

    this.state.balance = roundMoney(this.state.balance - safeAmount);
    this.state.reserve = roundMoney(this.state.reserve + safeAmount);
    this.record('decision-save', label, -safeAmount, atSeconds);
    this.message(`${label} · ${this.money(safeAmount)} na reserva`);
    return true;
  }

  chargeDecisionExpense(amount: number, label: string, atSeconds: number): void {
    const safeAmount = roundMoney(Math.max(0, amount));
    if (safeAmount <= 0) return;
    const debtCreated = this.payFromBalanceThenDebt(safeAmount);
    this.state.totalExpenses = roundMoney(this.state.totalExpenses + safeAmount);
    this.state.totalDecisionCosts = roundMoney(this.state.totalDecisionCosts + safeAmount);
    this.record('decision-expense', label, -safeAmount, atSeconds);
    this.message(
      debtCreated > 0
        ? `${label} · ${this.money(debtCreated)} viraram dívida`
        : `${label} · -${this.money(safeAmount)}`,
    );
  }

  scheduleLapCommitment(label: string, amountPerLap: number, charges: number): void {
    const safeAmount = roundMoney(Math.max(0, amountPerLap));
    const safeCharges = Math.max(0, Math.floor(charges));
    if (safeAmount <= 0 || safeCharges <= 0) return;

    this.state.commitments.push({
      id: this.state.nextCommitmentId,
      label,
      amountPerLap: safeAmount,
      remainingCharges: safeCharges,
    });
    this.state.nextCommitmentId += 1;
  }

  announce(text: string): void {
    this.message(text);
  }

  private handleTransfer(action: FinanceInputAction, atSeconds: number): void {
    if (this.state.transferCooldown > 0) return;
    this.state.transferCooldown = TRANSFER_COOLDOWN;

    if (action === 'save') {
      if (this.state.balance < TRANSFER_AMOUNT) {
        this.message('Saldo insuficiente para guardar R$10');
        return;
      }
      this.state.balance = roundMoney(this.state.balance - TRANSFER_AMOUNT);
      this.state.reserve = roundMoney(this.state.reserve + TRANSFER_AMOUNT);
      this.record('save', 'Transferência para reserva', -TRANSFER_AMOUNT, atSeconds);
      this.message('R$10 guardados na reserva');
      return;
    }

    if (this.state.reserve < TRANSFER_AMOUNT) {
      this.message('Reserva insuficiente para retirar R$10');
      return;
    }
    this.state.reserve = roundMoney(this.state.reserve - TRANSFER_AMOUNT);
    this.state.balance = roundMoney(this.state.balance + TRANSFER_AMOUNT);
    this.record('withdraw', 'Retirada da reserva', TRANSFER_AMOUNT, atSeconds);
    this.message('R$10 voltaram para o saldo');
  }

  private addIncome(amount: number, label: string, kind: 'income' | 'prize', atSeconds: number): void {
    this.state.balance = roundMoney(this.state.balance + amount);
    this.state.totalIncome = roundMoney(this.state.totalIncome + amount);
    this.record(kind, label, amount, atSeconds);
    this.message(`+R$${amount} · ${label}`);
  }

  private payRoutineExpense(amount: number, label: string, atSeconds: number): void {
    const debtCreated = this.payFromBalanceThenDebt(amount);
    this.state.totalExpenses = roundMoney(this.state.totalExpenses + amount);
    this.record('routine-expense', label, -amount, atSeconds);
    this.message(
      debtCreated > 0
        ? `${this.money(debtCreated)} viraram dívida`
        : `-${this.money(amount)} · custo da volta`,
    );
  }

  private payEmergencyExpense(amount: number, label: string, atSeconds: number): void {
    let remaining = amount;
    const fromReserve = Math.min(this.state.reserve, remaining);
    this.state.reserve = roundMoney(this.state.reserve - fromReserve);
    this.state.protectedByReserve = roundMoney(this.state.protectedByReserve + fromReserve);
    remaining = roundMoney(remaining - fromReserve);

    const fromBalance = Math.min(this.state.balance, remaining);
    this.state.balance = roundMoney(this.state.balance - fromBalance);
    remaining = roundMoney(remaining - fromBalance);
    if (remaining > 0) this.state.debt = roundMoney(this.state.debt + remaining);

    this.state.totalExpenses = roundMoney(this.state.totalExpenses + amount);
    this.record('emergency', label, -amount, atSeconds);
    this.message(
      fromReserve > 0
        ? `${label} ${this.money(amount)} · reserva cobriu ${this.money(fromReserve)}`
        : `${label} ${this.money(amount)} sem reserva disponível`,
    );
  }

  private processCommitments(atSeconds: number): void {
    for (const commitment of this.state.commitments) {
      if (commitment.remainingCharges <= 0) continue;
      const debtCreated = this.payFromBalanceThenDebt(commitment.amountPerLap);
      commitment.remainingCharges -= 1;
      this.state.totalExpenses = roundMoney(this.state.totalExpenses + commitment.amountPerLap);
      this.state.totalDecisionCosts = roundMoney(this.state.totalDecisionCosts + commitment.amountPerLap);
      this.record('installment', commitment.label, -commitment.amountPerLap, atSeconds);
      this.message(
        debtCreated > 0
          ? `${commitment.label} · ${this.money(debtCreated)} viraram dívida`
          : `${commitment.label} · -${this.money(commitment.amountPerLap)}`,
      );
    }
    this.state.commitments = this.state.commitments.filter((commitment) => commitment.remainingCharges > 0);
  }

  private applyDebtInterest(atSeconds: number): void {
    if (this.state.debt <= 0) return;
    const interest = roundMoney(this.state.debt * this.economy.debtInterestRate);
    if (interest <= 0) return;
    this.state.debt = roundMoney(this.state.debt + interest);
    this.state.totalInterest = roundMoney(this.state.totalInterest + interest);
    this.state.totalExpenses = roundMoney(this.state.totalExpenses + interest);
    this.record('interest', 'Juros simulados da dívida', -interest, atSeconds);
    this.message(`Dívida recebeu R$${interest.toFixed(2)} de juros simulados`);
  }

  private payFromBalanceThenDebt(amount: number): number {
    let remaining = roundMoney(amount);
    const fromBalance = Math.min(this.state.balance, remaining);
    this.state.balance = roundMoney(this.state.balance - fromBalance);
    remaining = roundMoney(remaining - fromBalance);
    if (remaining > 0) this.state.debt = roundMoney(this.state.debt + remaining);
    return remaining;
  }

  private message(text: string): void {
    this.state.lastMessage = text;
    this.state.messageRemaining = MESSAGE_SECONDS;
  }

  private money(amount: number): string {
    return `R$${roundMoney(amount).toFixed(2).replace('.', ',')}`;
  }

  private record(kind: FinancialTransactionKind, label: string, amount: number, atSeconds: number): void {
    this.state.transactions.push({
      id: this.state.nextTransactionId,
      atSeconds,
      kind,
      label,
      amount: roundMoney(amount),
      balanceAfter: this.state.balance,
      reserveAfter: this.state.reserve,
      debtAfter: this.state.debt,
    });
    this.state.nextTransactionId += 1;
    if (this.state.transactions.length > 24) this.state.transactions.shift();
  }
}
