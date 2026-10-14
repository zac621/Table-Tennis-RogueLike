import { useState } from "react";
import { PlayerState, Upgrade } from "@/lib/types";
import { currentEffect } from "@/lib/abilityInfo";
import BottomSheet from "./BottomSheet";

interface Props {
  player: PlayerState;
  max?: number; // badges shown before "+N more"
  size?: "sm" | "md";
}

// Ability badges that open a detail sheet on tap. Works the same on phones
// and desktop (no hover required).
export default function AbilityList({ player, max = 8, size = "sm" }: Props) {
  // Track the selection by id and look it up each render, so the sheet shows the
  // live stack count (copies merge by id) and closes if the ability is gone.
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected: Upgrade | null = selectedId ? player.upgrades.find(u => u.id === selectedId) ?? null : null;
  const [expanded, setExpanded] = useState(false);
  const { upgrades } = player;

  const visible = expanded ? upgrades : upgrades.slice(0, max);
  const hidden = upgrades.length - visible.length;
  const text = size === "sm" ? "text-xs px-1.5 py-0.5" : "text-sm px-2 py-1";

  return (
    <>
      <div className="flex flex-wrap gap-1 items-center min-h-5">
        {upgrades.length === 0 && (
          <span className="text-xs text-muted-foreground italic">No upgrades yet</span>
        )}

        {visible.map((u, i) => (
          <button
            type="button"
            key={u.instanceId ?? `${u.id}-${i}`}
            onClick={() => setSelectedId(u.id)}
            aria-label={`${u.name} details`}
            className={`${text} rounded border bg-background text-glow-${u.rarity} glow-${u.rarity} select-none touch-manipulation active:scale-95 transition-transform`}
          >
            {u.name}
            {(u.stackCount ?? 1) > 1 && (
              <span className={`ml-1 font-semibold text-glow-${u.rarity} opacity-90`}>×{u.stackCount}</span>
            )}
          </button>
        ))}

        {hidden > 0 && (
          <button
            type="button"
            onClick={() => setExpanded(true)}
            className={`${text} rounded border border-muted-foreground/40 text-muted-foreground select-none touch-manipulation`}
          >
            +{hidden} more
          </button>
        )}
        {expanded && upgrades.length > max && (
          <button
            type="button"
            onClick={() => setExpanded(false)}
            className={`${text} rounded text-muted-foreground underline select-none touch-manipulation`}
          >
            show less
          </button>
        )}
      </div>

      <BottomSheet
        open={!!selected}
        onClose={() => setSelectedId(null)}
        title={selected && (
          <span className={`text-glow-${selected.rarity}`}>
            {selected.name}
            {(selected.stackCount ?? 1) > 1 && <span className="ml-1.5">×{selected.stackCount}</span>}
          </span>
        )}
      >
        {selected && (
          <div className="space-y-3 pb-2">
            <div className="flex items-center gap-2 text-xs uppercase tracking-widest">
              <span className={`px-2 py-0.5 rounded border glow-${selected.rarity} text-glow-${selected.rarity}`}>{selected.rarity}</span>
              <span className="text-muted-foreground">{player.name}</span>
            </div>
            <p className="text-base leading-relaxed">{selected.description}</p>
            {currentEffect(selected.id, player) && (
              <div className="rounded-lg bg-background border border-border px-3 py-2">
                <p className="text-xs uppercase tracking-widest text-muted-foreground mb-0.5">Right now</p>
                <p className="text-sm font-semibold">{currentEffect(selected.id, player)}</p>
              </div>
            )}
          </div>
        )}
      </BottomSheet>
    </>
  );
}
