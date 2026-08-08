import { SeededRng, Voyage } from '../server/src/core.js';
import type { System } from '../server/src/types.js';

type Policy = 'plausible' | 'uniform';
type Outcome = 'Original Crew' | 'Replacement' | 'Everyone';
const outcomes = new Map<string, number>();
const runsPerCount = 500;

function increment(policy: Policy, count: number, outcome: Outcome): void {
  const key = `${policy} / ${count} players / ${outcome}`;
  outcomes.set(key, (outcomes.get(key) ?? 0) + 1);
}

function choosePlausibleSystem(game: Voyage, rng: SeededRng): System {
  const damaged = game.state.damage.map((damage) => damage.system);
  const fresh = damaged.filter((system) => !game.state.players.find((player) => player.system === system)?.replaced);
  const patched = damaged.filter((system) => game.state.players.find((player) => player.system === system)?.replaced);
  const preferFresh = ['Sound', 'Weathered'].includes(game.publicView().identityBand);
  const candidates = preferFresh ? (fresh.length ? fresh : patched) : (patched.length ? patched : fresh);
  return rng.pick(candidates.length ? candidates : damaged);
}

function spendLowMoralePowers(game: Voyage): void {
  if (game.state.morale > 2 || game.state.phase !== 'council') return;
  const anchor = game.state.players.find((player) => player.power === 'Anchor');
  if (anchor && !game.state.usedPowers.includes(`${anchor.id}:Anchor:${game.state.storm}`)) game.usePower(anchor.id);
  const patchedHull = game.state.players.find((player) => player.power === 'Patched Hull');
  if (patchedHull && !game.state.usedPowers.includes(`${patchedHull.id}:Patched Hull`)) game.usePower(patchedHull.id);
  const emptyGalley = game.state.players.find((player) => player.power === 'Empty Galley');
  if (emptyGalley && !game.state.usedPowers.includes(`${emptyGalley.id}:Empty Galley`)) game.usePower(emptyGalley.id);
}

function accusationTarget(game: Voyage, rng: SeededRng, policy: Policy): string {
  const replacedParts = game.state.players.filter((player) => player.replaced);
  if (policy === 'plausible' && replacedParts.length && rng.int(10) < 7) return rng.pick(replacedParts).id;
  return rng.pick(game.state.players).id;
}

function play(count: number, seed: number, policy: Policy): Outcome {
  const rng = new SeededRng(seed * 1009 + count * 17 + (policy === 'plausible' ? 1 : 2));
  const game = new Voyage(`B${count}${seed}${policy[0]}`, rng);
  for (let i = 0; i < count; i++) game.addPlayer(`p${i}`, `Bot ${i}`, `t${i}`);
  game.state.players.forEach((player) => game.ready(player.id, true));
  game.start('p0');
  for (let round = 0; round < 8 && !game.state.winner; round++) {
    game.advancePhase('damageReport');
    game.advancePhase('council');
    if (policy === 'plausible') spendLowMoralePowers(game);
    game.advancePhase('vote');
    const choice = policy === 'plausible'
      ? choosePlausibleSystem(game, rng)
      : rng.pick(game.state.players.map((player) => player.system));
    game.state.players.forEach((player) => {
      if (game.state.phase === 'vote') game.vote(player.id, choice);
    });
  }
  if (game.state.phase === 'mutiny') {
    const suspect = accusationTarget(game, rng, policy);
    game.state.players.forEach((player) => game.accuse(player.id, suspect));
  }
  if (!game.state.winner) throw new Error(`Seed ${seed}/${count}/${policy} did not terminate`);
  const maximumIdentity = Math.min(count, 8);
  if (game.state.identity < 0 || game.state.identity > maximumIdentity) throw new Error('Identity out of bounds');
  if (game.state.morale < 0 || game.state.morale > 5) throw new Error('Morale out of bounds');
  if (game.state.players.filter((player) => player.alignment === 'Replacement').length > 1) throw new Error('Multiple Replacements');
  return game.state.winner;
}

for (const policy of ['plausible', 'uniform'] as const) {
  for (let count = 6; count <= 10; count++) {
    for (let seed = 1; seed <= runsPerCount; seed++) increment(policy, count, play(count, seed, policy));
  }
}

console.log(`balance runs per policy/player count: ${runsPerCount}`);
for (const policy of ['plausible', 'uniform'] as const) {
  console.log(`\n${policy} policy`);
  console.log('players | Original Crew | Replacement | Everyone | total');
  for (let count = 6; count <= 10; count++) {
    const values = (['Original Crew', 'Replacement', 'Everyone'] as const).map((outcome) =>
      outcomes.get(`${policy} / ${count} players / ${outcome}`) ?? 0);
    console.log(`${count} | ${values[0]} | ${values[1]} | ${values[2]} | ${values.reduce((a, b) => a + b, 0)}`);
  }
}
