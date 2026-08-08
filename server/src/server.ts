import { randomUUID } from 'node:crypto';
import { WebSocketServer, type WebSocket } from 'ws';
import { createRoomCode, SeededRng, Voyage, type Rng } from './core.js';
import type { Phase, System } from './types.js';

type ClientMessage =
  | { type: 'create'; name: string }
  | { type: 'join'; roomCode: string; name: string; playerToken?: string }
  | { type: 'ready'; ready: boolean }
  | { type: 'start' }
  | { type: 'vote'; system: System }
  | { type: 'accuse'; suspectId: string }
  | { type: 'lantern'; targetId: string }
  | { type: 'power'; targetId?: string }
  | { type: 'heading'; heading: 'North' | 'East' | 'South' | 'West' }
  | { type: 'chat'; text: string }
  | { type: 'kick'; playerId: string };

interface Room {
  voyage: Voyage;
  sockets: Map<string, WebSocket>;
}

export class RoomServer {
  readonly rooms = new Map<string, Room>();
  private readonly rng: Rng;
  constructor(rng: Rng = new SeededRng(42)) {
    this.rng = rng;
  }

  create(name: string): { roomCode: string; playerId: string; playerToken: string } {
    let code: string;
    do {
      code = createRoomCode(this.rng);
    } while (this.rooms.has(code));
    const voyage = new Voyage(code, this.rng);
    const playerId = randomUUID();
    const playerToken = randomUUID();
    voyage.addPlayer(playerId, name, playerToken);
    this.rooms.set(code, { voyage, sockets: new Map() });
    return { roomCode: code, playerId, playerToken };
  }

  join(roomCode: string, name: string, playerToken?: string): { playerId: string; playerToken: string } {
    const room = this.rooms.get(roomCode);
    if (!room) throw new Error('Room not found');
    if (playerToken) {
      const existing = room.voyage.state.players.find((player) => player.token === playerToken);
      if (existing) {
        existing.connected = true;
        return { playerId: existing.id, playerToken };
      }
    }
    const playerId = randomUUID();
    const token = randomUUID();
    room.voyage.addPlayer(playerId, name, token);
    return { playerId, playerToken: token };
  }

  attach(roomCode: string, playerId: string, socket: WebSocket): void {
    const room = this.rooms.get(roomCode);
    if (!room) throw new Error('Room not found');
    room.sockets.set(playerId, socket);
    room.voyage.setConnected(playerId, true);
    this.send(room, playerId);
  }

  detach(roomCode: string, playerId: string): void {
    const room = this.rooms.get(roomCode);
    if (!room) return;
    room.sockets.delete(playerId);
    if (room.voyage.state.players.some((player) => player.id === playerId)) room.voyage.setConnected(playerId, false);
  }

  handle(roomCode: string, playerId: string, message: ClientMessage): void {
    const room = this.rooms.get(roomCode);
    if (!room) throw new Error('Room not found');
    switch (message.type) {
      case 'ready': room.voyage.ready(playerId, message.ready); break;
      case 'start': room.voyage.start(playerId); break;
      case 'vote': room.voyage.vote(playerId, message.system); break;
      case 'accuse': room.voyage.accuse(playerId, message.suspectId); break;
      case 'lantern': room.voyage.usePower(playerId, message.targetId); break;
      case 'power': room.voyage.usePower(playerId, message.targetId); break;
      case 'heading': room.voyage.chooseHeading(playerId, message.heading); break;
      case 'chat': room.voyage.addChat(playerId, message.text); break;
      case 'kick': room.voyage.kick(playerId, message.playerId); break;
      default: throw new Error('Invalid message for established connection');
    }
    this.broadcast(room);
  }

  advance(roomCode: string, phase?: Phase): void {
    const room = this.rooms.get(roomCode);
    if (!room) throw new Error('Room not found');
    room.voyage.advancePhase(phase);
    this.broadcast(room);
  }

  private send(room: Room, playerId: string): void {
    const socket = room.sockets.get(playerId);
    if (socket?.readyState === 1) socket.send(JSON.stringify({ type: 'state', ...room.voyage.playerView(playerId) }));
  }

  private broadcast(room: Room): void {
    room.sockets.forEach((_, playerId) => this.send(room, playerId));
  }
}

export function startWebSocketServer(port = 0, server = new RoomServer()): { wss: WebSocketServer; server: RoomServer; port: number } {
  const wss = new WebSocketServer({ port });
  wss.on('connection', (socket) => {
    let roomCode: string | undefined;
    let playerId: string | undefined;
    socket.on('message', (raw) => {
      try {
        const message = JSON.parse(raw.toString()) as ClientMessage;
        if (message.type === 'create') {
          const created = server.create(message.name);
          roomCode = created.roomCode;
          playerId = created.playerId;
          server.attach(roomCode, playerId, socket);
          socket.send(JSON.stringify({ type: 'joined', ...created }));
        } else if (message.type === 'join') {
          const joined = server.join(message.roomCode, message.name, message.playerToken);
          roomCode = message.roomCode;
          playerId = joined.playerId;
          server.attach(roomCode, playerId, socket);
          socket.send(JSON.stringify({ type: 'joined', roomCode, ...joined }));
        } else if (roomCode && playerId) server.handle(roomCode, playerId, message);
      } catch (error) {
        socket.send(JSON.stringify({ type: 'error', message: error instanceof Error ? error.message : 'Invalid request' }));
      }
    });
    socket.on('close', () => {
      if (roomCode && playerId) server.detach(roomCode, playerId);
    });
  });
  const address = wss.address();
  const actualPort = typeof address === 'object' && address ? address.port : port;
  return { wss, server, port: actualPort };
}
