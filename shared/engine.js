// shared/engine.js
// Authoritative game rules. Runs on the server (server/index.js) — clients only
// render the state the server broadcasts and send intents ("actions").
// Plain ESM JavaScript so Node can import it without a build step; types live
// in engine.d.ts for the Vite/TypeScript client.

// ─── Upgrade catalogue ────────────────────────────────────────────────────────
// NOTE: ids are historical and don't match rarity — the rarity field is canonical.

export const COMMON_UPGRADES = [
  { id: 'rare-2',   name: 'Battle Medic', rarity: 'common', cost: 5, description: 'Recover 2 HP every time you reach your 5th, 10th, 15th... total win.' },
  { id: 'rare-4',   name: 'Fortify',      rarity: 'common', cost: 5, description: 'Every 3 consecutive losses, gain +3 extra gold.' },
  { id: 'common-4', name: 'Quick Heal',   rarity: 'common', cost: 5, description: 'Recover 1 HP for every 3 consecutive wins.' },
  { id: 'common-6', name: 'Thorns',       rarity: 'common', cost: 5, description: 'Deals 1 damage every 3 consecutive losses, ignoring all modifiers.' },
  { id: 'common-7', name: 'Poison',       rarity: 'common', cost: 5, description: 'Rally wins have +1% chance to apply poison (10% current HP per rally for 3 rallies). Stacks to 20%.' },
];

export const RARE_UPGRADES = [
  { id: 'common-1', name: 'Iron Defense',   rarity: 'rare', cost: 15, description: 'Take 1 less damage per rally loss. (min 1 damage)' },
  { id: 'common-2', name: 'Power Smash',    rarity: 'rare', cost: 15, description: 'Deal 1 extra damage on rally wins.' },
  { id: 'common-3', name: 'Lucky Coin',     rarity: 'rare', cost: 15, description: 'Earn +1 extra gold every rally (win or lose).' },
  { id: 'rare-1',   name: 'Savage Streak',  rarity: 'rare', cost: 15, description: 'Consecutive wins deal +1 extra damage per win (max +3).' },
  { id: 'rare-3',   name: 'Counter Strike', rarity: 'rare', cost: 15, description: 'After losing a rally, your next win deals +2 extra damage.' },
  { id: 'rare-5',   name: 'Momentum',       rarity: 'rare', cost: 15, description: 'Win streak gold bonuses are doubled. Unique — can only be owned once.' },
  { id: 'rare-6',   name: 'Dead Eye',       rarity: 'rare', cost: 15, description: 'Rally wins have a 20% crit chance (double damage). Each copy adds +20%, capped at 100%. Not offered once you hit the cap.' },
  { id: 'epic-3',   name: 'Treasury',       rarity: 'rare', cost: 15, description: 'Interest gold cap raised from 50 to 80 gold.' },
  { id: 'rare-10',  name: 'Ignite',         rarity: 'rare', cost: 15, description: 'Rally wins have +1% chance to apply ignite (5% max HP per rally for 3 rallies, halves healing). Stacks to 20%.' },
];

export const EPIC_UPGRADES = [
  { id: 'common-5',    name: 'Bargain Hunt', rarity: 'epic', cost: 25, description: 'All shop upgrades cost 1 less gold. (min 1)' },
  { id: 'legendary-2', name: 'Life Steal',   rarity: 'epic', cost: 25, description: 'Each rally win steals 2 HP from your opponent and heals you. Stacks — each copy steals an additional 2 HP.' },
  { id: 'epic-1',      name: 'Berserker',    rarity: 'epic', cost: 25, description: 'Rally wins deal extra damage equal to your current win streak.' },
  { id: 'epic-4',      name: 'Phoenix',      rarity: 'epic', cost: 25, description: 'Once per use: survive a fatal hit and restore 10% of your max HP instead of dying. Consumed on activation.' },
  { id: 'epic-5',      name: 'Opportunist',  rarity: 'epic', cost: 25, description: 'Each rally win steals 1 gold from your opponent.' },
  { id: 'epic-6',      name: 'Headhunter',   rarity: 'epic', cost: 25, description: 'Your crits deal 3 additional damage.' },
];

export const LEGENDARY_UPGRADES = [
  { id: 'epic-2',      name: 'Vampire',       rarity: 'legendary', cost: 50, description: 'Recover 1 HP for every 2 damage you deal (tracks overflow between rallies).' },
  { id: 'legendary-1', name: 'War Machine',   rarity: 'legendary', cost: 50, description: 'Your base damage on rally wins is increased by 4 per copy. Stacks.' },
  { id: 'legendary-3', name: 'The Banker',    rarity: 'legendary', cost: 50, description: 'All shop costs reduced by 3 gold. (min 1, stacks with Bargain Hunt)' },
  { id: 'legendary-4', name: 'Eternal Flame', rarity: 'legendary', cost: 50, description: 'Gain 2 HP after every rally (win or lose). Stacks per copy.' },
  { id: 'legendary-5', name: 'Shields Up',    rarity: 'legendary', cost: 50, description: 'Every 5 consecutive losses grants a full damage-negating shield, consumed on the next hit.' },
];

export const ALL_UPGRADES = [...COMMON_UPGRADES, ...RARE_UPGRADES, ...EPIC_UPGRADES, ...LEGENDARY_UPGRADES];

export const POISON_CHANCE_PER_STACK = 1;  // %
export const IGNITE_CHANCE_PER_STACK = 1;  // %
export const PROC_CHANCE_CAP = 20;         // %
export const REFRESH_COST = 10;

// ─── Upgrade helpers ──────────────────────────────────────────────────────────

export function hasUpgrade(upgrades, id) {
  return upgrades.some(u => u.id === id);
}

// Counts effective copies, respecting stackCount
export function countUpgrade(upgrades, id) {
  return upgrades
    .filter(u => u.id === id)
    .reduce((sum, u) => sum + (u.stackCount ?? 1), 0);
}

// Merge duplicate upgrades into a single entry with a summed stackCount.
export function applyUpgradeCombining(upgrades) {
  const map = new Map();
  for (const u of upgrades) {
    const key = `${u.id}::${u.rarity}`;
    const existing = map.get(key);
    if (!existing) {
      map.set(key, { ...u, stackCount: u.stackCount ?? 1 });
    } else {
      existing.stackCount = (existing.stackCount ?? 1) + (u.stackCount ?? 1);
    }
  }
  return Array.from(map.values());
}

export function shopDiscount(upgrades) {
  return countUpgrade(upgrades, 'common-5') + countUpgrade(upgrades, 'legendary-3') * 3;
}

export function finalCost(upgrade, upgrades) {
  return Math.max(1, upgrade.cost - shopDiscount(upgrades));
}

// Upgrades that should no longer be offered (unique, or at their cap).
export function buildExcludeList(upgrades) {
  const exclude = [];

  if (hasUpgrade(upgrades, 'rare-5')) exclude.push('rare-5');
  if (hasUpgrade(upgrades, 'epic-3')) exclude.push('epic-3');
  if (countUpgrade(upgrades, 'rare-6') >= 5) exclude.push('rare-6');
  if (shopDiscount(upgrades) >= 17) exclude.push('common-5', 'legendary-3');
  if (countUpgrade(upgrades, 'common-7') * POISON_CHANCE_PER_STACK >= PROC_CHANCE_CAP) exclude.push('common-7');
  if (countUpgrade(upgrades, 'rare-10') * IGNITE_CHANCE_PER_STACK >= PROC_CHANCE_CAP) exclude.push('rare-10');
  if (countUpgrade(upgrades, 'legendary-5') >= 4) exclude.push('legendary-5');
  if (countUpgrade(upgrades, 'epic-4') >= 3) exclude.push('epic-4');

  return exclude;
}

// ─── Upgrade drawing ──────────────────────────────────────────────────────────

let instanceCounter = 0;

function withInstanceId(base) {
  instanceCounter += 1;
  return { ...base, instanceId: `inst-${base.id}-${Date.now().toString(36)}-${instanceCounter}` };
}

function pick(pool) {
  return pool[Math.floor(Math.random() * pool.length)];
}

function rollUpgrade(exclude) {
  for (let attempt = 0; attempt < 20; attempt++) {
    const r = Math.random();
    let pool;
    if (r < 0.05) pool = LEGENDARY_UPGRADES;
    else if (r < 0.2) pool = EPIC_UPGRADES;
    else if (r < 0.5) pool = RARE_UPGRADES;
    else pool = COMMON_UPGRADES;

    const available = pool.filter(u => !exclude.includes(u.id));
    if (available.length > 0) return pick(available);
  }
  const all = ALL_UPGRADES.filter(u => !exclude.includes(u.id));
  return all.length > 0 ? pick(all) : COMMON_UPGRADES[0];
}

export function drawUpgrades(count, forceRarity = null, exclude = []) {
  const res = [];
  for (let i = 0; i < count; i++) {
    let base;
    if (forceRarity === 'legendary') {
      const pool = LEGENDARY_UPGRADES.filter(u => !exclude.includes(u.id));
      base = pool.length > 0 ? pick(pool) : LEGENDARY_UPGRADES[0];
    } else {
      base = rollUpgrade(exclude);
    }
    res.push(withInstanceId(base));
  }
  return res;
}

// ─── Combat ───────────────────────────────────────────────────────────────────
// Every effect that fires during a rally is recorded as a combat event, so the
// clients can show exactly what happened (and why) without re-deriving it.
//   category: 'damage'     – HP removed from targetId (before mitigation)
//             'mitigation' – damage prevented for targetId
//             'heal'       – HP restored to targetId (actual amount after caps)
//             'special'    – crits, procs, shields gained, Phoenix, etc.
//             'gold'       – gold moved by an ability

function applyHealing(player, amount) {
  const healAmount = player.healingReduction ? Math.floor(amount / 2) : amount;
  const actualHeal = Math.max(0, Math.min(player.maxHp - player.hp, healAmount));
  player.hp += actualHeal;
  return actualHeal;
}

// Phoenix (epic-4): survive a fatal hit at 10% max HP, consuming one stack.
// Returns the HP restored (0 if it didn't trigger).
function tryPhoenix(player) {
  if (player.hp > 0 || !hasUpgrade(player.upgrades, 'epic-4')) return 0;
  const before = player.hp;
  player.hp = Math.max(1, Math.round(player.maxHp * 0.1));
  const idx = player.upgrades.findIndex(u => u.id === 'epic-4');
  const phoenix = player.upgrades[idx];
  if ((phoenix.stackCount ?? 1) > 1) {
    player.upgrades[idx] = { ...phoenix, stackCount: phoenix.stackCount - 1 };
  } else {
    player.upgrades.splice(idx, 1);
  }
  return player.hp - before;
}

const stacks = (n) => (n > 1 ? ` ×${n}` : '');
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

export function resolveRally(winner, loser) {
  const w = structuredClone(winner);
  const l = structuredClone(loser);
  const events = [];
  const log = (category, source, targetId, amount, message) =>
    events.push({ id: `e${events.length + 1}`, category, source, targetId, amount, message });

  const hpBefore = {
    p1: winner.id === 'p1' ? winner.hp : loser.hp,
    p2: winner.id === 'p2' ? winner.hp : loser.hp,
  };

  // --- Streak Updates ---
  w.winStreak += 1;
  w.lossStreak = 0;
  w.totalWins += 1;
  l.winStreak = 0;
  l.lossStreak += 1;

  // --- DOT ticks ---
  // Poison: 10% of current HP. Ignite: 5% of max HP + healing halved.
  const dots = { [w.id]: [], [l.id]: [] };
  for (const p of [w, l]) {
    if (p.poisonTicks > 0) {
      p.poisonTicks--;
      dots[p.id].push({ source: 'Poison', amount: Math.floor(hpBefore[p.id] * 0.10), message: `10% of current HP · ${plural(p.poisonTicks, 'rally')} left` });
    }
    if (p.igniteTicks > 0) {
      p.igniteTicks--;
      p.healingReduction = true;
      dots[p.id].push({ source: 'Ignite', amount: Math.floor(p.maxHp * 0.05), message: `5% of max HP · healing halved · ${plural(p.igniteTicks, 'rally')} left` });
    } else {
      p.healingReduction = false;
    }
  }

  // --- Shields Up (legendary-5): shield every 5 consecutive losses ---
  const shieldsUpStacks = countUpgrade(l.upgrades, 'legendary-5');
  if (shieldsUpStacks > 0 && l.lossStreak % 5 === 0) {
    l.shield += shieldsUpStacks;
    log('special', 'Shields Up', l.id, shieldsUpStacks, `Gained ${plural(shieldsUpStacks, 'shield')} on a ${l.lossStreak}-loss streak`);
  }

  // --- Rally hit on the loser ---
  let damage = 1;
  log('damage', 'Rally win', l.id, 1, 'Base damage');
  const addDamage = (source, amount, message) => {
    if (amount <= 0) return;
    damage += amount;
    log('damage', source, l.id, amount, message);
  };

  const warMachine = countUpgrade(w.upgrades, 'legendary-1');
  addDamage('War Machine', warMachine * 4, `+4 base damage${stacks(warMachine)}`);
  const powerSmash = countUpgrade(w.upgrades, 'common-2');
  addDamage('Power Smash', powerSmash, `+1 damage${stacks(powerSmash)}`);
  const savage = countUpgrade(w.upgrades, 'rare-1');
  addDamage('Savage Streak', Math.min(w.winStreak, 3) * savage, `${w.winStreak}-win streak (max +3)${stacks(savage)}`);
  if (w.counterStrikeActive) {
    const counter = countUpgrade(w.upgrades, 'rare-3');
    addDamage('Counter Strike', 2 * counter, `Payback for your last loss${stacks(counter)}`);
    w.counterStrikeActive = false;
  }
  const berserker = countUpgrade(w.upgrades, 'epic-1');
  addDamage('Berserker', w.winStreak * berserker, `+1 per win in your ${w.winStreak}-win streak${stacks(berserker)}`);
  const lifeStealCount = countUpgrade(w.upgrades, 'legendary-2');
  addDamage('Life Steal', lifeStealCount * 2, `Stole HP${stacks(lifeStealCount)}`);

  // Crit (Dead Eye) + Headhunter
  const deadEye = countUpgrade(w.upgrades, 'rare-6');
  const critChance = Math.min(1, deadEye * 0.2);
  const isCrit = critChance > 0 && Math.random() < critChance;
  if (isCrit) {
    const before = damage;
    damage *= 2;
    log('damage', 'Critical Hit', l.id, before, `Dead Eye crit (${Math.round(critChance * 100)}% chance) doubled ${before} → ${damage}`);
    const headhunter = countUpgrade(w.upgrades, 'epic-6');
    addDamage('Headhunter', 3 * headhunter, `+3 crit damage${stacks(headhunter)}`);
  }

  // The loser's DOT rides along with the rally hit
  for (const d of dots[l.id]) addDamage(d.source, d.amount, d.message);

  // Mitigation: Iron Defense (min 1), then a shield blocks the rest.
  const mitigate = (target, raw) => {
    const ironDefense = countUpgrade(target.upgrades, 'common-1');
    let dmg = Math.max(1, raw - ironDefense);
    if (raw - dmg > 0) log('mitigation', 'Iron Defense', target.id, raw - dmg, `Blocked ${raw - dmg} damage${stacks(ironDefense)}`);
    if (target.shield > 0 && dmg > 0) {
      target.shield--;
      log('mitigation', 'Shield', target.id, dmg, `Absorbed the hit · ${plural(target.shield, 'shield')} left`);
      dmg = 0;
    }
    return dmg;
  };

  const hitDamage = mitigate(l, damage);
  l.hp -= hitDamage;

  // --- Damage to the winner: their own DOTs, then Thorns ---
  let winnerDamageTaken = 0;
  const winnerDot = dots[w.id].reduce((sum, d) => sum + d.amount, 0);
  if (winnerDot > 0) {
    for (const d of dots[w.id]) log('damage', d.source, w.id, d.amount, d.message);
    const taken = mitigate(w, winnerDot);
    w.hp -= taken;
    winnerDamageTaken += taken;
  }

  // Thorns (common-6): every 3rd consecutive loss, 1 per stack to the winner,
  // ignoring all modifiers (no Iron Defense, not blocked by shields).
  const thornsStacks = countUpgrade(l.upgrades, 'common-6');
  if (thornsStacks > 0 && l.lossStreak % 3 === 0) {
    w.hp -= thornsStacks;
    winnerDamageTaken += thornsStacks;
    log('damage', 'Thorns', w.id, thornsStacks, `${l.lossStreak}-loss streak · ignores defenses${stacks(thornsStacks)}`);
  }

  // --- Phoenix: either player can be saved (winner can die to DOT/Thorns) ---
  const phoenixTriggered = {};
  for (const p of [w, l]) {
    const restored = tryPhoenix(p);
    phoenixTriggered[p.id] = restored > 0;
    if (restored > 0) {
      const left = countUpgrade(p.upgrades, 'epic-4');
      log('special', 'Phoenix', p.id, restored, `Survived a fatal blow · revived at ${p.hp} HP · ${plural(left, 'charge')} left`);
    }
  }

  // --- Counter Strike: arm on loser for their next win ---
  const loserCounter = countUpgrade(l.upgrades, 'rare-3');
  if (loserCounter > 0) {
    if (!l.counterStrikeActive) {
      log('special', 'Counter Strike', l.id, 2 * loserCounter, `Armed · +${2 * loserCounter} damage on your next win`);
    }
    l.counterStrikeActive = true;
  }

  // --- Poison & Ignite application on rally win ---
  w.poisonChance = Math.min(PROC_CHANCE_CAP, countUpgrade(w.upgrades, 'common-7') * POISON_CHANCE_PER_STACK);
  w.igniteChance = Math.min(PROC_CHANCE_CAP, countUpgrade(w.upgrades, 'rare-10') * IGNITE_CHANCE_PER_STACK);
  if (w.poisonChance > 0 && Math.random() * 100 < w.poisonChance) {
    l.poisonTicks = 3;
    log('special', 'Poison', l.id, 3, `Poisoned for 3 rallies (${w.poisonChance}% chance)`);
  }
  if (w.igniteChance > 0 && Math.random() * 100 < w.igniteChance) {
    l.igniteTicks = 3;
    log('special', 'Ignite', l.id, 3, `Ignited for 3 rallies (${w.igniteChance}% chance) · healing halved`);
  }

  // --- Winner healing (only while alive) ---
  let winnerHealAmount = 0;
  const heal = (source, amount, message) => {
    if (amount <= 0) return;
    const actual = applyHealing(w, amount);
    winnerHealAmount += actual;
    const notes = [message];
    if (w.healingReduction) notes.push('halved by Ignite');
    if (actual < (w.healingReduction ? Math.floor(amount / 2) : amount)) notes.push('capped at max HP');
    log('heal', source, w.id, actual, notes.join(' · '));
  };
  if (w.hp > 0) {
    heal('Life Steal', 2 * lifeStealCount, `Healed ${2 * lifeStealCount}${stacks(lifeStealCount)}`);

    // Vampire (epic-2): 1 HP per 2 damage dealt, overflow tracked across rallies
    const vampireCount = countUpgrade(w.upgrades, 'epic-2');
    if (vampireCount > 0) {
      w.vampireOverflow = (w.vampireOverflow || 0) + hitDamage;
      const heals = Math.floor(w.vampireOverflow / 2) * vampireCount;
      if (heals > 0) {
        w.vampireOverflow = w.vampireOverflow % 2;
        heal('Vampire', heals, `1 HP per 2 damage dealt${stacks(vampireCount)}`);
      }
    }

    const quickHealCount = countUpgrade(w.upgrades, 'common-4');
    if (quickHealCount > 0 && w.winStreak % 3 === 0) {
      heal('Quick Heal', quickHealCount, `${w.winStreak}-win streak${stacks(quickHealCount)}`);
    }

    const battleMedicCount = countUpgrade(w.upgrades, 'rare-2');
    if (battleMedicCount > 0 && w.totalWins % 5 === 0) {
      heal('Battle Medic', 2 * battleMedicCount, `Win #${w.totalWins}${stacks(battleMedicCount)}`);
    }
  }

  // --- Gold ---
  const calcGold = (p, isWinner) => {
    const base = isWinner ? 3 : 2;

    let winStreakBonus = 0;
    if (isWinner) {
      const raw = Math.min(p.winStreak, 4);
      winStreakBonus = hasUpgrade(p.upgrades, 'rare-5') ? raw * 2 : raw; // Momentum
    }

    const lossStreakBonus = isWinner ? 0 : Math.min(p.lossStreak, 4);

    const intCap = hasUpgrade(p.upgrades, 'epic-3') ? 80 : 50; // Treasury
    const interest = Math.floor(Math.min(p.gold, intCap) / 10);

    const upgradeSources = [];
    let upgradeBonus = 0;

    const luckyCoins = countUpgrade(p.upgrades, 'common-3');
    if (luckyCoins > 0) {
      upgradeBonus += luckyCoins;
      upgradeSources.push({ name: 'Lucky Coin', amount: luckyCoins });
    }

    if (!isWinner && p.lossStreak % 3 === 0) {
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

  // Opportunist (epic-5): steal 1 gold per copy
  const opportunistCount = countUpgrade(w.upgrades, 'epic-5');
  let stolen = 0;
  for (let i = 0; i < opportunistCount && l.gold > 0; i++) {
    l.gold -= 1;
    w.gold += 1;
    stolen += 1;
  }
  if (stolen > 0) log('gold', 'Opportunist', w.id, stolen, `Stole ${stolen} gold`);

  return {
    winner: w,
    loser: l,
    result: {
      winnerId: w.id,
      loserId: l.id,
      damageDealt: hitDamage,
      isCrit,
      damageTaken: { [w.id]: winnerDamageTaken, [l.id]: hitDamage },
      healAmounts: { [w.id]: winnerHealAmount, [l.id]: 0 },
      goldEarned: { [w.id]: wGold, [l.id]: lGold },
      phoenixTriggered,
      combatEvents: events,
      hpBefore,
    },
  };
}

// ─── Game state ───────────────────────────────────────────────────────────────

export function createPlayer(id, name, maxHp) {
  return {
    id,
    name,
    maxHp,
    hp: maxHp,
    gold: 5,
    winStreak: 0,
    lossStreak: 0,
    totalWins: 0,
    upgrades: [],
    counterStrikeActive: false,
    vampireOverflow: 0,
    poisonChance: 0,
    igniteChance: 0,
    poisonTicks: 0,
    igniteTicks: 0,
    shield: 0,
    healingReduction: false,
  };
}

// ─── Match stats ──────────────────────────────────────────────────────────────
// Whole-game totals per player, shown on the game-over screen. The rally log
// only keeps the last few rallies, so these are accumulated as the game goes.

export function createPlayerStats() {
  return {
    rallyWins: 0,
    longestWinStreak: 0,
    damageDealt: 0,      // HP the opponent lost because of this player (hits, Poison/Ignite, Thorns)
    damageTaken: 0,
    biggestHit: 0,       // largest single rally hit (after the opponent's blocks)
    biggestHitRally: null,
    biggestHitCrit: false,
    crits: 0,
    healingDone: 0,
    damageBlocked: 0,    // Iron Defense + shields
    shieldsUsed: 0,
    dotDamage: 0,        // Poison + Ignite damage inflicted (before the opponent's blocks)
    thornsDamage: 0,
    phoenixRevives: 0,
    goldEarned: 0,
    goldStolen: 0,
    goldSpent: 0,
    upgradesBought: 0,
    shopRefreshes: 0,
  };
}

const freshStats = () => ({ p1: createPlayerStats(), p2: createPlayerStats() });

function addRallyToStats(stats, result, players) {
  const next = { p1: { ...stats.p1 }, p2: { ...stats.p2 } };
  const w = next[result.winnerId];
  const sum = (filter) => result.combatEvents.filter(filter).reduce((a, e) => a + e.amount, 0);

  w.rallyWins += 1;
  w.longestWinStreak = Math.max(w.longestWinStreak, players[result.winnerId].winStreak);
  if (result.isCrit) w.crits += 1;
  if (result.damageDealt > w.biggestHit) {
    w.biggestHit = result.damageDealt;
    w.biggestHitRally = result.rallyNumber ?? null;
    w.biggestHitCrit = result.isCrit;
  }

  for (const id of ['p1', 'p2']) {
    const me = next[id];
    const opp = next[other(id)];
    // Every point of damage a player takes is caused by their opponent.
    me.damageTaken += result.damageTaken[id];
    opp.damageDealt += result.damageTaken[id];
    opp.dotDamage += sum(e => e.targetId === id && e.category === 'damage' && (e.source === 'Poison' || e.source === 'Ignite'));
    opp.thornsDamage += sum(e => e.targetId === id && e.source === 'Thorns');
    me.healingDone += result.healAmounts[id];
    me.damageBlocked += sum(e => e.targetId === id && e.category === 'mitigation');
    me.shieldsUsed += result.combatEvents.filter(e => e.targetId === id && e.source === 'Shield').length;
    me.phoenixRevives += result.combatEvents.filter(e => e.targetId === id && e.source === 'Phoenix').length;
    const stolen = sum(e => e.targetId === id && e.category === 'gold');
    me.goldStolen += stolen;
    me.goldEarned += result.goldEarned[id].total + stolen;
  }
  return next;
}

export function createInitialState(p1Name, p2Name) {
  return {
    phase: 'setup',
    players: {
      p1: createPlayer('p1', p1Name, 100),
      p2: createPlayer('p2', p2Name, 100),
    },
    servingPlayerId: null,
    rallyNumber: 1,
    ralliesPerRound: 5,
    ralliesThisRound: 0,
    lastRallyResult: null,
    roundGoldTotals: { p1: 0, p2: 0 },
    draftPool: [],
    draftTurn: null,
    shopPool: { p1: [], p2: [] },
    shopState: { p1Done: false, p2Done: false },
    rallyLog: [],
    matchStats: freshStats(),
  };
}

const other = (id) => (id === 'p1' ? 'p2' : 'p1');
const isPlayerId = (id) => id === 'p1' || id === 'p2';

function reject(state, error) {
  return { state, error };
}

// Apply one player intent to the state. Pure with respect to `state` (never
// mutates it). Returns { state, error? }; on error the original state is returned.
export function applyAction(state, actorId, action) {
  if (!action || typeof action.type !== 'string') return reject(state, 'Malformed action.');

  switch (action.type) {
    case 'start_game': {
      if (state.phase !== 'setup') return reject(state, 'The game has already started.');
      if (actorId !== 'p1') return reject(state, 'Only the host can start the game.');
      const hp = Math.round(Number(action.hp));
      const rallies = Math.round(Number(action.ralliesPerRound));
      if (!(hp >= 10 && hp <= 1000)) return reject(state, 'Invalid starting HP.');
      if (!(rallies >= 1 && rallies <= 20)) return reject(state, 'Invalid rallies per round.');
      return {
        state: {
          ...createInitialState(state.players.p1.name, state.players.p2.name),
          phase: 'rally-determination',
          ralliesPerRound: rallies,
          players: {
            p1: createPlayer('p1', state.players.p1.name, hp),
            p2: createPlayer('p2', state.players.p2.name, hp),
          },
        },
      };
    }

    case 'first_rally_winner': {
      if (state.phase !== 'rally-determination') return reject(state, 'First rally already decided.');
      if (!isPlayerId(action.winnerId)) return reject(state, 'Invalid winner.');
      return {
        state: {
          ...state,
          servingPlayerId: action.winnerId,
          phase: 'upgrade-draft',
          draftTurn: action.winnerId,
          draftPool: drawUpgrades(3, 'legendary'),
        },
      };
    }

    case 'draft_pick': {
      if (state.phase !== 'upgrade-draft') return reject(state, 'Not in the draft.');
      if (state.draftTurn !== actorId) return reject(state, "It's not your turn to pick.");
      const index = state.draftPool.findIndex(u => u.instanceId === action.instanceId);
      if (index === -1) return reject(state, 'That upgrade is no longer available.');
      const upgrade = state.draftPool[index];
      const players = {
        ...state.players,
        [actorId]: {
          ...state.players[actorId],
          upgrades: applyUpgradeCombining([...state.players[actorId].upgrades, upgrade]),
        },
      };
      const firstPicker = state.servingPlayerId;
      if (actorId === firstPicker) {
        return {
          state: {
            ...state,
            players,
            draftTurn: other(actorId),
            draftPool: state.draftPool.filter((_, i) => i !== index),
          },
        };
      }
      return {
        state: { ...state, players, phase: 'battle', draftTurn: null, draftPool: [] },
      };
    }

    case 'rally_win': {
      if (state.phase !== 'battle') return reject(state, 'Not in a battle.');
      // The rally number guards against double taps and both players tapping
      // "I won" for the same rally: only the first claim for a rally counts.
      if (action.rallyNumber !== state.rallyNumber) return reject(state, 'That rally was already recorded.');
      return { state: resolveRallyWin(state, actorId) };
    }

    case 'shop_buy': {
      if (state.phase !== 'shop') return reject(state, 'The shop is closed.');
      if (state.shopState[`${actorId}Done`]) return reject(state, 'You already finished shopping.');
      const player = state.players[actorId];
      const pool = state.shopPool[actorId];
      const upgrade = pool.find(u => u.instanceId === action.instanceId);
      if (!upgrade) return reject(state, 'That upgrade is no longer in your shop.');
      if (buildExcludeList(player.upgrades).includes(upgrade.id)) {
        return reject(state, `You can't own any more ${upgrade.name}.`);
      }
      const cost = finalCost(upgrade, player.upgrades);
      if (player.gold < cost) return reject(state, 'Not enough gold.');
      return {
        state: {
          ...state,
          players: {
            ...state.players,
            [actorId]: {
              ...player,
              gold: player.gold - cost,
              upgrades: applyUpgradeCombining([...player.upgrades, upgrade]),
            },
          },
          shopPool: { ...state.shopPool, [actorId]: pool.filter(u => u !== upgrade) },
          matchStats: bumpStats(state, actorId, { goldSpent: cost, upgradesBought: 1 }),
        },
      };
    }

    case 'shop_refresh': {
      if (state.phase !== 'shop') return reject(state, 'The shop is closed.');
      if (state.shopState[`${actorId}Done`]) return reject(state, 'You already finished shopping.');
      const player = state.players[actorId];
      if (player.gold < REFRESH_COST) return reject(state, 'Not enough gold to refresh.');
      return {
        state: {
          ...state,
          players: { ...state.players, [actorId]: { ...player, gold: player.gold - REFRESH_COST } },
          shopPool: {
            ...state.shopPool,
            [actorId]: drawUpgrades(3, null, buildExcludeList(player.upgrades)),
          },
          matchStats: bumpStats(state, actorId, { goldSpent: REFRESH_COST, shopRefreshes: 1 }),
        },
      };
    }

    case 'shop_done': {
      if (state.phase !== 'shop') return reject(state, 'The shop is closed.');
      const shopState = { ...state.shopState, [`${actorId}Done`]: true };
      if (shopState.p1Done && shopState.p2Done) {
        return {
          state: {
            ...state,
            shopState,
            phase: 'battle',
            lastRallyResult: null,
            roundGoldTotals: { p1: 0, p2: 0 },
          },
        };
      }
      return { state: { ...state, shopState } };
    }

    case 'rematch': {
      if (state.phase !== 'game-over') return reject(state, 'The game is not over yet.');
      return { state: createInitialState(state.players.p1.name, state.players.p2.name) };
    }

    default:
      return reject(state, `Unknown action "${action.type}".`);
  }
}

function bumpStats(state, id, deltas) {
  const stats = state.matchStats ?? freshStats();
  const mine = { ...stats[id] };
  for (const [k, v] of Object.entries(deltas)) mine[k] += v;
  return { ...stats, [id]: mine };
}

const RALLY_LOG_SIZE = 10;

function resolveRallyWin(state, winnerId) {
  const loserId = other(winnerId);
  const { winner, loser, result: rallyResult } = resolveRally(state.players[winnerId], state.players[loserId]);
  const players = { ...state.players, [winnerId]: winner, [loserId]: loser };

  const rallyNumber = state.rallyNumber + 1;
  const ralliesThisRound = state.ralliesThisRound + 1;
  const servingPlayerId = other(state.servingPlayerId ?? loserId);
  const result = { ...rallyResult, rallyNumber: state.rallyNumber };

  const withLog = (r) => [...(state.rallyLog ?? []), r].slice(-RALLY_LOG_SIZE);

  if (players.p1.hp <= 0 || players.p2.hp <= 0) {
    return {
      ...state,
      players,
      rallyNumber,
      lastRallyResult: result,
      rallyLog: withLog(result),
      matchStats: addRallyToStats(state.matchStats ?? freshStats(), result, players),
      phase: 'game-over',
    };
  }

  // Eternal Flame (legendary-4): +2 HP per copy after every rally
  const healAmounts = { ...result.healAmounts };
  const combatEvents = [...result.combatEvents];
  for (const id of ['p1', 'p2']) {
    const copies = countUpgrade(players[id].upgrades, 'legendary-4');
    if (copies > 0) {
      const p = { ...players[id] };
      const actual = applyHealing(p, copies * 2);
      healAmounts[id] += actual;
      players[id] = p;
      const notes = [`+2 HP after every rally${stacks(copies)}`];
      if (p.healingReduction) notes.push('halved by Ignite');
      if (actual < (p.healingReduction ? copies : copies * 2)) notes.push('capped at max HP');
      combatEvents.push({ id: `e${combatEvents.length + 1}`, category: 'heal', source: 'Eternal Flame', targetId: id, amount: actual, message: notes.join(' · ') });
    }
  }
  const lastRallyResult = { ...result, healAmounts, combatEvents };

  const roundGoldTotals = {
    p1: state.roundGoldTotals.p1 + result.goldEarned.p1.total,
    p2: state.roundGoldTotals.p2 + result.goldEarned.p2.total,
  };

  const base = {
    ...state,
    players,
    lastRallyResult,
    rallyLog: withLog(lastRallyResult),
    matchStats: addRallyToStats(state.matchStats ?? freshStats(), lastRallyResult, players),
    roundGoldTotals,
    rallyNumber,
    servingPlayerId,
  };

  if (ralliesThisRound >= state.ralliesPerRound) {
    return {
      ...base,
      ralliesThisRound: 0,
      phase: 'shop',
      shopState: { p1Done: false, p2Done: false },
      shopPool: {
        p1: drawUpgrades(3, null, buildExcludeList(players.p1.upgrades)),
        p2: drawUpgrades(3, null, buildExcludeList(players.p2.upgrades)),
      },
    };
  }

  return { ...base, ralliesThisRound, phase: 'battle' };
}
