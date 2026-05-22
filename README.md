# Chanchova

Juego online del Chancho argentino. Multijugador en tiempo real.

## Modos de juego

- **Chancho Dirigido**: con director que dicta el patrón de pase y permite tirar cartas al pozo central.
- **Chancho Va** _(próximamente)_: variante clásica, pase fijo a la derecha.

## Estructura del monorepo

```
chanchova/
├── apps/
│   ├── web/        # React + Vite (frontend)
│   └── api/        # NestJS + Fastify + Socket.IO (backend)
└── packages/
    ├── shared/     # Tipos, eventos y constantes compartidas
    ├── engine/     # Motor de juego puro (sin red ni UI)
    └── decks/      # Definiciones de mazos
```

## Requisitos

- Node.js 20+ (recomendado 22, ver `.nvmrc`)
- pnpm 9+ (instalar con `corepack enable && corepack prepare pnpm@9.12.3 --activate`)

## Setup

```bash
pnpm install
pnpm dev        # levanta web (5173) + api (3000) en paralelo
```

> ⚠️ **Importante**: usá siempre `pnpm <script>` desde la raíz, **no** `pnpm --filter <pkg> <script>`. Los scripts de raíz pasan por turbo y respetan dependencias entre paquetes (build orden de `shared` → `engine`/`decks` → `api`/`web`). Los `--filter` directos no respetan ese grafo y pueden fallar con tipos viejos.

## Scripts útiles

```bash
# Build de todo el monorepo (turbo encadena upstream)
pnpm build
pnpm build:api          # solo backend (turbo igual buildea sus deps)
pnpm build:web          # solo frontend

# Type-check
pnpm typecheck

# Tests del motor (54 tests)
pnpm test

# Simulador de consola: corre un escenario completo del Chancho Dirigido
pnpm sim

# Smoke tests del backend WebSocket (con server corriendo)
pnpm --filter @chanchova/api start                              # terminal 1
pnpm --filter @chanchova/api exec tsx scripts/integration-smoke.ts   # terminal 2
pnpm --filter @chanchova/api exec tsx scripts/bot-smoke.ts            # 1 humano + 3 bots
```

## Arquitectura del backend

- `apps/api/src/connection/`: registry de sockets + sesiones (con tokens para reconexión).
- `apps/api/src/lobby/`: salas en memoria, códigos de invitación, gateway WS para `lobby:*`.
- `apps/api/src/game/`: orquestación del motor, broadcasts, timeouts, bots.
  - `game.service.ts`: pegamento entre motor + red + timers.
  - `public-state.projector.ts`: convierte el `EngineState` privado a vista pública.
  - `bot/`: BotStrategy + BasicBot + BotOrchestrator.

### Reconexión

Al identificarse, el cliente recibe un `sessionToken` que debería persistir en `localStorage`. Si se cae y vuelve a conectarse dentro de 10s mandando ese token en `auth:identify`, recupera su `userId` y vuelve a su sala. Si pasa la gracia, se considera abandono: el motor lo marca eliminado, se reparte mano nueva con los activos restantes.

### Bots

Los bots se agregan al lobby con `lobby:add_bot` (solo el host). El `BotOrchestrator` los hace jugar después de cada cambio de estado, con delays sintéticos (200–1500ms) para imitar tiempo de reacción. La personalidad por defecto (`BasicBot`) juega honesto: nunca canta Chancho inválido, cae 50% del tiempo en una Chancha.

## Testeo manual end-to-end

```bash
# Terminal 1: backend
pnpm build
pnpm --filter @chanchova/api start

# Terminal 2: smoke test con 4 humanos
pnpm --filter @chanchova/api exec tsx scripts/integration-smoke.ts

# Terminal 2: smoke test con bots
pnpm --filter @chanchova/api exec tsx scripts/bot-smoke.ts
```
