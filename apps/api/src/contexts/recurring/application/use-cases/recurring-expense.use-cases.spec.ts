import { beforeEach, describe, expect, it } from 'vitest';

import { Currency } from '../../../../shared/domain/currency.vo';
import { Money } from '../../../../shared/domain/money.vo';
import { InMemoryRecurringExpenseRepository } from '../../../../../test/doubles/recurring.doubles';
import { InMemoryTransactionRepository } from '../../../../../test/doubles/ledger.doubles';
import { CalendarDate } from '../../../../shared/domain/calendar-date.vo';
import { Transaction } from '../../../ledger/domain/transaction.entity';

import { CreateRecurringExpenseUseCase } from './create-recurring-expense.use-case';
import { DeleteRecurringExpenseUseCase } from './delete-recurring-expense.use-case';
import { ListRecurringExpensesUseCase } from './list-recurring-expenses.use-case';
import { UpdateRecurringExpenseUseCase } from './update-recurring-expense.use-case';

const HOUSEHOLD = 'hh-1';
const NIO = Currency.NIO;
const date = (iso: string): CalendarDate => {
  const result = CalendarDate.fromISO(iso);
  if (!result.ok) throw result.error;
  return result.value;
};

describe('CreateRecurringExpenseUseCase', () => {
  let repo: InMemoryRecurringExpenseRepository;
  let useCase: CreateRecurringExpenseUseCase;

  beforeEach(() => {
    repo = new InMemoryRecurringExpenseRepository();
    useCase = new CreateRecurringExpenseUseCase(repo, { generate: () => `id-${Math.random()}` });
  });

  it('genera códigos F01, F02… secuenciales', async () => {
    const first = await useCase.execute({
      householdId: HOUSEHOLD,
      categoryId: 'cat-1',
      concept: 'Apoyo Casa',
      amount: Money.unsafe('2500', NIO),
      dueDay: 5,
      frequency: 'QUINCENAL',
    });
    const second = await useCase.execute({
      householdId: HOUSEHOLD,
      categoryId: 'cat-1',
      concept: 'Pasajes',
      amount: Money.unsafe('2400', NIO),
      dueDay: 1,
      frequency: 'QUINCENAL',
    });

    expect(first.ok && first.value.code).toBe('F01');
    expect(second.ok && second.value.code).toBe('F02');
  });

  it('deriva appliesTo automáticamente (RN-18)', async () => {
    const result = await useCase.execute({
      householdId: HOUSEHOLD,
      categoryId: 'cat-1',
      concept: 'Teléfono',
      amount: Money.unsafe('700', NIO),
      dueDay: 28,
      frequency: 'MENSUAL',
    });
    expect(result.ok && result.value.appliesTo).toBe('Q2');
  });

  it('rechaza un dueDay fuera de rango', async () => {
    const result = await useCase.execute({
      householdId: HOUSEHOLD,
      categoryId: 'cat-1',
      concept: 'X',
      amount: Money.unsafe('100', NIO),
      dueDay: 32,
      frequency: 'MENSUAL',
    });
    expect(result.ok).toBe(false);
  });

  it('rechaza un concepto duplicado', async () => {
    await useCase.execute({
      householdId: HOUSEHOLD,
      categoryId: 'cat-1',
      concept: 'Streaming',
      amount: Money.unsafe('400', NIO),
      dueDay: 12,
      frequency: 'QUINCENAL',
    });
    const dup = await useCase.execute({
      householdId: HOUSEHOLD,
      categoryId: 'cat-1',
      concept: 'Streaming',
      amount: Money.unsafe('400', NIO),
      dueDay: 12,
      frequency: 'QUINCENAL',
    });
    expect(dup.ok).toBe(false);
    if (!dup.ok) expect(dup.error.code).toBe('CONFLICT');
  });
});

describe('UpdateRecurringExpenseUseCase', () => {
  it('actualiza el importe sin cambiar el code (P11: id estable)', async () => {
    const repo = new InMemoryRecurringExpenseRepository();
    const create = new CreateRecurringExpenseUseCase(repo, { generate: () => 'exp-1' });
    const update = new UpdateRecurringExpenseUseCase(repo);

    const created = await create.execute({
      householdId: HOUSEHOLD,
      categoryId: 'cat-1',
      concept: 'Apoyo Casa',
      amount: Money.unsafe('2500', NIO),
      dueDay: 5,
      frequency: 'QUINCENAL',
    });
    if (!created.ok) throw created.error;

    const result = await update.execute({
      householdId: HOUSEHOLD,
      recurringExpenseId: created.value.id,
      amount: Money.unsafe('2700', NIO),
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.amount.toFixed()).toBe('2700.00');
      expect(result.value.code).toBe('F01');
    }
  });
});

describe('DeleteRecurringExpenseUseCase — RN-20', () => {
  it('borra físicamente un fijo sin movimientos', async () => {
    const repo = new InMemoryRecurringExpenseRepository();
    const txRepo = new InMemoryTransactionRepository(NIO);
    const create = new CreateRecurringExpenseUseCase(repo, { generate: () => 'exp-1' });
    const del = new DeleteRecurringExpenseUseCase(repo, txRepo);

    const created = await create.execute({
      householdId: HOUSEHOLD,
      categoryId: 'cat-1',
      concept: 'Apoyo Casa',
      amount: Money.unsafe('2500', NIO),
      dueDay: 5,
      frequency: 'QUINCENAL',
    });
    if (!created.ok) throw created.error;

    const result = await del.execute({ householdId: HOUSEHOLD, recurringExpenseId: created.value.id });
    expect(result.ok && result.value.kind).toBe('deleted');
    expect(await repo.findById(HOUSEHOLD, created.value.id)).toBeNull();
  });

  it('desactiva en vez de borrar si tiene movimientos asociados', async () => {
    const repo = new InMemoryRecurringExpenseRepository();
    const txRepo = new InMemoryTransactionRepository(NIO);
    const create = new CreateRecurringExpenseUseCase(repo, { generate: () => 'exp-1' });
    const del = new DeleteRecurringExpenseUseCase(repo, txRepo);

    const created = await create.execute({
      householdId: HOUSEHOLD,
      categoryId: 'cat-1',
      concept: 'Apoyo Casa',
      amount: Money.unsafe('2500', NIO),
      dueDay: 5,
      frequency: 'QUINCENAL',
    });
    if (!created.ok) throw created.error;

    await txRepo.save(
      Transaction.reconstitute({
        id: 'tx-1',
        householdId: HOUSEHOLD,
        date: date('2026-01-05'),
        periodId: 'period-1',
        type: 'FIJO',
        categoryId: 'cat-1',
        concept: 'Apoyo Casa',
        recurringExpenseId: created.value.id,
        savingsFundId: null,
        amount: Money.unsafe('2500', NIO),
        exchangeRate: Money.unsafe('1', NIO).toDecimal(),
        baseAmount: Money.unsafe('2500', NIO),
        paymentMethodId: null,
        status: 'PAGADO',
        notes: null,
        createdByUserId: 'user-1',
      })
    );

    const result = await del.execute({ householdId: HOUSEHOLD, recurringExpenseId: created.value.id });
    expect(result.ok).toBe(true);
    if (result.ok && result.value.kind === 'deactivated') {
      expect(result.value.expense.isActive).toBe(false);
    } else {
      throw new Error('se esperaba desactivación, no borrado');
    }

    // Sigue existiendo, solo inactivo: el histórico de movimientos no queda huérfano.
    expect(await repo.findById(HOUSEHOLD, created.value.id)).not.toBeNull();
  });
});

describe('ListRecurringExpensesUseCase', () => {
  it('ordena por code', async () => {
    const repo = new InMemoryRecurringExpenseRepository();
    let counter = 0;
    const create = new CreateRecurringExpenseUseCase(repo, { generate: () => `id-${++counter}` });

    await create.execute({
      householdId: HOUSEHOLD,
      categoryId: 'cat-1',
      concept: 'B',
      amount: Money.unsafe('100', NIO),
      dueDay: 1,
      frequency: 'QUINCENAL',
    });
    await create.execute({
      householdId: HOUSEHOLD,
      categoryId: 'cat-1',
      concept: 'A',
      amount: Money.unsafe('100', NIO),
      dueDay: 1,
      frequency: 'QUINCENAL',
    });

    const list = new ListRecurringExpensesUseCase(repo);
    const all = await list.execute({ householdId: HOUSEHOLD });
    expect(all.map((e) => e.code)).toEqual(['F01', 'F02']);
  });
});
