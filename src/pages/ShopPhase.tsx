import { GameState, Upgrade } from "../lib/types";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { motion, AnimatePresence } from "framer-motion";
import { countUpgrade } from "../lib/upgrades";
import { RefreshCw, Heart, Coins, Clock } from "lucide-react";

interface Props {
  state: GameState;
  onBuy: (playerId: 'p1' | 'p2', upgrade: Upgrade) => void;
  onDone: (playerId: 'p1' | 'p2') => void;
  onRefresh: (playerId: 'p1' | 'p2') => void;
  myPlayerId?: 'p1' | 'p2'; // online mode: lock shop to this player
}

export default function ShopPhase({ state, onBuy, onDone, onRefresh, myPlayerId }: Props) {
  // In online mode, always show MY shop. In local mode, show P1 first then P2.
  const localActiveId: 'p1' | 'p2' = !state.shopState.p1Done ? 'p1' : 'p2';
  const activeId: 'p1' | 'p2' = myPlayerId ?? localActiveId;

  const myDone = myPlayerId
    ? (myPlayerId === 'p1' ? state.shopState.p1Done : state.shopState.p2Done)
    : false;

  const player = state.players[activeId];
  const pool = state.shopPool[activeId];
  const roundGold = state.roundGoldTotals[activeId];

  const getDiscount = (upgrades: Upgrade[]) =>
    countUpgrade(upgrades, 'common-5') + countUpgrade(upgrades, 'legendary-3') * 3;

  const discount = getDiscount(player.upgrades);
  const canRefresh = player.gold >= 10;

  const hpPercent = Math.max(0, Math.min(100, (player.hp / player.maxHp) * 100));
  let hpColor = "bg-green-500";
  if (hpPercent < 50) hpColor = "bg-yellow-500";
  if (hpPercent < 25) hpColor = "bg-red-500";

  // Online mode: show waiting screen when I've already clicked Done
  if (myPlayerId && myDone) {
    const other = state.players[myPlayerId === 'p1' ? 'p2' : 'p1'];
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="min-h-screen flex flex-col items-center justify-center p-6 text-center gap-6"
      >
        <Clock className="w-12 h-12 text-muted-foreground animate-pulse" />
        <h2 className="text-3xl font-bold text-primary">Waiting for {other.name}…</h2>
        <p className="text-muted-foreground">
          Your shopping is done. Game resumes when {other.name} finishes.
        </p>
        <div className="flex gap-8 mt-4">
          <div className="text-center">
            <p className="text-xs uppercase tracking-widest text-muted-foreground mb-1">Your HP</p>
            <p className="text-2xl font-bold text-red-400 flex items-center gap-1">
              <Heart className="w-5 h-5" /> {player.hp}
            </p>
          </div>
          <div className="text-center">
            <p className="text-xs uppercase tracking-widest text-muted-foreground mb-1">Your Gold</p>
            <p className="text-2xl font-bold text-yellow-400 flex items-center gap-1">
              <Coins className="w-5 h-5" /> {player.gold}
            </p>
          </div>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      key={activeId}
      initial={{ opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.3 }}
      className="min-h-screen flex flex-col items-center justify-center p-6 space-y-8 max-w-4xl mx-auto"
    >
      {/* Header */}
      <div className="text-center space-y-4 w-full">
        <h2 className="text-4xl font-bold text-primary">Shop Phase</h2>
        <div className="bg-card border border-border rounded-xl p-6 shadow-xl space-y-4">
          <h3 className="text-2xl font-bold">
            {player.name}'s Turn
            {myPlayerId && <span className="ml-2 text-sm text-green-400 font-normal">(you)</span>}
          </h3>

          {/* HP Bar */}
          <div className="space-y-1">
            <div className="flex justify-between items-center text-sm font-bold">
              <span className="flex items-center gap-1 text-red-400"><Heart className="w-3 h-3" /> HP</span>
              <span>{player.hp} / {player.maxHp}</span>
            </div>
            <div className="w-full h-3 bg-muted rounded-full overflow-hidden">
              <motion.div
                className={`h-full ${hpColor}`}
                animate={{ width: `${hpPercent}%` }}
                transition={{ type: "spring", bounce: 0, duration: 0.5 }}
              />
            </div>
          </div>

          {/* Gold + round earnings */}
          <div className="flex items-center justify-center gap-6 flex-wrap">
            <span className="text-yellow-500 font-bold text-2xl flex items-center gap-2">
              <Coins className="w-5 h-5" /> {player.gold} gold
            </span>
            {roundGold > 0 && (
              <span className="text-sm text-muted-foreground bg-background px-3 py-1.5 rounded border border-border">
                +{roundGold}g earned this round ({state.ralliesPerRound} rallies)
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Upgrade Cards */}
      <div className="flex flex-wrap justify-center gap-6 w-full items-center">


        <AnimatePresence mode="popLayout">
          {pool.length === 0 ? (
            <motion.p
              key="empty"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-muted-foreground text-lg"
            >
              No upgrades left — refresh or finish your turn.
            </motion.p>
          ) : (
            pool.map((u, i) => {
              const finalCost = Math.max(1, u.cost - discount);
              const canAfford = player.gold >= finalCost;

              return (
                <motion.div
                  key={u.instanceId ?? `${u.id}-${i}`}
                  layout
                  initial={{ opacity: 0, scale: 0.85 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.75 }}
                  transition={{ duration: 0.2 }}
                  whileHover={canAfford ? { scale: 1.05 } : {}}
                  whileTap={canAfford ? { scale: 0.95 } : {}}
                >
                  <Card
                    className={`relative w-86 h-40 flex flex-col p-2 transition-colors bg-card border ${

                      canAfford
                        ? `cursor-pointer hover:border-primary glow-${u.rarity}`
                        : 'opacity-50 cursor-not-allowed'
                    } border-border`}
                    onClick={() => canAfford && onBuy(activeId, u)}
                    data-testid={`shop-item-${u.id}`}
                  >
                    <div className="flex justify-between items-start mb-4">
                      <h3 className={`font-bold text-lg text-glow-${u.rarity}`}>{u.name}</h3>
                      <span className="font-bold text-yellow-500 bg-background px-2 py-1 rounded border border-border text-sm whitespace-nowrap">
                        {finalCost}g
                      </span>
                    </div>

                    <p className="text-muted-foreground flex-1 text-sm">{u.description}</p>

                    <div className="mt-auto pt-4 border-t border-border">
                      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        {u.rarity}
                      </p>
                    </div>

                    {/* ⭐ STACK BADGE */}
                    {u.stackCount && u.stackCount > 1 && (
                      <div className="absolute bottom-2 right-2 bg-black/70 px-2 py-1 rounded text-sm">
                        <span className={`font-semibold text-glow-${u.rarity} opacity-90`}>
                          ×{u.stackCount}
                        </span>
                      </div>
                    )}
                    {!canAfford && (
                      <div className="absolute inset-0 flex items-center justify-center bg-background/60 rounded-xl font-bold text-destructive text-xl z-10">
                        Too Expensive
                      </div>
                    )}
                  </Card>
                </motion.div>
              );
            })
          )}
        </AnimatePresence>
      </div>

      {/* Actions */}
      <div className="flex flex-col sm:flex-row gap-4 items-center">
        <Button
          variant="outline"
          size="lg"
          className={`gap-2 font-semibold ${!canRefresh ? 'opacity-40 cursor-not-allowed' : ''}`}
          onClick={() => canRefresh && onRefresh(activeId)}
          disabled={!canRefresh}
          data-testid="btn-refresh-shop"
        >
          <RefreshCw className="w-4 h-4" />
          Refresh Shop (10g)
        </Button>

        <Button
          onClick={() => onDone(activeId)}
          variant="secondary"
          size="lg"
          className="w-48 font-bold text-lg"
          data-testid="btn-done-shop"
        >
          Done Shopping
        </Button>
      </div>
    </motion.div>
  );
}
