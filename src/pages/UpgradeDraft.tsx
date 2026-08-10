import { Upgrade } from "../lib/types";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { motion } from "framer-motion";

interface Props {
  pool: Upgrade[];
  draftTurn: 'p1' | 'p2';
  p1Name: string;
  p2Name: string;
  onSelect: (upgrade: Upgrade, index: number) => void;
}

export default function UpgradeDraft({ pool, draftTurn, p1Name, p2Name, onSelect }: Props) {
  const activeName = draftTurn === 'p1' ? p1Name : p2Name;

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="min-h-screen flex flex-col items-center justify-center p-6 space-y-8">
      <div className="text-center space-y-2">
        <h2 className="text-primary text-3xl font-bold">Initial Draft</h2>
        <p className="text-xl text-muted-foreground"><span className="text-primary font-bold">{activeName}'s</span> turn to pick</p>
      </div>

      <div className="flex flex-wrap justify-center gap-6">
        {pool.map((u, i) => (
          <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} key={`${u.id}-${i}`}>
            <Card 
              className={`w-64 h-80 flex flex-col p-4 cursor-pointer hover:border-primary transition-colors bg-card border-border glow-${u.rarity}`}
              onClick={() => onSelect(u, i)}
              data-testid={`card-upgrade-${u.id}`}
            >
              <div className="flex justify-between items-start mb-4">
                <h3 className={`font-bold text-lg text-glow-${u.rarity}`}>{u.name}</h3>
              </div>
              <p className="text-muted-foreground flex-1">{u.description}</p>
              <div className="mt-auto pt-4 border-t border-border">
                <p className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">{u.rarity}</p>
              </div>
            </Card>
          </motion.div>
        ))}
      </div>
    </motion.div>
  );
}
