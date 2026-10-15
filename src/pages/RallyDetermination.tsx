import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";

interface Props {
  p1Name: string;
  p2Name: string;
  myPlayerId: 'p1' | 'p2';
  onWinner: (winnerId: 'p1' | 'p2') => void;
  pending?: boolean; // a result was sent, waiting for the server
}

// Either player may report the result; the server accepts only the first report.
export default function RallyDetermination({ p1Name, p2Name, myPlayerId, onWinner, pending }: Props) {
  const label = (id: 'p1' | 'p2') =>
    id === myPlayerId ? 'I Won the Rally' : `${id === 'p1' ? p1Name : p2Name} Won the Rally`;
  const buttonClass =
    "flex-1 min-w-0 h-auto min-h-24 py-3 whitespace-normal break-anywhere text-xl sm:text-2xl font-bold " +
    "bg-secondary hover:bg-secondary/80 text-secondary-foreground touch-manipulation";

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col items-center justify-center min-h-screen p-4 text-center space-y-8">
      <h1 className="text-4xl font-bold text-primary tracking-tight">First Rally</h1>
      <p className="text-xl text-muted-foreground max-w-lg">Do a real-life rally to determine who goes first! Winner gets first pick and first serve.</p>

      <div className="flex flex-col sm:flex-row gap-4 w-full max-w-2xl mt-8">
        <Button onClick={() => onWinner('p1')} disabled={pending} className={buttonClass} data-testid="button-p1-won-rally">
          {label('p1')}
        </Button>
        <Button onClick={() => onWinner('p2')} disabled={pending} className={buttonClass} data-testid="button-p2-won-rally">
          {label('p2')}
        </Button>
      </div>
    </motion.div>
  );
}
