import { PlayerState, RallyResult, Upgrade, GoldBreakdown } from './types';
import {
  COMMON_UPGRADES,
  RARE_UPGRADES,
  EPIC_UPGRADES,
  LEGENDARY_UPGRADES,
  countUpgrade,
  hasUpgrade,
} from './upgrades';

function createRng(seed: number) {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return function () {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

function applyHealing(player: PlayerState, amount: number): number {
  let healAmount = amount;

  if (player.healingReduction) {
    healAmount = Math.floor(healAmount / 2);
  }

  const actualHeal = Math.min(player.maxHp - player.hp, healAmount);
  player.hp += actualHeal;

  return actualHeal;
}

export function resolveRally(
  winner: PlayerState,
  loser: PlayerState,
): { winner: PlayerState; loser: PlayerState; result: RallyResult } {
  const w = JSON.parse(JSON.stringify(winner)) as PlayerState;
  const l = JSON.parse(JSON.stringify(loser)) as PlayerState;
  


  // Capture HP before the rally
  const hpBefore: Record<'p1' | 'p2', number> = {
  p1: winner.id === 'p1' ? winner.hp : loser.hp,
  p2: winner.id === 'p2' ? winner.hp : loser.hp,
  };
  
  // --- Streak Updates ---
  w.winStreak += 1;
  w.lossStreak = 0;

  l.winStreak = 0;
  l.lossStreak += 1;
  w.totalWins += 1;

 // --- DOT & Thorns damage (added to final rally damage) ---

let dotDamageToWinner = 0;
let dotDamageToLoser = 0;
let thornsDamageToWinner = 0;

// Poison DOT (10% of HP at start of rally)
if (w.poisonTicks > 0) {
  w.poisonTicks--;
  dotDamageToWinner += Math.floor(hpBefore[w.id] * 0.10);
}
if (l.poisonTicks > 0) {
  l.poisonTicks--;
  dotDamageToLoser += Math.floor(hpBefore[l.id] * 0.10);
}


// Ignite DOT (5% max HP + healing reduction)
if (w.igniteTicks > 0) {
  w.igniteTicks--;
  dotDamageToWinner += Math.floor(w.maxHp * 0.05);
  w.healingReduction = true;
} else {
  w.healingReduction = false;
}

if (l.igniteTicks > 0) {
  l.igniteTicks--;
  dotDamageToLoser += Math.floor(l.maxHp * 0.05);
  l.healingReduction = true;
} else {
  l.healingReduction = false;
}

// Thorns (common-6): 1 damage every 3 losses
const thornsStacks = countUpgrade(l.upgrades, 'common-6');
if (thornsStacks > 0 && l.lossStreak % 3 === 0) {
  thornsDamageToWinner += thornsStacks;
}


  // --- Shields Up (legendary-5): shield every 5 losses ---
  const shieldsUpStacks = countUpgrade(l.upgrades, 'legendary-5');
  if (shieldsUpStacks > 0 && l.lossStreak % 5 === 0) {
    l.shield += shieldsUpStacks;
  }

  // --- Damage Calculation ---
  let damage = 1;

  // War Machine (legendary-1): +4 base damage per copy
  damage += countUpgrade(w.upgrades, 'legendary-1') * 4;

  // Power Smash (common-2): +1 per copy
  damage += countUpgrade(w.upgrades, 'common-2');

  // Savage Streak (rare-1): +min(winStreak, 3) per copy
  const savageCount = countUpgrade(w.upgrades, 'rare-1');
  if (savageCount > 0) {
    damage += Math.min(w.winStreak, 3) * savageCount;
  }

  // Counter Strike (rare-3): if flag active, +2 per copy, then clear flag
  if (w.counterStrikeActive) {
    damage += 2 * countUpgrade(w.upgrades, 'rare-3');
    w.counterStrikeActive = false;
  }

  // Berserker (epic-1): +winStreak per copy
  const berserkerCount = countUpgrade(w.upgrades, 'epic-1');
  if (berserkerCount > 0) {
    damage += w.winStreak * berserkerCount;
  }

  // Life Steal (legendary-2): +2 damage per copy (healing applied later)
  const lifeStealCount = countUpgrade(w.upgrades, 'legendary-2');
  damage += lifeStealCount * 2;

  // --- Crit (rare-6: Dead Eye) ---
  const critChance = Math.min(1.0, countUpgrade(w.upgrades, 'rare-6') * 0.2);
  const isCrit = critChance > 0 && Math.random() < critChance;
  if (isCrit) {
    damage *= 2;
    // Headhunter (epic-6): crits deal +3 extra per copy
    damage += 3 * countUpgrade(w.upgrades, 'epic-6');
  }
// Add DOT & Thorns to final damage
damage += dotDamageToLoser;      // DOT applied to loser


  // --- Defense Reduction ---
  // Iron Defense (common-1): -1 damage per copy on the loser's side (min 1)
  damage = Math.max(1, damage - countUpgrade(l.upgrades, 'common-1'));

  // --- Apply Damage ---
 // --- Shield Consumption ---
if (l.shield > 0 && damage > 0) {
  l.shield--;
  damage = 0;
}

// --- Apply Damage ---
l.hp -= damage;
// Apply DOT damage to winner (normal damage rules)
if (dotDamageToWinner > 0) {
  let dmg = dotDamageToWinner;

  // Iron Defense reduces damage taken
  dmg = Math.max(1, dmg - countUpgrade(w.upgrades, 'common-1'));

  // Shield blocks DOT
  if (w.shield > 0 && dmg > 0) {
    w.shield--;
    dmg = 0;
  }

  w.hp -= dmg;
}

// Apply Thorns damage to winner (normal damage rules)
if (thornsDamageToWinner > 0) {
  let dmg = thornsDamageToWinner;

  // Iron Defense reduces damage taken
  dmg = Math.max(1, dmg - countUpgrade(w.upgrades, 'common-1'));

  // Shield blocks Thorns
  if (w.shield > 0 && dmg > 0) {
    w.shield--;
    dmg = 0;
  }

  w.hp -= dmg;
}


  // --- Phoenix (epic-4): survive fatal, restore 10% max HP ---
  // --- Phoenix (epic-4): survive fatal, restore 10% max HP ---
if (l.hp <= 0 && hasUpgrade(l.upgrades, 'epic-4')) {
  l.hp = Math.max(1, Math.round(l.maxHp * 0.1));

  // Consume ONE Phoenix charge (stack-aware)
  const idx = l.upgrades.findIndex(u => u.id === 'epic-4');
  if (idx !== -1) {
    const phoenix = l.upgrades[idx];

    if ((phoenix.stackCount ?? 1) > 1) {
      phoenix.stackCount!--; // decrement one charge
    } else {
      l.upgrades.splice(idx, 1); // remove last charge
    }
  }
}

  // --- Counter Strike flag: set on loser for next rally ---
  if (hasUpgrade(l.upgrades, 'rare-3')) {
    l.counterStrikeActive = true;
  }

  // --- Winner Healing ---
  // --- Poison & Ignite Application on Rally Win ---

// Poison (common-7): +1% per stack
const poisonStacks = countUpgrade(w.upgrades, 'common-7');
w.poisonChance = Math.min(100, poisonStacks * 1);

// Ignite (rare-10): +1% per stack
const igniteStacks = countUpgrade(w.upgrades, 'rare-10');
w.igniteChance = Math.min(100, igniteStacks * 1);

// Poison proc
if (w.poisonChance > 0 && Math.random() * 100 < w.poisonChance) {
  l.poisonTicks = 3; // refresh duration
}

// Ignite proc
if (w.igniteChance > 0 && Math.random() * 100 < w.igniteChance) {
  l.igniteTicks = 3; // refresh duration
}

  let winnerHealAmount = 0;

  // Life Steal (legendary-2): heal winner by 2 per copy
  if (lifeStealCount > 0) {
    const heal = 2 * lifeStealCount;
    winnerHealAmount += applyHealing(w, heal);

  }

  // Vampire (epic-2): 1 HP per 2 damage dealt, overflow tracks across rallies
  const vampireCount = countUpgrade(w.upgrades, 'epic-2');
  if (vampireCount > 0) {
    w.vampireOverflow = (w.vampireOverflow || 0) + damage;
    const heals = Math.floor(w.vampireOverflow / 2) * vampireCount;
    if (heals > 0) {
      winnerHealAmount += applyHealing(w, heals);
      w.vampireOverflow = w.vampireOverflow % 2;
    }
  }


  // Quick Heal (common-4): +1 HP per copy every 3 consecutive wins
  const quickHealCount = countUpgrade(w.upgrades, 'common-4');
  if (quickHealCount > 0 && w.winStreak > 0 && w.winStreak % 3 === 0) {
    const heal = quickHealCount;
    winnerHealAmount += applyHealing(w, heal);

  }

  // Battle Medic (rare-2): +2 HP per copy every 5 total wins
  const battleMedicCount = countUpgrade(w.upgrades, 'rare-2');
  if (battleMedicCount > 0 && w.totalWins > 0 && w.totalWins % 5 === 0) {
    const heal = 2 * battleMedicCount;
    winnerHealAmount += applyHealing(w, heal);

  }

  // --- Gold Calculation ---
  const calcGold = (p: PlayerState, isWinner: boolean): GoldBreakdown => {
    const base = isWinner ? 3 : 2;

    // Win streak bonus ONLY for the winner
    let winStreakBonus = 0;
    if (isWinner) {
      const raw = Math.min(p.winStreak, 4);
      // Momentum (rare-5): doubles win streak gold bonus
      winStreakBonus = hasUpgrade(p.upgrades, 'rare-5') ? raw * 2 : raw;
    }

    // Loss streak bonus ONLY for the loser
    let lossStreakBonus = 0;
    if (!isWinner) {
      lossStreakBonus = Math.min(p.lossStreak, 4);
    }

    // Treasury (epic-3): raises interest cap to 80
    const intCap = hasUpgrade(p.upgrades, 'epic-3') ? 80 : 50;
    const interest = Math.floor(Math.min(p.gold, intCap) / 10);

    // Track per-source upgrade bonuses for display
    const upgradeSources: Array<{ name: string; amount: number }> = [];
    let upgradeBonus = 0;

    // Lucky Coin (common-3): +1 per copy, both win and lose
    const luckyCoins = countUpgrade(p.upgrades, 'common-3');
    if (luckyCoins > 0) {
      upgradeBonus += luckyCoins;
      upgradeSources.push({ name: 'Lucky Coin', amount: luckyCoins });
    }

    // Fortify (rare-4): loser only, +3 per copy every 3 consecutive losses
    if (!isWinner && p.lossStreak > 0 && p.lossStreak % 3 === 0) {
      const fortifyBonus = 3 * countUpgrade(p.upgrades, 'rare-4');
      if (fortifyBonus > 0) {
        upgradeBonus += fortifyBonus;
        upgradeSources.push({ name: 'Fortify', amount: fortifyBonus });
      }
    }

    return {
      base,
      winStreakBonus,
      lossStreakBonus,
      interest,
      upgradeBonus,
      total: base + winStreakBonus + lossStreakBonus + interest + upgradeBonus,
      upgradeSources,
    };
  };

  const wGold = calcGold(w, true);
  const lGold = calcGold(l, false);

  w.gold += wGold.total;
  l.gold += lGold.total;

  // Opportunist (epic-5): steal 1 gold per copy on win
  const opportunistCount = countUpgrade(w.upgrades, 'epic-5');
  for (let i = 0; i < opportunistCount; i++) {
    if (l.gold > 0) {
      l.gold -= 1;
      w.gold += 1;
    }
  }

  return {
  winner: w,
  loser: l,
  result: {
    winnerId: w.id,
    loserId: l.id,
    damageDealt: damage,
    isCrit,
    healAmounts: {
      [w.id]: winnerHealAmount,
      [l.id]: 0,
    } as Record<'p1' | 'p2', number>,
    goldEarned: {
      [w.id]: wGold,
      [l.id]: lGold,
    } as Record<'p1' | 'p2', GoldBreakdown>,
    combatEvents: [],        // required by RallyResult
    hpBefore,                // required by RallyResult
  },
};
}

// Roll a random upgrade, re-rolling up to 20 times to avoid excluded IDs
function rollFromRng(rng: () => number, exclude: string[] = []): Upgrade {
  for (let attempt = 0; attempt < 20; attempt++) {
    const r = rng();
    let pool: Upgrade[];
    if (r < 0.05) pool = LEGENDARY_UPGRADES;
    else if (r < 0.2) pool = EPIC_UPGRADES;
    else if (r < 0.5) pool = RARE_UPGRADES;
    else pool = COMMON_UPGRADES;

    const available = exclude.length ? pool.filter(u => !exclude.includes(u.id)) : pool;
    if (available.length > 0) {
      return available[Math.floor(rng() * available.length)];
    }
  }
  // Fallback
  const all = [...COMMON_UPGRADES, ...RARE_UPGRADES, ...EPIC_UPGRADES, ...LEGENDARY_UPGRADES]
    .filter(u => !exclude.includes(u.id));
  return all.length > 0 ? all[Math.floor(rng() * all.length)] : COMMON_UPGRADES[0];
}

let instanceCounter = 0;

export function drawUpgrades(
  count: number,
  seed: number,
  forceRarity: 'common' | 'legendary' | null = null,
  exclude: string[] = [],
): Upgrade[] {
  const rng = createRng(seed);
  const res: Upgrade[] = [];

  for (let i = 0; i < count; i++) {
    let base: Upgrade;
    if (forceRarity === 'common') {
      const pool = COMMON_UPGRADES.filter(u => !exclude.includes(u.id));
      base = pool.length > 0 ? pool[Math.floor(rng() * pool.length)] : COMMON_UPGRADES[0];
    } else if (forceRarity === 'legendary') {
      const pool = LEGENDARY_UPGRADES.filter(u => !exclude.includes(u.id));
      base = pool.length > 0 ? pool[Math.floor(rng() * pool.length)] : LEGENDARY_UPGRADES[0];
    } else {
      base = rollFromRng(rng, exclude);
    }
    instanceCounter += 1;
    res.push({ ...base, instanceId: `inst-${base.id}-${instanceCounter}` });
  }

  return res;
}
