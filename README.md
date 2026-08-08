# Ship of Theseus

An authoritative multiplayer social-deduction voyage for 6–10 players. Each storm
forces the crew to sacrifice a ship system, while a hidden Theseus Replacement may
try to destroy the ship's identity.

The server is a small TypeScript/Node WebSocket service; the game core is
deterministic and transport-independent. No Android client is included in this
step.

## Run

From this directory:

```sh
npm install
npm run lint
npm run typecheck
npm test
npm run bot
npm --workspace server run balance
```

Start the WebSocket server with `npm --workspace server start` after adding a
start script or run `npx tsx server/src/index.ts` directly. It listens on port
8080 (override with `PORT`).

`npm --workspace server run balance` runs 2,500 deterministic voyages (500
seeds at each player count from 6 through 10) and prints the outcome
distribution.
