import { useState, useEffect, useRef } from "react";
import { GameState, RallyResult, Upgrade } from "../lib/types";
import { motion, AnimatePresence } from "framer-motion";
import { Coins, Trophy } from "lucide-react";

interface Props {
  state: GameState;
  myPlayerId: 'p1' | 'p2';
  onWin: (winnerId: 'p1' | 'p2') => void;
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

// ── Upgrade pills with "+N…" overflow ────────────────────────────────────────

function UpgradeList({ upgrades }: { upgrades: Upgrade[] }) {
  const [showExtra, setShowExtra] = useState(false);
  const MAX = 8;
  const visible = upgrades.slice(0, MAX);
  const extra = upgrades.slice(MAX);

  return (
    <div className="flex flex-wrap gap-1 items-center min-h-5">
      {upgrades.length === 0 && (
        <span className="text-xs text-muted-foreground italic">No upgrades yet</span>
      )}

      {/* ⭐ Visible upgrades */}
      {visible.map((u, i) => (
        <span
          key={u.instanceId ?? `${u.id}-${i}`}
          title={`${u.rarity.toUpperCase()} — ${u.description}`}
          className={`text-xs px-1.5 py-0.5 rounded border bg-background text-glow-${u.rarity} glow-${u.rarity} cursor-help select-none`}
        >
          {u.name}
          {u.stackCount && u.stackCount > 1 && (
            <span className={`ml-1 font-semibold text-glow-${u.rarity} opacity-90`}>
              ×{u.stackCount}
            </span>
          )}
        </span>
      ))}

      {/* ⭐ Overflow button */}
      {extra.length > 0 && (
        <div className="relative">
          <button
            className="text-xs px-1.5 py-0.5 rounded border border-muted-foreground/40 text-muted-foreground select-none"
            onMouseEnter={() => setShowExtra(true)}
            onMouseLeave={() => setShowExtra(false)}
            onTouchStart={(e) => { e.stopPropagation(); setShowExtra(v => !v); }}
          >
            +{extra.length}…
          </button>

          {/* ⭐ Overflow popup */}
          <AnimatePresence>
            {showExtra && (
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ duration: 0.12 }}
                className="absolute bottom-full left-0 mb-1 bg-card border border-border rounded-xl p-2 flex flex-wrap gap-1 z-50 w-56 shadow-xl"
              >
                {extra.map((u, i) => (
                  <span
                    key={u.instanceId ?? `${u.id}-${i}`}
                    title={`${u.rarity.toUpperCase()} — ${u.description}`}
                    className={`text-xs px-1.5 py-0.5 rounded border bg-background text-glow-${u.rarity} glow-${u.rarity}`}
                  >
                    {u.name}
                    {u.stackCount && u.stackCount > 1 && (
                      <span className={`ml-1 font-semibold text-glow-${u.rarity} opacity-90`}>
                        ×{u.stackCount}
                      </span>
                    )}
                  </span>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
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

// ── Main component ────────────────────────────────────────────────────────────

export default function OnlineGameScreen({ state, myPlayerId, onWin }: Props) {
  const oppId = myPlayerId === 'p1' ? 'p2' : 'p1';
  const me = state.players[myPlayerId];
  const opp = state.players[oppId];
  const iAmServing = state.servingPlayerId === myPlayerId;
  const oppServing = state.servingPlayerId === oppId;

  return (
    <div className="min-h-screen flex flex-col p-3 gap-3 max-w-lg mx-auto">

      {/* ── Top row: Rally progress + total wins ── */}
      <div className="flex items-center gap-3 pt-2">
        <div className="flex-1 text-center">
          <div className="text-base font-black text-primary uppercase tracking-widest">
            Rally {state.ralliesThisRound + 1} / {state.ralliesPerRound}
          </div>
          <div className="flex justify-center gap-1 mt-1">
            {Array.from({ length: state.ralliesPerRound }).map((_, i) => (
              <div
                key={i}
                className={`h-1.5 w-4 rounded-full transition-colors ${
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
      </div>

      {/* ── Opponent card ── */}
      <div className="bg-card border border-border rounded-xl p-3 space-y-2">
        {/* Name row */}
        <div className="flex justify-between items-center">
          <span className="font-bold text-sm truncate">{opp.name}</span>
          {oppServing && (
            <span className="text-xs font-bold uppercase tracking-wider text-primary border border-primary px-2 py-0.5 rounded shrink-0 ml-2">
              Serving
            </span>
          )}
        </div>

        {/* HP row: bar (75%) + streak */}
        <div className="flex items-center gap-3">
          <div className="w-3/4 space-y-0.5">
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>HP</span>
              <span className="tabular-nums">{opp.hp} / {opp.maxHp}</span>
            </div>
            <HpBar hp={opp.hp} maxHp={opp.maxHp} />
          </div>
          <div className="flex-1 flex justify-center">
            <StreakBadge winStreak={opp.winStreak} lossStreak={opp.lossStreak} />
          </div>
        </div>

        {/* Upgrades */}
        <UpgradeList upgrades={opp.upgrades} />
      </div>

      {/* ── My card ── */}
      <div className="bg-card border border-primary/40 rounded-xl p-3 space-y-2">
        {/* Name row */}
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

        {/* HP row */}
        <div className="flex items-center gap-3">
          <div className="w-3/4 space-y-0.5">
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>HP</span>
              <span className="tabular-nums">{me.hp} / {me.maxHp}</span>
            </div>
            <HpBar hp={me.hp} maxHp={me.maxHp} />
          </div>
          <div className="flex-1 flex justify-center">
            <StreakBadge winStreak={me.winStreak} lossStreak={me.lossStreak} />
          </div>
        </div>

        {/* Upgrades */}
        <UpgradeList upgrades={me.upgrades} />

        {/* Gold + breakdown */}
        <div className="pt-1.5 border-t border-border/40 space-y-1">
          <div className="flex items-center gap-2 text-yellow-500 font-bold text-sm">
            <Coins className="w-4 h-4" />
            <span>{me.gold} gold</span>
          </div>
          <GoldSources result={state.lastRallyResult} myId={myPlayerId} />
        </div>
      </div>

      {/* ── Score button ── */}
      <div className="flex-1 flex items-center justify-center py-3 min-h-[100px]">
        <motion.button
          whileTap={{ scale: 0.94 }}
          onClick={() => onWin(myPlayerId)}
          className="w-full max-w-sm py-7 rounded-2xl bg-primary text-primary-foreground font-black text-2xl uppercase tracking-wider shadow-xl select-none hover:brightness-110 active:brightness-90 transition-[filter]"
        >
          🏓&nbsp; I Won This Rally
        </motion.button>
      </div>
    </div>
  );
}
