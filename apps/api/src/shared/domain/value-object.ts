/**
 * Base de los Value Objects.
 *
 * Un VO se define por su valor, no por identidad, y es inmutable: valida en la
 * construcción y se congela (CLAUDE.md §8). Si construirlo puede fallar, el
 * constructor se deja `private` y se expone un factory estático que devuelve
 * `Result` — nunca se lanza.
 *
 * Las subclases declaran `components()`; de ahí sale la igualdad estructural sin
 * que cada VO tenga que escribir su propio `equals`.
 */
export abstract class ValueObject {
  /**
   * Partes que definen la identidad del valor, en orden estable.
   * Se admiten primitivas y objetos con `equals` propio (p. ej. `Decimal`).
   */
  protected abstract components(): readonly unknown[];

  /**
   * Congela la instancia. Se llama al final del constructor de la subclase,
   * cuando todos los campos ya están asignados.
   */
  protected seal(): void {
    Object.freeze(this);
  }

  equals(other: unknown): boolean {
    if (this === other) return true;
    if (!(other instanceof ValueObject)) return false;
    if (this.constructor !== other.constructor) return false;

    const mine = this.components();
    const theirs = other.components();
    if (mine.length !== theirs.length) return false;

    return mine.every((value, index) => componentsEqual(value, theirs[index]));
  }
}

/**
 * Igualdad de un componente. Reconoce los objetos que traen su propio `equals`
 * —`Decimal` es el caso que importa— porque comparar dos `Decimal` con `===`
 * siempre daría `false` y dos importes iguales se verían como distintos.
 */
function componentsEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;

  if (a !== null && typeof a === 'object' && 'equals' in a && typeof a.equals === 'function') {
    return (a as { equals(other: unknown): boolean }).equals(b);
  }

  // NaN === NaN es false, pero como componente de un VO deben considerarse iguales.
  if (typeof a === 'number' && typeof b === 'number') {
    return Number.isNaN(a) && Number.isNaN(b);
  }

  return false;
}
