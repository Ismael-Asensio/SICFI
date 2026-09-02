import type { User } from './user.entity';

export const USER_REPOSITORY = Symbol('USER_REPOSITORY');

/**
 * Sin `householdId`: un usuario no pertenece a un solo household (RN-42), y su
 * `id` viene del JWT, no de una consulta con alcance de tenant.
 */
export interface UserRepository {
  findById(id: string): Promise<User | null>;
  findByEmail(email: string): Promise<User | null>;
  save(user: User): Promise<void>;
}
