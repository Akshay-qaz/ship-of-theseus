import { describe, expect, it } from 'vitest';
import { RoomServer } from '../src/server.js';

function roomWithPlayers(now: () => number, callbacks: Array<() => void>): RoomServer {
  const server = new RoomServer(undefined, {
    now,
    phaseDurations: {
      storm: 100,
      damageReport: 100,
      council: 100,
      vote: 100,
      mutiny: 100,
    },
    setTimeout: (callback) => {
      callbacks.push(callback);
      return callbacks.length as unknown as ReturnType<typeof setTimeout>;
    },
    clearTimeout: () => {},
  });
  const created = server.create('Player 1');
  for (let index = 2; index <= 6; index++) {
    server.join(created.roomCode, `Player ${index}`);
  }
  const room = server.rooms.get(created.roomCode);
  room?.voyage.state.players.forEach((player) => room.voyage.ready(player.id, true));
  return server;
}

describe('room phase timers', () => {
  it('auto-advances when the injected deadline passes', () => {
    let now = 1_000;
    const callbacks: Array<() => void> = [];
    const server = roomWithPlayers(() => now, callbacks);
    const roomCode = [...server.rooms.keys()][0];
    const room = server.rooms.get(roomCode);
    room?.voyage.start(room.voyage.state.hostId);

    expect(server.publicView(roomCode).deadline).toBe(1_100);
    now = 1_100;
    server.tick();

    expect(room?.voyage.state.phase).toBe('damageReport');
  });

  it('does not double-advance after all players vote early', () => {
    let now = 2_000;
    const callbacks: Array<() => void> = [];
    const server = roomWithPlayers(() => now, callbacks);
    const roomCode = [...server.rooms.keys()][0];
    const room = server.rooms.get(roomCode);
    room?.voyage.start(room.voyage.state.hostId);
    server.advance(roomCode, 'damageReport');
    server.advance(roomCode, 'council');
    server.advance(roomCode, 'vote');
    const oldDeadlineCallback = callbacks.at(-1);
    room?.voyage.state.players.forEach((player) => {
      if (room.voyage.state.phase === 'vote') room.voyage.vote(player.id, 'Sail');
    });
    const phaseAfterVote = room?.voyage.state.phase;

    oldDeadlineCallback?.();

    expect(phaseAfterVote).toBe('storm');
    expect(room?.voyage.state.phase).toBe('storm');
  });

  it('keeps the same absolute deadline available for reconnect serialization', () => {
    let now = 3_000;
    const callbacks: Array<() => void> = [];
    const server = roomWithPlayers(() => now, callbacks);
    const roomCode = [...server.rooms.keys()][0];
    const room = server.rooms.get(roomCode);
    room?.voyage.start(room.voyage.state.hostId);

    const firstView = server.publicView(roomCode);
    now = 3_040;
    const reconnectView = server.publicView(roomCode);

    expect(firstView.phase).toBe('storm');
    expect(reconnectView.phase).toBe('storm');
    expect(reconnectView.deadline).toBe(firstView.deadline);
    expect(reconnectView.deadline).toBe(3_100);
  });
});
