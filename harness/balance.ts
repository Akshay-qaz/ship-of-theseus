import { SeededRng, Voyage } from '../server/src/core.js';
import type { System } from '../server/src/types.js';

const outcomes = new Map<string, number>();
let runs = 0;
for (let count = 6; count <= 10; count++) {
  for (let seed = 1; seed <= 500; seed++) {
    const rng = new SeededRng(seed * 1009 + count);
    const game = new Voyage(`B${count}${seed}`, rng);
    for (let i = 0; i < count; i++) game.addPlayer(`p${i}`, `Bot ${i}`, `t${i}`);
    game.state.players.forEach((player) => game.ready(player.id, true));
    game.start('p0');
    for (let storm = 0; storm < 8 && !game.state.winner; storm++) {
      game.advancePhase('damageReport');
      game.advancePhase('council');
      game.advancePhase('vote');
      const systems = game.state.players.map((player) => player.system);
      const choice = systems[rng.int(systems.length)] as System;
      game.state.players.forEach((player) => {
        if (game.state.phase === 'vote') game.vote(player.id, choice);
      });
    }
    if (game.state.phase === 'mutiny') {
      const suspect = game.state.players[rng.int(game.state.players.length)]?.id;
      if (suspect) game.state.players.forEach((player) => game.accuse(player.id, suspect));
    }
    if (!game.state.winner) throw new Error(`Seed ${seed}/${count} did not terminate`);
    if (game.state.identity < 0 || game.state.identity > 8) throw new Error('Identity out of bounds');
    if (game.state.morale < 0 || game.state.morale > 5) throw new Error('Morale out of bounds');
    if (game.state.players.filter((player) => player.alignment === 'Replacement').length > 1) throw new Error('Multiple Replacements');
    outcomes.set(`${count} players / ${game.state.winner}`, (outcomes.get(`${count} players / ${game.state.winner}`) ?? 0) + 1);
    runs++;
  }
}
console.log(`balance runs: ${runs}`);
[...outcomes.entries()].sort().forEach(([outcome, count]) => console.log(`${outcome}: ${count}`));
