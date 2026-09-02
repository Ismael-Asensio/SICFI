import type { CalendarDate } from '../../../../shared/domain/calendar-date.vo';
import type { Clock } from '../../../../shared/domain/clock.port';
import { CurrencyConverter } from '../../../../shared/domain/currency-converter.service';
import { NotFoundError, type DomainError } from '../../../../shared/domain/domain-error';
import type { ExchangeRateProvider } from '../../../../shared/domain/exchange-rate-provider.port';
import type { IdGenerator } from '../../../../shared/domain/id-generator.port';
import type { Money } from '../../../../shared/domain/money.vo';
import { err, ok, type Result } from '../../../../shared/domain/result';
import { SavingsFundBalanceCalculator } from '../../../catalog/domain/savings-fund-balance-calculator.service';
import type { CategoryRepository } from '../../../catalog/domain/category.repository';
import type { PaymentMethodRepository } from '../../../catalog/domain/payment-method.repository';
import type { SavingsFundRepository } from '../../../catalog/domain/savings-fund.repository';
import type { PeriodRepository } from '../../../budget/domain/period.repository';
import type { RecurringExpenseRepository } from '../../../recurring/domain/recurring-expense.repository';
import type { HouseholdRepository } from '../../../iam/domain/household.repository';
import type { MovementType, TxStatus } from '../../domain/movement-type';
import { Transaction } from '../../domain/transaction.entity';
import type { TransactionRepository } from '../../domain/transaction.repository';
import { TransactionValidator, type ValidationContext } from '../../domain/transaction-validator.service';

export interface RegisterTransactionCommand {
  householdId: string;
  createdByUserId: string;
  date: CalendarDate;
  type: MovementType;
  categoryId: string;
  concept: string;
  /** En la moneda que lo capturó el usuario — no necesariamente la base. */
  amount: Money;
  status: TxStatus;
  recurringExpenseId?: string | null;
  savingsFundId?: string | null;
  paymentMethodId?: string | null;
  notes?: string | null;
}

/**
 * El caso de uso más completo del sistema: resuelve todas las FK, deriva la
 * quincena (RN-29), convierte a moneda base (RN-36, RN-37), valida la cascada
 * completa (RN-25..RN-29, RN-39, RN-41) y solo entonces persiste.
 *
 * Todas las comprobaciones de existencia ocurren ANTES de `TransactionValidator`
 * a propósito: así el validador —dominio puro, sin I/O— solo recibe hechos ya
 * resueltos y se puede seguir probando con dobles, sin tocar la base.
 */
export class RegisterTransactionUseCase {
  constructor(
    private readonly transactions: TransactionRepository,
    private readonly households: HouseholdRepository,
    private readonly categories: CategoryRepository,
    private readonly paymentMethods: PaymentMethodRepository,
    private readonly recurringExpenses: RecurringExpenseRepository,
    private readonly savingsFunds: SavingsFundRepository,
    private readonly periods: PeriodRepository,
    private readonly exchangeRates: ExchangeRateProvider,
    private readonly ids: IdGenerator,
    private readonly clock: Clock
  ) {}

  async execute(command: RegisterTransactionCommand): Promise<Result<Transaction, DomainError>> {
    const household = await this.households.findById(command.householdId);
    if (!household) {
      return err(new NotFoundError('El household no existe', { householdId: command.householdId }));
    }

    const category = await this.categories.findById(command.householdId, command.categoryId);
    if (!category) {
      return err(new NotFoundError('La categoría no existe', { categoryId: command.categoryId }));
    }

    if (command.paymentMethodId) {
      const paymentMethod = await this.paymentMethods.findById(
        command.householdId,
        command.paymentMethodId
      );
      if (!paymentMethod) {
        return err(
          new NotFoundError('El método de pago no existe', { paymentMethodId: command.paymentMethodId })
        );
      }
    }

    const context = await this.buildValidationContext(command);
    if (!context.ok) return context;

    const validated = TransactionValidator.validate(
      {
        date: command.date,
        type: command.type,
        categoryId: command.categoryId,
        concept: command.concept,
        amount: command.amount,
        status: command.status,
        recurringExpenseId: command.recurringExpenseId ?? null,
        savingsFundId: command.savingsFundId ?? null,
      },
      context.value
    );
    if (!validated.ok) return validated;

    const converter = new CurrencyConverter(this.exchangeRates);
    const conversion = await converter.toBaseCurrency({
      householdId: command.householdId,
      amount: command.amount,
      baseCurrency: household.baseCurrency,
      date: command.date,
    });
    if (!conversion.ok) return conversion;

    const transaction = Transaction.register(
      {
        id: this.ids.generate(),
        householdId: command.householdId,
        date: command.date,
        periodId: validated.value.periodId,
        type: command.type,
        categoryId: command.categoryId,
        concept: command.concept.trim(),
        recurringExpenseId: command.recurringExpenseId ?? null,
        savingsFundId: command.savingsFundId ?? null,
        amount: conversion.value.original,
        exchangeRate: conversion.value.exchangeRate,
        baseAmount: conversion.value.baseAmount,
        paymentMethodId: command.paymentMethodId ?? null,
        status: command.status,
        notes: command.notes ?? null,
        createdByUserId: command.createdByUserId,
      },
      this.clock.now()
    );

    await this.transactions.save(transaction);
    return ok(transaction);
  }

  private async buildValidationContext(
    command: RegisterTransactionCommand
  ): Promise<Result<ValidationContext, DomainError>> {
    const period = await this.periods.findByDate(command.householdId, command.date);

    let recurringExpenseExists = false;
    if (command.recurringExpenseId) {
      const expense = await this.recurringExpenses.findById(
        command.householdId,
        command.recurringExpenseId
      );
      recurringExpenseExists = expense !== null;
    }

    let savingsFundExists = false;
    let savingsFundBalance = null as ValidationContext['savingsFundBalance'];
    let savingsFundName: string | null = null;

    if (command.savingsFundId) {
      const fund = await this.savingsFunds.findById(command.householdId, command.savingsFundId);
      savingsFundExists = fund !== null;
      savingsFundName = fund?.name ?? null;

      // RN-41 solo importa para un retiro; para un aporte, cualquier saldo es válido.
      if (fund && command.type === 'RETIRO_AHORRO') {
        const totals = await this.transactions.getSavingsFundTotals(command.householdId, fund.id);
        savingsFundBalance = SavingsFundBalanceCalculator.balance(totals);
      }
    }

    return ok({
      budgetYear: command.date.year,
      resolvedPeriodId: period?.id ?? null,
      recurringExpenseExists,
      savingsFundExists,
      savingsFundBalance,
      savingsFundName,
    });
  }
}
