import { useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { CombatEvent, GoldBreakdown, PlayerId, PlayerState, RallyResult } from "@/lib/types";
import { rarityForSource } from "@/lib/abilityInfo";

interface Props {
  rallies: RallyResult[]; // oldest first (as stored); shown newest first
  players: Record<PlayerId, PlayerState>;
  myId: PlayerId;
}

type NameOf = (id: PlayerId) => string;

function Source({ source }: { source: string }) {
  const rarity = rarityForSource(source);
  return <span className={`font-semibold ${rarity ? `text-glow-${rarity}` : "text-foreground"}`}>{source}</span>;
}

function Row({ event, amount, amountClass }: { event: CombatEvent; amount?: string; amountClass?: string }) {
  return (
    <div className="flex items-start justify-between gap-3 py-1">
      <div className="min-w-0">
        <Source source={event.source} />
        <p className="text-xs text-muted-foreground leading-snug">{event.message}</p>
      </div>
      {amount && <span className={`font-bold tabular-nums whitespace-nowrap ${amountClass}`}>{amount}</span>}
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="pt-2">
      <p className="text-[11px] uppercase tracking-widest text-muted-foreground border-b border-border/60 pb-0.5 mb-0.5">{title}</p>
      {children}
    </div>
  );
}

function DamageSection({ result, targetId, nameOf, title }: { result: RallyResult; targetId: PlayerId; nameOf: NameOf; title: string }) {
  const events = result.combatEvents.filter(e => e.targetId === targetId && (e.category === "damage" || e.category === "mitigation"));
  if (events.length === 0) return null;
  return (
    <Section title={title}>
      {events.map(e => e.category === "damage"
        ? <Row key={e.id} event={e} amount={`+${e.amount}`} amountClass="text-red-400" />
        : <Row key={e.id} event={e} amount={`−${e.amount}`} amountClass="text-sky-400" />)}
      <div className="flex justify-between items-center pt-1 mt-0.5 border-t border-border/60 text-sm">
        <span className="font-semibold">{nameOf(targetId)} lost</span>
        <span className="font-black text-red-400 tabular-nums">{result.damageTaken[targetId]} HP</span>
      </div>
    </Section>
  );
}

function goldDetail(g: GoldBreakdown) {
  const parts = [`${g.base} base`];
  if (g.winStreakBonus) parts.push(`${g.winStreakBonus} win streak`);
  if (g.lossStreakBonus) parts.push(`${g.lossStreakBonus} loss streak`);
  if (g.interest) parts.push(`${g.interest} interest`);
  for (const s of g.upgradeSources) parts.push(`${s.amount < 0 ? `−${-s.amount}` : s.amount} ${s.name}`);
  return parts.join(" · ");
}

function RallyDetail({ result, nameOf }: { result: RallyResult; nameOf: NameOf }) {
  const heals = result.combatEvents.filter(e => e.category === "heal");
  const specials = result.combatEvents.filter(e => e.category === "special");
  const ids: PlayerId[] = [result.winnerId, result.loserId];

  return (
    <div className="pb-2">
      <DamageSection result={result} targetId={result.loserId} nameOf={nameOf} title={`Hit on ${nameOf(result.loserId)}`} />
      <DamageSection result={result} targetId={result.winnerId} nameOf={nameOf} title={`Damage to ${nameOf(result.winnerId)}`} />

      {heals.length > 0 && (
        <Section title="Healing">
          {heals.map(e => (
            <Row key={e.id} event={{ ...e, message: `${nameOf(e.targetId)} · ${e.message}` }} amount={`+${e.amount} HP`} amountClass="text-green-400" />
          ))}
        </Section>
      )}

      {specials.length > 0 && (
        <Section title="Effects">
          {specials.map(e => (
            <Row key={e.id} event={{ ...e, message: `${nameOf(e.targetId)} · ${e.message}` }} />
          ))}
        </Section>
      )}

      <Section title="Gold">
        {ids.map(id => (
          <div key={id} className="flex items-start justify-between gap-3 py-1">
            <div className="min-w-0">
              <span className="font-semibold">{nameOf(id)}</span>
              <p className="text-xs text-muted-foreground leading-snug">{goldDetail(result.goldEarned[id])}</p>
            </div>
            <span className={`font-bold tabular-nums ${result.goldEarned[id].total < 0 ? "text-red-400" : "text-yellow-400"}`}>
              {result.goldEarned[id].total < 0 ? `−${-result.goldEarned[id].total}` : `+${result.goldEarned[id].total}`}g
            </span>
          </div>
        ))}
      </Section>
    </div>
  );
}

export default function CombatLog({ rallies, players, myId }: Props) {
  const ordered = [...rallies].reverse();
  const [openKey, setOpenKey] = useState<number | null>(ordered[0]?.rallyNumber ?? null);
  const nameOf: NameOf = id => (id === myId ? "You" : players[id].name);

  if (ordered.length === 0) {
    return <p className="text-muted-foreground text-sm py-6 text-center">No rallies played yet.</p>;
  }

  return (
    <div className="divide-y divide-border">
      {ordered.map((r, i) => {
        const key = r.rallyNumber ?? -i;
        const open = openKey === key;
        const iWon = r.winnerId === myId;
        const blocked = r.combatEvents.some(e => e.source === "Shield" && e.targetId === r.loserId);
        return (
          <div key={key} className="py-2">
            <button
              type="button"
              onClick={() => setOpenKey(open ? null : key)}
              className="w-full flex items-center justify-between gap-2 text-left touch-manipulation"
              aria-expanded={open}
            >
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">Rally {r.rallyNumber ?? "?"}{i === 0 ? " · latest" : ""}</p>
                <p className="font-bold truncate">
                  <span className={iWon ? "text-green-400" : "text-red-400"}>{iWon ? "You" : players[r.winnerId].name}</span>
                  {" hit "}{r.loserId === myId ? "you" : players[r.loserId].name}
                  {blocked ? <span className="text-sky-300"> · 🛡️ blocked</span> : <>{" for "}<span className="tabular-nums">{r.damageDealt}</span></>}
                  {r.isCrit && <span className="ml-1.5 text-amber-400">💥 CRIT</span>}
                </p>
              </div>
              <ChevronDown className={`w-5 h-5 shrink-0 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
            </button>
            {open && <RallyDetail result={r} nameOf={nameOf} />}
          </div>
        );
      })}
    </div>
  );
}
