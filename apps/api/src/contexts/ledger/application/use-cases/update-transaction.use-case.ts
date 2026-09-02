import type { CalendarDate } from '../../../../shared/domain/calendar-date.vo';
import type { Clock } from '../../../../shared/domain/clock.port';
import { CurrencyConverter } from '../../../../shared/domain/currency-converter.service';
import { NotFoundError, type DomainError } from '../../../../shared/domain/domain-error';
import type { ExchangeRateProvider } from '../../../../shared/domain/exchange-rate-provider.port';
import type { Money } from '../../../../shared/domain/money.vo';
import { err, ok, type Result } from '../../../../shared/domain/result';
import type { PeriodRepository } from '../../../budget/domain/period.repository';
import type { CategoryRepository } from '../../../catalog/domain/category.repository';
import type { PaymentMethodRepository } from '../../../catalog/domain/payment-method.repository';
import { SavingsFundBalanceCalculator } from '../../../catalog/domain/savings-fund-balance-calculator.service';
import type { SavingsFundRepository } from '../../../catalog/domain/savings-fund.repository';
import type { HouseholdRepository } from '../../../iam/domain/household.repository';
import type { RecurringExpenseRepository } from '../../../recurring/domain/recurring-expense.repository';
import type { MovementType, TxStatus } from '../../domain/movement-type';
import { TransactionValidator, type ValidationContext } from '../../domain/transaction-validator.service';
import type { Transaction } from '../../domain/transaction.entity';
import type { TransactionRepository } from '../../domain/transaction.repository';

export interface UpdateTransactionCommand {
  householdId: string;
  transactionId: string;
  date?: CalendarDate;
  type?: MovementType;
  categoryId?: string;
  concept?: string;
  amount?: Money;
  status?: TxStatus;
  recurringExpenseId?: string | null;
  savingsFundId?: string | null;
  paymentMethodId?: string | null;
  notes?: string | null;
}

/**
 * `createdByUserId` no aparece en el comando a propósito (RN-45): es
 * inmutable, y `Transaction.update()` ya lo protege aunque alguien lo cuele.
 */
export class UpdateTransactionUseCase {
  constructor(
    private readonly transactions: TransactionRepository,
    private readonly households: HouseholdRepository,
    private readonly categories: CategoryRepository,
    private readonly paymentMethods: PaymentMethodRepository,
    private readonly recurringExpenses: RecurringExpenseRepository,
    private readonly savingsFunds: SavingsFundRepository,
    private readonly periods: PeriodRepository,
    private readonly exchangeRates: ExchangeRateProvider,
    private readonly clock: Clock
  ) {}

  async execute(command: UpdateTransactionCommand): Promise<Result<Transaction, DomainError>> {
    const existing = await this.transactions.findById(command.householdId, command.transactionId);
    if (!existing) {
      return err(new NotFoundError('El movimiento no existe', { transactionId: command.transactionId }));
    }

    const household = await this.households.findById(command.householdId);
    if (!household) {
      return err(new NotFoundError('El household no existe', { householdId: command.householdId }));
    }

    const date = command.date ?? existing.date;
    const type = command.type ?? existing.type;
    const categoryId = command.categoryId ?? existing.categoryId;
    const concept = (command.concept ?? existing.concept).trim();
    const amount = command.amount ?? existing.amount;
    const status = command.status ?? existing.status;
    const recurringExpenseId =
      command.recurringExpenseId === undefined ? existing.recurringExpenseId : command.recurringExpenseId;
    const savingsFundId =
      command.savingsFundId === undefined ? existing.savingsFundId : command.savingsFundId;
    const paymentMethodId =
      command.paymentMethodId === undefined ? existing.paymentMethodId : command.paymentMethodId;
    const notes = command.notes === undefined ? existing.notes : command.notes;

    if (categoryId !== existing.categoryId) {
      const category = await this.categories.findById(command.householdId, categoryId);
      if (!category) return err(new NotFoundError('La categoría no existe', { categoryId }));
    }
    if (paymentMethodId && paymentMethodId !== existing.paymentMethodId) {
      const paymentMethod = await this.paymentMethods.findById(command.householdId, paymentMethodId);
      if (!paymentMethod) {
        return err(new NotFoundError('El método de pago no existe', { paymentMethodId }));
      }
    }

    const context = await this.buildValidationContext({
      householdId: command.householdId,
      date,
      type,
      recurringExpenseId,
      savingsFundId,
      existing,
    });
    if (!context.ok) return context;

    const validated = TransactionValidator.validate(
      { date, type, categoryId, concept, amount, status, recurringExpenseId, savingsFundId },
      context.value
    );
    if (!validated.ok) return validated;

    const converter = new CurrencyConverter(this.exchangeRates);
    const conversion = await converter.recalculateOnEdit({
      householdId: command.householdId,
      baseCurrency: household.baseCurrency,
      previous: { date: existing.date, currency: existing.amount.currency, exchangeRate: existing.exchangeRate },
      next: { date, amount },
    });
    if (!conversion.ok) return conversion;

    const updated = existing.update(
      {
        date,
        periodId: validated.value.periodId,
        type,
        categoryId,
        concept,
        recurringExpenseId,
        savingsFundId,
        amount: conversion.value.original,
        exchangeRate: conversion.value.exchangeRate,
        baseAmount: conversion.value.baseAmount,
        paymentMethodId,
        status,
        notes,
      },
      this.clock.now()
    );

    await this.transactions.save(updated);
    return ok(updated);
  }

  private async buildValidationContext(params: {
    householdId: string;
    date: CalendarDate;
    type: MovementType;
    recurringExpenseId: string | null;
    savingsFundId: string | null;
    existing: Transaction;
  }): Promise<Result<ValidationContext, DomainError>> {
    const { householdId, date, type, recurringExpenseId, savingsFundId, existing } = params;

    const period = await this.periods.findByDate(householdId, date);

    let recurringExpenseExists = false;
    if (recurringExpenseId) {
      const expense = await this.recurringExpenses.findById(householdId, recurringExpenseId);
      recurringExpenseExists = expense !== null;
    }

    let savingsFundExists = false;
    let savingsFundBalance = null as ValidationContext['savingsFundBalance'];
    let savingsFundName: string | null = null;

    if (savingsFundId) {
      const fund = await this.savingsFunds.findById(householdId, savingsFundId);
      savingsFundExists = fund !== null;
      savingsFundName = fund?.name ?? null;

      if (fund && type === 'RETIRO_AHORRO') {
        const totals = await this.transactions.getSavingsFundTotals(householdId, fund.id);
        let balance = SavingsFundBalanceCalculator.balance(totals);

        // El propio movimiento que se edita ya está contado en `totals`. Si es
        // el mismo retiro del mismo fondo, hay que devolverle su importe
        // anterior al saldo antes de comprobar el nuevo: si no, cambiar solo la
        // fecha de un retiro fallaría "por saldo insuficiente" contra sí mismo.
        if (existing.type === 'RETIRO_AHORRO' && existing.savingsFundId === fund.id) {
          balance = balance.plus(existing.baseAmount);
        }

        savingsFundBalance = balance;
      }
    }

    return ok({
      budgetYear: date.year,
      resolvedPeriodId: period?.id ?? null,
      recurringExpenseExists,
      savingsFundExists,
      savingsFundBalance,
      savingsFundName,
    });
  }
}
