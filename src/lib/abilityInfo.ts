import { PlayerState } from "./types";
import {
  ALL_UPGRADES,
  countUpgrade,
  shopDiscount,
  POISON_CHANCE_PER_STACK,
  IGNITE_CHANCE_PER_STACK,
  PROC_CHANCE_CAP,
  ETERNAL_FLAME_PCT_PER_STACK,
  eternalFlameHeal,
} from "../../shared/engine.js";

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

// What an owned ability does right now, given its stack count and the
// player's current streaks/status. Shown when an ability badge is tapped — for
// either player's abilities, so the wording is neutral (no "your").
export function currentEffect(id: string, p: PlayerState): string | null {
  const n = countUpgrade(p.upgrades, id);
  if (n === 0) return null;
  switch (id) {
    case "rare-2": return `Heals ${2 * n} HP on every 5th total win · next at win #${(Math.floor(p.totalWins / 5) + 1) * 5}`;
    case "rare-4": return `+${3 * n} gold on every 3rd consecutive loss`;
    case "common-4": return `Heals ${n} HP on every 3rd consecutive win`;
    case "common-6": return `Deals ${n} damage to the opponent on every 3rd consecutive loss (ignores Iron Defense)`;
    case "common-7": return `${Math.min(PROC_CHANCE_CAP, n * POISON_CHANCE_PER_STACK)}% chance to poison on a rally win`;
    case "rare-10": return `${Math.min(PROC_CHANCE_CAP, n * IGNITE_CHANCE_PER_STACK)}% chance to ignite on a rally win`;
    case "common-1": return `Blocks ${n} damage from every hit taken (min 1 gets through)`;
    case "common-2": return `+${n} damage on rally wins`;
    case "common-3": return `+${n} gold every rally`;
    case "rare-1": return `+${n} damage per win in the streak, up to +${3 * n} · next win: +${Math.min(p.winStreak + 1, 3) * n}`;
    case "rare-3": return p.counterStrikeActive
      ? `ARMED — the next win deals +${2 * n} damage`
      : `After a loss, the next win deals +${2 * n} damage`;
    case "rare-5": return "Win-streak gold bonus is doubled";
    case "rare-6": return `${Math.min(100, 20 * n)}% crit chance (crits double damage)`;
    case "epic-3": return "Interest cap raised from 50 to 80 gold";
    case "common-5":
    case "legendary-3": return `Total shop discount: ${shopDiscount(p.upgrades)} gold off every upgrade (min 1)`;
    case "legendary-2": return `+${2 * n} damage and heal ${2 * n} HP on rally wins`;
    case "epic-1": return `+${n} damage per win in the streak · next win: +${(p.winStreak + 1) * n}`;
    case "epic-4": return `${plural(n, "revive")} left`;
    case "epic-5": return `Steals ${n} gold per rally win`;
    case "epic-6": return `Crits deal +${3 * n} extra damage`;
    case "epic-2": return `Heals ${n} HP for every 2 damage dealt`;
    case "legendary-1": return `+${4 * n} damage on rally wins`;
    case "legendary-4": return `Heals ${ETERNAL_FLAME_PCT_PER_STACK * n}% of max HP (${eternalFlameHeal(p.maxHp, n)} HP) after every rally${p.healingReduction ? " · halved by Ignite" : ""}`;
    case "legendary-5": return `Every 5th loss in a row tops up to ${plural(n, "shield")} · each blocks one hit, heals 50% of it and cures Poison/Ignite · ${plural(p.shield, "shield")} ready`;
  }
  return null;
}

// Rarity of an ability by its display name (combat events reference sources by name).
export function rarityForSource(source: string) {
  return ALL_UPGRADES.find(u => u.name === source)?.rarity ?? null;
}
