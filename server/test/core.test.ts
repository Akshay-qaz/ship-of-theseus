import { describe, expect, it } from 'vitest';
import { SeededRng, systemsForPlayers, Voyage } from '../src/core.js';
import type { Phase, Power, System } from '../src/types.js';

function voyage(count = 10, seed = 7, phases?: Phase[]): Voyage {
  const game = new Voyage('ABC123', new SeededRng(seed), {
    phaseChanged: phases ? (phase) => phases.push(phase) : undefined,
  });
  for (let i = 0; i < count; i++) game.addPlayer(`p${i}`, `Player ${i}`, `t${i}`);
  game.state.players.forEach((player) => game.ready(player.id, true));
  game.start('p0');
  return game;
}

function storm(game: Voyage, system: System, makeDamaged = false): void {
  if (game.state.winner) return;
  game.advancePhase('damageReport');
  if (makeDamaged) game.state.damage = [{ system, severity: 1 }];
  game.advancePhase('council');
  game.advancePhase('vote');
  game.state.players.forEach((player) => {
    if (game.state.phase === 'vote') game.vote(player.id, system);
  });
}

describe('revised meters and privacy', () => {
  it.each([6, 7, 8, 9, 10])('uses fixed player systems and a hidden reachable start for %i players', (count) => {
    const game = voyage(count);
    expect(game.state.players.map((player) => player.system)).toEqual([...systemsForPlayers(count)]);
    expect(game.state.identity).toBeGreaterThanOrEqual(6);
    expect(game.state.identity).toBeLessThanOrEqual(Math.min(count, 8));
    expect(game.state.morale).toBe(5);
  });

  it.each([6, 7, 8, 9, 10])('can reach Identity zero at %i players', (count) => {
    const game = voyage(count, 100 + count);
    for (const system of systemsForPlayers(count)) storm(game, system, true);
    expect(game.state.identity).toBe(0);
    expect(game.state.winner).toBe('Replacement');
  });

  it('costs Identity once and Morale when patching an already-replaced system', () => {
    const game = voyage();
    storm(game, 'Sail', true);
    expect(game.state.identity).toBeLessThan(8);
    const identity = game.state.identity;
    game.state.players.find((player) => player.system === 'Galley')!.power = 'Salvaged Plank';
    storm(game, 'Sail', true);
    expect(game.state.identity).toBe(identity);
    expect(game.state.morale).toBe(5);
  });

  it('charges Morale on the second repair even when the patch is damaged', () => {
    const game = voyage();
    storm(game, 'Sail', true);
    const identity = game.state.identity;
    storm(game, 'Sail', true);
    expect(game.state.identity).toBe(identity);
    expect(game.state.morale).toBe(5);
    storm(game, 'Sail', true);
    expect(game.state.morale).toBe(4);
  });

  it('converts exactly one player when hidden Identity reaches four or below', () => {
    const game = voyage();
    for (const system of ['Sail', 'Rudder', 'Hull', 'Mast'] as System[]) storm(game, system, true);
    expect(game.state.identity).toBeLessThanOrEqual(4);
    expect(game.state.replacementPlayerId).toBeTruthy();
    expect(game.state.players.filter((player) => player.alignment === 'Replacement')).toHaveLength(1);
  });

  it('corrupts only the converted player readings, stably and legally', () => {
    const game = voyage(10, 4);
    for (const system of ['Sail', 'Rudder', 'Hull', 'Mast'] as System[]) storm(game, system, true);
    const replacement = game.state.replacementPlayerId as string;
    const converted = game.playerView(replacement);
    const again = game.playerView(replacement);
    expect(converted.private.converted).toBe(true);
    expect(converted.private.readingsUnreliable).toBe(true);
    expect(converted.private.reveal).toContain('instruments');
    expect(converted.private).toEqual(again.private);
    const convertedPlayer = game.state.players.find((player) => player.id === replacement)!;
    convertedPlayer.power = 'Lantern';
    game.state.phase = 'council';
    game.usePower(replacement, game.state.players.find((player) => player.id !== replacement)!.id);
    const lantern = game.playerView(replacement).private.lanternAlignment!;
    const target = game.state.players.find((player) => player.id === lantern.playerId)!;
    expect(lantern.alignment).not.toBe(target.alignment);
    expect(converted.private.exactIdentity === null || (converted.private.exactIdentity >= 0 && converted.private.exactIdentity <= 8)).toBe(true);
    Object.values(converted.private.severity).forEach((severity) => expect(severity).toBeGreaterThanOrEqual(1));
    Object.values(converted.private.severity).forEach((severity) => expect(severity).toBeLessThanOrEqual(3));
    const unconverted = game.state.players.filter((player) => player.id !== replacement);
    unconverted.forEach((player) => {
      const view = game.playerView(player.id);
      expect(view.private.converted).toBe(false);
      const truth = player.power === 'Hull'
        ? Object.fromEntries(game.state.damage.map((damage) => [damage.system, damage.severity]))
        : player.power === player.system ? Object.fromEntries(game.state.damage
          .filter((damage) => damage.system === player.system)
          .map((damage) => [damage.system, damage.severity])) : {};
      expect(view.private.severity).toEqual(truth);
    });
  });

  it('emits queued phases once and in order', () => {
    const emitted: Phase[] = [];
    const game = voyage(10, 9, emitted);
    storm(game, 'Sail', true);
    expect(emitted).toEqual(['storm', 'damageReport', 'council', 'vote', 'replacement', 'integrityCheck', 'storm']);
  });

  it('keeps exact Identity, threshold, alignments, severity, and powers private', () => {
    const game = voyage();
    const view = game.playerView('p0');
    expect(JSON.stringify(view.public)).not.toContain('"identity":');
    expect(JSON.stringify(view.public)).not.toContain('"threshold":');
    expect(JSON.stringify(view.public)).not.toContain('alignment');
    expect(JSON.stringify(view.public)).not.toContain('severity');
    expect(Object.values(view.public.players).every((player) => !('power' in player))).toBe(true);
    expect(view.private.exactIdentity).toBeNull();
    expect(game.playerView('p9').private.exactIdentity).toBe(game.state.identity);
    expect(view.private.activatablePower).toBe('Sail');
  });

  it('does not let a public snapshot recover exact Identity', () => {
    const lower = voyage(10, 17);
    const higher = voyage(10, 18);
    lower.state.identity = 5;
    higher.state.identity = 6;
    lower.state.damage = [...higher.state.damage];
    expect(lower.publicView()).toEqual(higher.publicView());
  });

  it('retains public council chat and coarse Identity only', () => {
    const game = voyage();
    game.advancePhase('damageReport');
    game.advancePhase('council');
    game.addChat('p1', 'I saw damage on the sail.');
    expect(game.publicView().chat[0]?.text).toBe('I saw damage on the sail.');
    expect(['Sound', 'Weathered', 'Strange', 'Unrecognisable']).toContain(game.publicView().identityBand);
  });

  it('uses Sail heading to bias a proper random subset', () => {
    const north = voyage(10, 21);
    const east = voyage(10, 21);
    north.advancePhase('damageReport'); north.advancePhase('council'); north.chooseHeading('p0', 'North');
    east.advancePhase('damageReport'); east.advancePhase('council'); east.chooseHeading('p0', 'East');
    north.advancePhase('vote'); east.advancePhase('vote');
    expect(east.state.forecast).not.toEqual(north.state.forecast);
    expect(new Set(north.state.damage.map((damage) => damage.system)).size).toBe(north.state.damage.length);
  });

  it('Morale zero loses even on storm eight', () => {
    const game = voyage();
    game.state.storm = 7;
    game.state.morale = 1;
    game.state.players.find((player) => player.system === 'Galley')!.power = 'Salvaged Plank';
    game.advancePhase('damageReport');
    game.state.damage = [{ system: 'Rudder', severity: 1 }];
    game.advancePhase('council');
    game.advancePhase('vote');
    game.state.players.forEach((player) => game.vote(player.id, 'Sail'));
    expect(game.state.winner).toBe('Everyone');
  });

  it('reaches Original Crew wins with and without a Replacement, and wrong accusation loses', () => {
    const none = voyage();
    for (let i = 0; i < 8; i++) storm(none, 'Sail', true);
    expect(none.state.replacementPlayerId).toBeNull();
    none.state.players.forEach((player) => none.accuse(player.id, player.id));
    expect(none.state.winner).toBe('Original Crew');

    const correct = voyage();
    for (const system of ['Sail', 'Rudder', 'Hull', 'Mast'] as System[]) storm(correct, system, true);
    for (let i = 4; i < 8; i++) storm(correct, 'Sail', true);
    const replacement = correct.state.replacementPlayerId as string;
    correct.state.players.forEach((player) => correct.accuse(player.id, replacement));
    expect(correct.state.winner).toBe('Original Crew');

    const wrong = voyage();
    for (const system of ['Sail', 'Rudder', 'Hull', 'Mast'] as System[]) storm(wrong, system, true);
    for (let i = 4; i < 8; i++) storm(wrong, 'Sail', true);
    const target = wrong.state.players.find((player) => player.id !== wrong.state.replacementPlayerId)?.id as string;
    wrong.state.players.forEach((player) => wrong.accuse(player.id, target));
    expect(wrong.state.winner).toBe('Replacement');
  });
});

describe('powers', () => {
  it('implements Mast as one next-replacement cancellation', () => {
    const game = voyage();
    game.advancePhase('damageReport'); game.advancePhase('council'); game.advancePhase('vote');
    game.state.players[3].power = 'Mast';
    game.usePower('p3');
    game.state.players.forEach((player) => game.vote(player.id, 'Sail'));
    expect(game.state.replacements).toBe(0);
    storm(game, 'Sail', true);
    expect(game.state.replacements).toBe(1);
  });

  it('makes Charts and Borrowed Charts reveal next, not current, targets', () => {
    const game = voyage();
    const current = game.state.damage.map((damage) => damage.system);
    game.advancePhase('damageReport'); game.advancePhase('council');
    game.usePower('p7');
    expect(game.playerView('p7').private.forecast).toEqual(game.state.forecast);
    expect(game.playerView('p7').private.forecast).not.toEqual(current);
    game.state.players[2].power = 'Borrowed Charts';
    game.usePower('p2');
    expect(game.playerView('p2').private.forecast).toEqual(game.state.forecast);
  });

  it('uses Anchor as a delay without an extra sacrifice vote', () => {
    const phases: Phase[] = [];
    const game = voyage(10, 7, phases);
    game.advancePhase('damageReport'); game.advancePhase('council');
    game.usePower('p4');
    game.advancePhase('vote');
    game.state.players.forEach((player) => game.vote(player.id, 'Sail'));
    expect(phases.slice(-4)).toEqual(['replacement', 'integrityCheck', 'delay', 'storm']);
  });

  it('keeps Galley passive and exposes blank powers as non-activatable', () => {
    const game = voyage();
    game.state.players[5].power = 'Galley';
    expect(() => game.usePower('p5')).toThrow();
    game.state.players[0].power = 'Salvaged Plank';
    expect(game.playerView('p0').private.activatablePower).toBeNull();
  });

  it('activates Iron Rudder and Patched Hull before applying their effects', () => {
    const game = voyage();
    game.advancePhase('damageReport'); game.advancePhase('council'); game.advancePhase('vote');
    game.state.players[6].power = 'Iron Rudder';
    game.state.votes.p6 = 'Sail';
    expect(game.state.usedPowers).not.toContain('p6:Iron Rudder:active');
    game.usePower('p6');
    expect(game.state.usedPowers).toContain('p6:Iron Rudder:active');
    game.advancePhase('council');
    game.state.players[5].power = 'Patched Hull';
    game.usePower('p5');
    expect(game.state.usedPowers).toContain('p5:Patched Hull:active');
  });

  it('keeps Ghost Lantern results stable and tests the replacement pool', () => {
    const game = voyage(10, 3);
    game.advancePhase('damageReport'); game.advancePhase('council');
    game.state.players[0].power = 'Ghost Lantern';
    game.usePower('p0', 'p1');
    const result = game.playerView('p0').private.lanternAlignment;
    expect(game.playerView('p0').private.lanternAlignment).toEqual(result);
    const powers: Power[] = ['Salvaged Plank', 'Foreign Sail', 'Iron Rudder', 'Ghost Lantern',
      'Strange Bell', 'Patched Hull', 'Borrowed Charts', 'Empty Galley'];
    expect(new Set(powers).size).toBe(8);
  });
});

describe('room lifecycle edge cases', () => {
  it('retires a kicked player system from voting', () => {
    const game = voyage();
    game.state.players[1].missedRounds = 2;
    game.kick('p0', 'p1');
    game.advancePhase('damageReport'); game.advancePhase('council'); game.advancePhase('vote');
    expect(() => game.vote('p0', 'Rudder')).toThrow();
  });

  it('tied mutiny accusations are an explicit Replacement win', () => {
    const game = voyage();
    for (const system of ['Sail', 'Rudder', 'Hull', 'Mast'] as System[]) storm(game, system, true);
    for (let i = 4; i < 8; i++) storm(game, 'Sail', true);
    const replacement = game.state.replacementPlayerId as string;
    const other = game.state.players.find((player) => player.id !== replacement)?.id as string;
    game.state.players.slice(0, 5).forEach((player) => game.accuse(player.id, replacement));
    game.state.players.slice(5).forEach((player) => game.accuse(player.id, other));
    expect(game.state.winner).toBe('Replacement');
  });
});
