import { GameState } from "../lib/types";
import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";

interface Props {
  state: GameState;
  onReset: () => void;
}

export default function GameOver({ state, onReset }: Props) {
  const p1 = state.players.p1;
  const p2 = state.players.p2;
  
  const winner = p1.hp > 0 ? p1 : (p2.hp > 0 ? p2 : null);

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="min-h-screen flex flex-col items-center justify-center p-6 space-y-8 text-center max-w-4xl mx-auto">
      <h1 className="text-6xl font-black text-destructive tracking-widest uppercase">Game Over</h1>
      
      {winner ? (
        <div className="space-y-2">
          <h2 className="text-4xl font-bold text-glow-legendary animate-pulse">{winner.name} Wins!</h2>
          <p className="text-xl text-muted-foreground">Final HP: {winner.hp} / {winner.maxHp}</p>
        </div>
      ) : (
        <h2 className="text-4xl font-bold text-muted-foreground">It's a Draw!</h2>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 w-full mt-8">
        {[p1, p2].map(p => (
          <div key={p.id} className="bg-card p-6 rounded-xl border border-border text-left">
            <h3 className="text-2xl font-bold mb-4">{p.name}</h3>
            <p className="text-muted-foreground mb-4">Final HP: {p.hp} | Gold: {p.gold}</p>
            <h4 className="font-bold text-sm uppercase tracking-wider mb-2">Build History</h4>
            <div className="flex flex-wrap gap-2">
              {p.upgrades.length > 0 ? p.upgrades.map((u, i) => (
                <span
                  key={`${u.id}-${i}`}
                  className={`text-xs px-2 py-1 rounded border bg-background text-glow-${u.rarity} border-border glow-${u.rarity}`}
                >
                  {u.name}
                  {u.stackCount && u.stackCount > 1 && (
                    <span className={`ml-1 font-semibold text-glow-${u.rarity} opacity-90`}>×{u.stackCount}</span>
                  )}
                </span>
              )) : (
                <span className="text-sm text-muted-foreground">No upgrades</span>
              )}
            </div>
          </div>
        ))}
      </div>

      <Button onClick={onReset} size="lg" className="w-64 font-bold text-xl mt-8" data-testid="btn-play-again">
        Play Again
      </Button>
    </motion.div>
  );
}
