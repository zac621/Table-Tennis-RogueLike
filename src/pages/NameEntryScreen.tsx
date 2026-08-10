import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { motion } from "framer-motion";
import { Wifi } from "lucide-react";

interface Props {
  onNext: (p1: string, p2: string) => void;
  onPlayOnline: () => void;
}

export default function NameEntryScreen({ onNext, onPlayOnline }: Props) {
  const [p1Name, setP1Name] = useState("");
  const [p2Name, setP2Name] = useState("");

  const handleSubmit = () => {
    onNext(p1Name.trim() || "Player 1", p2Name.trim() || "Player 2");
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -24 }}
      transition={{ duration: 0.4 }}
      className="flex flex-col items-center justify-center min-h-screen p-4 bg-background text-foreground"
    >
      <Card className="w-full max-w-md border-border bg-card">
        <CardHeader className="pb-2">
          <CardTitle className="text-3xl font-bold text-center text-primary tracking-tight">
            Ping Pong RPG Tracker
          </CardTitle>
          <p className="text-center text-muted-foreground text-sm pt-1">
            Enter your names to begin the battle
          </p>
        </CardHeader>
        <CardContent className="space-y-6 pt-4">
          <div className="space-y-2">
            <Label htmlFor="p1" className="text-muted-foreground uppercase text-xs tracking-widest">
              Player 1 Name
            </Label>
            <Input
              id="p1"
              placeholder="Player 1"
              value={p1Name}
              onChange={e => setP1Name(e.target.value)}
              onKeyDown={e => e.key === "Enter" && document.getElementById("p2")?.focus()}
              className="bg-input border-border focus:border-primary text-lg"
              data-testid="input-p1-name"
              autoFocus
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="p2" className="text-muted-foreground uppercase text-xs tracking-widest">
              Player 2 Name
            </Label>
            <Input
              id="p2"
              placeholder="Player 2"
              value={p2Name}
              onChange={e => setP2Name(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleSubmit()}
              className="bg-input border-border focus:border-primary text-lg"
              data-testid="input-p2-name"
            />
          </div>

          <Button
            onClick={handleSubmit}
            className="w-full font-bold text-lg"
            size="lg"
            data-testid="button-continue"
          >
            Play Local
          </Button>

          <div className="relative flex items-center gap-3">
            <div className="flex-1 h-px bg-border" />
            <span className="text-xs text-muted-foreground uppercase tracking-widest">or</span>
            <div className="flex-1 h-px bg-border" />
          </div>

          <Button
            onClick={onPlayOnline}
            variant="outline"
            className="w-full font-bold text-lg gap-2"
            size="lg"
            data-testid="button-play-online"
          >
            <Wifi className="w-5 h-5 text-green-400" />
            Play Online
          </Button>

          <p className="text-center text-xs text-muted-foreground">
            Online mode connects two devices — each player uses their own phone
          </p>
        </CardContent>
      </Card>
    </motion.div>
  );
}
