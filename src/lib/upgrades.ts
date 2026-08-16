import { Upgrade, Rarity } from './types';

export const COMMON_UPGRADES: Upgrade[] = [
  { id: 'common-2', name: 'Power Smash',  rarity: 'common', cost: 5, description: 'Deal 1 extra damage on rally wins.' },
  { id: 'common-3', name: 'Lucky Coin',   rarity: 'common', cost: 5, description: 'Earn +1 extra gold every rally (win or lose).' },
  { id: 'common-4', name: 'Quick Heal',   rarity: 'common', cost: 5, description: 'Recover 1 HP for every 3 consecutive wins.' },
  { id: 'common-5', name: 'Bargain Hunt', rarity: 'common', cost: 5, description: 'All shop upgrades cost 1 less gold. (min 1)' },
];

export const RARE_UPGRADES: Upgrade[] = [
  { id: 'common-1', name: 'Iron Defense',   rarity: 'rare', cost: 10, description: 'Take 1 less damage per rally loss. (min 1 damage)' },
  { id: 'rare-1',   name: 'Savage Streak',  rarity: 'rare', cost: 10, description: 'Consecutive wins deal +1 extra damage per win (max +3).' },
  { id: 'rare-2',   name: 'Battle Medic',   rarity: 'rare', cost: 10, description: 'Recover 2 HP every time you reach your 5th, 10th, 15th... total win.' },
  { id: 'rare-3',   name: 'Counter Strike', rarity: 'rare', cost: 10, description: 'After losing a rally, your next win deals +2 extra damage.' },
  { id: 'rare-4',   name: 'Fortify',        rarity: 'rare', cost: 10, description: 'Every 3 consecutive losses, gain +3 extra gold.' },
  { id: 'rare-5',   name: 'Momentum',       rarity: 'rare', cost: 10, description: 'Win streak gold bonuses are doubled. Unique — can only be owned once.' },
  { id: 'rare-6',   name: 'Dead Eye',       rarity: 'rare', cost: 10, description: 'Rally wins have a 20% crit chance (double damage). Each copy adds +20%, capped at 100%. Not offered once you hit the cap.' },
];

export const EPIC_UPGRADES: Upgrade[] = [
  { id: 'epic-1', name: 'Berserker',        rarity: 'epic', cost: 20, description: 'Rally wins deal extra damage equal to your current win streak.' },
  { id: 'epic-2', name: 'Vampire',          rarity: 'epic', cost: 20, description: 'Recover 1 HP for every 2 damage you deal (tracks overflow between rallies).' },
  { id: 'epic-3', name: 'Treasury',         rarity: 'epic', cost: 20, description: 'Interest gold cap raised from 50 to 80 gold.' },
  { id: 'epic-4', name: 'Phoenix',          rarity: 'epic', cost: 20, description: 'Once per use: survive a fatal hit and restore 10% of your max HP instead of dying. Consumed on activation.' },
  { id: 'epic-5', name: 'Opportunist',      rarity: 'epic', cost: 20, description: 'Each rally win steals 1 gold from your opponent.' },
  { id: 'epic-6', name: 'Headhunter',       rarity: 'epic', cost: 20, description: 'Your crits deal 3 additional damage.' },
];

export const LEGENDARY_UPGRADES: Upgrade[] = [
  { id: 'legendary-1', name: 'War Machine',   rarity: 'legendary', cost: 50, description: 'Your base damage on rally wins is increased by 4 per copy. Stacks.' },
  { id: 'legendary-2', name: 'Life Steal',    rarity: 'legendary', cost: 50, description: 'Each rally win steals 2 HP from your opponent and heals you. Stacks — each copy steals an additional 2 HP.' },
  { id: 'legendary-3', name: 'The Banker',    rarity: 'legendary', cost: 50, description: 'All shop costs reduced by 3 gold. (min 1, stacks with Bargain Hunt)' },
  { id: 'legendary-4', name: 'Eternal Flame', rarity: 'legendary', cost: 50, description: 'Gain 2 HP after every rally (win or lose). Stacks per copy.' },
];

export const ALL_UPGRADES = [...COMMON_UPGRADES, ...RARE_UPGRADES, ...EPIC_UPGRADES, ...LEGENDARY_UPGRADES];

export function hasUpgrade(upgrades: Upgrade[], id: string): boolean {
  return upgrades.some(u => u.id === id);
}

// Counts effective copies, respecting stackCount from combining
export function countUpgrade(upgrades: Upgrade[], id: string): number {
  return upgrades
    .filter(u => u.id === id)
    .reduce((sum, u) => sum + (u.stackCount ?? 1), 0);
}

const RARITY_ORDER: Rarity[] = ['common', 'rare', 'epic', 'legendary'];

// When a player holds 2 upgrades of the same id+rarity (non-legendary), merge them
// into one upgrade of the next rarity, preserving the combined stack power.
// Cascades until no more pairs exist.
export function applyUpgradeCombining(upgrades: Upgrade[]): Upgrade[] {
  const map = new Map<string, Upgrade>();

  for (const u of upgrades) {
    const key = `${u.id}::${u.rarity}`;

    if (!map.has(key)) {
      // First copy → store it
      map.set(key, { ...u, stackCount: u.stackCount ?? 1 });
    } else {
      // Additional copy → increment stackCount
      const existing = map.get(key)!;
      existing.stackCount = (existing.stackCount ?? 1) + (u.stackCount ?? 1);
    }
  }

  return Array.from(map.values());
}

