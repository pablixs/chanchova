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
│   └── api/        # NestJS + Fastify + WebSockets (backend)
└── packages/
    ├── shared/     # Tipos, eventos y constantes compartidas
    ├── engine/     # Motor de juego puro (sin red ni UI)
    └── decks/      # Definiciones de mazos
```

## Requisitos

- Node.js 20+ (recomendado 22, ver `.nvmrc`)
- pnpm 9+

## Setup

```bash
pnpm install
pnpm dev        # levanta web + api en paralelo
```

- Web: http://localhost:5173
- API: http://localhost:3000

## Scripts útiles

```bash
pnpm build      # compila todo
pnpm typecheck  # verifica tipos en todo el monorepo
pnpm lint       # linter
```
