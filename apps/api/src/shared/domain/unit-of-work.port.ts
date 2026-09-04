/**
 * Puerto `UnitOfWork`.
 *
 * Permite que un caso de uso ejecute varias operaciones de varios repositorios
 * como una sola transacción atómica — `BootstrapUserUseCase` es el caso
 * evidente: si falla al sembrar el catálogo, no debe quedar a medias un
 * household sin sus quincenas.
 *
 * El callback no recibe nada del adaptador: los repositorios inyectados en el
 * caso de uso se unen a la transacción activa por sí solos (ver
 * `PrismaRepositoryBase`). El dominio no necesita saber cómo.
 */
export const UNIT_OF_WORK = Symbol('UNIT_OF_WORK');

export interface UnitOfWork {
  /** Si `work` lanza, nada de lo que hizo dentro se persiste. */
  run<T>(work: () => Promise<T>): Promise<T>;
}
