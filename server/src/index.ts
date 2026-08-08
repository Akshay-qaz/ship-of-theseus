import { RoomServer, startWebSocketServer } from './server.js';

const port = Number(process.env.PORT ?? 8080);
const timerMs = Number(process.env.VOYAGE_TIMER_MS);
const server = Number.isFinite(timerMs) && timerMs > 0
  ? new RoomServer(undefined, {
    phaseDurations: {
      storm: timerMs,
      damageReport: timerMs,
      council: timerMs,
      vote: timerMs,
      mutiny: timerMs,
    },
  })
  : new RoomServer();
startWebSocketServer(port, server);
console.log(`Ship of Theseus server listening on ${port}`);
