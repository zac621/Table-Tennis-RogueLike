import { useState } from "react";
import { GameState, PlayerId } from "../lib/types";
import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";
import { ScrollText } from "lucide-react";
import AbilityList from "@/components/game/AbilityList";
import BottomSheet from "@/components/game/BottomSheet";
import CombatLog from "@/components/game/CombatLog";
import RallyBanner from "@/components/game/RallyBanner";

interface Props {
  state: GameState;
  myPlayerId: PlayerId;
  onRematch: () => void;
  onLeave: () => void;
}

export default function GameOver({ state, myPlayerId, onRematch, onLeave }: Props) {
  const p1 = state.players.p1;
  const p2 = state.players.p2;
  const [logOpen, setLogOpen] = useState(false);

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

      {/* The finishing rally, with a link to the full log */}
      <div className="w-full max-w-lg text-left space-y-2">
        <RallyBanner result={state.lastRallyResult} players={state.players} myId={myPlayerId} onDetails={() => setLogOpen(true)} />
        <Button variant="outline" className="w-full gap-2" onClick={() => setLogOpen(true)} data-testid="btn-how-it-ended">
          <ScrollText className="w-4 h-4" /> How it ended — rally log
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 w-full mt-8">
        {[p1, p2].map(p => (
          <div key={p.id} className="bg-card p-6 rounded-xl border border-border text-left">
            <h3 className="text-2xl font-bold mb-4">{p.name}</h3>
            <p className="text-muted-foreground mb-4">Final HP: {Math.max(0, p.hp)} | Gold: {p.gold}</p>
            <h4 className="font-bold text-sm uppercase tracking-wider mb-2">Build History</h4>
            <AbilityList player={p} max={Infinity} size="md" />
          </div>
        ))}
      </div>

      <div className="flex flex-col sm:flex-row gap-4 mt-8">
        <Button onClick={onRematch} size="lg" className="w-64 font-bold text-xl" data-testid="btn-play-again">
          Rematch
        </Button>
        <Button onClick={onLeave} size="lg" variant="outline" className="w-64 font-bold text-xl" data-testid="btn-leave">
          Leave Lobby
        </Button>
      </div>
      <BottomSheet open={logOpen} onClose={() => setLogOpen(false)} title="Rally Log">
        <CombatLog rallies={state.rallyLog ?? []} players={state.players} myId={myPlayerId} />
      </BottomSheet>
    </motion.div>
  );
}
