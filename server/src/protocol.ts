import type { Heading, System } from './types.js';

export type ClientMessage =
  | { type: 'create'; name: string }
  | { type: 'join'; roomCode: string; name: string; playerToken?: string }
  | { type: 'ready'; ready: boolean }
  | { type: 'start' }
  | { type: 'vote'; system: System }
  | { type: 'accuse'; suspectId: string }
  | { type: 'lantern'; targetId: string }
  | { type: 'power'; targetId?: string }
  | { type: 'heading'; heading: Heading }
  | { type: 'chat'; text: string }
  | { type: 'kick'; playerId: string };

export type ServerMessage =
  | { type: 'joined'; roomCode: string; playerId: string; playerToken: string }
  | { type: 'state'; public: unknown; private: unknown }
  | { type: 'error'; message: string };
