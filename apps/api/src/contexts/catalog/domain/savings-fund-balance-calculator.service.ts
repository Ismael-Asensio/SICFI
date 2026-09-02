/**
 * `SavingsFundBalanceCalculator` — RN-40, RN-41, RN-41b.
 *
 * El detalle que el Excel no distinguía (P10): **ahorro bruto ≠ ahorro efectivo**.
 * Apartar C$ 1 500 y retirar C$ 1 400 no es ahorrar C$ 1 500, es ahorrar C$ 100.
 * El Panel debe mostrar el neto.
 */
import { BusinessRuleError, type DomainError } from '../../../shared/domain/domain-error';
import { Money } from '../../../shared/domain/money.vo';
import { err, ok, type Result } from '../../../shared/domain/result';

export interface SavingsFundTotals {
  /** Σ de los movimientos AHORRO del fondo. */
  contributions: Money;
  /** Σ de los movimientos RETIRO_AHORRO del fondo. */
  withdrawals: Money;
}

export class SavingsFundBalanceCalculator {
  /** RN-40: `saldo = Σ aportes − Σ retiros`, en la moneda del fondo. */
  static balance(totals: SavingsFundTotals): Money {
    return totals.contributions.minus(totals.withdrawals);
  }

  /**
   * RN-41b — ahorro efectivo de un periodo o del año.
   *
   * Es el mismo cálculo que el saldo, pero nombrado aparte porque responde a otra
   * pregunta: el saldo dice "cuánto tengo guardado", el ahorro efectivo dice
   * "cuánto conseguí ahorrar de verdad en este tramo".
   */
  static effectiveSavings(totals: SavingsFundTotals): Money {
    return totals.contributions.minus(totals.withdrawals);
  }

  /**
   * RN-41 — valida un retiro antes de persistirlo.
   *
   * Un retiro no puede dejar el fondo en negativo: un fondo de ahorro no es una
   * línea de crédito. Se comprueba en el dominio, donde el error puede decir
   * cuánto hay disponible, y no en un CHECK que solo devolvería un 500.
   */
  static validateWithdrawal(params: {
    fundName: string;
    currentBalance: Money;
    withdrawal: Money;
  }): Result<Money, DomainError> {
    const { fundName, currentBalance, withdrawal } = params;

    if (!withdrawal.isPositive()) {
      return err(
        new BusinessRuleError('RN-28', 'El importe de un retiro debe ser mayor que cero', {
          withdrawal: withdrawal.toFixed(),
        })
      );
    }

    if (withdrawal.isGreaterThan(currentBalance)) {
      return err(
        new BusinessRuleError(
          'RN-41',
          `No puedes retirar ${withdrawal.toFixed()} del fondo "${fundName}": ` +
            `solo tiene ${currentBalance.toFixed()} ${currentBalance.currency.code}`,
          {
            fund: fundName,
            requested: withdrawal.toFixed(),
            available: currentBalance.toFixed(),
          }
        )
      );
    }

    return ok(currentBalance.minus(withdrawal));
  }

  static emptyTotals(currency: Money['currency']): SavingsFundTotals {
    return { contributions: Money.zero(currency), withdrawals: Money.zero(currency) };
  }
}
