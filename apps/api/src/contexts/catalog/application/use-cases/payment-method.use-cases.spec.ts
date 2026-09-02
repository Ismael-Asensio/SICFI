import { beforeEach, describe, expect, it } from 'vitest';

import { InMemoryPaymentMethodRepository } from '../../../../../test/doubles/catalog.doubles';
import { SequentialIdGenerator } from '../../../../../test/doubles/id-generator.double';
import { PaymentMethod } from '../../domain/payment-method.entity';

import { CreatePaymentMethodUseCase } from './create-payment-method.use-case';
import { DeletePaymentMethodUseCase } from './delete-payment-method.use-case';
import { ListPaymentMethodsUseCase } from './list-payment-methods.use-case';
import { SetPaymentMethodActiveUseCase } from './set-payment-method-active.use-case';
import { UpdatePaymentMethodUseCase } from './update-payment-method.use-case';

const HOUSEHOLD = 'hh-1';

describe('CreatePaymentMethodUseCase', () => {
  let repo: InMemoryPaymentMethodRepository;
  let useCase: CreatePaymentMethodUseCase;

  beforeEach(() => {
    repo = new InMemoryPaymentMethodRepository();
    useCase = new CreatePaymentMethodUseCase(repo, new SequentialIdGenerator());
  });

  it('crea un método de pago nuevo, no de sistema', async () => {
    const result = await useCase.execute({ householdId: HOUSEHOLD, name: 'Cheque' });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.name).toBe('Cheque');
      expect(result.value.isSystem).toBe(false);
    }
  });

  it('rechaza nombre vacío y nombre duplicado', async () => {
    expect((await useCase.execute({ householdId: HOUSEHOLD, name: '  ' })).ok).toBe(false);
    await useCase.execute({ householdId: HOUSEHOLD, name: 'Cheque' });
    const dup = await useCase.execute({ householdId: HOUSEHOLD, name: 'Cheque' });
    expect(dup.ok).toBe(false);
    if (!dup.ok) expect(dup.error.code).toBe('CONFLICT');
  });
});

describe('UpdatePaymentMethodUseCase', () => {
  it('renombra y detecta NotFound / conflicto', async () => {
    const repo = new InMemoryPaymentMethodRepository();
    const create = new CreatePaymentMethodUseCase(repo, new SequentialIdGenerator());
    const update = new UpdatePaymentMethodUseCase(repo);

    const created = await create.execute({ householdId: HOUSEHOLD, name: 'Cheque' });
    if (!created.ok) throw created.error;

    const renamed = await update.execute({
      householdId: HOUSEHOLD,
      paymentMethodId: created.value.id,
      name: 'Cheque bancario',
    });
    expect(renamed.ok && renamed.value.name).toBe('Cheque bancario');

    const missing = await update.execute({ householdId: HOUSEHOLD, paymentMethodId: 'no-existe' });
    expect(missing.ok).toBe(false);
    if (!missing.ok) expect(missing.error.code).toBe('NOT_FOUND');
  });
});

describe('SetPaymentMethodActiveUseCase y DeletePaymentMethodUseCase', () => {
  it('activa/desactiva y borra un método creado por el usuario', async () => {
    const repo = new InMemoryPaymentMethodRepository();
    const create = new CreatePaymentMethodUseCase(repo, new SequentialIdGenerator());
    const setActive = new SetPaymentMethodActiveUseCase(repo);
    const del = new DeletePaymentMethodUseCase(repo);

    const created = await create.execute({ householdId: HOUSEHOLD, name: 'Cheque' });
    if (!created.ok) throw created.error;

    await setActive.execute({ householdId: HOUSEHOLD, paymentMethodId: created.value.id, isActive: false });
    expect((await repo.findById(HOUSEHOLD, created.value.id))?.isActive).toBe(false);

    const deleted = await del.execute({ householdId: HOUSEHOLD, paymentMethodId: created.value.id });
    expect(deleted.ok).toBe(true);
    expect(await repo.findById(HOUSEHOLD, created.value.id)).toBeNull();
  });

  it('rechaza borrar un método del sistema', async () => {
    const repo = new InMemoryPaymentMethodRepository();
    await repo.save(
      new PaymentMethod({
        id: 'system-1',
        householdId: HOUSEHOLD,
        name: 'Efectivo',
        isSystem: true,
        isActive: true,
        sortOrder: 0,
      })
    );

    const del = new DeletePaymentMethodUseCase(repo);
    const result = await del.execute({ householdId: HOUSEHOLD, paymentMethodId: 'system-1' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('BUSINESS_RULE_VIOLATION');
  });
});

describe('ListPaymentMethodsUseCase', () => {
  it('ordena por sortOrder', async () => {
    const repo = new InMemoryPaymentMethodRepository();
    const create = new CreatePaymentMethodUseCase(repo, new SequentialIdGenerator());
    const list = new ListPaymentMethodsUseCase(repo);

    await create.execute({ householdId: HOUSEHOLD, name: 'B', sortOrder: 2 });
    await create.execute({ householdId: HOUSEHOLD, name: 'A', sortOrder: 1 });

    const all = await list.execute({ householdId: HOUSEHOLD });
    expect(all.map((p) => p.name)).toEqual(['A', 'B']);
  });
});
