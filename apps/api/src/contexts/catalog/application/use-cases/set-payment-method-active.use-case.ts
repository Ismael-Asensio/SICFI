import { NotFoundError, type DomainError } from '../../../../shared/domain/domain-error';
import { err, ok, type Result } from '../../../../shared/domain/result';
import type { PaymentMethod } from '../../domain/payment-method.entity';
import type { PaymentMethodRepository } from '../../domain/payment-method.repository';

export interface SetPaymentMethodActiveCommand {
  householdId: string;
  paymentMethodId: string;
  isActive: boolean;
}

export class SetPaymentMethodActiveUseCase {
  constructor(private readonly paymentMethods: PaymentMethodRepository) {}

  async execute(command: SetPaymentMethodActiveCommand): Promise<Result<PaymentMethod, DomainError>> {
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

    const updated = paymentMethod.with({ isActive: command.isActive });
    await this.paymentMethods.save(updated);
    return ok(updated);
  }
}
