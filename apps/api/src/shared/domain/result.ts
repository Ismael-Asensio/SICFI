/**
 * `Result<T, E>` — el tipo de retorno de todo el dominio.
 *
 * En `domain/` está prohibido `throw` (CLAUDE.md §8): un error de negocio no es
 * una excepción, es un resultado posible que el llamante está obligado a mirar.
 * Las excepciones HTTP se lanzan solo en `infrastructure/http/`.
 *
 * La unión discrimina por el campo literal `ok`, así que TypeScript estrecha el
 * tipo solo con un `if (result.ok)`.
 */
import type { DomainError } from './domain-error';

export class Ok<T> {
  readonly ok = true as const;

  constructor(readonly value: T) {
    Object.freeze(this);
  }
}

export class Err<E> {
  readonly ok = false as const;

  constructor(readonly error: E) {
    Object.freeze(this);
  }
}

export type Result<T, E = DomainError> = Ok<T> | Err<E>;

export function ok(): Ok<void>;
export function ok<T>(value: T): Ok<T>;
export function ok<T>(value?: T): Ok<T | void> {
  return new Ok(value as T);
}

export function err<E>(error: E): Err<E> {
  return new Err(error);
}

export function isOk<T, E>(result: Result<T, E>): result is Ok<T> {
  return result.ok;
}

export function isErr<T, E>(result: Result<T, E>): result is Err<E> {
  return !result.ok;
}

/** Transforma el valor de un `Ok`; un `Err` pasa intacto. */
export function map<T, U, E>(result: Result<T, E>, fn: (value: T) => U): Result<U, E> {
  return result.ok ? ok(fn(result.value)) : result;
}

/** Transforma el error de un `Err`; un `Ok` pasa intacto. */
export function mapErr<T, E, F>(result: Result<T, E>, fn: (error: E) => F): Result<T, F> {
  return result.ok ? result : err(fn(result.error));
}

/** Encadena operaciones que a su vez pueden fallar, sin anidar `if`s. */
export function andThen<T, U, E>(
  result: Result<T, E>,
  fn: (value: T) => Result<U, E>
): Result<U, E> {
  return result.ok ? fn(result.value) : result;
}

export function unwrapOr<T, E>(result: Result<T, E>, fallback: T): T {
  return result.ok ? result.value : fallback;
}

/**
 * Colapsa varios `Result` en uno solo con la tupla de valores.
 * Devuelve el **primer** error encontrado.
 *
 * Es lo que permite construir un VO con cinco validaciones sin una escalera
 * de `if (!x.ok) return x;`.
 */
export function combine<T extends readonly Result<unknown, unknown>[]>(
  results: T
): Result<
  { -readonly [K in keyof T]: T[K] extends Result<infer U, unknown> ? U : never },
  T[number] extends Result<unknown, infer E> ? E : never
> {
  const values: unknown[] = [];

  for (const result of results) {
    if (!result.ok) {
      return result as never;
    }
    values.push(result.value);
  }

  return ok(values) as never;
}

/**
 * Como `combine`, pero acumula **todos** los errores en vez de parar en el
 * primero. Es lo que quiere un formulario: enseñar los cinco campos mal de una
 * vez, no obligar al usuario a corregirlos de uno en uno.
 */
export function combineAll<T, E>(results: readonly Result<T, E>[]): Result<T[], E[]> {
  const values: T[] = [];
  const errors: E[] = [];

  for (const result of results) {
    if (result.ok) values.push(result.value);
    else errors.push(result.error);
  }

  return errors.length > 0 ? err(errors) : ok(values);
}
