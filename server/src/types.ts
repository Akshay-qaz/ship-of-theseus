export const ALL_SYSTEMS = [
  'Sail',
  'Rudder',
  'Hull',
  'Mast',
  'Anchor',
  'Galley',
  'Lantern',
  'Charts',
  'Bell',
  'CrowsNest',
] as const;

export const REPLACEMENT_POWERS = [
  'Salvaged Plank',
  'Foreign Sail',
  'Iron Rudder',
  'Ghost Lantern',
  'Strange Bell',
  'Patched Hull',
  'Borrowed Charts',
  'Empty Galley',
] as const;
export type System = (typeof ALL_SYSTEMS)[number];
export type Power = System | (typeof REPLACEMENT_POWERS)[number];
export type Phase =
  | 'lobby'
  | 'storm'
  | 'damageReport'
  | 'council'
  | 'vote'
  | 'replacement'
  | 'integrityCheck'
  | 'delay'
  | 'mutiny'
  | 'results';
export type Alignment = 'Original Crew' | 'Replacement';
export type Heading = 'North' | 'East' | 'South' | 'West';
export type IdentityBand = 'Sound' | 'Weathered' | 'Strange' | 'Unrecognisable';

export interface Player {
  id: string;
  name: string;
  token: string;
  system: System;
  power: Power;
  alignment: Alignment;
  ready: boolean;
  connected: boolean;
  missedRounds: number;
  replaced: boolean;
}

export interface Damage {
  system: System;
  severity: number;
}

export interface GameState {
  roomCode: string;
  hostId: string;
  players: Player[];
  phase: Phase;
  storm: number;
  morale: number;
  identity: number;
  replacements: number;
  threshold: number;
  damage: Damage[];
  votes: Record<string, System>;
  mutinyVotes: Record<string, string>;
  heading: string | null;
  replacementPlayerId: string | null;
  winner: 'Original Crew' | 'Replacement' | 'Everyone' | null;
  message: string | null;
  chat: ChatMessage[];
  publicVote: boolean;
  forecast: System[];
  delayed: boolean;
  usedPowers: string[];
  lastSacrificed: System | null;
  lastWasAlreadyReplaced: boolean;
  cancelNextReplacement: boolean;
}

export interface ChatMessage {
  id: number;
  playerId: string;
  playerName: string;
  text: string;
  storm: number;
  phase: Phase;
}

export interface PublicPlayer {
  id: string;
  name: string;
  system: System;
  ready: boolean;
  connected: boolean;
  replaced: boolean;
}
export interface PublicView {
  roomCode: string;
  hostId: string;
  players: PublicPlayer[];
  phase: Phase;
  storm: number;
  morale: number;
  identityBand: IdentityBand;
  replacements: number;
  damagedSystems: System[];
  voteTally: Partial<Record<System, number>>;
  chat: ChatMessage[];
  publicVote: boolean;
  winner: GameState['winner'];
  message: string | null;
  deadline: number | null;
  timeline: TimelineEvent[];
  replacementPlayerId?: string;
}
export interface TimelineEvent {
  kind: 'replacement' | 'theseus';
  storm: number;
  system?: System;
  playerId: string;
}
export interface PrivateView {
  playerId: string;
  alignment: Alignment;
  severity: Partial<Record<System, number>>;
  lanternAlignment: { playerId: string; alignment: Alignment } | null;
  converted: boolean;
  power: Power;
  activatablePower: Power | null;
  exactIdentity: number | null;
  forecast: System[];
  targetCount: number | null;
  readingsUnreliable: boolean;
  reveal: string | null;
}
