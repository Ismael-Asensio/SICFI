import { beforeEach, describe, expect, it } from 'vitest';

import { CalendarDate } from '../../../../shared/domain/calendar-date.vo';
import { Currency } from '../../../../shared/domain/currency.vo';
import { Money } from '../../../../shared/domain/money.vo';
import { InMemorySavingsFundRepository } from '../../../../../test/doubles/catalog.doubles';
import { InMemoryTransactionRepository } from '../../../../../test/doubles/ledger.doubles';
import { SequentialIdGenerator } from '../../../../../test/doubles/id-generator.double';
import { Transaction } from '../../../ledger/domain/transaction.entity';

import { CreateSavingsFundUseCase } from './create-savings-fund.use-case';
import { GetSavingsFundBalanceUseCase } from './get-savings-fund-balance.use-case';
import { ListSavingsFundsUseCase } from './list-savings-funds.use-case';
import { SetSavingsFundActiveUseCase } from './set-savings-fund-active.use-case';
import { UpdateSavingsFundUseCase } from './update-savings-fund.use-case';

const HOUSEHOLD = 'hh-1';
const NIO = Currency.NIO;
const c = (amount: string): Money => Money.unsafe(amount, NIO);
const date = (iso: string): CalendarDate => {
  const result = CalendarDate.fromISO(iso);
  if (!result.ok) throw result.error;
  return result.value;
};

describe('CreateSavingsFundUseCase', () => {
  let repo: InMemorySavingsFundRepository;
  let useCase: CreateSavingsFundUseCase;

  beforeEach(() => {
    repo = new InMemorySavingsFundRepository();
    useCase = new CreateSavingsFundUseCase(repo, new SequentialIdGenerator());
  });

  it('crea un fondo, no por defecto', async () => {
    const result = await useCase.execute({ householdId: HOUSEHOLD, name: 'Viaje', currency: NIO });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.isDefault).toBe(false);
  });

  it('rechaza una meta cero o negativa', async () => {
    const result = await useCase.execute({
      householdId: HOUSEHOLD,
      name: 'Viaje',
      currency: NIO,
      targetAmount: c('0'),
    });
    expect(result.ok).toBe(false);
  });

  it('rechaza un nombre duplicado', async () => {
    await useCase.execute({ householdId: HOUSEHOLD, name: 'Viaje', currency: NIO });
    const result = await useCase.execute({ householdId: HOUSEHOLD, name: 'Viaje', currency: NIO });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('CONFLICT');
  });
});

describe('UpdateSavingsFundUseCase', () => {
  it('actualiza nombre y meta', async () => {
    const repo = new InMemorySavingsFundRepository();
    const create = new CreateSavingsFundUseCase(repo, new SequentialIdGenerator());
    const update = new UpdateSavingsFundUseCase(repo);

    const created = await create.execute({ householdId: HOUSEHOLD, name: 'Viaje', currency: NIO });
    if (!created.ok) throw created.error;

    const result = await update.execute({
      householdId: HOUSEHOLD,
      savingsFundId: created.value.id,
      targetAmount: c('20000'),
      targetDate: date('2026-12-31'),
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.targetAmount?.toFixed()).toBe('20000.00');
      expect(result.value.targetDate?.toISO()).toBe('2026-12-31');
    }
  });
});

describe('SetSavingsFundActiveUseCase — protege el fondo por defecto (RN-39)', () => {
  it('rechaza desactivar el fondo por defecto', async () => {
    const repo = new InMemorySavingsFundRepository();
    const create = new CreateSavingsFundUseCase(repo, new SequentialIdGenerator());
    const setActive = new SetSavingsFundActiveUseCase(repo);

    const created = await create.execute({ householdId: HOUSEHOLD, name: 'Fondo general', currency: NIO });
    if (!created.ok) throw created.error;

    // El caso de uso de creación nunca marca isDefault; se simula el estado
    // que deja BootstrapUserUseCase guardando la entidad ya marcada.
    await repo.save(created.value.with({ isDefault: true }));

    const result = await setActive.execute({
      householdId: HOUSEHOLD,
      savingsFundId: created.value.id,
      isActive: false,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.details.rule).toBe('RN-39');
  });

  it('permite desactivar un fondo que no es el por defecto', async () => {
    const repo = new InMemorySavingsFundRepository();
    const create = new CreateSavingsFundUseCase(repo, new SequentialIdGenerator());
    const setActive = new SetSavingsFundActiveUseCase(repo);

    const created = await create.execute({ householdId: HOUSEHOLD, name: 'Viaje', currency: NIO });
    if (!created.ok) throw created.error;

    const result = await setActive.execute({
      householdId: HOUSEHOLD,
      savingsFundId: created.value.id,
      isActive: false,
    });
    expect(result.ok).toBe(true);
  });
});

describe('ListSavingsFundsUseCase', () => {
  it('lista los fondos del household', async () => {
    const repo = new InMemorySavingsFundRepository();
    const create = new CreateSavingsFundUseCase(repo, new SequentialIdGenerator());
    const list = new ListSavingsFundsUseCase(repo);

    await create.execute({ householdId: HOUSEHOLD, name: 'Viaje', currency: NIO });
    await create.execute({ householdId: HOUSEHOLD, name: 'Imprevistos', currency: NIO });

    expect((await list.execute({ householdId: HOUSEHOLD })).map((f) => f.name).sort()).toEqual([
      'Imprevistos',
      'Viaje',
    ]);
  });
});

describe('GetSavingsFundBalanceUseCase — cruce catalog + ledger', () => {
  it('calcula el saldo, el progreso y lo que falta para la meta', async () => {
    const fundsRepo = new InMemorySavingsFundRepository();
    const txRepo = new InMemoryTransactionRepository(NIO);
    const create = new CreateSavingsFundUseCase(fundsRepo, new SequentialIdGenerator());
    const getBalance = new GetSavingsFundBalanceUseCase(fundsRepo, txRepo);

    const created = await create.execute({
      householdId: HOUSEHOLD,
      name: 'Viaje',
      currency: NIO,
      targetAmount: c('10000'),
    });
    if (!created.ok) throw created.error;

    const seedTx = (type: 'AHORRO' | 'RETIRO_AHORRO', amount: string): Transaction =>
      Transaction.reconstitute({
        id: `tx-${type}-${amount}`,
        householdId: HOUSEHOLD,
        date: date('2026-03-10'),
        periodId: 'period-1',
        type,
        categoryId: 'cat-ahorro',
        concept: 'Ahorro',
        recurringExpenseId: null,
        savingsFundId: created.value.id,
        amount: c(amount),
        exchangeRate: c('1').toDecimal(),
        baseAmount: c(amount),
        paymentMethodId: null,
        status: 'PAGADO',
        notes: null,
        createdByUserId: 'user-1',
      });

    await txRepo.save(seedTx('AHORRO', '1500'));
    await txRepo.save(seedTx('RETIRO_AHORRO', '1400'));

    const result = await getBalance.execute({ householdId: HOUSEHOLD, savingsFundId: created.value.id });

    expect(result.ok).toBe(true);
    if (result.ok) {
      // RN-41b: el saldo neto es 100, no 1 500.
      expect(result.value.balance.toFixed()).toBe('100.00');
      expect(result.value.progress?.toNumber()).toBeCloseTo(0.01, 10);
      expect(result.value.remainingToTarget?.toFixed()).toBe('9900.00');
    }
  });

  it('devuelve NotFoundError si el fondo no existe', async () => {
    const fundsRepo = new InMemorySavingsFundRepository();
    const txRepo = new InMemoryTransactionRepository(NIO);
    const getBalance = new GetSavingsFundBalanceUseCase(fundsRepo, txRepo);

    const result = await getBalance.execute({ householdId: HOUSEHOLD, savingsFundId: 'no-existe' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('NOT_FOUND');
  });
});
