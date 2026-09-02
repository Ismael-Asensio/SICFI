/**
 * Puerto `IdGenerator`.
 *
 * Un caso de uso que crea una entidad necesita su `id` **antes** de llamar al
 * repositorio (el dominio no vuelve de la base de datos con un id asignado:
 * construye la entidad completa y se la entrega a `save()`). Depender
 * directamente de `cuid()` acoplaría la capa de aplicación a una librería de
 * infraestructura; este puerto lo evita igual que `Clock` evita `new Date()`.
 */
export const ID_GENERATOR = Symbol('ID_GENERATOR');

export interface IdGenerator {
  generate(): string;
}
