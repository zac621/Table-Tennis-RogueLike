import { PlayerState } from "@/lib/types";
import { countUpgrade } from "../../../shared/engine.js";

// Ongoing effects on a player (DOTs, shields, armed Counter Strike).
export default function StatusChips({ player }: { player: PlayerState }) {
  const chips: Array<{ key: string; label: string; className: string }> = [];
  if (player.poisonTicks > 0) {
    chips.push({ key: "poison", label: `☠️ Poisoned · ${player.poisonTicks}`, className: "text-lime-300 border-lime-500/50 bg-lime-500/10" });
  }
  if (player.igniteTicks > 0) {
    chips.push({ key: "ignite", label: `🔥 Ignited · ${player.igniteTicks} · ½ healing`, className: "text-orange-300 border-orange-500/50 bg-orange-500/10" });
  }
  if (player.shield > 0) {
    chips.push({ key: "shield", label: `🛡️ Shield${player.shield > 1 ? ` ×${player.shield}` : ""}`, className: "text-sky-300 border-sky-500/50 bg-sky-500/10" });
  }
  if (player.counterStrikeActive && countUpgrade(player.upgrades, "rare-3") > 0) {
    chips.push({ key: "counter", label: "⚡ Counter ready", className: "text-yellow-300 border-yellow-500/50 bg-yellow-500/10" });
  }
  if (chips.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1">
      {chips.map(c => (
        <span key={c.key} className={`text-[11px] font-semibold px-1.5 py-0.5 rounded-full border ${c.className}`}>{c.label}</span>
      ))}
    </div>
  );
}
