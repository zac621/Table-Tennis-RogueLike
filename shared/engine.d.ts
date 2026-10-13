import type { GameAction, GameState, PlayerId, PlayerState, RallyResult, Rarity, Upgrade } from '../src/lib/types';

export declare const COMMON_UPGRADES: Upgrade[];
export declare const RARE_UPGRADES: Upgrade[];
export declare const EPIC_UPGRADES: Upgrade[];
export declare const LEGENDARY_UPGRADES: Upgrade[];
export declare const ALL_UPGRADES: Upgrade[];

export declare const POISON_CHANCE_PER_STACK: number;
export declare const IGNITE_CHANCE_PER_STACK: number;
export declare const PROC_CHANCE_CAP: number;
export declare const REFRESH_COST: number;

export declare function hasUpgrade(upgrades: Upgrade[], id: string): boolean;
export declare function countUpgrade(upgrades: Upgrade[], id: string): number;
export declare function applyUpgradeCombining(upgrades: Upgrade[]): Upgrade[];
export declare function shopDiscount(upgrades: Upgrade[]): number;
export declare function finalCost(upgrade: Upgrade, upgrades: Upgrade[]): number;
export declare function buildExcludeList(upgrades: Upgrade[]): string[];
export declare function drawUpgrades(count: number, forceRarity?: Rarity | null, exclude?: string[]): Upgrade[];
export declare function resolveRally(
  winner: PlayerState,
  loser: PlayerState,
): { winner: PlayerState; loser: PlayerState; result: RallyResult };
export declare function createPlayer(id: PlayerId, name: string, maxHp: number): PlayerState;
export declare function createInitialState(p1Name: string, p2Name: string): GameState;
export declare function applyAction(
  state: GameState,
  actorId: PlayerId,
  action: GameAction,
): { state: GameState; error?: string };
