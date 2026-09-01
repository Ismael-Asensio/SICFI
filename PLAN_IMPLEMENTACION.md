# SICFI — Sistema de Control Financiero Individual
## Análisis del Excel y Plan de Implementación

> **Origen:** `Presupuesto_Quincenal_2026.xlsx` (9 hojas, 28 nombres definidos, 12 reglas de validación de datos, 25 bloques de formato condicional).
> **Objetivo:** convertir ese archivo en una aplicación web multiusuario, responsive (móvil + PC), con NestJS + Prisma + PostgreSQL (Supabase) + Next.js/Tailwind desplegada en Vercel, bajo arquitectura hexagonal.
> **Fecha del plan:** 31 de agosto de 2026.
> **Estado vivo del proyecto:** `docs/PROGRESO.md` · **Contexto para el asistente:** `CLAUDE.md`

## ⚠️ DECISIONES CERRADAS EN LA FASE 0 (2026-08-31)

Las cinco decisiones que este documento dejaba abiertas ya están resueltas. **Tres de ellas
modifican el diseño original** y las secciones §2, §6 y §7 ya están actualizadas en consecuencia.

| # | Decisión | Elección | Impacto |
|---|----------|----------|---------|
| D1 | Frontend | **Next.js 15 App Router** | Ninguno; era la recomendación |
| D2 | Discriminante de tenant | **`householdId`**, no `userId` | +2 tablas (`Household`, `HouseholdMember`), roles, un join más por consulta. Presupuesto compartido desde el MVP |
| D3 | Tratamiento del ahorro | **Traslado a fondo — NO es gasto** | +1 tabla (`SavingsFund`), +1 tipo de movimiento (`RETIRO_AHORRO`), **RN-08/10/12/14 reescritas** |
| D4 | Moneda | **Multimoneda desde el inicio** | +1 tabla (`ExchangeRate`), 3 columnas más en `Transaction`, `Money` con conversión explícita |
| D5 | Multi-año | Esquema multi-año, UI de un año | Ninguno; `year` ya era dimensión |

**Consecuencia en esfuerzo:** el total sube de **85 h a ~104 h**. El desglose actualizado está en
[Resumen de esfuerzo](#resumen-de-esfuerzo-y-modelos).

> **Nota importante para cuando compares con el Excel:** D3 y D4 hacen que algunos números de la
> app **no coincidan** con la hoja original a propósito. El Excel trata el ahorro como gasto y es
> monomoneda. Antes de reportar un bug de cálculo, verifica si la diferencia se explica por D3 o D4.

---

# ÍNDICE

1. [Análisis exhaustivo del Excel](#1-análisis-exhaustivo-del-excel)
2. [Catálogo de reglas de negocio (RN)](#2-catálogo-de-reglas-de-negocio-rn)
3. [Problemas del Excel que la aplicación debe corregir](#3-problemas-del-excel-que-la-aplicación-debe-corregir)
4. [Decisiones de arquitectura y stack](#4-decisiones-de-arquitectura-y-stack)
5. [Arquitectura hexagonal — estructura de carpetas](#5-arquitectura-hexagonal--estructura-de-carpetas)
6. [Modelo de datos (Prisma)](#6-modelo-de-datos-prisma)
7. [Multi-tenancy, autenticación y segregación de datos](#7-multi-tenancy-autenticación-y-segregación-de-datos)
8. [Módulos del sistema](#8-módulos-del-sistema)
9. [Diseño de la API](#9-diseño-de-la-api)
10. [Frontend: rutas, componentes y responsive](#10-frontend-rutas-componentes-y-responsive)
11. [Patrones de diseño aplicados](#11-patrones-de-diseño-aplicados)
12. [Fases de implementación](#12-fases-de-implementación)
13. [Estrategia de optimización de tokens](#13-estrategia-de-optimización-de-tokens)
14. [Testing, CI/CD y despliegue](#14-testing-cicd-y-despliegue)
15. [Riesgos y mitigaciones](#15-riesgos-y-mitigaciones)
16. [Roadmap post-MVP](#16-roadmap-post-mvp)

---

# 1. ANÁLISIS EXHAUSTIVO DEL EXCEL

## 1.1 Inventario de hojas

| # | Hoja | Rango | Naturaleza | Rol en el sistema |
|---|------|-------|-----------|-------------------|
| 1 | `Panel` | A1:E51 | Solo lectura (fórmulas) | Dashboard + motor de alertas |
| 2 | `Config` | A1:D34 | Entrada del usuario | Parámetros y preferencias |
| 3 | `Quincenas` | A1:T31 | Mixta (solo `G` editable) | Calendario de 24 periodos + agregados |
| 4 | `Fijos` | A1:L38 | Entrada del usuario | Catálogo de gastos recurrentes |
| 5 | `Registro` | A1:L402 | Entrada del usuario | Libro de movimientos (396 filas útiles) |
| 6 | `Control` | A1:J39 | Solo lectura | Conciliación de fijos de la quincena activa |
| 7 | `Historial` | A1:AC32 | Solo lectura | Matriz fijos x 24 quincenas |
| 8 | `Reporte` | A1:K46 | Solo lectura | Resumen mensual + gasto por categoría |
| 9 | `Listas` | A1:J27 | Catálogos maestros | Alimenta los desplegables |

**Flujo de dependencias real (grafo de cálculo):**

```
Listas ──▶ Fijos ──┐
                   ├──▶ Quincenas ──┬──▶ Panel
Config ────────────┤                ├──▶ Reporte
                   │                └──▶ Control
Registro ──────────┴──▶ Historial ──▶ Quincenas.T ──▶ Panel
```

`Registro` es la única fuente de hechos. Todo lo demás es agregación o derivación. **Esa separación hecho/derivado es exactamente la frontera entre tablas y read models en la aplicación.**

## 1.2 Hoja `Config` — parámetros del usuario

| Celda | Nombre definido | Campo | Valor actual | Tipo |
|-------|----------------|-------|--------------|------|
| C5 | — | Nombre del presupuesto | "Presupuesto de Kelly" | texto |
| C6 | `Anio` | Año del presupuesto | 2026 | entero |
| C7 | — | Moneda | `C$ (córdobas)` | catálogo |
| C8 | — | Quincena activa (0 = automática) | 0 | 0–24 (validación `whole >= 0`) |
| C9 | — | Quincena de hoy (calculada) | `MATCH(TODAY(); inicios; 1)` | derivado |
| C10 | `Q_Activa` | Quincena mostrada | `IF(C8=0; C9; C8)` | derivado |
| C11 | — | Fecha de hoy | `TODAY()` | derivado |
| C12 | `Fecha_Inicio` | Llevo el control desde | 2026-09-01 | fecha |
| C14 | `Umbral_Gasto` | % del disponible que dispara aviso | 0.80 | porcentaje |
| C15 | `Dias_Aviso` | Días de anticipación para "Por vencer" | 3 | entero |
| C16 | `Dias_Sin_Registro` | Días sin registrar antes de avisar | 5 | entero |
| C17 | `Meta_Ahorro` | Meta de ahorro por quincena | 1 500 | dinero |
| C18 | — | Meta anual | `C17 * 24` | derivado |

**Semántica de color declarada** (B21:D25): amarillo + azul = input del usuario; blanco + negro = calculado; verde = correcto/pagado; amarillo = aviso; rojo = urgente. Se traduce directamente en los *design tokens* del frontend.

## 1.3 Hoja `Listas` — catálogos maestros

**Categorías (24)** con su *tipo sugerido*:

| Categoría | Tipo sugerido | | Categoría | Tipo sugerido |
|-----------|---------------|---|-----------|---------------|
| Vivienda | Fijo | | Cuidado personal | Variable |
| Servicios básicos | Fijo | | Ropa y calzado | Variable |
| Internet y teléfono | Fijo | | Entretenimiento | Variable |
| Transporte | Fijo | | Restaurantes | Variable |
| Combustible | Fijo | | Hogar y mantenimiento | Variable |
| Deudas y tarjetas | Fijo | | Mascotas | Variable |
| Suscripciones | Fijo | | Regalos y celebraciones | Variable |
| Seguros | Fijo | | Familia | Variable |
| Alimentación | Variable | | Impuestos y trámites | Variable |
| Supermercado | Variable | | Ahorro | Ahorro |
| Salud | Variable | | Imprevistos | Variable |
| Educación | Variable | | Otros | Variable |

- **Tipos de movimiento (4):** `Fijo`, `Variable`, `Ahorro`, `Ingreso extra`
- **Métodos de pago (7):** Efectivo, Tarjeta de débito, Tarjeta de crédito, Transferencia, Billetera móvil, Débito automático, Otro
- **Estados de movimiento (3):** Pagado, Pendiente, Programado
- **Frecuencias (2):** Mensual, Quincenal
- **Booleano:** Sí / No

## 1.4 Hoja `Quincenas` — calendario y agregados por periodo

24 filas, una por quincena del año.

| Col | Campo | Fórmula / naturaleza |
|-----|-------|---------------------|
| A | Nº | 1..24 |
| B/C | Mes (nombre / número) | fijo |
| D | Periodo | `Q1` \| `Q2` |
| E | Fecha inicio | `DATE(Anio; mes; SI(Q1;1;16))` |
| F | Fecha fin | `SI(Q1; DATE(Anio;mes;15); DATE(Anio;mes+1;0))` |
| **G** | **Ingreso de la quincena** | **ÚNICO INPUT** (8 500 precargado en las 24) |
| H | Ingresos extra | `SUMIFS(monto; quincena; A; tipo; "Ingreso extra")` |
| I | Total disponible | `G + H` |
| J | Fijos presupuestados | `SUMIFS(fijos; activo="Sí"; aplica=D) + SUMIFS(...; aplica="Ambas")` |
| K | Fijos pagados | `SUMIFS(monto; quincena; A; tipo; "Fijo")` |
| L | Gastos variables | `SUMIFS(...; tipo; "Variable")` |
| M | Ahorro apartado | `SUMIFS(...; tipo; "Ahorro")` |
| N | Total gastado | `K + L + M` |
| O | Fijos pendientes | `MAX(0; J − K)` |
| P | Disponible restante | `I − N` |
| Q | Restante proyectado | `P − O` ← **el número que manda** |
| R | % ejecutado | `SI(I=0; 0; N / I)` |
| S | Estado de la quincena | cascada de 5 estados |
| T | Fijos sin registrar | `INDEX(Historial!F32:AC32; A)` |

Fila 31: totales anuales + `COUNTIF(S; "Sobregiro")`.

## 1.5 Hoja `Fijos` — gastos recurrentes

22 filas útiles (7–28). Inputs: `B` categoría, `C` concepto, `D` monto, `E` día de pago, `F` frecuencia, `H` método, `I` activo, `L` notas.

| Col | Campo | Derivación |
|-----|-------|-----------|
| A | ID | `"F" & TEXTO(fila−6;"00")` → F01..F22 |
| G | Aplica a | `SI(frecuencia="Quincenal"; "Ambas"; SI(día<=15; "Q1"; "Q2"))` |
| J | Costo mensual | `SI(activo="No"; 0; SI(quincenal; monto*2; monto))` |
| K | Costo anual | `J * 12` |

**Datos precargados (5 fijos activos):**

| ID | Categoría | Concepto | Monto | Día | Frecuencia | Método | Aplica | Mensual | Anual |
|----|-----------|----------|-------|-----|-----------|--------|--------|---------|-------|
| F01 | Vivienda | Apoyo Casa | 2 500 | 5 | Quincenal | Transferencia | Ambas | 5 000 | 60 000 |
| F02 | Transporte | Pasajes y transporte | 2 400 | 1 | Quincenal | Efectivo | Ambas | 4 800 | 57 600 |
| F03 | Deudas y tarjetas | Pago Perfume | 400 | 18 | Quincenal | Transferencia | Ambas | 800 | 9 600 |
| F04 | Suscripciones | Streaming | 400 | 12 | Quincenal | Transferencia | Ambas | 800 | 9 600 |
| F05 | Internet y teléfono | Telefono | 700 | 28 | Mensual | Transferencia | Q2 | 700 | 8 400 |

> **Lectura financiera:** total de fijos C$ 12 100/mes = C$ 145 200/año, contra un ingreso proyectado de C$ 204 000 (8 500 × 24). Los fijos consumen el **71,2 %** del ingreso. Quedan ~C$ 2 950 por quincena para variables + ahorro, frente a una meta de ahorro de C$ 1 500/quincena que exigiría vivir con C$ 1 450 de gasto variable quincenal. **La app debe hacer visible esa tensión desde el primer día**: es el principal valor que aporta sobre el Excel.

Resumen (B32:E38): fijos de Q1, fijos de Q2, total mensual, total anual, cantidad de activos, cantidad de bajas.

## 1.6 Hoja `Registro` — libro de movimientos

396 filas (7–402). Inputs: `B` fecha, `E` tipo, `F` categoría, `G` concepto, `H` monto, `I` método, `J` estado, `K` notas.

| Col | Campo | Derivación |
|-----|-------|-----------|
| A | Nº | `CONTAR($B$7:$B7)` correlativo |
| C | Quincena | `COINCIDIR(fecha; inicios_quincena; 1)` |
| D | Mes | `MES(fecha)` |
| L | **Revisión automática** | cascada de 7 validaciones |

**Cascada de validación (columna L), en orden — el primer fallo gana:**

1. Fila vacía → `""`
2. Quincena no resuelta → `"La fecha está fuera del año configurado"`
3. Tipo vacío → `"Falta indicar el tipo"`
4. Monto vacío → `"Falta el monto"`
5. Categoría vacía → `"Falta la categoría"`
6. `tipo = "Fijo"` y el concepto no existe en `Fijos` → `"El concepto no existe en la hoja Fijos"`
7. `estado = "Pendiente"` → `"Movimiento pendiente de pago"`
8. En cualquier otro caso → `"OK"`

## 1.7 Hoja `Control` — conciliación de fijos de la quincena activa

Una fila por fijo (22 posibles), evaluadas contra `Q_Activa`.

| Col | Campo | Lógica |
|-----|-------|--------|
| D | Presupuestado | `SI(inactivo; 0; SI(aplica ∈ {"Ambas", periodo_actual}; monto; 0))` |
| E | Se paga el | `SI(quincenal; fin_de_quincena; FECHA(año; mes_quincena; MIN(día_pago; día_del_fin_de_quincena)))` |
| F | Registrado | `SUMIFS(monto; concepto; C; quincena; Q_Activa; tipo; "Fijo")` |
| G | Fecha en que lo pagaste | `MAX` de las fechas coincidentes |
| H | Diferencia | `F − D` |
| I | **Estado** | ver abajo |
| J | Días restantes | `E − HOY()` |

**Máquina de estados del fijo (columna I):**

```
presupuestado = 0                    → "No aplica"
registrado > 0 y |diferencia| < 1    → "Pagado"
registrado > 0 y |diferencia| >= 1   → "Pagado (monto distinto)"
vence < hoy                          → "VENCIDO sin registrar"   (rojo)
vence − hoy <= Dias_Aviso            → "Por vencer"              (amarillo)
resto                                → "Pendiente"
```

Contadores (B33:D39): presupuestado, pagado, pendiente, `D36` vencidos, `D37` por vencer, `D38` pagados, `D39` pendientes sin vencer. `D36` y `D37` alimentan las alertas A05 y A06 del Panel.

## 1.8 Hoja `Historial` — matriz de cumplimiento

Matriz de 22 fijos x 24 quincenas; cada celda es el monto registrado de ese fijo en esa quincena.

**Fila 32 — "Fijos sin registrar en quincenas ya cerradas":**

```
SI( fin_quincena < HOY()  Y  fin_quincena >= Fecha_Inicio ;
    CONTAR( fijos activos ∧ (aplica = periodo ∨ aplica = "Ambas") ∧ registrado = 0 ) ;
    0 )
```

El formato condicional pinta rojo cuando el fijo debía pagarse en una quincena ya cerrada y no hay registro; verde cuando sí lo hay. **`Fecha_Inicio` evita reclamar quincenas anteriores a que el usuario empezara a usar el sistema** — regla clave para no generar ruido en usuarios nuevos.

## 1.9 Hoja `Panel` — dashboard y motor de alertas

**Cabecera:** quincena activa (nº, mes, periodo, fechas), días para cerrar, último movimiento y días transcurridos.

**Resumen de la quincena (11 métricas):** disponible, fijos presupuestados, fijos pagados, fijos pendientes, variables, ahorro, total gastado, disponible restante, restante proyectado, % ejecutado (contra el umbral), estado general.

**Motor de alertas — 12 reglas (B23:B34), con prefijo semántico en el texto:**

| # | Nivel | Condición | Mensaje |
|---|-------|-----------|---------|
| A01 | URGENTE | `disponible = 0` | No has puesto el ingreso de esta quincena |
| A02 | URGENTE | `gastado > disponible` | Te pasaste por C$ X |
| A03 | AVISO | `0 < gastado <= disponible` ∧ `%ejecutado >= Umbral_Gasto` | Ya usaste el X % y faltan N días |
| A04 | URGENTE | `restante_proyectado < 0` | No alcanza para los fijos pendientes: faltan C$ X |
| A05 | URGENTE | `Control.D36 > 0` | N pago(s) fijo(s) vencido(s) sin registrar |
| A06 | AVISO | `Control.D37 > 0` | N pago(s) vencen en los próximos `Dias_Aviso` días |
| A07 | AVISO | sin movimientos, o `hoy − último > Dias_Sin_Registro` | Hace N días que no registras |
| A08 | AVISO | movimientos `Pendiente` en la quincena activa | N movimiento(s) marcados como Pendiente |
| A09 | AVISO | `SUMA(Quincenas.T) > 0` | N fijos de quincenas cerradas nunca registrados |
| A10 | AVISO | filas del registro con revisión distinta de OK | N fila(s) con datos incompletos |
| A11 | OK / INFO | `Meta_Ahorro > 0` | meta cumplida / faltan C$ X |
| A12 | OK | ninguna de las anteriores | Todo en orden |

**Resumen anual (9 métricas):** ingreso total, fijos pagados, variables, ahorro acumulado, total gastado, saldo del año, % de ahorro sobre ingreso, quincenas con sobregiro, fijos olvidados.

## 1.10 Hoja `Reporte`

**Bloque mensual (12 filas):** ingreso (suma de las quincenas del mes), fijos pagados, variables, ahorro, total gastado, saldo, % de ahorro, % ejecutado y estado del mes (`Sin ingreso` / `Sobregiro` / `Cerca del límite` / `En orden`).

**Bloque por categoría (24 filas):**

| Col | Campo | Lógica |
|-----|-------|--------|
| B | Presupuesto fijo del año | `Q1×12 + Q2×12 + Ambas×24` |
| C | Presupuesto acumulado desde el control | `Q1×nQ1 + Q2×nQ2 + Ambas×(nQ1+nQ2)` |
| D | Registrado en el año | `SUMIFS(monto; categoría; X; tipo; "<>Ingreso extra")` |
| E | Diferencia contra lo presupuestado a la fecha | `D − C` |
| F | Registrado en la quincena activa | filtro adicional por quincena |
| G | % del gasto del año | `D / total` |

**Base del cálculo acumulado (I22:J25):** quincena en que empezó el control, Q1 transcurridas, Q2 transcurridas, total. Es un *prorrateo temporal*: no compara contra el año completo sino contra lo que debió gastarse hasta hoy. Este detalle se pierde con frecuencia al portar hojas de cálculo — hay que conservarlo.

---

# 2. CATÁLOGO DE REGLAS DE NEGOCIO (RN)

Cada regla es rastreable a una celda del Excel y **debe** tener al menos un test unitario. Este catálogo es el contrato del dominio.

### Periodos

- **RN-01** El año se divide en 24 quincenas. `Q1` = días 1–15; `Q2` = día 16 al último del mes.
- **RN-02** `inicio(n) = fecha(año, mes, 1|16)`; `fin(n) = fecha(año, mes, 15)` o último día del mes.
- **RN-03** La quincena de una fecha es aquella cuyo `[inicio, fin]` la contiene. Fuera del año configurado → sin quincena (error de validación).
- **RN-04** La quincena activa es la que contiene *hoy* **en la zona horaria del usuario**, salvo override manual (1–24).
- **RN-05** Una quincena está *cerrada* si `fin < hoy`.

### Disponible y gasto — ⚠️ REESCRITAS POR D3 (el ahorro ya no es gasto)

- **RN-06** `disponible = ingreso_planificado + Σ(INGRESO_EXTRA) + Σ(RETIRO_AHORRO)` de la quincena
- **RN-07** `fijos_presupuestados = Σ(monto de fijos activos cuyo aplicaA ∈ {periodo, AMBAS})`
- **RN-08** `gasto_real = fijos_pagados + variables`. **El ahorro NO es gasto** — es un traslado de dinero a un fondo que sigue siendo tuyo.
- **RN-08b** `salidas_de_caja = gasto_real + ahorro_apartado`. Es lo que efectivamente sale del disponible de la quincena.
- **RN-09** `fijos_pendientes = max(0, presupuestados − pagados)`
- **RN-10** `disponible_restante = disponible − salidas_de_caja`
- **RN-11** `restante_proyectado = disponible_restante − fijos_pendientes` ← métrica principal del producto
- **RN-12** `porcentaje_ejecutado = gasto_real / disponible` (0 si `disponible = 0`). **Es el que usa el umbral de la alerta A03** — el ahorro no debe disparar avisos de sobregasto.
- **RN-12b** `porcentaje_comprometido = salidas_de_caja / disponible`. Métrica secundaria, se muestra junto a la anterior.

> **Diferencia visible contra el Excel:** en la hoja, apartar C$ 1 500 de ahorro subía el "% ejecutado".
> Aquí no: sube el "% comprometido" pero el "% ejecutado" solo mide gasto verdadero. El disponible
> restante baja igual en ambos, porque el dinero sí salió del bolsillo.

### Estado de la quincena (cascada, el primer match gana)

- **RN-13** `disponible = 0` → `SIN_INGRESO`
- **RN-14** `salidas_de_caja > disponible` → `SOBREGIRO`
- **RN-15** `restante_proyectado < 0` → `NO_ALCANZA_FIJOS`
- **RN-16** `% ejecutado >= umbral` → `CERCA_DEL_LIMITE`
- **RN-17** resto → `EN_ORDEN`

### Gastos fijos

- **RN-18** `aplicaA` es **derivado, no editable**: `QUINCENAL → AMBAS`; `MENSUAL → (día ≤ 15 ? Q1 : Q2)`.
- **RN-19** `costo_mensual = inactivo ? 0 : (quincenal ? monto×2 : monto)`; `costo_anual = mensual × 12`.
- **RN-20** Un fijo nunca se borra físicamente si tiene movimientos asociados: se marca inactivo (borrado lógico) para conservar el histórico.
- **RN-21** `fecha_limite` en una quincena: si es quincenal → `fin_quincena`; si es mensual → `fecha(año, mes, min(día_pago, día_del_fin_de_quincena))`. Protege contra el día 31 en febrero.

### Conciliación de fijos (estado por fijo x quincena)

- **RN-22** Cascada: `NO_APLICA` → `PAGADO` (|dif| < tolerancia) → `PAGADO_MONTO_DISTINTO` → `VENCIDO` (límite < hoy) → `POR_VENCER` (límite − hoy ≤ díasAviso) → `PENDIENTE`.
- **RN-23** La tolerancia para "pagado exacto" es configurable (default 1,00).
- **RN-24** Un fijo es *olvidado* si: la quincena está cerrada **y** `fin_quincena >= fecha_inicio_control` **y** el fijo estaba activo y aplicaba **y** no hay ningún movimiento asociado.

### Movimientos

- **RN-25** Tipos: `FIJO`, `VARIABLE`, `AHORRO`, `RETIRO_AHORRO`, `INGRESO_EXTRA`. Suman al disponible `INGRESO_EXTRA` y `RETIRO_AHORRO`; restan `FIJO`, `VARIABLE` y `AHORRO`. Solo `FIJO` y `VARIABLE` cuentan como *gasto real* (RN-08).
- **RN-26** Un movimiento `FIJO` **debe** referenciar un gasto fijo existente del usuario (FK, no coincidencia de texto).
- **RN-27** Estados: `PAGADO`, `PENDIENTE`, `PROGRAMADO`. Los `PENDIENTE` **sí** se contabilizan en el gasto de la quincena (igual que el Excel) pero disparan la alerta A08.
- **RN-28** El monto es `> 0`; la dirección la determina el tipo. Precisión: 2 decimales, `numeric(14,2)`.
- **RN-29** La quincena y el mes de un movimiento son **derivados** de su fecha; no se capturan a mano.

### Reportes

- **RN-30** El gasto por categoría excluye `INGRESO_EXTRA`.
- **RN-31** `presupuesto_acumulado(categoría) = Σ(fijos Q1)×nQ1 + Σ(fijos Q2)×nQ2 + Σ(fijos AMBAS)×(nQ1+nQ2)`, donde `nQx` = quincenas de ese tipo transcurridas entre la quincena de inicio del control y la activa (inclusive).
- **RN-32** El presupuesto por categoría solo existe donde hay fijos; en categorías variables es 0 y solo se muestra lo ejecutado.

### Alertas

- **RN-33** Las 12 reglas de §1.9 se evalúan contra la quincena activa. Cada una es una estrategia independiente y desactivable por el usuario.
- **RN-34** Niveles: `URGENTE` > `AVISO` > `INFO` > `OK`. El Panel las ordena por nivel.
- **RN-35** Ninguna alerta que dependa de fechas puede evaluarse antes de `fecha_inicio_control`.

### Multimoneda — NUEVAS por D4

- **RN-36** Todo movimiento se almacena en su **moneda original** (`currency`, `amount`) junto con el
  `exchangeRate` aplicado y el `baseAmount` resultante en la moneda base del household.
  **Toda agregación de reportes usa `baseAmount`.** Un `SUM(amount)` en un reporte es un bug.
- **RN-37** El tipo de cambio se resuelve **a la fecha del movimiento**. Si no hay tasa para esa fecha
  exacta, se usa la más reciente anterior. Si no existe ninguna y `currency ≠ baseCurrency`, la
  operación se rechaza pidiendo capturar la tasa. Si `currency = baseCurrency`, `exchangeRate = 1`.
- **RN-38** Editar un movimiento **no** recalcula el tipo de cambio histórico. Solo se recalcula si
  cambia la fecha o la moneda. Un gasto de hace tres meses conserva la tasa de aquel día.
- **RN-38b** Cambiar la `baseCurrency` de un household exige recalcular `baseAmount` de todo el
  histórico. Es una operación explícita y transaccional, no un simple `PATCH` de preferencias.

### Fondos de ahorro — NUEVAS por D3

- **RN-39** Un movimiento `AHORRO` o `RETIRO_AHORRO` **debe** referenciar un `savingsFundId`. Cada
  household tiene al menos un fondo por defecto, creado en el onboarding.
- **RN-40** `saldo_fondo = Σ(aportes) − Σ(retiros)`, expresado en la moneda del fondo.
- **RN-41** Un `RETIRO_AHORRO` no puede dejar el saldo del fondo en negativo. Se valida en el dominio
  antes de persistir.
- **RN-41b** El *ahorro efectivo del año* es `Σ(AHORRO) − Σ(RETIRO_AHORRO)`, no `Σ(AHORRO)`. El Panel
  debe mostrar el neto, no el bruto: apartar C$ 1 500 y retirar C$ 1 400 no es ahorrar C$ 1 500.

### Households y roles — NUEVAS por D2

- **RN-42** El discriminante de tenant es `householdId`. Un usuario pertenece a uno o más households,
  cada pertenencia con un rol. `Profile.activeHouseholdId` guarda cuál está viendo.
- **RN-43** Permisos por rol:
  | Rol | Movimientos | Fijos / catálogos / settings | Miembros | Borrar household |
  |-----|-------------|------------------------------|----------|------------------|
  | `OWNER` | todos | sí | invitar, cambiar rol, expulsar | sí |
  | `ADMIN` | todos | sí | invitar, expulsar (no a OWNER) | no |
  | `MEMBER` | crea; edita/borra **solo los suyos**; lee todos | solo lectura | no | no |
  | `VIEWER` | solo lectura | solo lectura | no | no |
- **RN-44** Un household siempre tiene exactamente un `OWNER`. Transferir la propiedad es una
  operación explícita; el último `OWNER` no puede abandonar el household ni degradarse.
- **RN-45** Todo movimiento guarda `createdByUserId` para atribución dentro de un household
  compartido. Ese campo es inmutable.

---

# 3. PROBLEMAS DEL EXCEL QUE LA APLICACIÓN DEBE CORREGIR

| # | Problema en el Excel | Consecuencia | Solución en la app |
|---|---------------------|--------------|--------------------|
| P1 | Los fijos se vinculan al movimiento **por texto exacto** del concepto | Un typo rompe silenciosamente `Control` e `Historial` | FK `recurringExpenseId` + selector, nunca texto libre |
| P2 | Límites fijos: 22 fijos, 396 movimientos, 24 categorías | El archivo se queda corto al segundo año | Sin límite; paginación e índices |
| P3 | Un solo año por archivo | Sin comparativas interanuales | `year` como dimensión; periodos generados por año |
| P4 | `TODAY()` usa la zona horaria de la máquina | La quincena activa cambia según el dispositivo | `timezone` por usuario (`America/Managua`); cálculo en el servidor |
| P5 | Solo `Mensual` y `Quincenal` | No cubre semanal, bimestral, anual (seguros, impuestos) | Enum de frecuencia extensible + `RecurrenceRule` |
| P6 | Ampliar una lista exige editar nombres definidos | Fricción alta para el usuario final | Catálogos como tablas por usuario, CRUD normal |
| P7 | Sin trazabilidad ni histórico de cambios | No se sabe quién cambió un monto ni cuándo | `createdAt`/`updatedAt` + `AuditLog` opcional |
| P8 | Archivo monousuario | No compartible | Multi-tenant por `userId` desde el esquema |
| P9 | Sin adjuntos ni comprobantes | Difícil auditar | Supabase Storage (post-MVP) |
| P10 | El ahorro se computa como gasto y a la vez es "lo que sobra" | Ambigüedad conceptual | Separar `AHORRO` (traslado a fondo) y exponer ambos: saldo y ahorro efectivo |
| P11 | El `id` del fijo depende del número de fila | Reordenar filas reasigna IDs | `cuid()` inmutable + `code` legible estable |
| P12 | El ingreso quincenal se precarga en las 24 filas | Falso positivo: parece que ya planificaste todo el año | Ingreso nulo por defecto + alerta A01 real |

---

# 4. DECISIONES DE ARQUITECTURA Y STACK

## 4.1 Stack

| Capa | Tecnología | Motivo |
|------|-----------|--------|
| Backend | **NestJS 11** (Node 22, TypeScript strict) | DI nativa, modularidad, encaja con hexagonal |
| ORM | **Prisma 6** | Tipado end-to-end, migraciones versionadas, `$transaction` como Unit of Work |
| BD | **Supabase Postgres** (free) | Postgres gestionado + Auth + Storage + pooler |
| Auth | **Supabase Auth** (JWT), verificado en NestJS por JWKS | Registro, login, verificación de email, recuperación y OAuth ya resueltos |
| Frontend | **Next.js 15 (App Router)** + React 19 | Despliegue nativo en Vercel, RSC, streaming |
| Estilos | **Tailwind CSS v4** + `shadcn/ui` (Radix) | Utility-first, accesible, mobile-first |
| Estado servidor | **TanStack Query v5** | Cache, invalidación, optimistic updates |
| Formularios | **react-hook-form + Zod** | Validación compartida con el backend |
| Gráficas | **Recharts** | Ligero, responsive, sin dependencias nativas |
| Contratos | **Zod** en `packages/contracts` | Una sola fuente de verdad de tipos y validación |
| Monorepo | **pnpm workspaces + Turborepo** | Caché de builds, tareas paralelas |
| Tests | Vitest (unit) · Supertest (e2e API) · Playwright (e2e UI) | — |
| Hosting | **Vercel** (web + api) | Gratis, previews por PR |

> **Decisión que tomo por ti y debes conocer:** pediste NestJS, que es solo backend. Para tener Tailwind y una UI responsive hace falta un frontend; elijo **Next.js** porque es lo que Vercel despliega de forma nativa y comparte lenguaje y tipos con NestJS. Si prefieres Vite + React SPA, solo cambia la Fase 9 en adelante; el backend no se toca.

## 4.2 Conexión a Supabase desde serverless (crítico)

Prisma en funciones serverless agota las conexiones de Postgres si se conecta directo. Configuración obligatoria:

```bash
# .env — runtime de la aplicación: pooler de Supabase (Supavisor), modo transaction
DATABASE_URL="postgresql://postgres.[REF]:[PASS]@aws-0-[REGION].pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=1"

# migraciones y prisma db push: conexión directa
DIRECT_URL="postgresql://postgres.[REF]:[PASS]@aws-0-[REGION].pooler.supabase.com:5432/postgres"
```

```prisma
datasource db {
  provider  = "postgresql"
  url       = env("DATABASE_URL")
  directUrl = env("DIRECT_URL")
}
```

`PrismaService` debe ser **singleton global** cacheado en `globalThis` para sobrevivir al *warm start* de la lambda.

## 4.3 NestJS sobre Vercel

Vercel no ejecuta un servidor persistente: envuelve la app como *serverless function*.

```
apps/api/
  api/index.ts        ← entrypoint de Vercel
  src/main.ts         ← entrypoint local (nest start)
  vercel.json
```

```ts
// apps/api/api/index.ts
import { NestFactory } from '@nestjs/core';
import { ExpressAdapter } from '@nestjs/platform-express';
import express, { Express } from 'express';
import { AppModule } from '../src/app.module';

let cached: Express;

async function bootstrap(): Promise<Express> {
  if (cached) return cached;
  const server = express();
  const app = await NestFactory.create(AppModule, new ExpressAdapter(server));
  app.setGlobalPrefix('api');
  app.enableCors({ origin: process.env.WEB_ORIGIN, credentials: true });
  await app.init();
  cached = server;
  return server;
}

export default async function handler(req: any, res: any) {
  const server = await bootstrap();
  return server(req, res);
}
```

```json
// apps/api/vercel.json
{
  "version": 2,
  "builds": [{ "src": "api/index.ts", "use": "@vercel/node" }],
  "rewrites": [{ "source": "/(.*)", "destination": "/api/index" }]
}
```

**Limitaciones del plan gratuito a tener presentes:**
- 10 s de ejecución por invocación → los reportes pesados se resuelven con SQL agregado, no en memoria.
- Sin procesos en segundo plano → los jobs se implementan con **Vercel Cron** (1 al día en free) o **`pg_cron` de Supabase**.
- El proyecto Supabase free **se pausa tras 7 días sin actividad** → un cron diario ligero lo mantiene vivo.
- Cold start de ~1–2 s → el frontend debe mostrar *skeletons*, nunca pantallas en blanco.

## 4.4 Por qué arquitectura hexagonal aquí

El valor de este sistema **no está en el CRUD sino en las reglas** (RN-01 a RN-35): cálculo de quincenas, cascadas de estado, prorrateo del presupuesto, motor de alertas. Esa lógica debe:

1. Poder probarse **sin base de datos ni HTTP** (tests en milisegundos).
2. Sobrevivir a un cambio de ORM, de proveedor de auth o de framework HTTP.
3. Expresarse en el lenguaje del usuario ("restante proyectado", "vencido sin registrar"), no en el del ORM.

Regla de dependencia: **`domain` no importa nada de `application` ni de `infrastructure`. `application` solo importa `domain`. `infrastructure` importa ambas.** Se verifica automáticamente con `eslint-plugin-boundaries` en CI.

---

# 5. ARQUITECTURA HEXAGONAL — ESTRUCTURA DE CARPETAS

```
sicfi/
├── apps/
│   ├── api/                                  # NestJS
│   │   ├── api/index.ts                      # handler de Vercel
│   │   ├── prisma/
│   │   │   ├── schema.prisma
│   │   │   ├── migrations/
│   │   │   └── seed.ts
│   │   ├── src/
│   │   │   ├── main.ts
│   │   │   ├── app.module.ts
│   │   │   │
│   │   │   ├── shared/                       # kernel compartido
│   │   │   │   ├── domain/
│   │   │   │   │   ├── aggregate-root.ts
│   │   │   │   │   ├── entity.ts
│   │   │   │   │   ├── value-object.ts
│   │   │   │   │   ├── domain-event.ts
│   │   │   │   │   ├── result.ts             # Result<T, E> — sin excepciones en el dominio
│   │   │   │   │   ├── errors/domain.error.ts
│   │   │   │   │   └── value-objects/
│   │   │   │   │       ├── money.vo.ts
│   │   │   │   │       ├── percentage.vo.ts
│   │   │   │   │       ├── date-range.vo.ts
│   │   │   │   │       └── user-id.vo.ts
│   │   │   │   ├── application/
│   │   │   │   │   ├── ports/
│   │   │   │   │   │   ├── clock.port.ts
│   │   │   │   │   │   ├── id-generator.port.ts
│   │   │   │   │   │   ├── unit-of-work.port.ts
│   │   │   │   │   │   └── event-bus.port.ts
│   │   │   │   │   └── use-case.interface.ts
│   │   │   │   └── infrastructure/
│   │   │   │       ├── prisma/
│   │   │   │       │   ├── prisma.service.ts
│   │   │   │       │   ├── tenant.extension.ts   # scoping automático por userId
│   │   │   │       │   └── prisma-unit-of-work.ts
│   │   │   │       ├── config/                   # @nestjs/config + validación Zod
│   │   │   │       ├── http/
│   │   │   │       │   ├── filters/domain-exception.filter.ts
│   │   │   │       │   ├── interceptors/{logging,transform}.interceptor.ts
│   │   │   │       │   ├── pipes/zod-validation.pipe.ts
│   │   │   │       │   └── decorators/current-user.decorator.ts
│   │   │   │       ├── clock/system-clock.adapter.ts
│   │   │   │       └── logger/pino.logger.ts
│   │   │   │
│   │   │   └── contexts/                     # bounded contexts
│   │   │       ├── iam/
│   │   │       ├── catalog/
│   │   │       ├── budget/
│   │   │       ├── recurring/
│   │   │       ├── ledger/
│   │   │       └── analytics/
│   │   └── test/
│   │
│   └── web/                                  # Next.js
│       ├── src/
│       │   ├── app/
│       │   │   ├── (auth)/{login,registro,recuperar}/page.tsx
│       │   │   ├── (app)/
│       │   │   │   ├── layout.tsx            # shell: sidebar desktop / bottom-nav móvil
│       │   │   │   ├── panel/page.tsx
│       │   │   │   ├── movimientos/page.tsx
│       │   │   │   ├── fijos/page.tsx
│       │   │   │   ├── quincenas/page.tsx
│       │   │   │   ├── control/page.tsx
│       │   │   │   ├── historial/page.tsx
│       │   │   │   ├── reportes/page.tsx
│       │   │   │   └── ajustes/page.tsx
│       │   │   └── layout.tsx
│       │   ├── components/
│       │   │   ├── ui/                       # design system (shadcn)
│       │   │   ├── layout/
│       │   │   └── features/{panel,ledger,recurring,...}/
│       │   ├── lib/
│       │   │   ├── api/                      # cliente tipado por contexto
│       │   │   ├── query/                    # queryKeys + hooks TanStack
│       │   │   ├── supabase/{client,server}.ts
│       │   │   └── format/{money,date,percent}.ts
│       │   ├── hooks/
│       │   └── styles/globals.css            # tokens Tailwind v4
│       └── middleware.ts                     # protección de rutas
│
├── packages/
│   ├── contracts/                            # Zod + tipos compartidos api ↔ web
│   ├── config-eslint/
│   ├── config-typescript/
│   └── ui-tokens/                            # paleta y escalas compartidas
│
├── turbo.json
├── pnpm-workspace.yaml
└── CLAUDE.md                                 # convenciones para el asistente
```

## 5.1 Anatomía de un contexto (ejemplo: `ledger`)

```
contexts/ledger/
├── domain/
│   ├── entities/transaction.entity.ts            # agregado
│   ├── value-objects/
│   │   ├── transaction-type.vo.ts                # FIJO|VARIABLE|AHORRO|INGRESO_EXTRA
│   │   └── transaction-status.vo.ts
│   ├── services/transaction-validator.service.ts # RN-25..RN-29 (cascada de la col. L)
│   ├── repositories/transaction.repository.ts    # PUERTO (interface)
│   ├── events/transaction-registered.event.ts
│   └── errors/{invalid-amount,period-not-found}.error.ts
│
├── application/
│   ├── use-cases/
│   │   ├── register-transaction.use-case.ts
│   │   ├── update-transaction.use-case.ts
│   │   ├── delete-transaction.use-case.ts
│   │   ├── list-transactions.use-case.ts
│   │   └── bulk-import-transactions.use-case.ts
│   ├── dto/{register-transaction.command.ts, list-transactions.query.ts}
│   └── mappers/transaction.mapper.ts
│
├── infrastructure/
│   ├── persistence/
│   │   ├── prisma-transaction.repository.ts      # ADAPTADOR
│   │   └── transaction.prisma-mapper.ts
│   └── http/
│       ├── transactions.controller.ts
│       └── dto/{create,update,query}-transaction.dto.ts
│
└── ledger.module.ts                              # cablea puertos ↔ adaptadores
```

```ts
// ledger.module.ts — inversión de dependencias explícita
@Module({
  controllers: [TransactionsController],
  providers: [
    RegisterTransactionUseCase,
    TransactionValidatorService,
    { provide: TRANSACTION_REPOSITORY, useClass: PrismaTransactionRepository },
    { provide: CLOCK, useClass: SystemClockAdapter },
  ],
  exports: [TRANSACTION_REPOSITORY],
})
export class LedgerModule {}
```

---

# 6. MODELO DE DATOS (PRISMA)

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider  = "postgresql"
  url       = env("DATABASE_URL")
  directUrl = env("DIRECT_URL")
}

// ───────────────────────── ENUMS ─────────────────────────
enum MovementType   { FIJO VARIABLE AHORRO RETIRO_AHORRO INGRESO_EXTRA }  // D3
enum Frequency      { QUINCENAL MENSUAL BIMESTRAL SEMESTRAL ANUAL }
enum PeriodHalf     { Q1 Q2 }
enum AppliesTo      { Q1 Q2 AMBAS }
enum TxStatus       { PAGADO PENDIENTE PROGRAMADO }
enum CategoryKind   { FIJO VARIABLE AHORRO }
enum HouseholdRole  { OWNER ADMIN MEMBER VIEWER }                          // D2

// ───────────────────────── IAM ─────────────────────────
/// Espejo local de auth.users de Supabase. El id ES el sub del JWT.
model User {
  id        String   @id @db.Uuid
  email     String   @unique
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  profile      Profile?
  memberships  HouseholdMember[]
  transactions Transaction[]      @relation("TxCreatedBy")

  @@map("users")
}

model Profile {
  id          String  @id @default(cuid())
  userId      String  @unique @db.Uuid
  displayName String
  locale      String  @default("es-NI")
  timezone    String  @default("America/Managua")

  /// Household que el usuario está viendo ahora (RN-42)
  activeHouseholdId String?

  user            User       @relation(fields: [userId], references: [id], onDelete: Cascade)
  activeHousehold Household? @relation(fields: [activeHouseholdId], references: [id], onDelete: SetNull)

  @@map("profiles")
}

// ───────────── HOUSEHOLD — DISCRIMINANTE DE TENANT (D2, RN-42) ─────────────
model Household {
  id           String @id @default(cuid())
  name         String
  /// Moneda de consolidación. TODOS los reportes se expresan aquí (RN-36)
  baseCurrency String @default("NIO")            // ISO 4217
  timezone     String @default("America/Managua")

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  members           HouseholdMember[]
  settings          BudgetSettings[]
  categories        Category[]
  paymentMethods    PaymentMethod[]
  savingsFunds      SavingsFund[]
  periods           Period[]
  recurringExpenses RecurringExpense[]
  transactions      Transaction[]
  exchangeRates     ExchangeRate[]
  activeForProfiles Profile[]

  @@map("households")
}

model HouseholdMember {
  id          String        @id @default(cuid())
  householdId String
  userId      String        @db.Uuid
  role        HouseholdRole @default(MEMBER)      // RN-43
  joinedAt    DateTime      @default(now())

  household Household @relation(fields: [householdId], references: [id], onDelete: Cascade)
  user      User      @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([householdId, userId])
  @@index([userId])
  @@map("household_members")
}

/// Invitación por email; el invitado se une al aceptarla
model HouseholdInvite {
  id          String        @id @default(cuid())
  householdId String
  email       String
  role        HouseholdRole @default(MEMBER)
  token       String        @unique
  expiresAt   DateTime
  acceptedAt  DateTime?
  createdAt   DateTime      @default(now())

  @@unique([householdId, email])
  @@map("household_invites")
}

// ───────────────────────── CONFIG (hoja Config) ─────────────────────────
model BudgetSettings {
  id          String @id @default(cuid())
  householdId String
  year        Int
  name        String @default("Mi presupuesto")

  /// null = automática por fecha; 1..24 = override manual (Config!C8)
  activePeriodOverride Int?

  /// Config!C12 — no se generan alertas de quincenas anteriores a esta fecha (RN-35)
  controlStartDate    DateTime @db.Date

  spendThreshold      Decimal  @default(0.80) @db.Decimal(4, 3)  // Umbral_Gasto
  dueSoonDays         Int      @default(3)                        // Dias_Aviso
  inactivityDays      Int      @default(5)                        // Dias_Sin_Registro
  savingGoalPerPeriod Decimal  @default(0)     @db.Decimal(14, 2) // Meta_Ahorro
  paidToleranceAmount Decimal  @default(1)     @db.Decimal(14, 2) // RN-23

  /// Reglas de alerta desactivadas: ["A07","A10"]
  disabledAlerts String[] @default([])

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  household Household @relation(fields: [householdId], references: [id], onDelete: Cascade)

  @@unique([householdId, year])
  @@map("budget_settings")
}

// ───────────────────────── CATÁLOGOS (hoja Listas) ─────────────────────────
model Category {
  id          String       @id @default(cuid())
  householdId String
  name        String
  kind        CategoryKind @default(VARIABLE)   // "tipo sugerido"
  color       String?                           // #RRGGBB para gráficas
  icon        String?
  isSystem    Boolean      @default(false)      // vino del seed
  isActive    Boolean      @default(true)
  sortOrder   Int          @default(0)

  recurringExpenses RecurringExpense[]
  transactions      Transaction[]
  household         Household @relation(fields: [householdId], references: [id], onDelete: Cascade)

  @@unique([householdId, name])
  @@index([householdId, isActive])
  @@map("categories")
}

model PaymentMethod {
  id          String  @id @default(cuid())
  householdId String
  name        String
  isSystem    Boolean @default(false)
  isActive    Boolean @default(true)
  sortOrder   Int     @default(0)

  recurringExpenses RecurringExpense[]
  transactions      Transaction[]
  household         Household @relation(fields: [householdId], references: [id], onDelete: Cascade)

  @@unique([householdId, name])
  @@map("payment_methods")
}

// ───────────── FONDOS DE AHORRO (D3, RN-39..RN-41) ─────────────
model SavingsFund {
  id           String   @id @default(cuid())
  householdId  String
  name         String                                   // "Fondo general", "Imprevistos", "Viaje"
  currency     String   @default("NIO")
  targetAmount Decimal? @db.Decimal(14, 2)              // meta opcional
  targetDate   DateTime? @db.Date
  isDefault    Boolean  @default(false)
  isActive     Boolean  @default(true)

  transactions Transaction[]
  household    Household @relation(fields: [householdId], references: [id], onDelete: Cascade)

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@unique([householdId, name])
  @@index([householdId, isActive])
  @@map("savings_funds")
}

// ───────────── TIPOS DE CAMBIO (D4, RN-37) ─────────────
model ExchangeRate {
  id          String   @id @default(cuid())
  /// null = tasa global (p. ej. importada del BCN); con valor = tasa manual del household
  householdId String?
  baseCurrency  String                       // ISO 4217 — a la que se convierte
  quoteCurrency String                       // ISO 4217 — desde la que se convierte
  date        DateTime @db.Date
  rate        Decimal  @db.Decimal(18, 8)    // 1 quote = rate * base
  source      String   @default("MANUAL")    // MANUAL | BCN | API

  household Household? @relation(fields: [householdId], references: [id], onDelete: Cascade)

  createdAt DateTime @default(now())

  @@unique([householdId, baseCurrency, quoteCurrency, date])
  @@index([baseCurrency, quoteCurrency, date(sort: Desc)])
  @@map("exchange_rates")
}

// ───────────────────────── QUINCENAS (hoja Quincenas) ─────────────────────────
model Period {
  id          String     @id @default(cuid())
  householdId String
  year        Int
  number      Int                              // 1..24
  month       Int                              // 1..12
  half        PeriodHalf
  startDate   DateTime   @db.Date
  endDate     DateTime   @db.Date

  /// Quincenas!G — ÚNICO input de esta hoja. null = aún no planificado (dispara A01)
  plannedIncome         Decimal? @db.Decimal(14, 2)
  plannedIncomeCurrency String   @default("NIO")

  transactions Transaction[]
  household    Household @relation(fields: [householdId], references: [id], onDelete: Cascade)

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@unique([householdId, year, number])
  @@index([householdId, startDate, endDate])
  @@map("periods")
}

// ───────────────────────── FIJOS (hoja Fijos) ─────────────────────────
model RecurringExpense {
  id          String    @id @default(cuid())
  householdId String
  code        String                                 // F01, F02… estable (corrige P11)
  categoryId  String
  concept     String
  amount      Decimal   @db.Decimal(14, 2)
  currency    String    @default("NIO")              // D4
  dueDay      Int                                    // 1..31
  frequency   Frequency @default(QUINCENAL)

  /// DERIVADO (RN-18) — se persiste para poder indexar y agregar en SQL
  appliesTo AppliesTo

  paymentMethodId String?
  isActive        Boolean   @default(true)
  notes           String?
  startDate       DateTime? @db.Date                 // vigencia
  endDate         DateTime? @db.Date

  category      Category       @relation(fields: [categoryId], references: [id], onDelete: Restrict)
  paymentMethod PaymentMethod? @relation(fields: [paymentMethodId], references: [id], onDelete: SetNull)
  transactions  Transaction[]
  household     Household @relation(fields: [householdId], references: [id], onDelete: Cascade)

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@unique([householdId, code])
  @@unique([householdId, concept])
  @@index([householdId, isActive, appliesTo])
  @@map("recurring_expenses")
}

// ───────────────────────── MOVIMIENTOS (hoja Registro) ─────────────────────────
model Transaction {
  id          String       @id @default(cuid())
  householdId String
  date        DateTime     @db.Date
  periodId    String                                 // DERIVADO de date (RN-29)
  type        MovementType
  categoryId  String
  concept     String

  /// FK en vez de coincidencia por texto — corrige P1. Obligatorio si type = FIJO (RN-26)
  recurringExpenseId String?

  /// Obligatorio si type ∈ {AHORRO, RETIRO_AHORRO} (RN-39)
  savingsFundId String?

  // ── Dinero multimoneda (D4, RN-36..RN-38) ──
  amount       Decimal @db.Decimal(14, 2)    // en la moneda original
  currency     String  @default("NIO")       // ISO 4217
  exchangeRate Decimal @default(1) @db.Decimal(18, 8)
  /// amount × exchangeRate. TODA agregación de reportes usa ESTE campo
  baseAmount   Decimal @db.Decimal(14, 2)

  paymentMethodId String?
  status          TxStatus @default(PAGADO)
  notes           String?

  /// Atribución dentro de un household compartido. Inmutable (RN-45)
  createdByUserId String @db.Uuid

  category         Category          @relation(fields: [categoryId], references: [id], onDelete: Restrict)
  paymentMethod    PaymentMethod?    @relation(fields: [paymentMethodId], references: [id], onDelete: SetNull)
  period           Period            @relation(fields: [periodId], references: [id], onDelete: Restrict)
  recurringExpense RecurringExpense? @relation(fields: [recurringExpenseId], references: [id], onDelete: SetNull)
  savingsFund      SavingsFund?      @relation(fields: [savingsFundId], references: [id], onDelete: Restrict)
  createdBy        User              @relation("TxCreatedBy", fields: [createdByUserId], references: [id], onDelete: Restrict)
  household        Household         @relation(fields: [householdId], references: [id], onDelete: Cascade)

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([householdId, date(sort: Desc)])
  @@index([householdId, periodId, type])
  @@index([householdId, categoryId])
  @@index([householdId, recurringExpenseId, periodId])
  @@index([householdId, savingsFundId])
  @@map("transactions")
}

// ───────────────────────── AUDITORÍA ─────────────────────────
model AuditLog {
  id          String   @id @default(cuid())
  householdId String
  userId      String   @db.Uuid          // quién hizo el cambio
  entity      String
  entityId    String
  action      String                     // CREATE | UPDATE | DELETE
  changes     Json
  at          DateTime @default(now())

  @@index([householdId, at(sort: Desc)])
  @@map("audit_logs")
}
```

## 6.1 Notas de modelado

- **Dinero:** `Decimal(14,2)` en Postgres, `Decimal.js` en la aplicación. **Nunca `Float`.** El VO `Money` encapsula moneda + monto y **prohíbe operar entre monedas distintas**: sumar C$ con US$ solo es posible pasando por una conversión explícita.
- **`baseAmount` es la columna que agregan los reportes** (RN-36). `amount` y `currency` existen para mostrar el movimiento como el usuario lo capturó. Un `SUM(amount)` en `analytics` es un bug — añádelo a la revisión de código.
- **`exchangeRate` es histórico e inmutable** salvo cambio de fecha o moneda (RN-38). Es la diferencia entre un sistema contable correcto y uno que reescribe el pasado cada vez que fluctúa el dólar.
- **Fechas de negocio:** `@db.Date` (sin hora ni zona). Los `timestamps` de auditoría sí llevan zona. Esto elimina el bug clásico de "el gasto se movió al día anterior".
- **`appliesTo` persistido pese a ser derivado:** permite el `SUM ... GROUP BY` de RN-07 en SQL puro. Se recalcula siempre en el dominio al guardar (nunca lo escribe el cliente).
- **`periodId` persistido:** evita un rango de fechas en cada agregación. Se recalcula si cambia la fecha del movimiento.
- **`onDelete: Restrict`** en categoría, periodo, fondo y `createdBy`: impide huérfanos. Los fijos usan borrado lógico (RN-20).
- **`onDelete: Cascade` desde `Household`:** borrar un household borra todos sus datos. Es la única cascada destructiva del esquema y debe estar detrás de doble confirmación en la UI.
- **Índices:** todos empiezan por `householdId` — es el discriminante de tenant y el primer filtro de toda consulta.
- **`HouseholdMember` tiene índice por `userId`** además del único compuesto: se consulta en cada request para resolver a qué households pertenece el usuario del JWT.
- **`ExchangeRate.householdId` nullable:** permite tasas globales compartidas (importadas del BCN) y tasas manuales privadas. La resolución busca primero la del household, luego la global (RN-37).

---

# 7. MULTI-TENANCY, AUTENTICACIÓN Y SEGREGACIÓN DE DATOS

Modelo elegido: **base de datos compartida, esquema compartido, discriminante `householdId`** (D2).
Es lo correcto para miles de usuarios de escala personal, soporta presupuestos compartidos sin
migración posterior, y es lo que el free tier aguanta.

> **Distinción que hay que tener clara:** `userId` identifica **quién** hace la petición (autenticación
> y atribución); `householdId` determina **qué datos** puede ver (autorización y aislamiento). Un
> usuario puede pertenecer a varios households; el activo se resuelve en cada request.

## 7.1 Flujo de autenticación y resolución de tenant

```
Navegador ──▶ Supabase Auth (signUp / signInWithPassword / OAuth)
              └─▶ access_token (JWT, ~1 h) + refresh_token (cookie httpOnly)
Navegador ──▶ NestJS  Authorization: Bearer <JWT>   [+ X-Household-Id opcional]
NestJS    ──▶ 1. verifica firma contra el JWKS de Supabase (cacheado)
              2. sub → userId
              3. resuelve householdId:
                   header X-Household-Id  →  valida que exista membresía
                   si no                  →  Profile.activeHouseholdId
              4. carga el rol de esa membresía
              5. { userId, householdId, role } → AsyncLocalStorage
```

**Regla de oro:** el `householdId` **nunca** se toma del cuerpo de la petición. Siempre se resuelve
en el guard contra una membresía verificada. Si viniera del body, cualquiera podría escribir en el
household de otro simplemente cambiando un campo del JSON.

- Los tokens **nunca** se guardan en `localStorage`: cookies `httpOnly`, `Secure`, `SameSite=Lax`, gestionadas por `@supabase/ssr` en el middleware de Next.
- El middleware de Next protege el grupo de rutas `(app)` y refresca la sesión.
- El registro dispara un webhook o un `ensureUser()` idempotente en el primer request autenticado, que crea `User`, `Profile`, `BudgetSettings` del año, los 24 `Period` y siembra categorías y métodos de pago.

## 7.2 Tres capas de defensa

**Capa 1 — Guard global.** Todas las rutas exigen JWT válido salvo las marcadas `@Public()`.

```ts
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly jwks: JwksService, private readonly als: TenantContext) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest();
    const token = extractBearer(req);
    if (!token) throw new UnauthorizedException();
    const payload = await this.jwks.verify(token);       // valida firma, exp, aud, iss
    this.als.setUserId(payload.sub);                      // AsyncLocalStorage
    req.user = { id: payload.sub, email: payload.email };
    return true;
  }
}
```

**Capa 2 — Prisma Client Extension (la clave).** Inyecta `householdId` en **todas** las operaciones. Si un repositorio olvida filtrar, el filtro se aplica igual.

```ts
// shared/infrastructure/prisma/tenant.extension.ts
const TENANT_MODELS = new Set([
  'BudgetSettings','Category','PaymentMethod','SavingsFund','ExchangeRate',
  'Period','RecurringExpense','Transaction','AuditLog','HouseholdMember',
]);

export const tenantExtension = (getHouseholdId: () => string | undefined) =>
  Prisma.defineExtension({
    name: 'tenant-scope',
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          if (!model || !TENANT_MODELS.has(model)) return query(args);
          const householdId = getHouseholdId();
          if (!householdId) throw new MissingTenantError(`${model}.${operation}`);

          if (/^(findFirst|findMany|findUnique|count|aggregate|groupBy|updateMany|deleteMany)/.test(operation)) {
            args.where = { ...(args.where ?? {}), householdId };
          }
          if (operation === 'create')     args.data = { ...args.data, householdId };
          if (operation === 'createMany') args.data = toArray(args.data).map(d => ({ ...d, householdId }));
          if (/^(update|delete|upsert)$/.test(operation)) {
            args.where = { ...(args.where ?? {}), householdId };   // exige índice compuesto
          }
          return query(args);
        },
      },
    },
  });
```

> `findUnique` con un `where` extra deja de ser `findUnique` para Prisma. En los repositorios usa
> `findFirst({ where: { id, householdId } })` para búsquedas por id — la extensión lo cubre, pero
> escribirlo explícito evita sorpresas de tipado.

**Capa 3 — RLS en Postgres (defensa en profundidad).**

```sql
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON transactions
  USING (
    household_id IN (
      SELECT household_id FROM household_members WHERE user_id = auth.uid()
    )
  )
  WITH CHECK (
    household_id IN (
      SELECT household_id FROM household_members WHERE user_id = auth.uid()
    )
  );
-- repetir para las 10 tablas con household_id
```

## 7.2b Autorización por rol (RN-43)

El aislamiento por household responde "¿puedes ver estos datos?". El rol responde "¿puedes
modificarlos?". Se implementa con un `RolesGuard` + decorador declarativo:

```ts
@Post()
@RequireRole(HouseholdRole.MEMBER)          // MEMBER o superior
create(@Body() dto: CreateTransactionDto) { ... }

@Patch(':id')
@RequireRole(HouseholdRole.MEMBER)
@RequireOwnership('transaction')            // MEMBER solo edita los suyos; ADMIN+ cualquiera
update(...) { ... }

@Delete('/households/:id')
@RequireRole(HouseholdRole.OWNER)
remove(...) { ... }
```

La comprobación de propiedad (`createdByUserId === userId`) vive en el caso de uso, no en el guard:
es una regla de negocio, no de transporte.

> **Advertencia honesta:** si Prisma se conecta con el rol `postgres` (superusuario), **RLS no se aplica**. Por eso la Capa 2 es la barrera real. RLS protege el acceso directo vía cliente de Supabase, PostgREST o SQL manual — que es exactamente donde ocurren las fugas por descuido. Para que RLS también cubra a Prisma habría que conectarse con un rol no privilegiado y hacer `SET LOCAL request.jwt.claims` por transacción; queda documentado como mejora en el Roadmap.

## 7.3 Prueba de la segregación (obligatoria antes de producción)

Test e2e con dos households A y B: A crea movimientos, fijos, fondos y categorías; un usuario de B
intenta leer, actualizar y borrar cada recurso por id. Toda respuesta debe ser `404` (no `403`: no se
filtra la existencia del recurso). **Este test bloquea el merge si falla.**

Segunda batería, dentro del mismo household: un `VIEWER` intenta escribir (debe recibir `403`), y un
`MEMBER` intenta editar un movimiento creado por otro miembro (debe recibir `403`, mientras que un
`ADMIN` sí puede). Aislamiento y permisos son fallos distintos y necesitan pruebas distintas.

---

# 8. MÓDULOS DEL SISTEMA

| Contexto | Hojas del Excel | Responsabilidad | Naturaleza |
|----------|-----------------|-----------------|-----------|
| **iam** | — | Registro, login, perfil, onboarding | Comandos |
| **catalog** | `Listas` | Categorías y métodos de pago del usuario | CRUD |
| **budget** | `Config`, `Quincenas` | Parámetros del año, generación de las 24 quincenas, ingreso planificado | CRUD + factory |
| **recurring** | `Fijos` | Gastos fijos, derivación de `appliesTo`, costos mensual/anual | CRUD + reglas |
| **ledger** | `Registro` | Alta/edición/borrado de movimientos, validación en cascada | Núcleo transaccional |
| **analytics** | `Panel`, `Control`, `Historial`, `Reporte` | Todos los agregados y el motor de alertas | **Solo lectura (CQRS query side)** |
| **importer** | archivo `.xlsx` | Migración del Excel existente | Servicio de aplicación |
| **notifications** | — | Recordatorios (post-MVP) | Jobs |

**Nota de diseño:** `analytics` **no tiene repositorios de escritura ni entidades**. Es el lado *query* de un CQRS ligero: recibe parámetros, ejecuta SQL agregado (o vistas materializadas si crecen los datos) y devuelve DTOs de lectura. Meter estos cálculos en las entidades de dominio sería un error de diseño clásico — no son invariantes de un agregado, son proyecciones.

## 8.1 El motor de alertas como Strategy

```ts
// analytics/domain/alerts/alert-rule.port.ts
export interface AlertRule {
  readonly code: string;                 // 'A01'..'A12'
  readonly level: AlertLevel;
  evaluate(ctx: AlertContext): Alert | null;
}

// analytics/domain/alerts/rules/overdraft.rule.ts
export class OverdraftRule implements AlertRule {
  readonly code = 'A02';
  readonly level = AlertLevel.URGENTE;

  evaluate({ snapshot, currency }: AlertContext): Alert | null {
    if (!snapshot.totalSpent.greaterThan(snapshot.available)) return null;
    const over = snapshot.totalSpent.minus(snapshot.available);
    return {
      code: this.code,
      level: this.level,
      title: 'Te pasaste del disponible',
      message: `Te pasaste por ${format(over, currency)}. Frena los gastos variables o ajusta lo que apartaste para ahorro.`,
      action: { label: 'Ver movimientos', href: '/movimientos' },
    };
  }
}
```

Las 12 reglas se registran en un array inyectable. El `EvaluateAlertsUseCase` recorre el array, descarta las de `disabledAlerts`, ordena por nivel y devuelve la lista. **Añadir una alerta nueva = añadir una clase, sin tocar nada más** (Open/Closed).

---

# 9. DISEÑO DE LA API

Base: `/api/v1`. Todas las rutas exigen `Authorization: Bearer <jwt>` salvo `/health`.

### Perfil y configuración
```
GET    /me                                  perfil + settings del año activo
PATCH  /me/profile                          nombre, moneda, locale, timezone
GET    /settings/:year
PATCH  /settings/:year                      umbral, díasAviso, meta de ahorro, alertas activas
POST   /settings/:year/bootstrap            genera las 24 quincenas del año
```

### Catálogos
```
GET    /categories?active=true
POST   /categories
PATCH  /categories/:id
DELETE /categories/:id                      409 si tiene movimientos
GET    /payment-methods
POST   /payment-methods
PATCH  /payment-methods/:id
DELETE /payment-methods/:id
```

### Quincenas
```
GET    /periods?year=2026                   las 24 con sus agregados (equivale a la hoja Quincenas)
GET    /periods/active                      resuelve override o fecha de hoy (RN-04)
GET    /periods/:id
PATCH  /periods/:id/income                  { plannedIncome }
PATCH  /periods/bulk-income                 { year, amount, from?, to? }  ← "aplicar a todas"
```

### Gastos fijos
```
GET    /recurring-expenses?active=true
POST   /recurring-expenses
PATCH  /recurring-expenses/:id
PATCH  /recurring-expenses/:id/toggle       activar / dar de baja (RN-20)
DELETE /recurring-expenses/:id              409 si tiene movimientos → sugiere toggle
GET    /recurring-expenses/summary          Q1, Q2, mensual, anual, activos, bajas
```

### Movimientos
```
GET    /transactions?periodId=&type=&categoryId=&from=&to=&status=&q=&cursor=&limit=
POST   /transactions
POST   /transactions/bulk                   alta múltiple
PATCH  /transactions/:id
DELETE /transactions/:id
POST   /transactions/from-recurring/:id     ← "marcar como pagado" en un toque
GET    /transactions/validation-issues      filas con revisión distinta de OK (col. L)
```

### Analítica
```
GET    /dashboard?periodId=                 Panel completo: métricas + alertas + resumen anual
GET    /control?periodId=                   conciliación de fijos + contadores
GET    /history?year=2026                   matriz fijos x 24 quincenas + fila de olvidados
GET    /reports/monthly?year=2026           12 filas
GET    /reports/by-category?year=2026        24 filas con prorrateo acumulado
GET    /reports/trends?months=12             series para gráficas
GET    /reports/export?format=xlsx|csv       exportación
```

### Importación
```
POST   /import/excel                        multipart; valida y devuelve un preview
POST   /import/excel/confirm                aplica el import previamente validado
```

## 9.1 Convenciones

- **Errores:** RFC 7807 (`application/problem+json`) con `type`, `title`, `status`, `detail`, `errors[]`.
- **Paginación:** cursor (`?cursor=&limit=`), nunca `offset` — el registro crece sin techo.
- **Idempotencia:** cabecera `Idempotency-Key` en `POST /transactions` para evitar duplicados por doble toque en móvil.
- **Versionado:** prefijo `/v1` desde el primer día.
- **OpenAPI:** generado con `@nestjs/swagger` en `/api/docs` (protegido fuera de desarrollo).
- **Validación:** `ZodValidationPipe` con los esquemas de `packages/contracts` — el mismo esquema valida en el navegador y en el servidor.

---

# 10. FRONTEND: RUTAS, COMPONENTES Y RESPONSIVE

## 10.1 Filosofía: mobile-first de verdad

El caso de uso dominante es **registrar un gasto en la calle, en 15 segundos, con una mano**. Todo lo demás es secundario.

- Botón flotante `+` siempre visible en móvil (`fixed bottom-20 right-4`).
- El alta de movimiento es un `Sheet` que sube desde abajo, con foco automático en el monto y teclado numérico (`inputMode="decimal"`).
- Campos precargados con lo más probable: fecha = hoy, tipo = `VARIABLE`, método = el más usado del usuario.
- Objetivo: **3 toques** para registrar un gasto (`+` → monto → categoría → guardar).
- Áreas táctiles ≥ 44 px. Nada de acciones críticas dependientes de hover.

## 10.2 Navegación adaptativa

| Breakpoint | Navegación | Layout |
|-----------|-----------|--------|
| `< 768px` | Bottom nav de 5 items (Panel · Movimientos · `+` · Fijos · Más) | 1 columna, tarjetas apiladas |
| `768–1024px` | Sidebar colapsada (iconos) | 2 columnas |
| `> 1024px` | Sidebar expandida | 3 columnas, tablas completas |

**Tablas → tarjetas:** las tablas densas (`Movimientos`, `Control`, `Historial`) se renderizan como lista de tarjetas por debajo de `md`. El `Historial` (22 x 24) usa scroll horizontal con primera columna fija (`sticky left-0`) en escritorio y un selector de quincena en móvil.

## 10.3 Design tokens (Tailwind v4, derivados de la leyenda del Excel)

```css
/* apps/web/src/styles/globals.css */
@import "tailwindcss";

@theme {
  --color-ok-50:  oklch(0.96 0.03 150);
  --color-ok-500: oklch(0.62 0.15 150);   /* verde  — en orden / pagado */
  --color-warn-50:  oklch(0.97 0.04 85);
  --color-warn-500: oklch(0.75 0.15 85);  /* ámbar  — aviso / por vencer */
  --color-danger-50:  oklch(0.96 0.03 25);
  --color-danger-500: oklch(0.58 0.20 25);/* rojo   — urgente / vencido */
  --color-info-500: oklch(0.60 0.14 250); /* azul   — informativo */

  --font-sans: "Inter Variable", system-ui, sans-serif;
  --font-mono: "JetBrains Mono", ui-monospace, monospace;  /* cifras */
}

/* soporte de tema del sistema + override explícito */
:root { color-scheme: light dark; }
```

Los importes se renderizan con `font-mono` y `tabular-nums` para que las columnas de cifras alineen.

## 10.4 Pantallas

| Ruta | Hoja de origen | Contenido |
|------|---------------|-----------|
| `/panel` | `Panel` | Selector de quincena · 4 KPI (disponible, gastado, **restante proyectado**, ahorro) · barra de progreso vs. umbral · lista de alertas ordenada por nivel · donut por categoría · accesos rápidos |
| `/movimientos` | `Registro` | Filtros (quincena, tipo, categoría, texto) · lista virtualizada · edición en línea en escritorio · Sheet en móvil · banner de filas con problemas |
| `/fijos` | `Fijos` | Tarjetas con concepto, monto, día, frecuencia, `appliesTo` calculado · toggle activo · totales Q1/Q2/mensual/anual |
| `/quincenas` | `Quincenas` | Tabla de 24 filas, quincena activa resaltada · edición del ingreso en línea · acción "aplicar a todas" · barra de datos del % ejecutado |
| `/control` | `Control` | Lista de fijos de la quincena con badge de estado · botón **"Marcar como pagado"** que crea el movimiento en un toque · contadores |
| `/historial` | `Historial` | Matriz 22 x 24 (heatmap) con celdas rojas para olvidos · en móvil, vista por quincena |
| `/reportes` | `Reporte` | Pestañas Mensual / Por categoría / Tendencias · gráficas Recharts · exportar |
| `/ajustes` | `Config` + `Listas` | Perfil, moneda, zona horaria, umbrales, meta de ahorro, alertas activables, catálogos, importar Excel |

## 10.5 Estrategia de datos

- **RSC** para la carga inicial del Panel y los reportes (HTML directo, sin *waterfall*).
- **TanStack Query** para lo interactivo, con `queryKeys` jerárquicas: `['transactions', { periodId, filters }]`.
- **Optimistic updates** al registrar un movimiento: aparece en la lista antes de la respuesta; si falla, se revierte con un toast.
- Invalidación en cascada: crear un movimiento invalida `transactions`, `dashboard`, `control`, `periods`.
- **PWA** (`manifest.json` + service worker) para instalarla en el teléfono. Cola offline de movimientos en IndexedDB → post-MVP, pero el manifest va desde el MVP.

---

# 11. PATRONES DE DISEÑO APLICADOS

| Patrón | Dónde | Para qué |
|--------|-------|----------|
| **Ports & Adapters** | todo el backend | Aislar el dominio de Prisma, HTTP y Supabase |
| **Repository** | `domain/repositories/*` + `infrastructure/persistence/*` | Persistencia en lenguaje de dominio |
| **Use Case / Command Handler** | `application/use-cases/*` | Una clase = una operación de negocio, un `execute()` |
| **CQRS ligero** | `ledger` (write) vs. `analytics` (read) | Escrituras con invariantes; lecturas con SQL agregado |
| **Strategy** | `AlertRule` (12 reglas), `PeriodStatusResolver` | Añadir reglas sin modificar el motor (OCP) |
| **Chain of Responsibility** | `TransactionValidator` (columna L) | La cascada de 7 validaciones, en orden y cortocircuitada |
| **State** | `RecurringExpenseStatus`, `PeriodStatus` | Transiciones explícitas, no `if` anidados |
| **Value Object** | `Money`, `Percentage`, `DateRange`, `DueDay` | Imposibilita estados inválidos por construcción |
| **Factory** | `PeriodFactory.createYear(year, tz)` | Genera las 24 quincenas con RN-01/RN-02 |
| **Specification** | `TransactionSpecification` | Filtros componibles traducidos a `where` de Prisma |
| **Data Mapper** | `*.prisma-mapper.ts` | Fila de BD ↔ entidad de dominio |
| **Unit of Work** | `PrismaUnitOfWork` sobre `$transaction` | Atomicidad multi-agregado (import, bootstrap) |
| **Decorator** | `tenantExtension` de Prisma | Scoping por tenant transversal |
| **Result / Either** | `Result<T, DomainError>` | Errores esperados sin excepciones en el dominio |
| **Adapter** | `SupabaseAuthAdapter`, `SystemClockAdapter` | `Clock` inyectable = tests deterministas de fechas |
| **DTO + ACL** | `dto/` en cada capa | El modelo de BD nunca se filtra al cliente |
| **Facade** | `DashboardQueryService` | Una llamada compone las 11 métricas + 12 alertas |
| **Observer / Domain Events** | `TransactionRegisteredEvent` | Desacopla efectos secundarios (notificaciones, auditoría) |
| **Outbox** | tabla `outbox` (post-MVP) | Entrega fiable de eventos sin broker |

**Principios que se verifican en CI:** SOLID (con `eslint-plugin-boundaries` para DIP), *Tell, Don't Ask* en las entidades, *fail fast* en los constructores de los VO, e inmutabilidad de los VO (`readonly` + `Object.freeze`).

---

# 12. FASES DE IMPLEMENTACIÓN

Cada fase indica el **modelo recomendado** y por qué. La lógica del reparto:

| Modelo | Cuándo usarlo | Por qué |
|--------|--------------|---------|
| **Opus 5** | Diseño arquitectónico, dominio, seguridad, SQL analítico, depuración difícil | Decisiones con efecto en cascada; equivocarse aquí cuesta mucho más que el token ahorrado |
| **Sonnet 5** | Implementación en volumen: casos de uso, controladores, repositorios, componentes React | Excelente relación calidad/costo cuando el patrón ya está definido |
| **Haiku 4.5** | Trabajo mecánico y repetitivo: DTOs, barrels, seeds, fixtures, renombrados, docs | Barato y rápido cuando existe una plantilla que copiar |

> **La regla de oro:** *Opus escribe el primer ejemplar de cada patrón; Sonnet lo replica; Haiku lo multiplica.* Nunca uses Opus para la fila 12 de una tabla cuyas filas 1–11 ya existen.

---

## FASE 0 — Preparación y decisiones · `Opus 5` · ~2 h

**Objetivo:** cerrar toda ambigüedad antes de escribir código.

**Entregables**
- [ ] Cuentas creadas: Supabase (proyecto `sicfi-prod` + `sicfi-dev`), Vercel, GitHub.
- [ ] Este documento revisado y las decisiones abiertas resueltas (moneda, zona horaria, si el ahorro es gasto o traslado).
- [ ] `CLAUDE.md` en la raíz con: stack, estructura de carpetas, convenciones de nombres, regla de dependencia, formato de commits, comandos de test.
- [ ] `.env.example` con todas las variables documentadas.

**Por qué Opus:** `CLAUDE.md` se carga en **cada** sesión posterior. Un `CLAUDE.md` bueno ahorra miles de tokens de reexplicación durante todo el proyecto. Es la inversión de mayor retorno del plan.

**DoD:** `CLAUDE.md` existe y describe la regla de dependencia y la estructura de un contexto.

---

## FASE 1 — Andamiaje del monorepo · `Haiku 4.5` (Sonnet si algo falla) · ~3 h

**Objetivo:** esqueleto ejecutable, sin lógica.

**Entregables**
- [ ] `pnpm-workspace.yaml`, `turbo.json`, `apps/api`, `apps/web`, `packages/{contracts,config-eslint,config-typescript}`.
- [ ] NestJS 11 con `tsconfig` en `strict` + `noUncheckedIndexedAccess`.
- [ ] Next.js 15 + Tailwind v4 + shadcn/ui inicializado.
- [ ] ESLint (con `eslint-plugin-boundaries`), Prettier, Husky, lint-staged, commitlint.
- [ ] `GET /api/v1/health` responde `{ status: 'ok' }`; la home de Next carga.

**Por qué Haiku:** es trabajo de plantilla, sin decisiones. Los generadores oficiales (`nest new`, `create-next-app`, `shadcn init`) hacen el 80 %.

**DoD:** `pnpm dev` levanta ambas apps; `pnpm lint && pnpm build` pasa.

---

## FASE 2 — Modelo de datos, migraciones y seeds · `Opus 5` → `Haiku 4.5` · ~4 h

**Entregables**
- [ ] `schema.prisma` completo (§6) — **Opus**.
- [ ] Primera migración aplicada en Supabase dev — **Opus**.
- [ ] `PrismaService` singleton + `DATABASE_URL`/`DIRECT_URL` — **Opus**.
- [ ] `seed.ts`: 24 categorías, 7 métodos de pago, 5 fijos, 24 quincenas de 2026 — **Haiku**.
- [ ] Script SQL de RLS para las 8 tablas — **Opus**.

**Por qué el reparto:** el esquema condiciona todo lo demás (índices, cascadas, precisión decimal); un error aquí se paga en migraciones dolorosas. El seed es transcripción literal de las tablas de §1.3 y §1.5.

**DoD:** `prisma migrate dev` + `prisma db seed` corren limpios; Prisma Studio muestra los datos.

---

## FASE 3 — Núcleo de dominio · `Opus 5` · ~8 h · **LA FASE CRÍTICA**

**Objetivo:** todas las reglas RN-01 a RN-35 implementadas y probadas **sin base de datos**.

**Entregables**
- [ ] Kernel: `Entity`, `AggregateRoot`, `ValueObject`, `Result`, `DomainError`, `DomainEvent`.
- [ ] VOs: `Money` (Decimal.js **con moneda**), `Currency`, `ExchangeRate`, `Percentage`, `DateRange`, `DueDay`, `PeriodNumber`.
- [ ] `CurrencyConverter` + puerto `ExchangeRateProvider` — RN-36 a RN-38.
- [ ] `PeriodFactory` — RN-01, RN-02 (incluye febrero bisiesto y meses de 30/31 días).
- [ ] `PeriodCalculator` — RN-06 a RN-12b. **Ojo: métricas dobles (gasto real vs. salidas de caja).**
- [ ] `PeriodStatusResolver` (Strategy) — RN-13 a RN-17.
- [ ] `RecurringExpense` entidad — RN-18 a RN-21.
- [ ] `FixedExpenseReconciler` (State) — RN-22 a RN-24.
- [ ] `TransactionValidator` (Chain of Responsibility) — RN-25 a RN-29.
- [ ] `SavingsFund` entidad + `SavingsFundBalanceCalculator` — RN-39 a RN-41b.
- [ ] `HouseholdPolicy` — RN-43, RN-44 (matriz de permisos por rol, sin dependencias de HTTP).
- [ ] `AlertEngine` + las 12 `AlertRule` — RN-33 a RN-35.
- [ ] **Suite de tests unitarios con ≥ 90 % de cobertura del dominio.** Un test por RN, más casos borde.

**Por qué Opus, sin excepción:** aquí vive todo el valor del producto. Los casos borde son sutiles y silenciosos: el día 31 en febrero (RN-21), el redondeo decimal en la tolerancia (RN-23), quincenas que cruzan el año, el prorrateo de RN-31, la zona horaria en RN-04. Un modelo más barato produce código que *parece* correcto y falla en producción con números equivocados — el peor fallo posible en una app de dinero.

**Casos borde que deben tener test explícito:**
- Fijo mensual con `dueDay = 31` en una quincena que termina el 28/29/30.
- Movimiento con fecha del 31 de diciembre y del 1 de enero.
- `disponible = 0` con gastos registrados (división por cero en RN-12).
- Fijo dado de baja a mitad de año: no debe generar olvidos posteriores.
- `controlStartDate` a mitad de quincena.
- Suma de decimales que produce `0.30000000000000004` con floats.
- **Sumar `Money` de monedas distintas debe fallar en compilación o lanzar, nunca sumar a ciegas.**
- **Movimiento en US$ sin tasa para esa fecha → se usa la anterior más reciente; sin ninguna → rechazo (RN-37).**
- **`RETIRO_AHORRO` mayor que el saldo del fondo → rechazo (RN-41).**
- **Ahorro de C$ 1 500 con retiro de C$ 1 400 → ahorro efectivo C$ 100, no C$ 1 500 (RN-41b).**
- **Apartar ahorro NO debe subir el `%ejecutado` ni disparar la alerta A03 (RN-12).**
- **Último `OWNER` intentando abandonar el household → rechazo (RN-44).**

**DoD:** `pnpm test:domain` verde, cobertura ≥ 90 %, cero dependencias de `@prisma/client` dentro de `domain/`.

---

## FASE 4 — Capa de aplicación (casos de uso) · `Sonnet 5` · ~6 h

**Entregables**
- [ ] Puertos de repositorio (interfaces) de los 5 contextos de escritura.
- [ ] Casos de uso CRUD de `catalog`, `budget`, `recurring`, `ledger`.
- [ ] Commands/Queries + mappers.
- [ ] `BootstrapUserUseCase`: crea perfil, settings, 24 quincenas y siembra catálogos (idempotente).
- [ ] Tests con repositorios en memoria (dobles), sin BD.

**Por qué Sonnet:** el patrón ya está fijado por el dominio de la Fase 3. Es aplicación repetida de una plantilla con criterio.

**Prompt eficiente:** *"Siguiendo exactamente el patrón de `register-transaction.use-case.ts`, implementa los casos de uso de `recurring`. No leas otros contextos."*

**DoD:** todos los casos de uso probados con dobles; ninguno importa Prisma.

---

## FASE 5 — Infraestructura de persistencia · `Sonnet 5` (+ `Opus 5` para el tenant) · ~5 h

**Entregables**
- [ ] Repositorios Prisma que implementan los puertos + mappers.
- [ ] `PrismaUnitOfWork` sobre `$transaction`.
- [ ] **`tenantExtension` + `TenantContext` con `AsyncLocalStorage` — Opus.**
- [ ] Tests de integración contra Postgres efímero (Testcontainers o base `sicfi_test` en Supabase dev).

**Por qué Opus solo para el tenant:** es el único punto donde un fallo expone datos de un usuario a otro. Lo demás es mapeo mecánico.

**DoD:** tests de integración verdes; una consulta sin tenant lanza excepción.

---

## FASE 6 — Autenticación y segregación · `Opus 5` · ~5 h

**Entregables**
- [ ] Supabase Auth configurado: email/contraseña, verificación, recuperación, (opcional) Google.
- [ ] `JwtAuthGuard` global con verificación JWKS y caché de claves.
- [ ] **`TenantResolver`: JWT → userId → membresía → `{ householdId, role }` en `AsyncLocalStorage`** (§7.1).
- [ ] **`RolesGuard` + `@RequireRole()` + `@RequireOwnership()`** — RN-43.
- [ ] `@Public()`, `@CurrentUser()`, `@CurrentHousehold()`.
- [ ] `ensureUser()` idempotente: crea `User`, `Profile`, un `Household` personal, la membresía `OWNER`, `BudgetSettings`, un `SavingsFund` por defecto, los 24 `Period` y siembra catálogos.
- [ ] **Gestión de households:** crear, renombrar, cambiar de household activo, invitar por email, aceptar invitación, cambiar rol, expulsar, transferir propiedad (RN-44).
- [ ] Cliente Supabase en Next (`@supabase/ssr`) + `middleware.ts` que protege `(app)`.
- [ ] Pantallas de login, registro y recuperación (funcionales, sin pulir).
- [ ] **Test e2e de aislamiento entre households + batería de permisos por rol (§7.3) — bloqueante.**
- [ ] Rate limiting (`@nestjs/throttler`) en las rutas de auth y de invitación.

**Por qué Opus:** seguridad. Los errores aquí son silenciosos hasta que dejan de serlo, y son irreparables reputacionalmente.

**DoD:** el test A/B pasa; ninguna ruta de datos responde sin JWT válido.

---

## FASE 7 — API HTTP · `Sonnet 5` (DTOs con `Haiku 4.5`) · ~6 h

**Entregables**
- [ ] Controladores de los endpoints de §9 (excepto analítica).
- [ ] DTOs Zod en `packages/contracts` — **Haiku**, es transcripción del esquema.
- [ ] `ZodValidationPipe`, `DomainExceptionFilter` (→ RFC 7807), interceptores de logging y transformación.
- [ ] OpenAPI en `/api/docs`.
- [ ] Tests e2e con Supertest de la ruta feliz y los errores de cada endpoint.
- [ ] Colección de Bruno/Insomnia versionada.

**Por qué Sonnet:** los controladores son finos por diseño (delegan al caso de uso). Haiku para los DTOs porque son mecánicos.

**DoD:** Swagger completo; e2e verdes; `4xx` con cuerpo RFC 7807.

---

## FASE 8 — Analítica y read models · `Opus 5` (wiring con `Sonnet 5`) · ~8 h

**Entregables**
- [ ] `DashboardQueryService` — Panel completo en **una** llamada — **Opus**.
- [ ] `ControlQueryService` — conciliación (RN-22) — **Opus**.
- [ ] `HistoryQueryService` — matriz 22x24 + fila de olvidados (RN-24) — **Opus**.
- [ ] `MonthlyReportQueryService` y `CategoryReportQueryService` (RN-31, el prorrateo) — **Opus**.
- [ ] Controladores y DTOs de respuesta — **Sonnet**.
- [ ] Tests contra un dataset fijo con resultados calculados a mano desde el Excel.

**Por qué Opus:** son consultas SQL agregadas con `GROUP BY`, `FILTER`, `LATERAL` y ventanas, sobre reglas que ya son sutiles. Además hay que respetar el límite de 10 s de Vercel: nada de traer 5 000 filas a memoria para sumarlas en JavaScript.

**Optimización obligatoria:** el Panel debe resolverse en **≤ 3 consultas**, no en 11. Ejemplo del patrón:

```sql
SELECT
  SUM(amount) FILTER (WHERE type = 'FIJO')          AS fijos_pagados,
  SUM(amount) FILTER (WHERE type = 'VARIABLE')      AS variables,
  SUM(amount) FILTER (WHERE type = 'AHORRO')        AS ahorro,
  SUM(amount) FILTER (WHERE type = 'INGRESO_EXTRA') AS ingresos_extra
FROM transactions
WHERE user_id = $1 AND period_id = $2;
```

**Validación cruzada obligatoria:** cargar en la app los datos del Excel actual y verificar que **cada número del Panel y del Reporte coincide** con el que muestra la hoja. Si un número difiere, el problema está en la app, no en el Excel.

**DoD:** `GET /dashboard` < 300 ms con 5 000 movimientos; los números coinciden con el Excel.

---

## FASE 9 — Design system y shell responsive · `Sonnet 5` · ~6 h

**Entregables**
- [ ] Tokens de Tailwind v4 (§10.3), modo claro/oscuro.
- [ ] Primitivas: `Button`, `Input`, `Select`, `Card`, `Badge`, `Sheet`, `Dialog`, `Table`, `Tabs`, `Toast`, `Skeleton`, `EmptyState`.
- [ ] Componentes de dominio: `MoneyDisplay`, `PercentBar`, `StatusBadge`, `AlertCard`, `PeriodSelector`, `KpiCard`.
- [ ] `AppShell`: sidebar en escritorio, bottom nav en móvil, FAB de alta rápida.
- [ ] Cliente de API tipado + hooks de TanStack Query + `queryKeys`.
- [ ] Formateadores de moneda/fecha con `Intl` según el locale del usuario.

**Por qué Sonnet:** UI de sistema, bien documentada, sin trampas. shadcn/ui aporta la base accesible.

**DoD:** shell navegable en 375 px y 1440 px; sin scroll horizontal; contraste AA.

---

## FASE 10 — Pantallas por módulo · `Sonnet 5` (repetitivas con `Haiku 4.5`) · ~14 h

Orden recomendado — **por valor entregado**, no por comodidad técnica:

1. **`/movimientos` + alta rápida** (~4 h) — es lo que se usa a diario. Si esto no es cómodo, nada más importa.
2. **`/panel`** (~3 h) — KPIs, alertas, donut.
3. **`/fijos`** (~2 h) — CRUD con derivados visibles.
4. **`/control`** (~2 h) — incluye el botón "marcar como pagado" en un toque.
5. **`/quincenas`** (~1 h) — edición del ingreso en línea.
6. **`/reportes`** (~2 h) — pestañas + Recharts.
7. **`/historial`** (~1 h) — heatmap, `Haiku` sobre el patrón de tabla ya existente.
8. **`/ajustes`** (~1 h) — formularios, `Haiku`.

**Por qué así:** entregas valor desde la semana 1. Puedes empezar a registrar tus gastos reales antes de que el reporte anual exista, y eso a su vez te da datos de verdad para probar la analítica.

**DoD:** cada pantalla con estados de carga, vacío y error; probada en móvil real.

---

## FASE 11 — Testing integral · `Sonnet 5` (casos borde con `Opus 5`) · ~5 h

**Entregables**
- [ ] Cobertura: dominio ≥ 90 %, aplicación ≥ 80 %, global ≥ 70 %.
- [ ] E2E de API con Supertest sobre los flujos completos.
- [ ] E2E de UI con Playwright: registrarse → configurar → crear fijo → registrar gasto → ver panel → ver reporte.
- [ ] Test de aislamiento A/B en CI (bloqueante).
- [ ] Prueba de carga ligera (k6 o autocannon): 1 000 movimientos, medir `/dashboard`.

**DoD:** CI verde y bloqueando merges con cobertura por debajo del umbral.

---

## FASE 12 — Importador del Excel · `Sonnet 5` · ~4 h

**Entregables**
- [ ] Parser con `exceljs` que lee `Config`, `Listas`, `Fijos`, `Quincenas` (col. G) y `Registro`.
- [ ] Mapeo texto → FK: categorías y fijos por nombre, creando lo que falte.
- [ ] Modo *dry-run*: devuelve un preview con conteos y una lista de conflictos antes de escribir nada.
- [ ] Confirmación transaccional (Unit of Work): todo o nada.
- [ ] Reporte de importación: creados, actualizados, omitidos y por qué.

**Por qué importa:** sin esto, migrar significa teclear a mano. Con esto, la adopción es inmediata.

**DoD:** importar `Presupuesto_Quincenal_2026.xlsx` reproduce exactamente los números de la hoja `Panel`.

---

## FASE 13 — CI/CD y despliegue · `Sonnet 5` · ~3 h

**Entregables**
- [ ] GitHub Actions: `lint → typecheck → test → build` en cada PR.
- [ ] Dos proyectos en Vercel (`sicfi-api`, `sicfi-web`) desde el mismo repo, con `rootDirectory` distinto.
- [ ] Variables de entorno por entorno (Production / Preview / Development).
- [ ] Migraciones aplicadas en el paso de build (`prisma migrate deploy`).
- [ ] Vercel Cron diario: mantiene vivo Supabase y precalcula alertas.
- [ ] Sentry (free) para errores en ambas apps.

**DoD:** un push a `main` despliega solo; los PR generan preview funcional.

---

## FASE 14 — Hardening y observabilidad · `Opus 5` · ~4 h

**Entregables**
- [ ] Auditoría de seguridad: cabeceras (Helmet, CSP), CORS estricto, rate limiting global, validación de tamaño de payload.
- [ ] Revisión de N+1 con logs de Prisma; índices verificados con `EXPLAIN ANALYZE`.
- [ ] Logging estructurado (Pino) con `requestId`, **sin datos personales ni montos en los logs**.
- [ ] Backups: `pg_dump` programado (el free tier de Supabase no garantiza retención larga).
- [ ] Lighthouse ≥ 90 en Performance y Accessibility en móvil.
- [ ] Revisión de accesibilidad: foco visible, roles ARIA, navegación por teclado.

**DoD:** `pnpm audit` sin vulnerabilidades altas; Lighthouse en verde.

---

## FASE 15 — Documentación y cierre · `Haiku 4.5` · ~2 h

- [ ] `README.md` con arranque local en 5 comandos.
- [ ] `docs/architecture.md` (diagrama de contextos), `docs/business-rules.md` (§2 con enlaces al código).
- [ ] `CHANGELOG.md`.
- [ ] Guía de usuario breve, reutilizando los textos de la hoja `Config` (que ya están bien escritos).

---

## Resumen de esfuerzo y modelos

Cifras revisadas tras las decisiones D2 (households), D3 (fondos de ahorro) y D4 (multimoneda).

| Fase | Horas orig. | **Horas rev.** | Modelo | Criticidad |
|------|:-----------:|:--------------:|--------|-----------|
| 0 Preparación | 2 | **2** | Opus 5 | Alta |
| 1 Andamiaje | 3 | **3** | Haiku 4.5 | Baja |
| 2 Datos | 4 | **6** | Opus 5 + Haiku | Alta |
| 3 **Dominio** | 8 | **12** | **Opus 5** | **Máxima** |
| 4 Aplicación | 6 | **7** | Sonnet 5 | Media |
| 5 Persistencia | 5 | **7** | Sonnet 5 + Opus | Alta |
| 6 **Auth + households** | 5 | **8** | **Opus 5** | **Máxima** |
| 7 API HTTP | 6 | **7** | Sonnet 5 + Haiku | Media |
| 8 **Analítica** | 8 | **10** | **Opus 5** | **Máxima** |
| 9 Design system | 6 | **6** | Sonnet 5 | Media |
| 10 Pantallas | 14 | **17** | Sonnet 5 + Haiku | Media |
| 11 Testing | 5 | **6** | Sonnet 5 + Opus | Alta |
| 12 Importador | 4 | **4** | Sonnet 5 | Media |
| 13 CI/CD | 3 | **3** | Sonnet 5 | Media |
| 14 Hardening | 4 | **4** | Opus 5 | Alta |
| 15 Documentación | 2 | **2** | Haiku 4.5 | Baja |
| **Total** | 85 h | **~104 h** | | |

**Dónde se van las 19 horas extra:** +4 h en el dominio (`Money` con conversión, fondos, métricas
dobles de RN-08), +3 h en auth (households, roles, invitaciones), +3 h en pantallas (selector de
household, de moneda y de fondo), +2 h en el esquema, +2 h en persistencia, +2 h en analítica
(agregar por `baseAmount` y separar gasto real de salidas de caja), +1 h en API, +1 h en tests
(la segunda batería de permisos por rol).

**Reparto estimado:** ~38 % Opus (donde se decide), ~49 % Sonnet (donde se construye), ~13 % Haiku (donde se repite).

**Ruta más corta a algo usable (MVP funcional):** Fases 0 → 1 → 2 → 3 → 4 → 5 → 6 → 7 → 9 → 10.1 → 10.2 → 13.
Unas 60 h y ya registras gastos reales con panel y alertas.

**Protocolo entre fases (acordado con el usuario):**
1. Ejecutar la fase completa.
2. `git commit` con el ámbito `fase-N`.
3. Actualizar `docs/PROGRESO.md` (tablero, entregables, notas para la siguiente).
4. **Avisar del cambio de modelo requerido y pausar.**
5. El usuario cambia de modelo → continuar con la fase siguiente.

---

# 13. ESTRATEGIA DE OPTIMIZACIÓN DE TOKENS

El desperdicio de tokens casi nunca viene del código generado: viene de **volver a explicar el contexto** y de **releer archivos**. Estas ocho prácticas atacan justo eso.

### 13.1 `CLAUDE.md` es la mayor palanca

Se carga automáticamente en cada sesión. Todo lo que esté ahí no hay que repetirlo nunca más. Debe contener, y nada más que esto:

```markdown
# SICFI — contexto para el asistente

## Stack
NestJS 11 · Prisma 6 · PostgreSQL (Supabase) · Next.js 15 · Tailwind v4 · pnpm + Turborepo

## Arquitectura
Hexagonal por bounded context en `apps/api/src/contexts/<ctx>/{domain,application,infrastructure}`.
REGLA DE DEPENDENCIA (inviolable): domain no importa nada. application solo importa domain.
infrastructure importa ambas. Verificado por eslint-plugin-boundaries.

## Convenciones
- Archivos: kebab-case con sufijo de rol (`register-transaction.use-case.ts`)
- Dinero: SIEMPRE el VO `Money` (Decimal.js). Nunca `number` para importes.
- Errores de dominio: `Result<T, DomainError>`, nunca `throw`.
- Un caso de uso = una clase con un único método `execute()`.
- Tests junto al archivo: `*.spec.ts`.

## Comandos
pnpm dev · pnpm test · pnpm test:domain · pnpm lint · pnpm db:migrate · pnpm db:seed

## Reglas de negocio
Numeradas RN-01..RN-35 en PLAN_IMPLEMENTACION.md §2. Cítalas por número en los comentarios.

## No hacer
- No leas `prisma/migrations/` salvo que se pida.
- No reescribas archivos completos para cambiar tres líneas.
- No inventes campos que no estén en el esquema.
```

### 13.2 Una fase = una sesión limpia

Ejecuta `/clear` entre fases. El contexto de la Fase 3 no aporta nada en la Fase 10 y sí cuesta en cada turno. Cierra cada fase con un commit y **tres líneas** de estado en `docs/PROGRESO.md` — eso es todo lo que la siguiente sesión necesita saber.

### 13.3 Planifica antes de escribir

Usa el modo plan para acordar el enfoque y *después* ejecuta. Corregir 400 líneas ya escritas cuesta mucho más que discutir el enfoque en 20.

### 13.4 Verticales, no horizontales

Implementa **un contexto completo** (dominio → aplicación → infra → HTTP → UI) antes de pasar al siguiente. Así:
- Cada slice cabe en una ventana de contexto.
- El primero se convierte en la plantilla de los demás.
- Ves valor funcionando desde el principio.

Nunca "todas las entidades, luego todos los repositorios, luego todos los controladores": obliga a recargar todo el proyecto en cada capa.

### 13.5 Explota la plantilla

Después de que Opus escriba `ledger` completo:

> *"Implementa el contexto `recurring` replicando exactamente la estructura de `contexts/ledger`. Los campos están en `schema.prisma` (modelo `RecurringExpense`) y las reglas son RN-18 a RN-21. Lee solo `contexts/ledger/domain/entities/transaction.entity.ts` y `contexts/ledger/application/use-cases/register-transaction.use-case.ts` como referencia."*

Ese prompt hace que Sonnet lea 2 archivos en lugar de 20.

### 13.6 Sé quirúrgico con las rutas

| Cuesta caro | Cuesta poco |
|-------------|-------------|
| "Revisa el proyecto y arregla el bug de las quincenas" | "En `period-factory.ts:42`, `getMonthEnd` falla en febrero bisiesto. Arréglalo y añade el test." |
| "Añade validación a los formularios" | "En `transaction-form.tsx`, añade validación Zod usando `createTransactionSchema` de `packages/contracts`." |

Da siempre archivo y, si puedes, línea. Si no sabes dónde está, pide **solo la búsqueda** con el agente `Explore` y después trabaja con la ruta que devuelva.

### 13.7 Los tests son la especificación más barata

Escribir el test primero (o pedirlo junto al código) elimina el ciclo caro de "no era eso → reescribe". Un test es una especificación ejecutable de 10 líneas que sustituye tres párrafos de explicación.

### 13.8 Errores concretos, no capturas de pantalla mentales

Pega el mensaje de error exacto y el stack trace recortado a las 5 líneas relevantes. "No funciona" garantiza una ronda de exploración que podrías haberte ahorrado.

### 13.9 Modelo por tipo de tarea — resumen operativo

| Tarea | Modelo |
|-------|--------|
| Diseñar el esquema, decidir arquitectura | Opus 5 |
| Cálculos financieros, fechas, casos borde | Opus 5 |
| Seguridad, auth, aislamiento de tenant | Opus 5 |
| SQL analítico y optimización de consultas | Opus 5 |
| Depurar un fallo que ya te costó dos intentos | Opus 5 |
| CRUD sobre un patrón existente | Sonnet 5 |
| Componentes React, formularios, tablas | Sonnet 5 |
| Tests de rutas felices | Sonnet 5 |
| Configuración de herramientas y CI | Sonnet 5 |
| DTOs, barrels, seeds, fixtures | Haiku 4.5 |
| Renombrados, formateo, docs de rutina | Haiku 4.5 |
| Traducciones y microcopy de la interfaz | Haiku 4.5 |

**Señal de que subiste de nivel demasiado tarde:** si Sonnet falló dos veces en la misma tarea, el tercer intento con Sonnet sale más caro que el primero con Opus. Cambia al segundo fallo, no al quinto.

---

# 14. TESTING, CI/CD Y DESPLIEGUE

## 14.1 Pirámide de pruebas

```
        ╱ E2E UI (Playwright) — 5 flujos críticos
      ╱   E2E API (Supertest) — un caso por endpoint
    ╱     Integración (Prisma + Postgres) — repositorios
  ╱       Unitarias (Vitest, sin I/O) — dominio y casos de uso  ◀── el grueso
```

El dominio es puro: sus tests corren en milisegundos y son los que más veces vas a ejecutar. Ahí va el esfuerzo.

## 14.2 Pipeline

```yaml
# .github/workflows/ci.yml
name: CI
on: [push, pull_request]
jobs:
  quality:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: pnpm lint
      - run: pnpm typecheck
      - run: pnpm test:unit --coverage
      - run: pnpm test:integration      # servicio Postgres
      - run: pnpm test:tenant-isolation # BLOQUEANTE
      - run: pnpm build
```

## 14.3 Entornos

| Entorno | Rama | Supabase | Vercel |
|---------|------|----------|--------|
| Development | local | `sicfi-dev` | `pnpm dev` |
| Preview | PR | `sicfi-dev` | deploy automático por PR |
| Production | `main` | `sicfi-prod` | dominio productivo |

## 14.4 Variables de entorno

```bash
# apps/api
DATABASE_URL=                 # pooler :6543 + pgbouncer=true&connection_limit=1
DIRECT_URL=                   # directa :5432 (solo migraciones)
SUPABASE_URL=
SUPABASE_JWT_SECRET=          # o SUPABASE_JWKS_URL
WEB_ORIGIN=                   # CORS
NODE_ENV=

# apps/web
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
NEXT_PUBLIC_API_URL=
```

> `SUPABASE_SERVICE_ROLE_KEY` **nunca** se expone al navegador ni se prefija con `NEXT_PUBLIC_`.

---

# 15. RIESGOS Y MITIGACIONES

| # | Riesgo | Impacto | Mitigación |
|---|--------|---------|-----------|
| R1 | Agotamiento de conexiones de Prisma en serverless | Caída de la API | Pooler `:6543` + `connection_limit=1` + singleton global. Probar con carga concurrente. |
| R2 | Timeout de 10 s en reportes | Error en producción | Toda agregación en SQL. Vista materializada si crece. Índices verificados con `EXPLAIN`. |
| R3 | Fuga de datos entre usuarios | **Crítico** | Triple capa (§7.2) + test A/B bloqueante en CI. |
| R4 | Errores de redondeo en dinero | Pérdida de confianza | `Decimal(14,2)` + `Decimal.js` + VO `Money`. Prohibido `number` para importes (regla de lint). |
| R5 | Zona horaria: la quincena cambia según el dispositivo | Datos mal clasificados | `timezone` por usuario; todo cálculo de "hoy" en el servidor; fechas de negocio como `DATE`. |
| R6 | Supabase free se pausa a los 7 días | App caída sin aviso | Vercel Cron diario que hace ping a `/health` con una consulta trivial. |
| R7 | Cold start de 1–2 s | Se percibe lenta | Skeletons, prefetch en RSC, `stale-while-revalidate` en TanStack Query. |
| R8 | Límites del free tier (500 MB de BD, 100 GB de banda) | Bloqueo al crecer | Monitorizar; a ~50 usuarios activos evaluar plan Pro. Paginación por cursor desde el día 1. |
| R9 | Divergencia entre el Excel y la app en los números | Rechazo del usuario | Validación cruzada obligatoria en la Fase 8 contra el archivo real. |
| R10 | Alcance creciente (presupuestos compartidos, multimoneda, bancos) | Nunca sale a producción | Congelar el alcance del MVP en las Fases 0–13. Lo demás va al Roadmap. |
| R11 | Pérdida de datos sin backups fiables | Irrecuperable | `pg_dump` programado a almacenamiento externo + exportación a Excel desde la app. |

---

# 16. ROADMAP POST-MVP

**v1.1 — Fricción cero**
- PWA instalable con cola offline (IndexedDB) — registrar sin señal.
- Widget/atajo de alta rápida.
- Plantillas de gastos frecuentes ("Pasaje C$ 60" en un toque).

**v1.2 — Inteligencia**
- Notificaciones push de vencimientos (Web Push + `pg_cron`).
- Proyección de fin de quincena basada en el ritmo de gasto.
- Detección de gastos atípicos (desviación sobre la mediana de la categoría).
- Sugerencia automática de categoría por el concepto (aprendizaje del histórico del usuario).

**v1.3 — Alcance financiero**
- Multimoneda con tipo de cambio histórico (C$/US$ es relevante en Nicaragua).
- Metas de ahorro con seguimiento y fondos separados.
- Gestión de deudas con amortización.
- Presupuesto por categoría también para variables (sobres / *envelope budgeting*).

**v1.4 — Colaboración**
- Presupuesto compartido (pareja/familia) con roles — requiere pasar de `userId` a `householdId` en el discriminante de tenant. **Diseñar la migración desde ahora** para no reescribir el modelo.
- Comentarios en movimientos.

**v2.0 — Automatización**
- Importación de estados de cuenta (CSV/OFX).
- Adjuntar comprobantes con OCR (Supabase Storage).
- Comparativas interanuales.
- RLS efectivo también para Prisma (rol no privilegiado + `SET LOCAL request.jwt.claims`).

---

## Decisiones — CERRADAS en la Fase 0 (2026-08-31)

Ver el bloque del encabezado de este documento y §2 de `CLAUDE.md`. Resumen:

| # | Decisión | Elección | Secciones afectadas |
|---|----------|----------|---------------------|
| D1 | Frontend | Next.js 15 App Router | §4, §10 |
| D2 | Tenant | `householdId` + roles | §6, §7, RN-42..RN-45 |
| D3 | Ahorro | Traslado a fondo, no es gasto | §6, RN-08, RN-10, RN-12, RN-14, RN-25, RN-39..RN-41 |
| D4 | Moneda | Multimoneda desde el inicio | §6, RN-36..RN-38 |
| D5 | Multi-año | Esquema multi-año, UI de un año | §6 (ya soportado) |

Como consecuencia de D3 y D4, **la app y el Excel darán números distintos a propósito** en el ahorro,
el % ejecutado y cualquier reporte que mezcle monedas. La validación cruzada de la Fase 8 debe
comparar contra un Excel de referencia **con esas dos correcciones aplicadas a mano**, no contra el
archivo tal cual.

## Roadmap ajustado por las decisiones

Lo que D2/D3/D4 sacan del Roadmap por estar ya en el MVP:
- ~~Presupuesto compartido (v1.4)~~ → en el MVP
- ~~Multimoneda con tipo de cambio histórico (v1.3)~~ → en el MVP
- ~~Metas de ahorro con fondos separados (v1.3)~~ → parcialmente en el MVP (`SavingsFund.targetAmount`)

Lo que se añade al Roadmap por las mismas decisiones:
- **v1.1** — importación automática de la tasa oficial del BCN (hoy `ExchangeRate` se llena a mano).
- **v1.2** — notificaciones a los miembros de un household cuando alguien registra un gasto grande.
- **v1.2** — vista "quién gastó qué" dentro del household (ya hay `createdByUserId`).
- **v1.3** — reasignar la `baseCurrency` de un household con recálculo transaccional del histórico (RN-38b).
