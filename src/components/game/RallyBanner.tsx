import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ScrollText } from "lucide-react";
import { PlayerId, PlayerState, RallyResult } from "@/lib/types";

interface Props {
  result: RallyResult | null;
  players: Record<PlayerId, PlayerState>;
  myId: PlayerId;
  onDetails: () => void;
}

interface Chip { key: string; text: string; className: string }

// Short, scannable highlights of the abilities that fired this rally.
function highlightChips(r: RallyResult, players: Record<PlayerId, PlayerState>, myId: PlayerId): Chip[] {
  const chips: Chip[] = [];
  const subj = (id: PlayerId) => (id === myId ? "You" : players[id].name);   // "You gained…"
  const obj = (id: PlayerId) => (id === myId ? "you" : players[id].name);    // "…saved you"
  const poss = (id: PlayerId) => (id === myId ? "Your" : `${players[id].name}'s`);
  const has = (source: string, targetId?: PlayerId) =>
    r.combatEvents.filter(e => e.source === source && (!targetId || e.targetId === targetId));

  for (const e of has("Phoenix")) chips.push({ key: e.id, text: `🔥 Phoenix saved ${obj(e.targetId)}!`, className: "text-orange-300 border-orange-500/50" });
  for (const e of has("Shield")) chips.push({ key: e.id, text: `🛡️ Shield blocked ${e.amount}`, className: "text-sky-300 border-sky-500/50" });
  for (const e of has("Iron Defense")) chips.push({ key: e.id, text: `🛡️ Iron Defense −${e.amount}`, className: "text-sky-300 border-sky-500/50" });
  for (const e of r.combatEvents.filter(e => e.category === "special" && (e.source === "Poison" || e.source === "Ignite"))) {
    chips.push({ key: e.id, text: `${e.source === "Poison" ? "☠️" : "🔥"} ${e.source} → ${obj(e.targetId)}`, className: e.source === "Poison" ? "text-lime-300 border-lime-500/50" : "text-orange-300 border-orange-500/50" });
  }
  for (const e of has("Thorns")) chips.push({ key: e.id, text: `🌵 Thorns ${e.amount} → ${obj(e.targetId)}`, className: "text-emerald-300 border-emerald-500/50" });
  for (const e of has("Shields Up")) chips.push({ key: e.id, text: `🛡️ ${subj(e.targetId)} gained ${e.amount > 1 ? `${e.amount} shields` : "a shield"}`, className: "text-sky-300 border-sky-500/50" });
  for (const e of r.combatEvents.filter(e => e.source === "Counter Strike" && e.category === "special")) {
    chips.push({ key: e.id, text: `⚡ ${poss(e.targetId)} counter is armed`, className: "text-yellow-300 border-yellow-500/50" });
  }
  for (const id of ["p1", "p2"] as PlayerId[]) {
    if (r.healAmounts[id] > 0) chips.push({ key: `heal-${id}`, text: `💚 ${subj(id)} +${r.healAmounts[id]} HP`, className: "text-green-300 border-green-500/50" });
  }
  for (const e of has("Opportunist")) chips.push({ key: e.id, text: `🪙 ${subj(e.targetId)} stole ${e.amount}g`, className: "text-yellow-300 border-yellow-500/50" });
  return chips;
}

export default function RallyBanner({ result, players, myId, onDetails }: Props) {
  if (!result) return null;
  const iWon = result.winnerId === myId;
  const shieldBlocked = result.combatEvents.some(e => e.source === "Shield" && e.targetId === result.loserId);
  const headline = shieldBlocked
    ? `${result.loserId === myId ? "Your" : `${players[result.loserId].name}'s`} shield absorbed the hit`
    : iWon
      ? `You hit ${players[result.loserId].name} for ${result.damageDealt}`
      : `${players[result.winnerId].name} hit you for ${result.damageDealt}`;
  const chips = highlightChips(result, players, myId);
  const tone = result.isCrit
    ? "border-amber-400/70 bg-amber-500/10 shadow-[0_0_24px_rgba(245,158,11,0.35)]"
    : iWon ? "border-green-500/40 bg-green-500/5" : "border-red-500/40 bg-red-500/5";

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={result.rallyNumber}
        initial={{ opacity: 0, y: -8, scale: result.isCrit ? 0.9 : 1 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ type: "spring", bounce: result.isCrit ? 0.5 : 0, duration: 0.45 }}
        className={`rounded-xl border px-3 py-2 ${tone}`}
        data-testid="rally-banner"
      >
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            {result.isCrit && (
              <motion.p
                initial={{ scale: 1.6, rotate: -4 }}
                animate={{ scale: 1, rotate: 0 }}
                transition={{ type: "spring", bounce: 0.6, duration: 0.5 }}
                className="text-amber-400 font-black text-base min-[400px]:text-lg tracking-wider leading-tight whitespace-nowrap"
              >
                💥 CRITICAL HIT!
              </motion.p>
            )}
            <p className={`font-bold leading-tight ${iWon ? "text-green-300" : "text-red-300"}`}>{headline}</p>
          </div>
          <button
            type="button"
            onClick={onDetails}
            className="shrink-0 flex items-center gap-1 text-xs font-semibold px-2.5 py-1.5 rounded-lg border border-border bg-background touch-manipulation active:scale-95"
            data-testid="btn-rally-details"
          >
            <ScrollText className="w-3.5 h-3.5" /> Details
          </button>
        </div>
        {chips.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1.5">
            {chips.map(c => (
              <span key={c.key} className={`text-[11px] font-semibold px-1.5 py-0.5 rounded-full border bg-background/60 ${c.className}`}>{c.text}</span>
            ))}
          </div>
        )}
      </motion.div>
    </AnimatePresence>
  );
}

// Floating "−7 / +3" next to a player's HP after each rally.
export function HpDelta({ result, playerId }: { result: RallyResult | null; playerId: PlayerId }) {
  const [visible, setVisible] = useState(false);
  const key = result?.rallyNumber;
  useEffect(() => {
    if (key === undefined) return;
    setVisible(true);
    const t = setTimeout(() => setVisible(false), 3500);
    return () => clearTimeout(t);
  }, [key]);

  if (!result) return null;
  const lost = result.damageTaken[playerId];
  const healed = result.healAmounts[playerId];
  if (!lost && !healed) return null;

  return (
    <AnimatePresence>
      {visible && (
        <motion.span
          key={key}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          className="inline-flex gap-1.5 font-black tabular-nums text-sm"
        >
          {lost > 0 && <span className="text-red-400">−{lost}</span>}
          {healed > 0 && <span className="text-green-400">+{healed}</span>}
        </motion.span>
      )}
    </AnimatePresence>
  );
}
