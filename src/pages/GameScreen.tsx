import { GameState, PlayerState, RallyResult } from "../lib/types";
import { Button } from "@/components/ui/button";
import { motion, AnimatePresence } from "framer-motion";
import { Heart, Coins, Zap, ShieldAlert } from "lucide-react";

interface Props {
  state: GameState;
  onWin: (winnerId: "p1" | "p2") => void;
  myPlayerId?: 'p1' | 'p2'; // online mode: limits buttons to your own "I won" action
}

function PlayerPanel({ p, isServing }: { p: PlayerState; isServing: boolean }) {
  const hpPercent = Math.max(0, Math.min(100, (p.hp / p.maxHp) * 100));
  let hpColor = "bg-green-500";
  if (hpPercent < 50) hpColor = "bg-yellow-500";
  if (hpPercent < 25) hpColor = "bg-red-500";

  return (
    <div className="flex-1 flex flex-col p-5 bg-card border border-border rounded-xl relative overflow-hidden">
      {isServing && <div className="absolute top-0 left-0 w-full h-1 bg-primary animate-pulse" />}

      <div className="flex justify-between items-center mb-4">
        <h2 className="text-2xl font-bold tracking-tight truncate">{p.name}</h2>
        {isServing && (
          <span className="text-xs font-bold uppercase tracking-wider text-primary border border-primary px-2 py-1 rounded shrink-0 ml-2">
            Serving
          </span>
        )}
      </div>

      <div className="space-y-1 mb-4">
        <div className="flex justify-between items-center text-sm font-bold">
          <span className="flex items-center gap-1 text-red-400"><Heart className="w-3 h-3" /> HP</span>
          <span>{p.hp} / {p.maxHp}</span>
        </div>
        <div className="w-full h-3 bg-muted rounded-full overflow-hidden">
          <motion.div
            className={`h-full ${hpColor} transition-all`}
            animate={{ width: `${hpPercent}%` }}
            transition={{ type: "spring", bounce: 0, duration: 0.6 }}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className="bg-background rounded-lg p-3 border border-border flex flex-col items-center">
          <span className="text-muted-foreground text-xs uppercase font-bold tracking-wider mb-1">Gold</span>
          <span className="font-bold flex items-center gap-1 text-yellow-500">
            <Coins className="w-4 h-4" /> {p.gold}
          </span>
        </div>
        <div className="bg-background rounded-lg p-3 border border-border flex flex-col items-center">
          <span className="text-muted-foreground text-xs uppercase font-bold tracking-wider mb-1">Streak</span>
          <span className="font-bold text-green-500 text-sm">{p.winStreak}W</span>
          <span className="text-xs font-bold text-red-400">{p.lossStreak}L</span>
        </div>
      </div>

      <div className="flex-1 min-h-0">
        <h3 className="text-xs uppercase tracking-wider text-muted-foreground font-bold mb-2">
          Upgrades ({p.upgrades.length})
        </h3>
        <div className="flex flex-wrap gap-1">
          {p.upgrades.map((u, i) => (
            <div
              key={`${u.instanceId ?? u.id}-${i}`}
              className={`text-xs px-2 py-1 rounded border bg-background glow-${u.rarity} text-glow-${u.rarity} cursor-help`}
              title={u.description}
            >
              {u.name}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function RallyResultBanner({ result, players }: { result: RallyResult; players: GameState["players"] }) {
  const winnerName = players[result.winnerId].name;
  const loserName = players[result.loserId].name;
  const p1Heal = result.healAmounts.p1;
  const p2Heal = result.healAmounts.p2;

  return (
    <motion.div
      key={result.winnerId + result.damageDealt}
      initial={{ opacity: 0, y: -12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.3 }}
      className="w-full max-w-2xl mx-auto bg-card border border-border rounded-xl px-6 py-3 flex flex-wrap items-center justify-center gap-x-6 gap-y-1 text-sm"
    >
      <span className="font-bold text-primary">{winnerName} won rally</span>
      <span className="flex items-center gap-1 text-red-400 font-semibold">
        <ShieldAlert className="w-4 h-4" />
        {loserName} took <span className="font-bold">{result.damageDealt}</span> dmg
        {result.isCrit && (
          <span className="ml-1 text-yellow-400 font-black flex items-center gap-0.5">
            <Zap className="w-3 h-3" /> CRIT
          </span>
        )}
      </span>
      {p1Heal > 0 && (
        <span className="flex items-center gap-1 text-green-400 font-semibold">
          <Heart className="w-4 h-4" /> {players.p1.name} +{p1Heal} HP
        </span>
      )}
      {p2Heal > 0 && (
        <span className="flex items-center gap-1 text-green-400 font-semibold">
          <Heart className="w-4 h-4" /> {players.p2.name} +{p2Heal} HP
        </span>
      )}
    </motion.div>
  );
}

export default function GameScreen({ state, onWin, myPlayerId }: Props) {
  const { p1, p2 } = state.players;
  const rallyLabel = `${state.ralliesThisRound + 1} / ${state.ralliesPerRound}`;

  return (
    <div className="min-h-screen flex flex-col p-4 lg:p-6 gap-4 max-w-7xl mx-auto">

      {/* Rally counter */}
      <div className="text-center space-y-1 pt-2">
        <h1 className="text-2xl font-black text-primary uppercase tracking-widest">
          Rally {rallyLabel}
        </h1>
        <div className="flex justify-center gap-1.5 mt-1">
          {Array.from({ length: state.ralliesPerRound }).map((_, i) => (
            <div
              key={i}
              className={`h-2 w-6 rounded-full transition-colors ${
                i < state.ralliesThisRound ? 'bg-primary' : 'bg-muted'
              }`}
            />
          ))}
        </div>
        {myPlayerId && (
          <p className="text-xs text-muted-foreground">
            You are <span className="text-primary font-bold">{state.players[myPlayerId].name}</span>
          </p>
        )}
      </div>

      {/* Last rally result banner */}
      <AnimatePresence mode="wait">
        {state.lastRallyResult && (
          <RallyResultBanner result={state.lastRallyResult} players={state.players} />
        )}
      </AnimatePresence>

      {/* Player panels + win buttons */}
      <div className="flex flex-col lg:flex-row gap-4 flex-1">
        <PlayerPanel p={p1} isServing={state.servingPlayerId === "p1"} />

        <div className="flex lg:flex-col items-center justify-center gap-3 py-2">
          <Button
            onClick={() => onWin("p1")}
            size="lg"
            className="w-full lg:w-36 lg:h-24 text-base font-bold"
            data-testid="btn-win-p1"
          >
            {p1.name} won
          </Button>
          <div className="font-bold text-muted-foreground p-3 bg-card rounded-full border border-border text-sm">
            VS
          </div>
          <Button
            onClick={() => onWin("p2")}
            size="lg"
            className="w-full lg:w-36 lg:h-24 text-base font-bold"
            data-testid="btn-win-p2"
          >
            {p2.name} won
          </Button>
        </div>

        <PlayerPanel p={p2} isServing={state.servingPlayerId === "p2"} />
      </div>
    </div>
  );
}
