import {
  ConflictError,
  NotFoundError,
  ValidationError,
  type DomainError,
} from '../../../../shared/domain/domain-error';
import { err, ok, type Result } from '../../../../shared/domain/result';
import type { PaymentMethod } from '../../domain/payment-method.entity';
import type { PaymentMethodRepository } from '../../domain/payment-method.repository';

export interface UpdatePaymentMethodCommand {
  householdId: string;
  paymentMethodId: string;
  name?: string;
  sortOrder?: number;
}

export class UpdatePaymentMethodUseCase {
  constructor(private readonly paymentMethods: PaymentMethodRepository) {}

  async execute(command: UpdatePaymentMethodCommand): Promise<Result<PaymentMethod, DomainError>> {
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

    let name = paymentMethod.name;
    if (command.name !== undefined) {
      name = command.name.trim();
      if (!name) {
        return err(new ValidationError('El nombre del método de pago no puede estar vacío'));
      }
      if (name !== paymentMethod.name) {
        const clash = await this.paymentMethods.findByName(command.householdId, name);
        if (clash) {
          return err(new ConflictError(`Ya existe un método de pago llamado "${name}"`, { name }));
        }
      }
    }

    const updated = paymentMethod.with({ name, sortOrder: command.sortOrder ?? paymentMethod.sortOrder });
    await this.paymentMethods.save(updated);
    return ok(updated);
  }
}
