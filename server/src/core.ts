import {
  ALL_SYSTEMS, REPLACEMENT_POWERS, type Alignment, type ChatMessage,
  type GameState, type Heading, type IdentityBand, type Phase, type Player,
  type Power, type PrivateView, type PublicView, type System,
} from './types.js';

export interface Rng { int(maxExclusive: number): number; pick<T>(items: readonly T[]): T; }
export interface PhaseTimers { phaseChanged?(phase: Phase, state: GameState): void; }
export class SeededRng implements Rng {
  private value: number;
  constructor(seed = 1) { this.value = seed >>> 0; }
  int(maxExclusive: number): number { this.value = (1664525 * this.value + 1013904223) >>> 0; return this.value % maxExclusive; }
  pick<T>(items: readonly T[]): T { return items[this.int(items.length)] as T; }
}
export function createRoomCode(rng: Rng): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from({ length: 6 }, () => alphabet[rng.int(alphabet.length)]).join('');
}
export function systemsForPlayers(count: number): readonly System[] { return ALL_SYSTEMS.slice(0, count); }

export class Voyage {
  readonly state: GameState;
  private readonly rng: Rng;
  private readonly timers: PhaseTimers;
  private readonly privateSeverity = new Map<string, Partial<Record<System, number>>>();
  private readonly lanternResults = new Map<string, { playerId: string; alignment: Alignment }>();
  private readonly forecasts = new Map<string, System[]>();
  private readonly conversionSeen = new Set<string>();
  private transitionQueue: Phase[] = [];
  private transitioning = false;
  private chatSequence = 0;
  private replacedSystems = new Set<System>();

  constructor(roomCode: string, rng: Rng = new SeededRng(), timers: PhaseTimers = {}) {
    this.rng = rng; this.timers = timers;
    this.state = {
      roomCode, hostId: '', players: [], phase: 'lobby', storm: 0, morale: 5, identity: 8,
      replacements: 0, threshold: 4, damage: [], votes: {}, mutinyVotes: {}, heading: null,
      replacementPlayerId: null, winner: null, message: null, chat: [], publicVote: false,
      forecast: [], delayed: false, usedPowers: [], lastSacrificed: null, lastWasAlreadyReplaced: false,
    };
  }
  addPlayer(id: string, name: string, token: string): Player {
    if (this.state.phase !== 'lobby') throw new Error('Voyage already started');
    if (this.state.players.length >= 10) throw new Error('Room is full');
    const system = systemsForPlayers(this.state.players.length + 1).at(-1) as System;
    const player: Player = { id, name, token, system, power: system, alignment: 'Original Crew',
      ready: false, connected: true, missedRounds: 0, replaced: false };
    this.state.players.push(player);
    if (!this.state.hostId) this.state.hostId = id;
    return player;
  }
  setConnected(id: string, connected: boolean): void { this.player(id).connected = connected; }
  ready(id: string, ready: boolean): void {
    if (this.state.phase !== 'lobby') throw new Error('Not in lobby');
    this.player(id).ready = ready;
  }
  start(hostId: string): void {
    if (hostId !== this.state.hostId) throw new Error('Only host can start');
    if (this.state.players.length < 6) throw new Error('At least six players required');
    if (this.state.players.some((player) => !player.ready)) throw new Error('All players must be ready');
    this.advancePhase('storm');
  }
  addChat(id: string, text: string): void {
    if (this.state.phase === 'lobby' || this.state.phase === 'results') throw new Error('Chat is closed');
    const player = this.player(id);
    if (!text.trim() || text.length > 500) throw new Error('Invalid chat message');
    const message: ChatMessage = { id: ++this.chatSequence, playerId: id, playerName: player.name,
      text: text.trim(), storm: this.state.storm, phase: this.state.phase };
    this.state.chat.push(message);
  }
  vote(id: string, system: System): void {
    if (this.state.phase !== 'vote') throw new Error('Voting is not open');
    if (!this.state.players.some((player) => player.system === system)) throw new Error('Invalid system');
    this.state.votes[id] = system;
    if (Object.keys(this.state.votes).length >= this.state.players.filter((player) => player.connected).length) this.advancePhase('replacement');
  }
  accuse(id: string, suspectId: string): void {
    if (this.state.phase !== 'mutiny') throw new Error('Mutiny is not open');
    this.player(suspectId); this.state.mutinyVotes[id] = suspectId;
    if (Object.keys(this.state.mutinyVotes).length >= this.state.players.filter((player) => player.connected).length) this.resolveMutiny();
  }
  chooseHeading(id: string, heading: Heading): void {
    if (!['storm', 'council'].includes(this.state.phase)) throw new Error('Heading is not open');
    const player = this.player(id);
    if (player.system !== 'Sail' || this.state.usedPowers.includes(`${id}:Sail:${this.state.storm}`)) throw new Error('Sail unavailable');
    this.state.heading = heading; this.state.usedPowers.push(`${id}:Sail:${this.state.storm}`);
  }
  usePower(id: string, targetId?: string): void {
    const player = this.player(id);
    const key = `${id}:${player.power}:${this.state.storm}`;
    const oncePerVoyage = ['Lantern', 'Ghost Lantern', 'Rudder', 'Mast', 'Iron Rudder', 'Patched Hull', 'Empty Galley'];
    if (this.state.usedPowers.includes(key) || (oncePerVoyage.includes(player.power) && this.state.usedPowers.includes(`${id}:${player.power}`))) {
      throw new Error('Power already used');
    }
    switch (player.power) {
      case 'Lantern': case 'Ghost Lantern': this.useLantern(player, targetId); break;
      case 'Rudder': this.requirePhase('vote'); this.state.votes = {}; break;
      case 'Mast': this.requirePhase('vote'); this.state.usedPowers.push(`${id}:Mast`); break;
      case 'Anchor': this.requirePhase('council'); this.state.delayed = true; this.changeMorale(-1); break;
      case 'Galley': this.requirePhase('integrityCheck'); this.changeMorale(1); break;
      case 'Bell': this.requirePhase('vote'); this.state.publicVote = true; break;
      case 'Strange Bell': this.requirePhase('council'); this.state.publicVote = true; break;
      case 'Charts': case 'Borrowed Charts': this.requirePhase('council'); this.setForecast(id, this.state.forecast); break;
      case 'Foreign Sail': this.requirePhase('damageReport'); break;
      case 'Iron Rudder': this.requirePhase('vote'); break;
      case 'Patched Hull': this.requirePhase('council'); break;
      case 'Empty Galley': this.requirePhase('council'); this.changeMorale(1); break;
      case 'Salvaged Plank': throw new Error('Salvaged Plank has no power');
      case 'Hull': case 'CrowsNest': break;
      default: throw new Error('Unsupported power');
    }
    this.state.usedPowers.push(key);
    if (oncePerVoyage.includes(player.power)) this.state.usedPowers.push(`${id}:${player.power}`);
  }
  kick(hostId: string, id: string): void {
    if (hostId !== this.state.hostId) throw new Error('Only host can kick');
    const player = this.player(id);
    if (player.missedRounds < 2) throw new Error('Player has not missed two rounds');
    this.state.players = this.state.players.filter((candidate) => candidate.id !== id);
  }

  advancePhase(next?: Phase): void {
    this.transitionQueue.push(next ?? this.nextPhase(this.state.phase));
    if (this.transitioning) return;
    this.transitioning = true;
    try {
      while (this.transitionQueue.length && !this.state.winner) {
        const phase = this.transitionQueue.shift() as Phase;
        this.state.phase = phase; this.state.message = null;
        if (phase === 'storm') this.beginStorm();
        if (phase === 'replacement') this.resolveReplacement();
        if (phase === 'integrityCheck') this.integrityCheck();
        if (phase === 'mutiny') this.state.message = 'Accuse one suspect';
        if (phase === 'results') this.state.message = 'Voyage complete';
        this.timers.phaseChanged?.(phase, this.state);
      }
    } finally { this.transitioning = false; }
  }
  publicView(): PublicView {
    const voteTally: Partial<Record<System, number>> = {};
    Object.values(this.state.votes).forEach((system) => { voteTally[system] = (voteTally[system] ?? 0) + 1; });
    return {
      roomCode: this.state.roomCode, hostId: this.state.hostId,
      players: this.state.players.map(({ id, name, system, ready, connected, replaced }) => ({ id, name, system, ready, connected, replaced })),
      phase: this.state.phase, storm: this.state.storm, morale: this.state.morale, identityBand: this.identityBand(),
      replacements: this.state.replacements, threshold: 4, damagedSystems: this.state.damage.map(({ system }) => system),
      voteTally, chat: [...this.state.chat], publicVote: this.state.publicVote, winner: this.state.winner, message: this.state.message,
    };
  }
  playerView(id: string): { public: PublicView; private: PrivateView } {
    const player = this.player(id);
    return { public: this.publicView(), private: {
      playerId: id, alignment: player.alignment, severity: this.privateSeverity.get(id) ?? {},
      lanternAlignment: this.lanternResults.get(id) ?? null, converted: this.conversionSeen.has(id),
      exactIdentity: player.system === 'CrowsNest' && player.power === 'CrowsNest' ? this.state.identity : null,
      forecast: this.forecasts.get(id) ?? [], targetCount: player.power === 'Foreign Sail' ? this.state.damage.length : null,
    } };
  }
  private beginStorm(): void {
    this.state.storm += 1; this.state.damage = []; this.state.votes = {}; this.state.publicVote = false;
    this.state.lastSacrificed = null; this.state.lastWasAlreadyReplaced = false;
    this.state.forecast = this.rollTargets();
    this.state.damage = this.state.forecast.map((system) => ({ system, severity: this.rng.int(3) + 1 }));
    this.state.players.forEach((player) => {
      const owned = this.state.damage.filter((damage) => damage.system === player.system);
      if (owned.length) this.privateSeverity.set(player.id, Object.fromEntries(owned.map((damage) => [damage.system, damage.severity])));
      if (player.power === 'Hull') this.privateSeverity.set(player.id, Object.fromEntries(this.state.damage.map((damage) => [damage.system, damage.severity])));
      if (player.power === 'Charts' || player.power === 'Borrowed Charts') this.setForecast(player.id, this.state.forecast);
    });
  }
  private rollTargets(): System[] {
    const systems = [...systemsForPlayers(this.state.players.length)];
    const count = this.state.players.length >= 9 ? 3 : 2;
    const offset: Record<string, number> = { North: 0, East: 1, South: 2, West: 3 };
    const start = (this.rng.int(systems.length) + (offset[this.state.heading ?? 'North'] ?? 0)) % systems.length;
    return Array.from({ length: count }, (_, index) => systems[(start + index) % systems.length] as System);
  }
  private resolveReplacement(): void {
    const active = this.state.players.filter((player) => player.connected);
    const counts = new Map<System, number>();
    Object.entries(this.state.votes).forEach(([voter, system]) => {
      if (!active.some((player) => player.id === voter)) return;
      const weight = this.player(voter).power === 'Iron Rudder' ? 2 : 1;
      counts.set(system, (counts.get(system) ?? 0) + weight);
    });
    let candidates = [...counts.entries()].filter(([, count]) => count === Math.max(0, ...counts.values())).map(([system]) => system);
    if (candidates.length > 1) {
      const sail = this.state.players.find((player) => player.system === 'Sail');
      if (sail && candidates.includes(this.state.votes[sail.id])) candidates = [this.state.votes[sail.id]];
    }
    const chosen = candidates[0] ?? this.state.damage[0]?.system ?? this.state.players[0]?.system;
    const owner = this.state.players.find((player) => player.system === chosen);
    if (owner && !this.state.usedPowers.includes(`${owner.id}:Mast`)) {
      const wasAlreadyReplaced = this.replacedSystems.has(chosen);
      owner.replaced = true; owner.power = this.rng.pick(REPLACEMENT_POWERS) as Power;
      this.state.replacements += 1; this.replacedSystems.add(chosen); this.state.lastSacrificed = chosen;
      this.state.lastWasAlreadyReplaced = wasAlreadyReplaced;
      this.state.message = `${chosen} replaced`;
    }
    this.transitionQueue.push('integrityCheck');
  }
  private integrityCheck(): void {
    this.state.players.forEach((player) => { if (!player.connected) player.missedRounds += 1; });
    const chosen = this.state.lastSacrificed;
    if (chosen) {
      if (this.state.lastWasAlreadyReplaced) this.loseMorale();
      else this.state.identity = Math.max(0, this.state.identity - 1);
      if (!this.state.damage.some((damage) => damage.system === chosen)) this.loseMorale();
    }
    if (this.state.storm % 2 === 0 && this.state.players.some((player) => player.system === 'Galley' && player.power === 'Galley')) this.changeMorale(1);
    if (this.state.morale <= 0 && this.state.storm < 8) return this.finish('Everyone');
    if (this.state.identity <= 0) return this.finish('Replacement');
    if (this.replacedSystems.size >= 4 && !this.state.replacementPlayerId) {
      const replacement = this.rng.pick(this.state.players.filter((player) => player.replaced));
      replacement.alignment = 'Replacement'; this.state.replacementPlayerId = replacement.id; this.conversionSeen.add(replacement.id);
    }
    if (this.state.storm >= 8) this.transitionQueue.push('mutiny');
    else if (this.state.delayed) { this.state.delayed = false; this.transitionQueue.push('council'); }
    else this.transitionQueue.push('storm');
  }
  private resolveMutiny(): void {
    const tally = new Map<string, number>();
    Object.values(this.state.mutinyVotes).forEach((id) => tally.set(id, (tally.get(id) ?? 0) + 1));
    const accused = [...tally.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
    if (!this.state.replacementPlayerId) return this.finish('Original Crew');
    this.finish(accused === this.state.replacementPlayerId ? 'Original Crew' : 'Replacement');
  }
  private finish(winner: 'Original Crew' | 'Replacement' | 'Everyone'): void { this.state.winner = winner; this.transitionQueue.push('results'); }
  private changeMorale(delta: number): void { this.state.morale = Math.max(0, Math.min(5, this.state.morale + delta)); }
  private loseMorale(): void {
    const shield = this.state.players.find((player) => player.power === 'Patched Hull' && !this.state.usedPowers.includes(`${player.id}:Patched Hull`));
    if (shield) this.state.usedPowers.push(`${shield.id}:Patched Hull`);
    else this.changeMorale(-1);
  }
  private useLantern(player: Player, targetId?: string): void {
    this.requirePhase('council');
    if (!targetId || targetId === player.id) throw new Error('Lantern needs another player');
    const target = this.player(targetId); let alignment = target.alignment;
    if (player.power === 'Ghost Lantern' && this.rng.int(4) === 0) alignment = alignment === 'Original Crew' ? 'Replacement' : 'Original Crew';
    this.lanternResults.set(player.id, { playerId: targetId, alignment });
  }
  private setForecast(id: string, forecast: System[]): void { this.forecasts.set(id, [...forecast]); }
  private requirePhase(phase: Phase): void { if (this.state.phase !== phase) throw new Error(`Power requires ${phase}`); }
  private identityBand(): IdentityBand {
    if (this.state.identity >= 7) return 'Sound';
    if (this.state.identity >= 5) return 'Weathered';
    if (this.state.identity >= 3) return 'Strange';
    return 'Unrecognisable';
  }
  private player(id: string): Player {
    const player = this.state.players.find((candidate) => candidate.id === id);
    if (!player) throw new Error('Unknown player');
    return player;
  }
  private nextPhase(phase: Phase): Phase {
    return ({ storm: 'damageReport', damageReport: 'council', council: 'vote', vote: 'replacement', replacement: 'integrityCheck', integrityCheck: 'storm' } as Partial<Record<Phase, Phase>>)[phase] ?? phase;
  }
}
