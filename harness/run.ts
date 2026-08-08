import WebSocket from 'ws';
import { startWebSocketServer } from '../server/src/server.js';
import type { PublicView } from '../server/src/types.js';

const running = startWebSocketServer(0);
await new Promise<void>((resolve) => running.wss.once('listening', resolve));
const address = running.wss.address();
const port = typeof address === 'object' && address ? address.port : running.port;
const sockets: WebSocket[] = [];
const states: PublicView[] = [];
type Message = { type: string; [key: string]: unknown };
type Bot = { socket: WebSocket; playerId: string; playerToken: string };
const wait = (socket: WebSocket, predicate: (message: Message) => boolean) =>
  new Promise<Message>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('bot timeout')), 3000);
    socket.on('message', (raw) => {
      const message = JSON.parse(raw.toString()) as Message;
      if (predicate(message)) { clearTimeout(timer); resolve(message); }
    });
  });

const first = new WebSocket(`ws://127.0.0.1:${port}`);
await new Promise<void>((resolve) => first.once('open', resolve));
sockets.push(first);
first.send(JSON.stringify({ type: 'create', name: 'Bot 1' }));
const created = await wait(first, (message) => message.type === 'joined') as Message & { roomCode: string; playerId: string; playerToken: string };
const code = created.roomCode as string;
const players: Bot[] = [{ socket: first, playerId: created.playerId, playerToken: created.playerToken }];
for (let i = 2; i <= 10; i++) {
  const socket = new WebSocket(`ws://127.0.0.1:${port}`);
  await new Promise<void>((resolve) => socket.once('open', resolve));
  sockets.push(socket);
  socket.send(JSON.stringify({ type: 'join', roomCode: code, name: `Bot ${i}` }));
  const joined = await wait(socket, (message) => message.type === 'joined') as Message & { playerId: string; playerToken: string };
  players.push({ socket, playerId: joined.playerId, playerToken: joined.playerToken });
}
players.forEach(({ socket }) => socket.send(JSON.stringify({ type: 'ready', ready: true })));
while (!(running.server.rooms.get(code)?.voyage.state.players.every((player) => player.ready))) {
  await new Promise((resolve) => setTimeout(resolve, 5));
}
players[0].socket.send(JSON.stringify({ type: 'start' }));
while (running.server.rooms.get(code)?.voyage.state.phase !== 'storm') {
  await new Promise((resolve) => setTimeout(resolve, 5));
}
for (let round = 0; round < 8; round++) {
  running.server.advance(code, 'damageReport');
  running.server.advance(code, 'council');
  running.server.advance(code, 'vote');
  const voyage = running.server.rooms.get(code)?.voyage;
  const fresh = voyage?.state.damage.find((damage) => !voyage.state.players.find((player) => player.system === damage.system)?.replaced);
  const choice = fresh?.system ?? voyage?.state.damage[0]?.system ?? voyage?.state.players[0]?.system;
  if (!choice) throw new Error('No system available for bot vote');
  players.forEach(({ socket }) => socket.send(JSON.stringify({ type: 'vote', system: choice })));
  await new Promise((resolve) => setTimeout(resolve, 10));
  if (running.server.rooms.get(code)?.voyage.state.phase === 'vote') running.server.advance(code, 'replacement');
}
if (running.server.rooms.get(code)?.voyage.state.phase === 'mutiny') {
  const suspect = players[0].playerId as string;
  players.forEach(({ socket }) => socket.send(JSON.stringify({ type: 'accuse', suspectId: suspect })));
}
await new Promise((resolve) => setTimeout(resolve, 20));
const voyage = running.server.rooms.get(code)?.voyage.state;
if (!voyage?.winner) throw new Error('Voyage did not reach terminal state');
states.push(running.server.rooms.get(code)?.voyage.publicView() as PublicView);
console.log(`10-bot voyage complete: ${voyage.winner}, storms=${voyage.storm}, replacements=${voyage.replacements}`);
sockets.forEach((socket) => socket.close());
running.wss.close();
