import WebSocket from 'ws';
import { RoomServer, startWebSocketServer } from '../server/src/server.js';
import type { PublicView } from '../server/src/types.js';

const timerMs = Number(process.env.VOYAGE_TIMER_MS ?? 10);
const running = startWebSocketServer(
  0,
  new RoomServer(undefined, {
    phaseDurations: {
      storm: timerMs,
      damageReport: timerMs,
      council: timerMs,
      vote: timerMs,
      mutiny: timerMs,
    },
  }),
);
await new Promise<void>((resolve) => running.wss.once('listening', resolve));
const address = running.wss.address();
const port = typeof address === 'object' && address ? address.port : running.port;
const sockets: WebSocket[] = [];
const actionPhase = new WeakMap<WebSocket, string>();
let resolveTerminal: (() => void) | null = null;
const terminal = new Promise<void>((resolve) => { resolveTerminal = resolve; });
let resolveReady: (() => void) | null = null;
const ready = new Promise<void>((resolve) => { resolveReady = resolve; });
type Message = { type: string; public?: PublicView; [key: string]: unknown };
type Bot = { socket: WebSocket; playerId: string; playerToken: string };
const wait = (socket: WebSocket, predicate: (message: Message) => boolean) =>
  new Promise<Message>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('bot timeout')), 3000);
    socket.on('message', (raw) => {
      const message = JSON.parse(raw.toString()) as Message;
      if (predicate(message)) {
        clearTimeout(timer);
        resolve(message);
      }
    });
  });
const observe = (socket: WebSocket) => {
  socket.on('message', (raw) => {
    const message = JSON.parse(raw.toString()) as Message;
    const publicState = message.public;
    if (message.type !== 'state' || !publicState) return;
    if (publicState.phase === 'lobby' && publicState.players.length === 10 &&
      publicState.players.every((player) => player.ready)) {
      resolveReady?.();
    }
    if (publicState.phase === 'results') {
      resolveTerminal?.();
      return;
    }
    if (publicState.phase !== 'vote' && publicState.phase !== 'mutiny') return;
    const key = `${publicState.phase}:${publicState.storm}`;
    if (actionPhase.get(socket) === key) return;
    actionPhase.set(socket, key);
    if (publicState.phase === 'vote') {
      const system = publicState.damagedSystems[0] ?? publicState.players[0]?.system;
      if (system) socket.send(JSON.stringify({ type: 'vote', system }));
    } else {
      const suspect = publicState.players[0]?.id;
      if (suspect) socket.send(JSON.stringify({ type: 'accuse', suspectId: suspect }));
    }
  });
};

const first = new WebSocket(`ws://127.0.0.1:${port}`);
await new Promise<void>((resolve) => first.once('open', resolve));
sockets.push(first);
observe(first);
first.send(JSON.stringify({ type: 'create', name: 'Bot 1' }));
const created = await wait(first, (message) => message.type === 'joined') as
  Message & { roomCode: string; playerId: string; playerToken: string };
const code = created.roomCode;
const players: Bot[] = [{ socket: first, playerId: created.playerId, playerToken: created.playerToken }];
for (let i = 2; i <= 10; i++) {
  const socket = new WebSocket(`ws://127.0.0.1:${port}`);
  await new Promise<void>((resolve) => socket.once('open', resolve));
  sockets.push(socket);
  observe(socket);
  socket.send(JSON.stringify({ type: 'join', roomCode: code, name: `Bot ${i}` }));
  const joined = await wait(socket, (message) => message.type === 'joined') as
    Message & { playerId: string; playerToken: string };
  players.push({ socket, playerId: joined.playerId, playerToken: joined.playerToken });
}
players.forEach(({ socket }) => socket.send(JSON.stringify({ type: 'ready', ready: true })));
await ready;
players[0].socket.send(JSON.stringify({ type: 'start' }));
await terminal;
const voyage = running.server.rooms.get(code)?.voyage.state;
if (!voyage?.winner || voyage.phase !== 'results') throw new Error('Voyage did not reach results');
const publicState = running.server.publicView(code);
if (publicState.phase !== 'results') throw new Error('Public view did not reach results');
console.log(`10-bot voyage complete: ${voyage.winner}, storms=${voyage.storm}, replacements=${voyage.replacements}`);
sockets.forEach((socket) => socket.close());
running.wss.close();
