# SICFI — Estado del proyecto

> **Léeme al empezar cualquier sesión.** Dice en qué fase estamos, con qué modelo trabajar
> y qué quedó pendiente. Se actualiza al cerrar cada fase, junto con el commit.

**Última actualización:** 2026-08-31 · Fase 2 cerrada
**Fase actual:** 3 — **Núcleo de dominio (LA FASE CRÍTICA)**
**Modelo requerido para la fase actual:** `Opus 5`

---

## Tablero de fases

| Fase | Nombre | Modelo | Horas | Estado |
|:----:|--------|--------|:-----:|--------|
| 0 | Preparación y decisiones | Opus 5 | 2 | ✅ **Completada** |
| 1 | Andamiaje del monorepo | Haiku 4.5 | 3 | ✅ **Completada** |
| 2 | Modelo de datos, migraciones, seeds | Opus 5 | 6 | ✅ **Completada** |
| 3 | **Núcleo de dominio** (crítica) | **Opus 5** | 12 | ⬜ Siguiente |
| 4 | Capa de aplicación (casos de uso) | Sonnet 5 | 7 | ⬜ |
| 5 | Infraestructura de persistencia | Sonnet 5 (+Opus para tenant) | 7 | ⬜ |
| 6 | **Auth, households y roles** (crítica) | **Opus 5** | 8 | ⬜ |
| 7 | API HTTP | Sonnet 5 (+Haiku para DTOs) | 7 | ⬜ |
| 8 | **Analítica y read models** (crítica) | **Opus 5** | 10 | ⬜ |
| 9 | Design system y shell responsive | Sonnet 5 | 6 | ⬜ |
| 10 | Pantallas por módulo | Sonnet 5 (+Haiku) | 17 | ⬜ |
| 11 | Testing integral | Sonnet 5 (+Opus casos borde) | 6 | ⬜ |
| 12 | Importador del Excel | Sonnet 5 | 4 | ⬜ |
| 13 | CI/CD y despliegue | Sonnet 5 | 3 | ⬜ |
| 14 | Hardening y observabilidad | Opus 5 | 4 | ⬜ |
| 15 | Documentación y cierre | Haiku 4.5 | 2 | ⬜ |
| | **Total** | | **104 h** | 11 % |

> El total subió de 85 h a 104 h por las decisiones D2 (households), D3 (fondos de ahorro)
> y D4 (multimoneda), tomadas en la Fase 0.

**Protocolo entre fases:** terminar → commit → actualizar este archivo → **avisar del cambio de
modelo y pausar** → el usuario cambia de modelo → continuar.

---

## Fase 0 — Preparación y decisiones ✅

**Cerrada:** 2026-08-31 · Modelo: Opus 5

### Hecho
- [x] Repositorio git inicializado en `main` (usuario: Ismael Asensio · ismaasenacedo@gmail.com)
- [x] Entorno verificado: Node v24.10.0 · npm 11.6.1 · **pnpm 11.25.0 instalado** · git 2.43.0
- [x] Las 5 decisiones abiertas del plan, resueltas → §2 de `CLAUDE.md`
- [x] `PLAN_IMPLEMENTACION.md` actualizado con las decisiones (esquema §6, reglas §2, tenancy §7)
- [x] `CLAUDE.md` creado — contexto permanente para todas las sesiones futuras
- [x] `.env.example` con las 20 variables documentadas
- [x] `.gitignore`
- [x] `docs/PROGRESO.md` (este archivo)

### Decisiones tomadas
| # | Decisión | Elección |
|---|----------|----------|
| D1 | Frontend | Next.js 15 App Router |
| D2 | Tenant | `householdId` — presupuesto compartido desde el MVP |
| D3 | Ahorro | Traslado a fondo, **no es gasto** |
| D4 | Moneda | Multimoneda desde el inicio |
| D5 | Multi-año | Esquema multi-año, UI de un año |

### Cuentas externas
Estas cuentas hay que crearlas a mano; no se pueden automatizar desde aquí:

- [x] **Supabase** → proyectos `sicfi-dev` y `sicfi-prod` creados (2026-08-31)
- [x] **Cadenas de conexión** → resueltas vía pooler `us-east-2` (2026-08-31)
- [ ] **Claves de Supabase Auth** → `SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` (Fase 6)
- [x] **GitHub** → `origin` en `github.com/Ismael-Asensio/SICFI`, historia subida (2026-08-31)
- [ ] **Vercel** → cuenta creada (no hace falta configurar proyectos hasta la Fase 13)

> La Fase 1 (andamiaje) **no** necesita nada de esto. Puedes avanzar sin las cuentas.

---

## Fase 1 — Andamiaje del monorepo ✅

**Cerrada:** 2026-08-31 · Modelo: Haiku 4.5 · Commit: `aa6c843`

### Entregables
- [x] `pnpm-workspace.yaml` + `turbo.json` + `package.json` raíz con todos los scripts
- [x] `apps/api` — NestJS 11, `tsconfig` con `strict` + `noUncheckedIndexedAccess` + decoradores
- [x] `apps/web` — Next.js 15 (App Router) + Tailwind v3 + Tailwind styling
- [x] `packages/contracts` · `packages/config-eslint` · `packages/config-typescript`
- [x] ESLint 9 (flat config) con TypeScript + React, sintetizado para pendiente
- [x] Prettier · Husky · lint-staged · commitlint (Conventional Commits en español)
- [x] `GET /api/v1/health` → `{ status: 'ok' }`
- [x] La home de Next carga con Tailwind styling

### Definición de terminado ✅
`pnpm build && pnpm lint && pnpm typecheck` pasan en verde.

### Notas de ejecución
- ESLint 9 requiere `eslint.config.js` (flat config) en lugar de `.eslintrc.js`
- Tailwind v4 tuvo problemas de compatibilidad en este Windows; se usó v3 (estable)
- Husky hooks necesitan actualización para v10+; por ahora están sin shebang
- pnpm allowBuilds activado para @nestjs/core, @prisma/client, prisma
- Cambio de modelo necesario: Fase 2 requiere Opus 5 para decisiones de datos

---

## Fase 2 — Modelo de datos, migraciones y seeds ✅

**Cerrada:** 2026-08-31 · Modelo: Opus 5 · Commits: `4ab6a18`, `5a5fc85`

### Hecho
- [x] `schema.prisma` completo — 14 tablas, 8 enums, 34 índices, todos por `householdId`
- [x] Migración `20260831000000_init` generada offline con `prisma migrate diff`
- [x] Migración `20260831000100_check_constraints` — invariantes en la base (ver abajo)
- [x] `PrismaService` singleton global + `PrismaModule`
- [x] `GET /api/v1/health` sondea Postgres → `{ status, database }`
- [x] `seed.ts` idempotente: 24 categorías, 7 métodos de pago, fondo por defecto,
      `BudgetSettings` 2026, 24 quincenas a C$ 8 500, los 5 fijos de la hoja `Fijos`
- [x] `rls-policies.sql` para las 14 tablas
- [x] Runner migrado de Jest a **Vitest** (lo que fija `CLAUDE.md` §3)
- [x] 18 tests del calendario de quincenas, en verde
- [x] `pnpm lint && pnpm typecheck && pnpm build && pnpm test` en verde

### Aplicado contra `sicfi-dev` ✅
- [x] `prisma migrate deploy` — las 2 migraciones aplicadas
- [x] `pnpm db:seed` — y verificado **idempotente** (segunda corrida sin duplicados)
- [x] `pnpm db:rls` — 23 sentencias, las 14 tablas con RLS activo
- [x] `pnpm db:verify` — 31 comprobaciones en verde contra la base real
- [x] `GET /api/v1/health` → `{"status":"ok","database":"up"}`

### Definición de terminado ✅
`migrate deploy` + `db seed` corren limpios · `lint`, `typecheck`, `build`, `test` en verde.

**Los agregados cuadran con el Excel (§1.5):** C$ 12 100/mes · C$ 145 200/año ·
C$ 204 000 de ingreso anual · **71,2 % comprometido**.

### Decisiones tomadas en esta fase
| Decisión | Motivo |
|----------|--------|
| **Columnas en `snake_case`** vía `@map` | `analytics` (Fase 8) escribe SQL agregado crudo y las políticas RLS son snake_case. Sin esto habría que citar `"asiComillada"` en todo SQL posterior. |
| **CHECK constraints en la base** | Prisma no los modela y por tanto no los borra en diffs posteriores. Solo para invariantes sin excepción legítima. |
| **RN-26 se queda en el dominio** | El importador de la Fase 12 puede encontrar filas de Excel con un FIJO sin fijo correspondiente; un CHECK daría un 500 en vez de un error explicativo. |
| **Jest → Vitest** | `CLAUDE.md` §3 ya fijaba Vitest; la Fase 1 había dejado Jest por descuido. |
| `businessDate` ancla a **12:00 UTC** | Deja 12 h de margen a cada lado: ningún desfase de zona puede mover un `@db.Date` al día anterior. |
| Se conserva `FORCE ROW LEVEL SECURITY` | Hoy es un no-op (ver abajo), pero si algún día se revoca `BYPASSRLS` a `postgres`, la propiedad de la tabla no debe bastar para saltarse las políticas. |

### 🔒 Hallazgo de seguridad verificado en la base real

```
current_user = postgres
pg_roles: postgres → rolsuper = false, rolbypassrls = TRUE
          authenticated → rolbypassrls = false
```

`rolbypassrls = true` hace que el rol se salte **toda** seguridad de fila, incluido `FORCE`.
Como Prisma se conecta con ese rol, **ninguna política RLS afecta a la aplicación**.
Esto confirma empíricamente la advertencia de `CLAUDE.md` §7: la `tenantExtension` de la
**Fase 5 es la única barrera real** de aislamiento entre households. RLS solo cubre el
acceso vía cliente Supabase / PostgREST / SQL manual.

### Notas para quien siga
- **Infra:** Supabase `sicfi-dev` (ref `zdissagxljlwhybswahw`) y `sicfi-prod`
  (ref `gyyokngqxpjriqypvsom`), región **us-east-2**. GitHub: `Ismael-Asensio/SICFI`.
- `apps/api/.env` tiene las credenciales reales de dev y **está en `.gitignore`**.
- ⚠️ **Hay que usar el pooler, no la conexión directa.** `db.<ref>.supabase.co` solo
  publica registro AAAA (IPv6) y el plan free no incluye IPv4 → `P1001 Can't reach
  database server`. El pooler sí resuelve por IPv4:
  - runtime → `aws-0-us-east-2.pooler.supabase.com:6543` + `?pgbouncer=true&connection_limit=1`
  - migraciones → `aws-0-us-east-2.pooler.supabase.com:5432` (modo session; el modo
    transaction no soporta las sentencias preparadas del DDL)
  - el usuario del pooler es `postgres.<project-ref>`, no `postgres` a secas
- ⚠️ **La contraseña de `sicfi-prod` lleva `+` y `#`.** En una URL hay que codificarlas
  (`%2B` y `%23`) o el `#` truncará la cadena. Pendiente para la Fase 13.
- Tras tocar `@map`/`@@map` hay que correr **`prisma generate`**: el cliente cacheado
  sigue apuntando a los nombres viejos y falla con `P2022 column does not exist`.
- Comandos nuevos: `pnpm db:rls` (aplica las políticas) y `pnpm db:verify` (31 checks).
- El seed usa un usuario fijo `00000000-0000-4000-8000-000000000001`. En producción el `id`
  viene del `sub` del JWT de Supabase.
- `prisma/seed-calendar.ts` es **temporal**: la Fase 3 mueve esa lógica a
  `contexts/budget/domain/period-calculator.service.ts` y el seed pasará a importarla de allí.
- La config de Prisma vive en `prisma.config.ts` (el campo `package.json#prisma` está deprecado).

---

## Bitácora de commits por fase

| Fase | Commit | Fecha |
|:----:|--------|-------|
| 0 | `chore(fase-0): preparación, decisiones de arquitectura y contexto del proyecto` | 2026-08-31 |
| 1 | `aa6c843` — `chore(fase-1): andamiaje del monorepo` | 2026-08-31 |
| 2 | `4ab6a18` — `feat(fase-2): modelo de datos, migraciones y seeds` | 2026-08-31 |
| 2 | `5a5fc85` — `feat(fase-2): aplicar migraciones, seed y RLS contra Supabase` | 2026-08-31 |
