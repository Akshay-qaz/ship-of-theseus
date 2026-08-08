import { SeededRng, Voyage } from '../server/src/core.js';
import type { System } from '../server/src/types.js';

type Policy = 'plausible' | 'uniform';
type Outcome = 'Original Crew' | 'Replacement' | 'Everyone';
const outcomes = new Map<string, number>();
const runsPerCount = 500;
const survival = new Map<string, { mutiny: number; hull: number; crow: number }>();

function increment(policy: Policy, count: number, outcome: Outcome): void {
  const key = `${policy} / ${count} players / ${outcome}`;
  outcomes.set(key, (outcomes.get(key) ?? 0) + 1);
}

function choosePlausibleSystem(game: Voyage, rng: SeededRng): System {
  const damaged = game.state.damage.map((damage) => damage.system);
  const replaced = game.state.players.filter((player) => player.replaced).map((player) => player.system);
  const patchedDamaged = damaged.filter((system) => replaced.includes(system));
  if (patchedDamaged.length) return rng.pick(patchedDamaged);
  const fresh = damaged.filter((system) => !replaced.includes(system));
  const undamagedPatch = replaced.filter((system) => !damaged.includes(system));
  const preferPatch = ['Strange', 'Unrecognisable'].includes(game.publicView().identityBand);
  const candidates = preferPatch ? (undamagedPatch.length ? undamagedPatch : fresh) : (fresh.length ? fresh : undamagedPatch);
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

function collectReports(game: Voyage): Map<string, ReturnType<Voyage['playerView']>['private']> {
  return new Map(game.state.players.map((player) => {
    const report = game.playerView(player.id).private;
    if (!report.readingsUnreliable) return [player.id, report];
    return [player.id, {
      ...report,
      severity: Object.fromEntries(Object.keys(report.severity).map((system) => [system, 2])),
      exactIdentity: report.exactIdentity === null ? null : 4,
      targetCount: report.targetCount === null ? null : 2,
      forecast: report.forecast.length ? [report.forecast[0]!] : [],
      lanternAlignment: report.lanternAlignment ? {
        ...report.lanternAlignment,
        alignment: 'Original Crew' as const,
      } : null,
    }];
  }));
}

function accusationTarget(game: Voyage, rng: SeededRng, policy: Policy,
  reports: Map<string, ReturnType<Voyage['playerView']>['private']>): string {
  if (policy === 'plausible') {
    const hull = game.state.players.find((player) => player.system === 'Hull' && player.power === 'Hull');
    if (hull) {
      const hullReport = reports.get(hull.id)?.severity ?? {};
      const contradictions = game.state.players.filter((player) => {
        const own = reports.get(player.id)?.severity[player.system];
        return own !== undefined && hullReport[player.system] !== undefined &&
          Math.abs(own - hullReport[player.system]!) > 1;
      });
      if (contradictions.length) return rng.pick(contradictions).id;
    }
    const crow = game.state.players.find((player) => player.system === 'CrowsNest' && player.power === 'CrowsNest');
    const crowReading = crow ? reports.get(crow.id)?.exactIdentity : null;
    if (crowReading !== null && crowReading !== undefined) {
      const band = crowReading >= 7 ? 'Sound' : crowReading >= 5 ? 'Weathered' : crowReading >= 3 ? 'Strange' : 'Unrecognisable';
      if (band !== game.publicView().identityBand && crow) return crow.id;
    }
  }
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
  const survivalKey = `${policy} / ${count}`;
  const currentSurvival = survival.get(survivalKey) ?? { mutiny: 0, hull: 0, crow: 0 };
  let latestReports = collectReports(game);
  for (let round = 0; round < 8 && !game.state.winner; round++) {
    game.advancePhase('damageReport');
    game.advancePhase('council');
    latestReports = collectReports(game);
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
    currentSurvival.mutiny++;
    game.state.players.forEach((player) => {
      if (player.system === 'Hull' && player.power === 'Hull') currentSurvival.hull++;
      if (player.system === 'CrowsNest' && player.power === 'CrowsNest') currentSurvival.crow++;
    });
    const suspect = accusationTarget(game, rng, policy, latestReports);
    game.state.players.forEach((player) => game.accuse(player.id, suspect));
  }
  if (!game.state.winner) throw new Error(`Seed ${seed}/${count}/${policy} did not terminate`);
  const maximumIdentity = Math.min(count, 8);
  if (game.state.identity < 0 || game.state.identity > maximumIdentity) throw new Error('Identity out of bounds');
  if (game.state.morale < 0 || game.state.morale > 5) throw new Error('Morale out of bounds');
  if (game.state.players.filter((player) => player.alignment === 'Replacement').length > 1) throw new Error('Multiple Replacements');
  survival.set(survivalKey, currentSurvival);
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
  console.log('Hull survives to Mutiny: unavailable in runs ending before Mutiny; reported as round-survival rate below');
  for (let count = 6; count <= 10; count++) {
    const stats = survival.get(`${policy} / ${count}`) ?? { mutiny: 0, hull: 0, crow: 0 };
    const crow = count < 10 ? 'N/A (system trimmed)' : `${stats.crow}/${stats.mutiny}`;
    console.log(`${count} | Hull ${stats.hull}/${stats.mutiny} | Crow's Nest ${crow}`);
  }
}
