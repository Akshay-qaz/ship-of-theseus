import { randomUUID } from 'node:crypto';
import { WebSocketServer, type WebSocket } from 'ws';
import { createRoomCode, SeededRng, Voyage, type Rng } from './core.js';
import type { ClientMessage } from './protocol.js';
import type { PublicView } from './types.js';
import type { Phase } from './types.js';

interface Room {
  voyage: Voyage;
  sockets: Map<string, WebSocket>;
  phaseDeadline: number | null;
  phaseTimer: ReturnType<typeof setTimeout> | null;
}

export interface RoomServerOptions {
  now?: () => number;
  phaseDurations?: Partial<Record<Phase, number>>;
  setTimeout?: (callback: () => void, delay: number) => ReturnType<typeof setTimeout>;
  clearTimeout?: (timer: ReturnType<typeof setTimeout>) => void;
}

export const DEFAULT_PHASE_DURATIONS: Record<Phase, number> = {
  lobby: 0,
  storm: 5_000,
  damageReport: 5_000,
  council: 90_000,
  vote: 30_000,
  replacement: 0,
  integrityCheck: 0,
  delay: 0,
  mutiny: 90_000,
  results: 0,
};

export class RoomServer {
  readonly rooms = new Map<string, Room>();
  private readonly rng: Rng;
  private readonly now: () => number;
  private readonly phaseDurations: Record<Phase, number>;
  private readonly setTimer: NonNullable<RoomServerOptions['setTimeout']>;
  private readonly clearTimer: NonNullable<RoomServerOptions['clearTimeout']>;
  constructor(rng: Rng = new SeededRng(42), options: RoomServerOptions = {}) {
    this.rng = rng;
    this.now = options.now ?? Date.now;
    this.phaseDurations = { ...DEFAULT_PHASE_DURATIONS, ...options.phaseDurations };
    this.setTimer = options.setTimeout ?? ((callback, delay) => setTimeout(callback, delay));
    this.clearTimer = options.clearTimeout ?? ((timer) => clearTimeout(timer));
  }

  create(name: string): { roomCode: string; playerId: string; playerToken: string } {
    let code: string;
    do {
      code = createRoomCode(this.rng);
    } while (this.rooms.has(code));
    const voyage = new Voyage(code, this.rng, {
      phaseChanged: (phase) => this.phaseChanged(code, phase),
    });
    const playerId = randomUUID();
    const playerToken = randomUUID();
    voyage.addPlayer(playerId, name, playerToken);
    this.rooms.set(code, { voyage, sockets: new Map(), phaseDeadline: null, phaseTimer: null });
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
    if (room.phaseDeadline !== null && room.phaseTimer === null) {
      if (room.phaseDeadline <= this.now()) this.tick();
      else room.phaseTimer = this.setTimer(() => this.tick(), room.phaseDeadline - this.now());
    }
    this.send(room, playerId);
  }

  detach(roomCode: string, playerId: string): void {
    const room = this.rooms.get(roomCode);
    if (!room) return;
    room.sockets.delete(playerId);
    if (room.voyage.state.players.some((player) => player.id === playerId)) room.voyage.setConnected(playerId, false);
    if (room.sockets.size === 0) this.clearPhaseTimer(room, false);
    if (room.voyage.state.phase === 'results') this.clearPhaseTimer(room);
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
  publicView(roomCode: string): PublicView {
    const room = this.rooms.get(roomCode);
    if (!room) throw new Error('Room not found');
    return { ...room.voyage.publicView(), deadline: room.phaseDeadline };
  }
  tick(now = this.now()): void {
    this.rooms.forEach((room) => {
      if (room.phaseDeadline === null) return;
      if (room.phaseDeadline > now) {
        const deadline = room.phaseDeadline;
        this.clearPhaseTimer(room);
        room.phaseDeadline = deadline;
        room.phaseTimer = this.setTimer(() => this.tick(), Math.max(1, deadline - now));
        return;
      }
      const phase = room.voyage.state.phase;
      this.clearPhaseTimer(room);
      room.voyage.deadlineReached(phase);
      this.broadcast(room);
    });
  }
  private phaseChanged(roomCode: string, phase: Phase): void {
    const room = this.rooms.get(roomCode);
    if (!room) return;
    this.clearPhaseTimer(room);
    const duration = this.phaseDurations[phase];
    if (duration > 0) {
      room.phaseDeadline = this.now() + duration;
      room.phaseTimer = this.setTimer(() => this.tick(), duration);
    }
    this.broadcast(room);
  }
  private clearPhaseTimer(room: Room, clearDeadline = true): void {
    if (room.phaseTimer !== null) this.clearTimer(room.phaseTimer);
    room.phaseTimer = null;
    if (clearDeadline) room.phaseDeadline = null;
  }

  private send(room: Room, playerId: string): void {
    const socket = room.sockets.get(playerId);
    if (socket?.readyState === 1) {
      socket.send(JSON.stringify({
        type: 'state',
        public: { ...room.voyage.publicView(), deadline: room.phaseDeadline },
        private: room.voyage.playerView(playerId).private,
      }));
    }
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
