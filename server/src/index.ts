import { startWebSocketServer } from './server.js';

const port = Number(process.env.PORT ?? 8080);
startWebSocketServer(port);
console.log(`Ship of Theseus server listening on ${port}`);
