import { randomUUID } from 'node:crypto';

import { sharedPrisma, tenantContext } from './shared-prisma';

export interface TestHousehold {
  householdId: string;
  userId: string;
  /**
   * Ejecuta el cuerpo del test dentro del ámbito de tenant de este household.
   * Sin esto, la `tenantExtension` lanza `MissingTenantError` — que es
   * exactamente lo que debe hacer.
   */
  run<T>(work: () => Promise<T>): Promise<T>;
  /** Borra el household (cascada) y el usuario. Llamar siempre en `afterAll`. */
  cleanup(): Promise<void>;
}

/**
 * Crea un household de prueba aislado, con nombre reconocible para poder
 * identificar y purgar manualmente cualquier residuo si un test se
 * interrumpe antes de su `cleanup()`.
 */
export async function createTestHousehold(
  overrides: { baseCurrency?: string; timezone?: string } = {}
): Promise<TestHousehold> {
  const userId = randomUUID();
  const householdId = randomUUID();

  await sharedPrisma.user.create({
    data: { id: userId, email: `${userId}@integration.test` },
  });

  await sharedPrisma.household.create({
    data: {
      id: householdId,
      name: `__integration_test__ ${householdId}`,
      baseCurrency: overrides.baseCurrency ?? 'NIO',
      timezone: overrides.timezone ?? 'America/Managua',
    },
  });

  await sharedPrisma.householdMember.create({
    data: { householdId, userId, role: 'OWNER' },
  });

  return {
    householdId,
    userId,
    run<T>(work: () => Promise<T>): Promise<T> {
      return tenantContext.runWith({ householdId, userId }, work);
    },
    async cleanup() {
      // El borrado del household encadena (Cascade) todas sus tablas de datos
      // — categorías, quincenas, movimientos, etc. — en el orden correcto
      // dentro de una sola sentencia. El usuario no se ve afectado por eso y
      // se borra aparte.
      await sharedPrisma.household.delete({ where: { id: householdId } });
      await sharedPrisma.user.delete({ where: { id: userId } });
    },
  };
}
