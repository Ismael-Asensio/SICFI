import { BusinessRuleError, NotFoundError, type DomainError } from '../../../../shared/domain/domain-error';
import { err, ok, type Result } from '../../../../shared/domain/result';
import type { PaymentMethodRepository } from '../../domain/payment-method.repository';

export interface DeletePaymentMethodCommand {
  householdId: string;
  paymentMethodId: string;
}

export class DeletePaymentMethodUseCase {
  constructor(private readonly paymentMethods: PaymentMethodRepository) {}

  async execute(command: DeletePaymentMethodCommand): Promise<Result<void, DomainError>> {
    const paymentMethod = await this.paymentMethods.findById(
      command.householdId,
      command.paymentMethodId
    );
    if (!paymentMethod) {
      return err(
        new NotFoundError('El método de pago no existe', {
          paymentMethodId: command.paymentMethodId,
        })
      );
    }

    if (!paymentMethod.canBeDeleted) {
      return err(
        new BusinessRuleError(
          'system-payment-method',
          'Un método de pago del catálogo por defecto no se puede eliminar; desactívalo en su lugar',
          { paymentMethodId: command.paymentMethodId }
        )
      );
    }

    await this.paymentMethods.delete(command.householdId, command.paymentMethodId);
    return ok();
  }
}
