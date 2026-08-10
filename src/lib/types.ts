export type Phase = 'name-entry' | 'setup' | 'rally-determination' | 'upgrade-draft' | 'battle' | 'shop' | 'game-over' | 'online-lobby';

export type Rarity = 'common' | 'rare' | 'epic' | 'legendary';

export interface Upgrade {
  id: string;
  name: string;
  rarity: Rarity;
  cost: number;
  description: string;
  instanceId?: string;
  stackCount?: number;
}

export interface PlayerState {
  id: 'p1' | 'p2';
  name: string;
  maxHp: number;
  hp: number;
  gold: number;
  winStreak: number;
  lossStreak: number;
  totalWins: number;
  upgrades: Upgrade[];
  counterStrikeActive: boolean;
  vampireOverflow: number;
}

export interface GoldBreakdown {
  base: number;
  winStreakBonus: number;
  lossStreakBonus: number;
  interest: number;
  upgradeBonus: number;
  total: number;
  upgradeSources: Array<{ name: string; amount: number }>;
}

export type CombatEventCategory = 'damage' | 'heal' | 'mitigation' | 'special';

export interface CombatEvent {
  id: string;
  category: CombatEventCategory;
  source: string;
  amount: number;
  targetId: 'p1' | 'p2';
  message?: string;
}

export interface RallyResult {
  winnerId: 'p1' | 'p2';
  loserId: 'p1' | 'p2';
  damageDealt: number;
  isCrit: boolean;
  healAmounts: Record<'p1' | 'p2', number>;
  goldEarned: Record<'p1' | 'p2', GoldBreakdown>;
  combatEvents: CombatEvent[];
  hpBefore: Record<'p1' | 'p2', number>;
}

export interface GameState {
  phase: Phase;
  players: Record<'p1' | 'p2', PlayerState>;
  servingPlayerId: 'p1' | 'p2' | null;
  rallyNumber: number;
  ralliesPerRound: number;
  ralliesThisRound: number;
  lastRallyResult: RallyResult | null;
  roundGoldTotals: Record<'p1' | 'p2', number>;
  draftPool: Upgrade[];
  draftTurn: 'p1' | 'p2' | null;
  shopPool: Record<'p1' | 'p2', Upgrade[]>;
  shopState: { p1Done: boolean; p2Done: boolean };
}
