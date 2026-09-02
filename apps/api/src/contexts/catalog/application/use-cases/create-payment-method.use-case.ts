import { ConflictError, ValidationError, type DomainError } from '../../../../shared/domain/domain-error';
import type { IdGenerator } from '../../../../shared/domain/id-generator.port';
import { err, ok, type Result } from '../../../../shared/domain/result';
import { PaymentMethod } from '../../domain/payment-method.entity';
import type { PaymentMethodRepository } from '../../domain/payment-method.repository';

export interface CreatePaymentMethodCommand {
  householdId: string;
  name: string;
  sortOrder?: number;
}

export class CreatePaymentMethodUseCase {
  constructor(
    private readonly paymentMethods: PaymentMethodRepository,
    private readonly ids: IdGenerator
  ) {}

  async execute(command: CreatePaymentMethodCommand): Promise<Result<PaymentMethod, DomainError>> {
    const name = command.name.trim();
    if (!name) {
      return err(new ValidationError('El nombre del método de pago no puede estar vacío'));
    }

    const existing = await this.paymentMethods.findByName(command.householdId, name);
    if (existing) {
      return err(new ConflictError(`Ya existe un método de pago llamado "${name}"`, { name }));
    }

    const paymentMethod = new PaymentMethod({
      id: this.ids.generate(),
      householdId: command.householdId,
      name,
      isSystem: false,
      isActive: true,
      sortOrder: command.sortOrder ?? 0,
    });

    await this.paymentMethods.save(paymentMethod);
    return ok(paymentMethod);
  }
}
