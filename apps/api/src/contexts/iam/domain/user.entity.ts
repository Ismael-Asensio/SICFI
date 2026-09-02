/**
 * `User` — espejo local de `auth.users` de Supabase. RN-42.
 *
 * El `id` ES el `sub` del JWT: no se genera aquí, llega ya asignado desde la
 * capa de autenticación (Fase 6). No es una raíz de agregado propia: no tiene
 * invariantes de negocio, solo existe para que `Transaction.createdByUserId` y
 * `HouseholdMember.userId` tengan a qué apuntar por FK.
 */
import { Entity } from '../../../shared/domain/entity';

export interface UserProps {
  id: string;
  email: string;
}

export class User extends Entity<string> {
  readonly email: string;

  constructor(props: UserProps) {
    super(props.id);
    this.email = props.email;
  }
}
