import { useState, useEffect, useRef } from "react";
import { GameState, PlayerState, RallyResult } from "../lib/types";
import { motion, AnimatePresence } from "framer-motion";
import { Coins, ScrollText, Trophy } from "lucide-react";
import AbilityList from "@/components/game/AbilityList";
import StatusChips from "@/components/game/StatusChips";
import RallyBanner, { HpDelta } from "@/components/game/RallyBanner";
import BottomSheet from "@/components/game/BottomSheet";
import CombatLog from "@/components/game/CombatLog";

interface Props {
  state: GameState;
  myPlayerId: 'p1' | 'p2';
  onWin: () => void;
}

// ── HP Bar ────────────────────────────────────────────────────────────────────

function HpBar({ hp, maxHp }: { hp: number; maxHp: number }) {
  const pct = Math.max(0, Math.min(100, (hp / maxHp) * 100));
  const color = pct > 50 ? "bg-green-500" : pct > 25 ? "bg-yellow-500" : "bg-red-500";
  return (
    <div className="h-4 bg-muted rounded-full overflow-hidden">
      <motion.div
        className={`h-full rounded-full ${color}`}
        animate={{ width: `${pct}%` }}
        transition={{ type: "spring", bounce: 0, duration: 0.5 }}
      />
    </div>
  );
}

// ── Streak badge (win XOR loss) ───────────────────────────────────────────────

function StreakBadge({ winStreak, lossStreak }: { winStreak: number; lossStreak: number }) {
  if (winStreak > 0)
    return <span className="font-black text-green-400 text-lg leading-none tabular-nums">{winStreak}W</span>;
  if (lossStreak > 0)
    return <span className="font-black text-red-400 text-lg leading-none tabular-nums">{lossStreak}L</span>;
  return <span className="text-muted-foreground text-sm">—</span>;
}

// ── Gold source breakdown (fades 3 s after each rally) ───────────────────────

function GoldSources({ result, myId }: { result: RallyResult | null; myId: 'p1' | 'p2' }) {
  const [visible, setVisible] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(false);

  useEffect(() => {
    // skip the initial mount so we don't flash stale data
    if (!mountedRef.current) { mountedRef.current = true; return; }
    if (!result) return;
    setVisible(true);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setVisible(false), 3000);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [result]);

  if (!result) return null;

  const g = result.goldEarned[myId];
  const sources: Array<{ label: string; amount: number }> = [];
  if (g.base) sources.push({ label: 'Base', amount: g.base });
  if (g.winStreakBonus) sources.push({ label: 'Win Streak', amount: g.winStreakBonus });
  if (g.lossStreakBonus) sources.push({ label: 'Loss Streak', amount: g.lossStreakBonus });
  if (g.interest) sources.push({ label: 'Interest', amount: g.interest });
  for (const src of (g.upgradeSources ?? [])) {
    sources.push({ label: src.name, amount: src.amount });
  }

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="flex flex-wrap gap-x-3 gap-y-0.5"
        >
          {sources.map(s => (
            <span key={s.label} className="text-yellow-400 text-xs font-semibold">
              +{s.amount} {s.label}
            </span>
          ))}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ── HP row: bar + numbers + floating delta + streak ──────────────────────────

function HpRow({ player, result }: { player: PlayerState; result: RallyResult | null }) {
  return (
    <div className="flex items-center gap-3">
      <div className="w-3/4 space-y-0.5">
        <div className="flex justify-between items-center text-xs text-muted-foreground">
          <span className="flex items-center gap-2">HP <HpDelta result={result} playerId={player.id} /></span>
          <span className="tabular-nums">{Math.max(0, player.hp)} / {player.maxHp}</span>
        </div>
        <HpBar hp={player.hp} maxHp={player.maxHp} />
      </div>
      <div className="flex-1 flex justify-center">
        <StreakBadge winStreak={player.winStreak} lossStreak={player.lossStreak} />
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function OnlineGameScreen({ state, myPlayerId, onWin }: Props) {
  const oppId = myPlayerId === 'p1' ? 'p2' : 'p1';
  const me = state.players[myPlayerId];
  const opp = state.players[oppId];
  const iAmServing = state.servingPlayerId === myPlayerId;
  const oppServing = state.servingPlayerId === oppId;
  const result = state.lastRallyResult;
  const [logOpen, setLogOpen] = useState(false);

  // Lock the button after a tap until the server confirms the rally (the
  // rally number changes). The server also rejects duplicate claims.
  const [claimedRally, setClaimedRally] = useState<number | null>(null);
  const waitingForServer = claimedRally === state.rallyNumber;
  useEffect(() => {
    if (!waitingForServer) return;
    const t = setTimeout(() => setClaimedRally(null), 4000);
    return () => clearTimeout(t);
  }, [waitingForServer]);

  // Buzz on big moments (Android; iOS Safari ignores vibrate).
  useEffect(() => {
    if (!result) return;
    const big = result.isCrit || result.combatEvents.some(e => e.source === "Phoenix");
    if (big) navigator.vibrate?.([60, 40, 120]);
  }, [result?.rallyNumber]);

  return (
    <div className="min-h-screen flex flex-col p-3 gap-3 max-w-lg mx-auto">

      {/* ── Top row: Rally progress + total wins + log ── */}
      <div className="flex items-center gap-2 pt-2">
        <div className="flex-1 min-w-0 text-center">
          <div className="text-base font-black text-primary uppercase tracking-widest">
            Rally {state.ralliesThisRound + 1} / {state.ralliesPerRound}
          </div>
          {/* Dots shrink to fit so long rounds (up to 20 rallies) never widen the page */}
          <div className="flex justify-center gap-0.5 sm:gap-1 mt-1">
            {Array.from({ length: state.ralliesPerRound }).map((_, i) => (
              <div
                key={i}
                className={`h-1.5 flex-1 max-w-4 min-w-0.5 rounded-full transition-colors ${
                  i < state.ralliesThisRound ? 'bg-primary' : 'bg-muted'
                }`}
              />
            ))}
          </div>
        </div>
        <div className="bg-card border border-border rounded-lg px-2.5 py-1.5 shrink-0 flex items-center gap-1.5">
          <Trophy className="w-3.5 h-3.5 text-yellow-500" />
          <span className="text-sm font-bold tabular-nums">
            {state.players.p1.totalWins}
            <span className="text-muted-foreground mx-1">—</span>
            {state.players.p2.totalWins}
          </span>
        </div>
        <button
          type="button"
          onClick={() => setLogOpen(true)}
          aria-label="Rally log"
          className="bg-card border border-border rounded-lg p-2 shrink-0 touch-manipulation active:scale-95"
          data-testid="btn-rally-log"
        >
          <ScrollText className="w-4 h-4" />
        </button>
      </div>

      {/* ── Last rally summary ── */}
      <RallyBanner result={result} players={state.players} myId={myPlayerId} onDetails={() => setLogOpen(true)} />

      {/* ── Opponent card ── */}
      <div className="bg-card border border-border rounded-xl p-3 space-y-2" data-testid="opponent-card">
        <div className="flex justify-between items-center">
          <span className="font-bold text-sm truncate">{opp.name}</span>
          {oppServing && (
            <span className="text-xs font-bold uppercase tracking-wider text-primary border border-primary px-2 py-0.5 rounded shrink-0 ml-2">
              Serving
            </span>
          )}
        </div>
        <HpRow player={opp} result={result} />
        <StatusChips player={opp} />
        <AbilityList player={opp} />
      </div>

      {/* ── My card ── */}
      <div className="bg-card border border-primary/40 rounded-xl p-3 space-y-2" data-testid="my-card">
        <div className="flex justify-between items-center">
          <span className="font-bold text-sm">
            {me.name}
            <span className="ml-1.5 text-xs text-primary font-normal">(you)</span>
          </span>
          {iAmServing && (
            <span className="text-xs font-bold uppercase tracking-wider text-primary border border-primary px-2 py-0.5 rounded shrink-0 ml-2">
              Serving
            </span>
          )}
        </div>
        <HpRow player={me} result={result} />
        <StatusChips player={me} />
        <AbilityList player={me} />

        {/* Gold + breakdown */}
        <div className="pt-1.5 border-t border-border/40 space-y-1">
          <div className="flex items-center gap-2 text-yellow-500 font-bold text-sm">
            <Coins className="w-4 h-4" />
            <span>{me.gold} gold</span>
          </div>
          <GoldSources result={result} myId={myPlayerId} />
        </div>
      </div>

      {/* ── Score button ── */}
      <div className="flex-1 flex items-center justify-center py-3 min-h-[100px]">
        <motion.button
          whileTap={waitingForServer ? undefined : { scale: 0.94 }}
          disabled={waitingForServer}
          onClick={() => {
            if (waitingForServer) return;
            setClaimedRally(state.rallyNumber);
            onWin();
          }}
          className="w-full max-w-sm py-7 rounded-2xl bg-primary text-primary-foreground font-black text-2xl uppercase tracking-wider shadow-xl select-none hover:brightness-110 active:brightness-90 transition-[filter] disabled:opacity-60"
        >
          🏓&nbsp; I Won This Rally
        </motion.button>
      </div>

      <BottomSheet open={logOpen} onClose={() => setLogOpen(false)} title="Rally Log">
        <CombatLog rallies={state.rallyLog ?? []} players={state.players} myId={myPlayerId} />
      </BottomSheet>
    </div>
  );
}
