import { Upgrade } from "../lib/types";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { motion } from "framer-motion";

interface Props {
  pool: Upgrade[];
  draftTurn: 'p1' | 'p2';
  p1Name: string;
  p2Name: string;
  myPlayerId?: 'p1' | 'p2';
  onSelect: (upgrade: Upgrade, index: number) => void;
}

export default function UpgradeDraft({ pool, draftTurn, p1Name, p2Name, myPlayerId, onSelect }: Props) {
  const activeName = draftTurn === 'p1' ? p1Name : p2Name;
  const isMyTurn = !myPlayerId || myPlayerId === draftTurn;

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="min-h-screen flex flex-col items-center justify-center p-6 space-y-8">
      <div className="text-center space-y-2">
        <h2 className="text-primary text-3xl font-bold">Initial Draft</h2>
        <p className="text-xl text-muted-foreground"><span className="text-primary font-bold">{activeName}'s</span> turn to pick</p>
      </div>

      <div className="flex flex-col items-center gap-4">
        {myPlayerId && !isMyTurn && (
          <div className="rounded-xl border border-border bg-surface px-4 py-3 text-sm text-muted-foreground">
            Waiting for <span className="font-semibold text-foreground">{activeName}</span> to pick their first ability.
          </div>
        )}
        <div className="flex flex-wrap justify-center gap-6 w-full items-center">


          {pool.map((u, i) => {
            const disabled = myPlayerId != null && !isMyTurn;
            return (
              <motion.div
                whileHover={{ scale: disabled ? 1 : 1.05 }}
                whileTap={{ scale: disabled ? 1 : 0.95 }}
                key={`${u.id}-${i}`}
              >
                <Card
                  className={`relative w-56 h-35 flex flex-col p-4 ${disabled ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer hover:border-primary'} transition-colors bg-card border-border glow-${u.rarity}`}
                  onClick={() => !disabled && onSelect(u, i)}
                  data-testid={`card-upgrade-${u.id}`}
                >
                  <div className="flex justify-between items-start mb-4">
                    <h3 className={`font-bold text-lg text-glow-${u.rarity}`}>{u.name}</h3>
                  </div>

                  <p className="text-muted-foreground flex-1">{u.description}</p>

                  <div className="mt-auto pt-4 border-t border-border">
                    <p className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
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
                </Card>

              </motion.div>
            );
          })}
        </div>
      </div>
    </motion.div>
  );
}
