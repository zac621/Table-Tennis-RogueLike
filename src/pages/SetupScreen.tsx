import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { motion } from "framer-motion";

interface Props {
  p1Name: string;
  p2Name: string;
  onStart: (hp: number, ralliesPerRound: number) => void;
  isOnline?: boolean;
}

export default function SetupScreen({ p1Name, p2Name, onStart, isOnline }: Props) {
  const [hp, setHp] = useState(100);
  const [ralliesPerRound, setRalliesPerRound] = useState(5);

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
            Game Setup
          </CardTitle>
          <p className="text-center text-muted-foreground text-sm pt-1">
            <span className="text-foreground font-semibold">{p1Name}</span>
            {" vs "}
            <span className="text-foreground font-semibold">{p2Name}</span>
            {isOnline && (
              <span className="ml-2 text-xs text-green-400 font-bold">● Online</span>
            )}
          </p>
        </CardHeader>
        <CardContent className="space-y-8 pt-6">
          <div className="space-y-4">
            <Label className="text-muted-foreground uppercase text-xs tracking-widest flex justify-between items-center">
              <span>Starting HP</span>
              <span className="text-primary font-bold text-xl">{hp}</span>
            </Label>
            <Slider
              min={10} max={1000} step={10}
              value={[hp]} onValueChange={v => setHp(v[0])}
              data-testid="slider-hp"
            />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>10</span>
              <span>1000</span>
            </div>
          </div>

          <div className="space-y-4">
            <Label className="text-muted-foreground uppercase text-xs tracking-widest flex justify-between items-center">
              <span>Rallies per shop phase</span>
              <span className="text-primary font-bold text-xl">{ralliesPerRound}</span>
            </Label>
            <Slider
              min={1} max={20} step={1}
              value={[ralliesPerRound]} onValueChange={v => setRalliesPerRound(v[0])}
              data-testid="slider-rallies"
            />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>1</span>
              <span>20</span>
            </div>
          </div>

          <Button
            onClick={() => onStart(hp, ralliesPerRound)}
            className="w-full font-bold text-lg"
            size="lg"
            data-testid="button-start-game"
          >
            {isOnline ? "Start Online Game" : "Start Game"}
          </Button>
        </CardContent>
      </Card>
    </motion.div>
  );
}
