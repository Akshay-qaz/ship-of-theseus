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
  game.advancePhase('damageReport');
  if (makeDamaged) game.state.damage = [{ system, severity: 1 }];
  game.advancePhase('council');
  game.advancePhase('vote');
  game.state.players.forEach((player) => game.vote(player.id, system));
}

describe('revised meters and voyage rules', () => {
  it.each([6, 7, 8, 9, 10])('supports %i players with fixed meters', (count) => {
    const game = voyage(count);
    expect(game.state.players.map((player) => player.system)).toEqual([...systemsForPlayers(count)]);
    expect(game.state.threshold).toBe(4);
    expect(game.state.identity).toBe(8);
    expect(game.state.morale).toBe(5);
  });

  it('costs Identity only for a first replacement and Morale for repeats', () => {
    const game = voyage();
    storm(game, 'Sail');
    expect(game.state.identity).toBe(7);
    expect(game.state.morale).toBe(5);
    game.state.players.find((player) => player.system === 'Galley')!.power = 'Salvaged Plank';
    storm(game, 'Sail');
    expect(game.state.identity).toBe(7);
    expect(game.state.morale).toBe(4);
  });

  it('triggers exactly one Replacement at four distinct systems', () => {
    const game = voyage();
    for (const system of ['Sail', 'Rudder', 'Hull', 'Mast'] as System[]) storm(game, system);
    expect(game.state.replacementPlayerId).toBeTruthy();
    expect(game.state.players.filter((player) => player.alignment === 'Replacement')).toHaveLength(1);
    for (let i = 0; i < 4; i++) storm(game, 'Sail');
    expect(game.state.players.filter((player) => player.alignment === 'Replacement')).toHaveLength(1);
  });

  it('emits each phase exactly once and in order despite nested effects', () => {
    const emitted: Phase[] = [];
    const game = voyage(10, 9, emitted);
    storm(game, 'Sail');
    expect(emitted).toEqual(['storm', 'damageReport', 'council', 'vote', 'replacement', 'integrityCheck', 'storm']);
    expect(emitted.every((phase, index) => index === 0 || phase !== emitted[index - 1])).toBe(true);
  });

  it('keeps alignments, exact Identity, exact powers, and severity private', () => {
    const game = voyage();
    const view = game.playerView('p0');
    expect(JSON.stringify(view.public)).not.toContain('alignment');
    expect(JSON.stringify(view.public)).not.toContain('severity');
    expect(JSON.stringify(view.public)).not.toContain('"identity":');
    expect(JSON.stringify(view.public)).not.toContain('Salvaged Plank');
    expect(Object.values(view.public.players).every((player) => !('power' in player))).toBe(true);
    expect(view.private.exactIdentity).toBeNull();
    expect(game.playerView('p9').private.exactIdentity).toBe(8);
  });

  it('retains public council chat', () => {
    const game = voyage();
    game.advancePhase('damageReport');
    game.advancePhase('council');
    game.addChat('p1', 'I saw damage on the sail.');
    expect(game.publicView().chat[0]?.text).toBe('I saw damage on the sail.');
  });

  it('uses Sail to break ties and heading to change targets', () => {
    const north = voyage(10, 21);
    const east = voyage(10, 21);
    north.advancePhase('damageReport'); north.advancePhase('council'); north.advancePhase('vote');
    north.state.players.forEach((player) => north.vote(player.id, 'Sail'));
    east.advancePhase('damageReport'); east.advancePhase('council'); east.advancePhase('vote');
    east.state.players.forEach((player) => east.vote(player.id, 'Sail'));
    north.advancePhase('council'); east.advancePhase('council');
    north.chooseHeading('p0', 'North'); east.chooseHeading('p0', 'East');
    north.advancePhase('storm'); east.advancePhase('storm');
    expect(east.state.forecast).not.toEqual(north.state.forecast);
  });

  it('reaches every terminal outcome', () => {
    const correct = voyage();
    for (const system of ['Sail', 'Rudder', 'Hull', 'Mast'] as System[]) storm(correct, system, true);
    for (let i = 4; i < 8; i++) storm(correct, 'Sail', true);
    if (correct.state.phase === 'mutiny' && correct.state.replacementPlayerId) {
      correct.state.players.forEach((player) => correct.accuse(player.id, correct.state.replacementPlayerId as string));
    }
    expect(correct.state.winner).toBe('Original Crew');

    const none = voyage();
    for (let i = 0; i < 8; i++) storm(none, 'Sail', true);
    expect(none.state.replacementPlayerId).toBeNull();
    expect(none.state.phase).toBe('mutiny');
    none.state.players.forEach((player) => none.accuse(player.id, player.id));
    expect(none.state.winner).toBe('Original Crew');

    const wrong = voyage();
    for (const system of ['Sail', 'Rudder', 'Hull', 'Mast'] as System[]) storm(wrong, system, true);
    for (let i = 4; i < 8; i++) storm(wrong, 'Sail', true);
    const wrongTarget = wrong.state.players.find((player) => player.id !== wrong.state.replacementPlayerId)?.id;
    if (wrong.state.phase === 'mutiny' && wrongTarget) wrong.state.players.forEach((player) => wrong.accuse(player.id, wrongTarget));
    expect(wrong.state.winner).toBe('Replacement');

    const morale = voyage();
    morale.state.morale = 1;
    morale.state.players.find((player) => player.system === 'Galley')!.power = 'Salvaged Plank';
    morale.advancePhase('damageReport');
    morale.state.damage = [{ system: 'Rudder', severity: 1 }];
    morale.advancePhase('council');
    morale.advancePhase('vote');
    morale.state.players.forEach((player) => morale.vote(player.id, 'Sail'));
    expect(morale.state.winner).toBe('Everyone');
  });
});

describe('powers', () => {
  it('exercises the original power actions', () => {
    const game = voyage();
    game.advancePhase('damageReport');
    game.advancePhase('council');
    game.chooseHeading('p0', 'East');
    expect(game.state.heading).toBe('East');
    game.state.players.find((p) => p.system === 'Lantern')!.power = 'Lantern';
    game.usePower('p6', 'p1');
    game.advancePhase('vote');
    game.state.players.find((p) => p.system === 'Rudder')!.power = 'Rudder';
    game.usePower('p1');
    game.state.players.find((p) => p.system === 'Bell')!.power = 'Bell';
    game.usePower('p8');
    expect(game.state.publicVote).toBe(true);
  });

  it('exercises the remaining original powers', () => {
    const game = voyage();
    game.advancePhase('damageReport');
    game.advancePhase('council');
    game.usePower('p4');
    expect(game.state.morale).toBe(4);
    game.usePower('p7');
    expect(game.playerView('p7').private.forecast).toEqual(game.state.forecast);
    expect(game.playerView('p2').private.severity).toEqual(Object.fromEntries(game.state.damage.map((damage) => [damage.system, damage.severity])));
    game.advancePhase('vote');
    game.state.players[3].power = 'Mast';
    game.usePower('p3');
    game.state.players.forEach((player) => game.vote(player.id, 'Mast'));
    expect(game.state.replacements).toBe(0);
  });

  it('exercises every replacement ability', () => {
    const game = voyage();
    game.advancePhase('damageReport');
    game.state.players[0].power = 'Foreign Sail';
    game.usePower('p0');
    expect(game.playerView('p0').private.targetCount).toBe(game.state.damage.length);
    game.advancePhase('council');
    game.state.players[1].power = 'Strange Bell';
    game.usePower('p1');
    expect(game.state.publicVote).toBe(true);
    game.state.players[2].power = 'Borrowed Charts';
    game.usePower('p2');
    expect(game.playerView('p2').private.forecast).toEqual(game.state.forecast);
    game.state.players[4].power = 'Empty Galley';
    const morale = game.state.morale;
    game.usePower('p4');
    expect(game.state.morale).toBe(Math.min(5, morale + 1));
    game.state.players[5].power = 'Patched Hull';
    game.usePower('p5');
    expect(game.state.usedPowers).toContain('p5:Patched Hull');
    game.advancePhase('vote');
    game.state.players[6].power = 'Iron Rudder';
    game.usePower('p6');
    expect(game.state.usedPowers).toContain('p6:Iron Rudder');
  });

  it('keeps Ghost Lantern lies stable across serialization', () => {
    const game = voyage(10, 3);
    game.advancePhase('damageReport');
    game.advancePhase('council');
    game.state.players[0].power = 'Ghost Lantern';
    game.usePower('p0', 'p1');
    const result = game.playerView('p0').private.lanternAlignment;
    expect(game.playerView('p0').private.lanternAlignment).toEqual(result);
  });

  it('defines the complete replacement pool', () => {
    const powers: Power[] = ['Salvaged Plank', 'Foreign Sail', 'Iron Rudder', 'Ghost Lantern',
      'Strange Bell', 'Patched Hull', 'Borrowed Charts', 'Empty Galley'];
    expect(new Set(powers).size).toBe(8);
  });
});
