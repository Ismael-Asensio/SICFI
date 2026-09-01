# SICFI — Sistema de Control Financiero Individual

> Contexto permanente del proyecto. Se carga en cada sesión.
> **Referencia profunda:** `PLAN_IMPLEMENTACION.md` (análisis del Excel, 42 reglas de negocio, fases).
> **Estado actual:** `docs/PROGRESO.md` (qué está hecho, qué sigue, en qué modelo).

---

## 1. QUÉ ES ESTO

Aplicación web para control de gastos personales **por quincenas** (24 al año), migrada desde
`Presupuesto_Quincenal_2026.xlsx` (9 hojas, en la raíz del repo — es la fuente de verdad funcional
y el fixture del importador de la Fase 12).

**Concepto central:** el año se divide en 24 quincenas. `Q1` = días 1–15, `Q2` = día 16 al fin de mes.
Cada quincena tiene un ingreso planificado, unos gastos fijos que le aplican, y movimientos reales.
La métrica que manda es el **restante proyectado** = lo que queda después de pagar los fijos pendientes.

**Usuario real:** presupuesto doméstico en Nicaragua, córdobas (NIO) con dólares ocasionales.
Fijos actuales ≈ C$ 12 100/mes contra C$ 8 500/quincena de ingreso → **71 % del ingreso comprometido**.
El producto existe para hacer visible esa tensión antes de que se convierta en sobregiro.

---

## 2. DECISIONES CERRADAS (no volver a discutirlas)

| # | Decisión | Elección | Consecuencia |
|---|----------|----------|--------------|
| D1 | Frontend | **Next.js 15 App Router** | Despliegue nativo en Vercel, tipos compartidos con Nest |
| D2 | Discriminante de tenant | **`householdId`** (no `userId`) | Tablas `Household` + `HouseholdMember` con roles. Presupuesto compartido desde el MVP |
| D3 | Tratamiento del ahorro | **Traslado a fondo, NO es gasto** | Tabla `SavingsFund`, tipo `RETIRO_AHORRO`, métricas `gastoReal` vs `salidasDeCaja` separadas |
| D4 | Moneda | **Multimoneda desde el inicio** | Cada movimiento guarda moneda + tipo de cambio + monto en moneda base. Agregaciones siempre sobre `baseAmount` |
| D5 | Multi-año | Esquema multi-año, UI de un año | `year` ya es dimensión en `Period` y `BudgetSettings` |

> **D2, D3 y D4 se apartan del Excel original.** El Excel es monousuario, trata el ahorro como
> gasto y es monomoneda. Cuando un número de la app no coincida con el Excel, revisa primero si
> la causa es una de estas tres decisiones antes de buscar un bug.

---

## 3. STACK

| Capa | Tecnología | Notas |
|------|-----------|-------|
| Backend | NestJS 11 · Node 22+ · TypeScript `strict` | Serverless en Vercel |
| ORM | Prisma 6 | `DATABASE_URL` pooler `:6543`, `DIRECT_URL` `:5432` |
| BD | Supabase Postgres (free) | Se pausa a los 7 días sin actividad → cron diario |
| Auth | Supabase Auth (JWT) verificado por JWKS en Nest | Tokens en cookies httpOnly, nunca localStorage |
| Frontend | Next.js 15 + React 19 | RSC para carga inicial |
| Estilos | Tailwind CSS v4 + shadcn/ui (Radix) | Mobile-first real |
| Estado servidor | TanStack Query v5 | `queryKeys` jerárquicas |
| Formularios | react-hook-form + Zod | Mismo esquema Zod valida en cliente y servidor |
| Gráficas | Recharts | |
| Contratos | `packages/contracts` (Zod) | Fuente única de tipos api ↔ web |
| Monorepo | pnpm workspaces + Turborepo | pnpm 11.x |
| Tests | Vitest · Supertest · Playwright | |

**Entorno local verificado:** Node v24.10.0 · npm 11.6.1 · pnpm 11.25.0 · git 2.43.0 · Windows 11.

---

## 4. ARQUITECTURA

Hexagonal (Ports & Adapters) por bounded context.

```
apps/api/src/contexts/<ctx>/
├── domain/          entidades, VOs, servicios de dominio, PUERTOS (interfaces), eventos, errores
├── application/     casos de uso (un método execute()), commands/queries, mappers
└── infrastructure/  ADAPTADORES: repositorios Prisma, controladores HTTP, DTOs
```

### Regla de dependencia — INVIOLABLE

```
domain          →  no importa NADA (ni Prisma, ni Nest, ni Zod)
application     →  solo importa domain
infrastructure  →  importa domain y application
```

Verificada en CI por `eslint-plugin-boundaries`. Si necesitas romperla, el diseño está mal.

### Bounded contexts

| Contexto | Hojas del Excel | Naturaleza |
|----------|-----------------|-----------|
| `iam` | — | Usuarios, households, miembros, roles, onboarding |
| `catalog` | `Listas` | Categorías, métodos de pago, fondos de ahorro, monedas |
| `budget` | `Config`, `Quincenas` | Settings del año, generación de 24 quincenas, ingreso |
| `recurring` | `Fijos` | Gastos fijos, derivación de `appliesTo` |
| `ledger` | `Registro` | Movimientos. **Núcleo transaccional** |
| `analytics` | `Panel`, `Control`, `Historial`, `Reporte` | **Solo lectura (CQRS query side)** |

`analytics` **no tiene entidades ni repositorios de escritura**. Son proyecciones, no invariantes de
agregado. Recibe parámetros → SQL agregado → DTO de lectura. No metas estos cálculos en entidades.

---

## 5. MODELO DE DATOS — resumen operativo

Esquema completo y comentado en `PLAN_IMPLEMENTACION.md` §6. Lo que hay que tener siempre presente:

### Jerarquía de tenant

```
User (espejo de auth.users, id = sub del JWT)
 └── HouseholdMember (userId, householdId, role)
      └── Household   ◀── DISCRIMINANTE DE TENANT: toda tabla de datos lleva householdId
           ├── BudgetSettings · Category · PaymentMethod · SavingsFund
           ├── Period · RecurringExpense · Transaction · ExchangeRate
```

`Profile.activeHouseholdId` guarda el household seleccionado.
Roles: `OWNER` > `ADMIN` > `MEMBER` > `VIEWER`.

### Enums

```
MovementType  FIJO | VARIABLE | AHORRO | RETIRO_AHORRO | INGRESO_EXTRA
Frequency     QUINCENAL | MENSUAL | BIMESTRAL | SEMESTRAL | ANUAL
PeriodHalf    Q1 | Q2
AppliesTo     Q1 | Q2 | AMBAS        (DERIVADO — nunca lo escribe el cliente)
TxStatus      PAGADO | PENDIENTE | PROGRAMADO
CategoryKind  FIJO | VARIABLE | AHORRO
HouseholdRole OWNER | ADMIN | MEMBER | VIEWER
```

### Reglas de columna que se olvidan

- **Dinero:** `Decimal(14,2)` en Postgres, `Decimal.js` en la app. **`number` para importes es un bug.**
- **Fechas de negocio:** `@db.Date` (sin hora ni zona). Solo los timestamps de auditoría llevan zona.
- **`Transaction`** guarda: `currency`, `amount`, `exchangeRate`, `baseAmount`.
  **Toda agregación usa `baseAmount`.** Si ves un `SUM(amount)` en un reporte, es un bug.
- **`appliesTo` y `periodId` se persisten aunque sean derivados** — para poder agregar en SQL.
  Se recalculan en el dominio al guardar; el cliente no los envía nunca.
- **`Transaction.createdByUserId`** existe para atribución dentro de un household compartido.
- Índices: todos empiezan por `householdId`. Es el primer filtro de toda consulta.

---

## 6. REGLAS DE NEGOCIO — las que más se rompen

Catálogo completo RN-01..RN-42 en `PLAN_IMPLEMENTACION.md` §2. **Cita el número de RN en los
comentarios del código.** Las críticas:

### Cálculo de la quincena (revisado por D3 — ojo, difiere del Excel)

```
disponible          = ingresoPlanificado + Σ(INGRESO_EXTRA) + Σ(RETIRO_AHORRO)
gastoReal           = Σ(FIJO) + Σ(VARIABLE)                    ← el ahorro NO es gasto
ahorroApartado      = Σ(AHORRO)
salidasDeCaja       = gastoReal + ahorroApartado               ← lo que sale del bolsillo
fijosPendientes     = max(0, fijosPresupuestados − Σ(FIJO))
disponibleRestante  = disponible − salidasDeCaja
restanteProyectado  = disponibleRestante − fijosPendientes     ◀── LA MÉTRICA QUE MANDA
%ejecutado          = gastoReal / disponible                   ← el umbral de alerta usa ESTE
%comprometido       = salidasDeCaja / disponible
```

### Estado de la quincena (cascada, el primer match gana)

```
disponible = 0              → SIN_INGRESO
salidasDeCaja > disponible  → SOBREGIRO
restanteProyectado < 0      → NO_ALCANZA_FIJOS
%ejecutado >= umbral        → CERCA_DEL_LIMITE
resto                       → EN_ORDEN
```

### Derivaciones que el cliente nunca envía

```
appliesTo   = QUINCENAL ? AMBAS : (dueDay <= 15 ? Q1 : Q2)              (RN-18)
periodId    = la quincena cuyo [startDate, endDate] contiene date        (RN-03, RN-29)
baseAmount  = amount × exchangeRate                                      (RN-36)
costoMensual= inactivo ? 0 : (quincenal ? monto×2 : monto)               (RN-19)
fechaLimite = quincenal ? finQuincena
                        : fecha(año, mes, min(dueDay, díaFinQuincena))   (RN-21)
```

`min(dueDay, díaFinQuincena)` **no es opcional**: sin él, un fijo con `dueDay = 31` revienta en febrero.

### Estado de un fijo en una quincena (cascada)

```
presupuestado = 0                        → NO_APLICA
registrado > 0 y |dif| < tolerancia      → PAGADO
registrado > 0 y |dif| >= tolerancia     → PAGADO_MONTO_DISTINTO
fechaLimite < hoy                        → VENCIDO
fechaLimite − hoy <= diasAviso           → POR_VENCER
resto                                    → PENDIENTE
```

### Multimoneda (RN-36..RN-38)

- El tipo de cambio se resuelve **a la fecha del movimiento**; si no hay tasa exacta se usa la más
  reciente anterior. Si no hay ninguna y `currency != baseCurrency`, se exige capturarla.
- Editar un movimiento **no** recalcula el tipo de cambio histórico, salvo que cambie fecha o moneda.

### Fondos de ahorro (RN-39, RN-40)

- `AHORRO` y `RETIRO_AHORRO` **deben** referenciar un `savingsFundId`.
- `RETIRO_AHORRO` no puede dejar el saldo del fondo en negativo.
- `saldoFondo = Σ aportes − Σ retiros`, en la moneda del fondo.

### Alertas (12 reglas, Strategy)

`A01`..`A12` con niveles `URGENTE > AVISO > INFO > OK`. Cada una es una clase que implementa
`AlertRule`. **Añadir una alerta = añadir una clase, sin tocar el motor.**
Ninguna alerta con dependencia de fechas se evalúa antes de `BudgetSettings.controlStartDate` (RN-35)
— si no, un usuario nuevo recibe decenas de falsos "olvidaste pagar".

---

## 7. SEGURIDAD — triple capa de aislamiento

1. **`JwtAuthGuard` global** — verifica firma JWKS, extrae `sub`, resuelve el household activo y lo
   mete en `AsyncLocalStorage`. Todo es privado salvo `@Public()`.
2. **`tenantExtension` de Prisma** — inyecta `householdId` en **toda** operación de las tablas de
   datos. Si un repositorio olvida filtrar, el filtro se aplica igual. **Esta es la barrera real.**
3. **RLS en Postgres** — defensa en profundidad.

> **Advertencia que hay que recordar:** si Prisma se conecta con el rol `postgres`, **RLS no se
> aplica**. RLS protege el acceso vía cliente Supabase/PostgREST, no vía Prisma. Por eso la capa 2
> es la que de verdad aísla. Nunca la desactives "temporalmente para depurar".

**Test bloqueante en CI:** dos households A y B; B intenta leer/editar/borrar cada recurso de A por
id. Toda respuesta debe ser `404` (no `403`: no se filtra la existencia del recurso).

**Nunca:** `SUPABASE_SERVICE_ROLE_KEY` en el cliente ni con prefijo `NEXT_PUBLIC_`. Nada de montos
ni datos personales en los logs.

---

## 8. CONVENCIONES DE CÓDIGO

### Nombres de archivo — kebab-case con sufijo de rol

```
transaction.entity.ts            money.vo.ts
register-transaction.use-case.ts transaction.repository.ts       (puerto)
prisma-transaction.repository.ts (adaptador)
transactions.controller.ts       transaction.prisma-mapper.ts
overdraft.rule.ts                period-calculator.service.ts
```

### Reglas duras

- Un caso de uso = una clase con **un único** método `execute()`.
- Errores de dominio: `Result<T, DomainError>`. **No `throw` dentro de `domain/`.**
  Las excepciones HTTP se lanzan solo en `infrastructure/http/`.
- Los Value Objects validan en el constructor y son inmutables (`readonly` + `Object.freeze`).
- Importes: siempre el VO `Money`. Nunca `number`, nunca `parseFloat`.
- Tests junto al archivo: `*.spec.ts`.
- Los puertos se inyectan por token: `{ provide: TRANSACTION_REPOSITORY, useClass: PrismaTransactionRepository }`.
- El modelo de Prisma **nunca** se devuelve al cliente: siempre pasa por un DTO de respuesta.
- Fechas: toda noción de "hoy" se calcula **en el servidor** con la zona horaria del household.
  `new Date()` dentro del dominio está prohibido — usa el puerto `Clock`.

### Commits — Conventional Commits en español

```
feat(ledger): registrar movimiento con conversión de moneda
fix(analytics): corregir prorrateo acumulado por categoría (RN-31)
chore(fase-1): andamiaje del monorepo
docs: actualizar PROGRESO tras la fase 3
test(domain): casos borde de fecha límite en febrero (RN-21)
```

Ámbitos válidos: `iam`, `catalog`, `budget`, `recurring`, `ledger`, `analytics`, `web`, `infra`,
`fase-N`.

---

## 9. COMANDOS

```bash
pnpm dev                  # api (3001) + web (3000)
pnpm build
pnpm lint
pnpm typecheck
pnpm test                 # todo
pnpm test:domain          # solo dominio, sin I/O — el que más vas a correr
pnpm test:integration     # repositorios contra Postgres
pnpm test:e2e             # Supertest + Playwright
pnpm test:tenant          # aislamiento entre households (BLOQUEANTE en CI)
pnpm db:migrate           # prisma migrate dev
pnpm db:deploy            # prisma migrate deploy (producción)
pnpm db:seed
pnpm db:studio
```

---

## 10. CÓMO TRABAJAR EN ESTE REPO (para el asistente)

### Al empezar una sesión
1. Lee `docs/PROGRESO.md` — dice exactamente en qué fase estás y qué falta.
2. **No leas todo el repo.** Pide rutas concretas o usa el agente `Explore` solo para localizar.
3. Al terminar una fase: commit + actualizar `docs/PROGRESO.md` + avisar del cambio de modelo.

### Trabajo por verticales, no por capas
Implementa **un contexto completo** (dominio → aplicación → infra → HTTP → UI) antes de pasar al
siguiente. Nunca "todas las entidades, luego todos los repositorios": eso obliga a recargar el
proyecto entero en cada capa.

### Explota la plantilla
`contexts/ledger` es el contexto de referencia. Para implementar otro:
> "Replica la estructura de `contexts/ledger`. Lee solo `transaction.entity.ts` y
> `register-transaction.use-case.ts` como referencia. Campos en `schema.prisma`, reglas RN-XX."

### No hacer
- No leas `prisma/migrations/` salvo que se pida explícitamente.
- No reescribas un archivo completo para cambiar tres líneas.
- No inventes campos que no estén en `schema.prisma`.
- No metas lógica de negocio en controladores ni en componentes React.
- No uses `any`. Si el tipo es difícil, es señal de que el diseño se puede simplificar.

---

## 11. TRAMPAS CONOCIDAS (checklist de depuración)

| Síntoma | Causa probable |
|---------|----------------|
| Los números no cuadran con el Excel | Revisa primero D3 (ahorro no es gasto) y D4 (multimoneda) antes de buscar un bug |
| `SUM` de un reporte da raro con varias monedas | Estás sumando `amount` en vez de `baseAmount` (RN-36) |
| Un gasto aparece en la quincena equivocada | Zona horaria: se usó `new Date()` del cliente en vez del `Clock` del servidor con la tz del household |
| Un gasto "se movió al día anterior" | Se guardó como `timestamptz` en vez de `@db.Date` |
| Fijo mensual con `dueDay=31` explota en febrero | Falta el `min(dueDay, díaFinQuincena)` de RN-21 |
| `0.30000000000000004` en un total | Alguien usó `number` en vez de `Decimal` |
| "Too many connections" en Postgres | Falta `pgbouncer=true&connection_limit=1`, o `PrismaService` no es singleton global |
| Timeout de 10 s en un reporte | Se están trayendo filas a memoria para sumarlas en JS. Agrega en SQL |
| Usuario nuevo inundado de alertas de "olvidaste pagar" | No se está respetando `controlStartDate` (RN-35) |
| La app cayó de un día para otro sin cambios | Supabase free se pausó por 7 días de inactividad → cron diario |
| `prisma migrate` falla pero la app conecta bien | Migraciones necesitan `DIRECT_URL` (`:5432`), no el pooler |

---

## 12. ESTRUCTURA DEL REPO

```
SICFI/
├── CLAUDE.md                        ← este archivo
├── PLAN_IMPLEMENTACION.md           ← análisis del Excel + 42 RN + 16 fases
├── Presupuesto_Quincenal_2026.xlsx  ← fuente funcional + fixture del importador
├── docs/
│   ├── PROGRESO.md                  ← estado vivo: fase actual, modelo, pendientes
│   ├── architecture.md              (Fase 15)
│   └── business-rules.md            (Fase 15)
├── apps/
│   ├── api/                         NestJS + Prisma
│   └── web/                         Next.js + Tailwind
└── packages/
    ├── contracts/                   Zod compartido
    ├── config-eslint/
    ├── config-typescript/
    └── ui-tokens/
```

---

## 13. ESTADO

Consulta **siempre** `docs/PROGRESO.md` antes de escribir código: dice la fase actual, el modelo
recomendado para ella y qué quedó pendiente de la anterior.
