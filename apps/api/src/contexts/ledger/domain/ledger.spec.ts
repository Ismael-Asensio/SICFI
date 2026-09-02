import { describe, expect, it } from 'vitest';

import { CalendarDate } from '../../../shared/domain/calendar-date.vo';
import { Currency } from '../../../shared/domain/currency.vo';
import { Money } from '../../../shared/domain/money.vo';

import { MovementTypes, type MovementType } from './movement-type';
import {
  TransactionValidator,
  type TransactionDraft,
  type ValidationContext,
} from './transaction-validator.service';

const NIO = Currency.NIO;
const USD = Currency.USD;
const c = (amount: string | number): Money => Money.unsafe(amount, NIO);
const date = (iso: string): CalendarDate => {
  const result = CalendarDate.fromISO(iso);
  if (!result.ok) throw result.error;
  return result.value;
};

describe('MovementTypes — clasificación (RN-25, RN-08)', () => {
  it('los ingresos extra y los retiros suman al disponible', () => {
    expect(MovementTypes.isInflow('INGRESO_EXTRA')).toBe(true);
    expect(MovementTypes.isInflow('RETIRO_AHORRO')).toBe(true);
    expect(MovementTypes.isInflow('FIJO')).toBe(false);
  });

  it('solo FIJO y VARIABLE son gasto real — el ahorro no (D3)', () => {
    expect(MovementTypes.isRealSpend('FIJO')).toBe(true);
    expect(MovementTypes.isRealSpend('VARIABLE')).toBe(true);
    expect(MovementTypes.isRealSpend('AHORRO')).toBe(false);
    expect(MovementTypes.isRealSpend('RETIRO_AHORRO')).toBe(false);
    expect(MovementTypes.isRealSpend('INGRESO_EXTRA')).toBe(false);
  });

  it('el ahorro sale del disponible aunque no sea gasto', () => {
    expect(MovementTypes.isOutflow('AHORRO')).toBe(true);
    expect(MovementTypes.isRealSpend('AHORRO')).toBe(false);
  });

  it('solo el ahorro exige fondo y solo FIJO exige gasto fijo', () => {
    expect(MovementTypes.requiresSavingsFund('AHORRO')).toBe(true);
    expect(MovementTypes.requiresSavingsFund('RETIRO_AHORRO')).toBe(true);
    expect(MovementTypes.requiresSavingsFund('VARIABLE')).toBe(false);
    expect(MovementTypes.requiresRecurringExpense('FIJO')).toBe(true);
    expect(MovementTypes.requiresRecurringExpense('VARIABLE')).toBe(false);
  });
});

// ─────────────────────── TransactionValidator ───────────────────────

function draft(overrides: Partial<TransactionDraft> = {}): TransactionDraft {
  return {
    date: date('2026-03-10'),
    type: 'VARIABLE',
    categoryId: 'cat-1',
    concept: 'Supermercado',
    amount: c('500'),
    status: 'PAGADO',
    recurringExpenseId: null,
    savingsFundId: null,
    ...overrides,
  };
}

function context(overrides: Partial<ValidationContext> = {}): ValidationContext {
  return {
    budgetYear: 2026,
    resolvedPeriodId: 'period-5',
    recurringExpenseExists: true,
    savingsFundExists: true,
    savingsFundBalance: null,
    savingsFundName: null,
    ...overrides,
  };
}

describe('TransactionValidator — importe y campos (RN-28, RN-25)', () => {
  it('acepta un movimiento válido', () => {
    const result = TransactionValidator.validate(draft(), context());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.periodId).toBe('period-5');
      expect(result.value.isRealSpend).toBe(true);
    }
  });

  it('rechaza importe cero o negativo (RN-28)', () => {
    expect(TransactionValidator.validate(draft({ amount: c('0') }), context()).ok).toBe(false);
    expect(TransactionValidator.validate(draft({ amount: c('-100') }), context()).ok).toBe(false);
  });

  it('rechaza concepto y categoría vacíos', () => {
    expect(TransactionValidator.validate(draft({ concept: '   ' }), context()).ok).toBe(false);
    expect(TransactionValidator.validate(draft({ categoryId: '' }), context()).ok).toBe(false);
  });
});

describe('TransactionValidator — quincena derivada (RN-03, RN-29)', () => {
  it('rechaza una fecha fuera del año configurado', () => {
    const result = TransactionValidator.validate(
      draft({ date: date('2025-12-31') }),
      context({ resolvedPeriodId: null })
    );

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.message).toContain('fuera del año configurado');
  });

  it('acepta el 31 de diciembre y el 1 de enero dentro de su año', () => {
    expect(
      TransactionValidator.validate(draft({ date: date('2026-12-31') }), context()).ok
    ).toBe(true);
    expect(
      TransactionValidator.validate(draft({ date: date('2026-01-01') }), context()).ok
    ).toBe(true);
  });
});

describe('TransactionValidator — vínculo con el fijo (RN-26, corrige P1)', () => {
  it('un FIJO sin referencia se rechaza', () => {
    const result = TransactionValidator.validate(
      draft({ type: 'FIJO', recurringExpenseId: null }),
      context()
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.details.rule).toBe('RN-26');
  });

  it('un FIJO que apunta a un fijo inexistente se rechaza', () => {
    const result = TransactionValidator.validate(
      draft({ type: 'FIJO', recurringExpenseId: 'no-existe' }),
      context({ recurringExpenseExists: false })
    );
    expect(result.ok).toBe(false);
  });

  it('un FIJO bien referenciado se acepta', () => {
    expect(
      TransactionValidator.validate(
        draft({ type: 'FIJO', recurringExpenseId: 'exp-1' }),
        context()
      ).ok
    ).toBe(true);
  });

  it('un VARIABLE no puede referenciar un fijo', () => {
    expect(
      TransactionValidator.validate(
        draft({ type: 'VARIABLE', recurringExpenseId: 'exp-1' }),
        context()
      ).ok
    ).toBe(false);
  });
});

describe('TransactionValidator — fondos de ahorro (RN-39, RN-41)', () => {
  it('AHORRO y RETIRO_AHORRO exigen fondo', () => {
    for (const type of ['AHORRO', 'RETIRO_AHORRO'] as MovementType[]) {
      const result = TransactionValidator.validate(draft({ type, savingsFundId: null }), context());
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.details.rule).toBe('RN-39');
    }
  });

  it('un VARIABLE no puede referenciar un fondo', () => {
    expect(
      TransactionValidator.validate(
        draft({ type: 'VARIABLE', savingsFundId: 'fund-1' }),
        context()
      ).ok
    ).toBe(false);
  });

  it('rechaza un retiro mayor que el saldo del fondo (RN-41)', () => {
    const result = TransactionValidator.validate(
      draft({ type: 'RETIRO_AHORRO', savingsFundId: 'fund-1', amount: c('1500') }),
      context({ savingsFundBalance: c('1000'), savingsFundName: 'Fondo general' })
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.details.rule).toBe('RN-41');
      expect(result.error.message).toContain('Fondo general');
    }
  });

  it('acepta un retiro por el saldo exacto', () => {
    expect(
      TransactionValidator.validate(
        draft({ type: 'RETIRO_AHORRO', savingsFundId: 'fund-1', amount: c('1000') }),
        context({ savingsFundBalance: c('1000') })
      ).ok
    ).toBe(true);
  });

  it('rechaza retirar en una moneda distinta de la del fondo', () => {
    const result = TransactionValidator.validate(
      draft({
        type: 'RETIRO_AHORRO',
        savingsFundId: 'fund-1',
        amount: Money.unsafe('10', USD),
      }),
      context({ savingsFundBalance: c('1000') })
    );
    expect(result.ok).toBe(false);
  });
});

describe('TransactionValidator — estados (RN-27)', () => {
  it('PAGADO y PENDIENTE cuentan en el gasto de la quincena', () => {
    for (const status of ['PAGADO', 'PENDIENTE'] as const) {
      const result = TransactionValidator.validate(draft({ status }), context());
      expect(result.ok && result.value.countsTowardSpending).toBe(true);
    }
  });

  it('PROGRAMADO no cuenta: es una previsión futura', () => {
    const result = TransactionValidator.validate(draft({ status: 'PROGRAMADO' }), context());
    expect(result.ok && result.value.countsTowardSpending).toBe(false);
  });
});

describe('TransactionValidator — cascada y recolección', () => {
  it('la cascada devuelve el primer fallo', () => {
    const result = TransactionValidator.validate(
      draft({ amount: c('-1'), concept: '', categoryId: '' }),
      context({ resolvedPeriodId: null })
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.message).toContain('mayor que cero');
  });

  it('collectFailures devuelve todos los fallos a la vez, para el formulario', () => {
    const failures = TransactionValidator.collectFailures(
      draft({ amount: c('-1'), concept: '', categoryId: '' }),
      context({ resolvedPeriodId: null })
    );
    expect(failures.length).toBeGreaterThanOrEqual(4);
  });
});
