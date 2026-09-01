# SICFI — Estado del proyecto

> **Léeme al empezar cualquier sesión.** Dice en qué fase estamos, con qué modelo trabajar
> y qué quedó pendiente. Se actualiza al cerrar cada fase, junto con el commit.

**Última actualización:** 2026-08-31 · Fase 1 cerrada
**Fase actual:** 2 — Modelo de datos, migraciones, seeds
**Modelo requerido para la fase actual:** `Opus 5` (→ Haiku 4.5)

---

## Tablero de fases

| Fase | Nombre | Modelo | Horas | Estado |
|:----:|--------|--------|:-----:|--------|
| 0 | Preparación y decisiones | Opus 5 | 2 | ✅ **Completada** |
| 1 | Andamiaje del monorepo | Haiku 4.5 | 3 | ✅ **Completada** |
| 2 | Modelo de datos, migraciones, seeds | **Opus 5** → Haiku 4.5 | 6 | ⬜ Siguiente |
| 3 | **Núcleo de dominio** (crítica) | **Opus 5** | 12 | ⬜ |
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
| | **Total** | | **104 h** | 2 % |

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

### ⚠️ Pendiente del usuario — BLOQUEA LA FASE 2
Estas cuentas hay que crearlas a mano; no se pueden automatizar desde aquí:

- [ ] **Supabase** → crear proyecto `sicfi-dev` (región más cercana: `us-east-1`).
      Copiar a `.env`: `DATABASE_URL` (pooler `:6543`), `DIRECT_URL` (`:5432`), `SUPABASE_URL`,
      `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
- [ ] **GitHub** → crear repo remoto y `git remote add origin ...`
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

## Bitácora de commits por fase

| Fase | Commit | Fecha |
|:----:|--------|-------|
| 0 | `chore(fase-0): preparación, decisiones de arquitectura y contexto del proyecto` | 2026-08-31 |
| 1 | `aa6c843` — `chore(fase-1): andamiaje del monorepo` | 2026-08-31 |
