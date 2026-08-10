import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";

interface Props {
  p1Name: string;
  p2Name: string;
  onWinner: (winnerId: 'p1' | 'p2') => void;
}

export default function RallyDetermination({ p1Name, p2Name, onWinner }: Props) {
  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col items-center justify-center min-h-screen p-4 text-center space-y-8">
      <h1 className="text-4xl font-bold text-primary tracking-tight">First Rally</h1>
      <p className="text-xl text-muted-foreground max-w-lg">Do a real-life rally to determine who goes first! Winner gets first pick and first serve.</p>
      
      <div className="flex flex-col sm:flex-row gap-4 w-full max-w-2xl mt-8">
        <Button onClick={() => onWinner('p1')} className="flex-1 h-24 text-2xl font-bold bg-secondary hover:bg-secondary/80 text-secondary-foreground" data-testid="button-p1-won-rally">
          {p1Name} Won the Rally
        </Button>
        <Button onClick={() => onWinner('p2')} className="flex-1 h-24 text-2xl font-bold bg-secondary hover:bg-secondary/80 text-secondary-foreground" data-testid="button-p2-won-rally">
          {p2Name} Won the Rally
        </Button>
      </div>
    </motion.div>
  );
}
