import { useState } from "react";
import { GameState, PlayerId, PlayerState, PlayerStats } from "../lib/types";
import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";
import { Crown, ScrollText } from "lucide-react";
import AbilityList from "@/components/game/AbilityList";
import BottomSheet from "@/components/game/BottomSheet";
import CombatLog from "@/components/game/CombatLog";
import RallyBanner from "@/components/game/RallyBanner";
import { createPlayerStats } from "../../shared/engine.js";

interface Props {
  state: GameState;
  myPlayerId: PlayerId;
  onRematch: () => unknown;
  onLeave: () => void;
  rematchPending?: boolean; // our rematch vote is on its way to the server
  partnerLeft?: boolean;    // the opponent left the lobby after the game ended
}

// Left column is always the viewer, right is the opponent.
const MY_COLOR = { text: "text-sky-400", bar: "bg-sky-500" };
const OPP_COLOR = { text: "text-rose-400", bar: "bg-rose-500" };

interface Award {
  key: string;
  icon: string;
  title: string;
  stat: (s: PlayerStats) => number;
  detail: (s: PlayerStats) => string;
  tieDetail?: (value: number) => string; // when tied, don't show one player's specifics
}

const AWARDS: Award[] = [
  { key: "hit", icon: "💥", title: "Biggest Hit", stat: s => s.biggestHit,
    detail: s => `${s.biggestHit} damage${s.biggestHitCrit ? " (crit)" : ""}${s.biggestHitRally ? ` · rally ${s.biggestHitRally}` : ""}`,
    tieDetail: v => `${v} damage each` },
  { key: "dmg", icon: "🗡️", title: "Damage Dealer", stat: s => s.damageDealt, detail: s => `${s.damageDealt} total damage` },
  { key: "streak", icon: "🔥", title: "Hot Streak", stat: s => s.longestWinStreak, detail: s => `${s.longestWinStreak} wins in a row` },
  { key: "crit", icon: "🎯", title: "Sharpshooter", stat: s => s.crits, detail: s => `${s.crits} critical hit${s.crits === 1 ? "" : "s"}` },
  { key: "heal", icon: "💚", title: "Best Healer", stat: s => s.healingDone, detail: s => `${s.healingDone} HP healed` },
  { key: "block", icon: "🛡️", title: "Iron Wall", stat: s => s.damageBlocked, detail: s => `${s.damageBlocked} damage blocked` },
  { key: "dot", icon: "☠️", title: "Plague Doctor", stat: s => s.dotDamage, detail: s => `${s.dotDamage} Poison & Ignite damage` },
  { key: "phoenix", icon: "🪶", title: "Rose From the Ashes", stat: s => s.phoenixRevives, detail: s => `Revived by Phoenix ×${s.phoenixRevives}` },
  { key: "gold", icon: "💰", title: "Big Spender", stat: s => s.goldSpent, detail: s => `${s.goldSpent} gold spent` },
];

interface StatRow {
  label: string;
  value: (s: PlayerStats, p: PlayerState) => number;
  format?: (n: number, s: PlayerStats, p: PlayerState) => string;
  lowerIsBetter?: boolean;
  optional?: boolean; // hidden when both players are 0
}

const ROWS: StatRow[] = [
  { label: "Rally wins", value: s => s.rallyWins },
  { label: "Longest win streak", value: s => s.longestWinStreak },
  { label: "Damage dealt", value: s => s.damageDealt },
  { label: "Damage taken", value: s => s.damageTaken, lowerIsBetter: true },
  { label: "Biggest hit", value: s => s.biggestHit, format: (n, s) => `${n}${s.biggestHitCrit ? " 💥" : ""}` },
  { label: "Critical hits", value: s => s.crits, optional: true },
  { label: "Healing done", value: s => s.healingDone, optional: true },
  { label: "Damage blocked", value: s => s.damageBlocked, optional: true },
  { label: "Shield blocks", value: s => s.shieldsUsed, optional: true },
  { label: "Poison & Ignite dmg", value: s => s.dotDamage, optional: true },
  { label: "Thorns damage", value: s => s.thornsDamage, optional: true },
  { label: "Phoenix revives", value: s => s.phoenixRevives, optional: true },
  { label: "Gold earned", value: s => s.goldEarned },
  { label: "Gold stolen", value: s => s.goldStolen, optional: true },
  { label: "Gold spent", value: s => s.goldSpent },
  { label: "Upgrades bought", value: s => s.upgradesBought },
  { label: "Shop refreshes", value: s => s.shopRefreshes, optional: true },
  { label: "Final HP", value: (_, p) => p.hp, format: (n, _, p) => `${n} / ${p.maxHp}` },
];

function HeadToHead({ me, opp, myStats, oppStats }: { me: PlayerState; opp: PlayerState; myStats: PlayerStats; oppStats: PlayerStats }) {
  const rows = ROWS.filter(r => !r.optional || r.value(myStats, me) !== 0 || r.value(oppStats, opp) !== 0);
  return (
    <div className="bg-card border border-border rounded-xl p-4 text-left">
      <div className="flex justify-between items-end mb-2 text-sm font-bold">
        <span className={`${MY_COLOR.text} truncate`}>{me.name} <span className="font-normal text-xs">(you)</span></span>
        <span className="text-[11px] uppercase tracking-widest text-muted-foreground px-2">Head to head</span>
        <span className={`${OPP_COLOR.text} truncate text-right`}>{opp.name}</span>
      </div>
      <div className="divide-y divide-border/50">
        {rows.map(row => {
          const a = row.value(myStats, me);
          const b = row.value(oppStats, opp);
          const fmt = (n: number, s: PlayerStats, p: PlayerState) => (row.format ? row.format(n, s, p) : String(n));
          const leader = a === b ? null : (a > b) !== !!row.lowerIsBetter ? "me" : "opp";
          // Bar shows each side's share; negative values (Final HP) count as 0.
          const pa = Math.max(0, a), pb = Math.max(0, b);
          const share = pa + pb > 0 ? (pa / (pa + pb)) * 100 : 50;
          return (
            <div key={row.label} className="py-1.5">
              <div className="flex justify-between items-baseline gap-2">
                <span className={`tabular-nums ${leader === "me" ? `font-black ${MY_COLOR.text}` : "font-semibold"} ${a < 0 ? "text-red-400" : ""}`}>
                  {fmt(a, myStats, me)}
                </span>
                <span className="text-xs text-muted-foreground text-center">{row.label}</span>
                <span className={`tabular-nums text-right ${leader === "opp" ? `font-black ${OPP_COLOR.text}` : "font-semibold"} ${b < 0 ? "text-red-400" : ""}`}>
                  {fmt(b, oppStats, opp)}
                </span>
              </div>
              <div className="flex h-1 mt-1 rounded-full overflow-hidden bg-muted">
                <div className={`${MY_COLOR.bar} opacity-80`} style={{ width: `${share}%` }} />
                <div className={`${OPP_COLOR.bar} opacity-80 flex-1`} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Highlights({ players, stats, myId }: { players: Record<PlayerId, PlayerState>; stats: Record<PlayerId, PlayerStats>; myId: PlayerId }) {
  const awards = AWARDS.flatMap(a => {
    const v1 = a.stat(stats.p1), v2 = a.stat(stats.p2);
    const best = Math.max(v1, v2);
    if (best <= 0) return [];
    const winners = (["p1", "p2"] as PlayerId[]).filter(id => a.stat(stats[id]) === best);
    return [{ ...a, winners }];
  });
  if (awards.length === 0) return null;

  return (
    <div className="grid grid-cols-2 gap-2 text-left">
      {awards.map((a, i) => {
        const tie = a.winners.length > 1;
        const id = a.winners[0];
        const color = tie ? "text-foreground" : id === myId ? MY_COLOR.text : OPP_COLOR.text;
        return (
          <motion.div
            key={a.key}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 + i * 0.06 }}
            className="bg-card border border-border rounded-xl p-3"
          >
            <p className="text-[11px] uppercase tracking-widest text-muted-foreground">{a.icon} {a.title}</p>
            <p className={`font-bold truncate ${color}`}>
              {tie ? "Tie" : `${players[id].name}${id === myId ? " (you)" : ""}`}
            </p>
            <p className="text-xs text-muted-foreground leading-snug">
              {tie && a.tieDetail ? a.tieDetail(a.stat(stats[id])) : a.detail(stats[id])}
            </p>
          </motion.div>
        );
      })}
    </div>
  );
}

function PlayerCard({ player, isMe, isWinner }: { player: PlayerState; isMe: boolean; isWinner: boolean }) {
  const totalStacks = player.upgrades.reduce((n, u) => n + (u.stackCount ?? 1), 0);
  return (
    <div className={`bg-card p-4 rounded-xl border text-left space-y-3 ${isWinner ? "border-amber-500/60" : "border-border"}`}>
      <div className="flex items-center justify-between gap-2">
        <h3 className={`text-xl font-bold truncate ${isMe ? MY_COLOR.text : OPP_COLOR.text}`}>
          {player.name}{isMe && <span className="text-xs font-normal text-muted-foreground ml-1.5">(you)</span>}
        </h3>
        {isWinner && <Crown className="w-5 h-5 text-amber-400 shrink-0" />}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
        <span>
          Final HP:{" "}
          <span className={`font-bold tabular-nums ${player.hp <= 0 ? "text-red-400" : "text-green-400"}`}>{player.hp}</span>
          <span className="text-muted-foreground"> / {player.maxHp}</span>
          {player.hp < 0 && <span className="text-xs text-red-400/80 ml-1">({-player.hp} overkill)</span>}
        </span>
        <span>Gold left: <span className="font-bold text-yellow-400 tabular-nums">{player.gold}</span></span>
      </div>
      <div className="space-y-1.5">
        <h4 className="font-bold text-xs uppercase tracking-wider text-muted-foreground">
          Abilities · {player.upgrades.length} unique, {totalStacks} total
        </h4>
        <AbilityList player={player} max={Infinity} size="md" />
      </div>
    </div>
  );
}

export default function GameOver({ state, myPlayerId, onRematch, onLeave, rematchPending, partnerLeft }: Props) {
  const [logOpen, setLogOpen] = useState(false);
  const oppId: PlayerId = myPlayerId === "p1" ? "p2" : "p1";
  const me = state.players[myPlayerId];
  const opp = state.players[oppId];
  const stats = state.matchStats ?? { p1: createPlayerStats(), p2: createPlayerStats() };
  const winner = me.hp > 0 ? me : opp.hp > 0 ? opp : null;
  const ralliesPlayed = stats.p1.rallyWins + stats.p2.rallyWins;
  const iWon = winner?.id === myPlayerId;
  const myVote = !!state.rematchVotes?.[myPlayerId];
  const oppVote = !!state.rematchVotes?.[oppId];

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="min-h-screen flex flex-col items-center p-4 sm:p-6 gap-5 text-center max-w-lg mx-auto">
      <h1 className="text-5xl sm:text-6xl font-black text-destructive tracking-widest uppercase pt-4">Game Over</h1>

      {winner ? (
        <div className="space-y-1 max-w-full">
          <h2 className="text-4xl font-bold text-glow-legendary animate-pulse break-anywhere">{iWon ? "You Win!" : `${winner.name} Wins!`}</h2>
          <p className="text-muted-foreground">after {ralliesPlayed} rall{ralliesPlayed === 1 ? "y" : "ies"} · {winner.hp} / {winner.maxHp} HP left</p>
        </div>
      ) : (
        <h2 className="text-4xl font-bold text-muted-foreground">It's a Draw!</h2>
      )}

      {/* Rally score */}
      <div className="flex items-center justify-center gap-4 w-full" data-testid="final-score">
        <div className="flex-1 text-right min-w-0">
          <p className={`text-sm font-semibold truncate ${MY_COLOR.text}`}>{me.name}</p>
          <p className="text-5xl font-black tabular-nums">{stats[myPlayerId].rallyWins}</p>
        </div>
        <span className="text-3xl text-muted-foreground font-light">—</span>
        <div className="flex-1 text-left min-w-0">
          <p className={`text-sm font-semibold truncate ${OPP_COLOR.text}`}>{opp.name}</p>
          <p className="text-5xl font-black tabular-nums">{stats[oppId].rallyWins}</p>
        </div>
      </div>
      <p className="text-[11px] uppercase tracking-widest text-muted-foreground -mt-3">Rallies won</p>

      {/* The finishing rally, with a link to the full log */}
      <div className="w-full text-left space-y-2">
        <p className="text-[11px] uppercase tracking-widest text-muted-foreground">Final rally</p>
        <RallyBanner result={state.lastRallyResult} players={state.players} myId={myPlayerId} onDetails={() => setLogOpen(true)} />
        <Button variant="outline" className="w-full gap-2" onClick={() => setLogOpen(true)} data-testid="btn-how-it-ended">
          <ScrollText className="w-4 h-4" /> How it ended — rally log
        </Button>
      </div>

      <div className="w-full space-y-2" data-testid="highlights">
        <p className="text-[11px] uppercase tracking-widest text-muted-foreground text-left">Highlights</p>
        <Highlights players={state.players} stats={stats} myId={myPlayerId} />
      </div>

      <div className="w-full" data-testid="head-to-head">
        <HeadToHead me={me} opp={opp} myStats={stats[myPlayerId]} oppStats={stats[oppId]} />
      </div>

      <div className="w-full space-y-3">
        <PlayerCard player={me} isMe isWinner={winner?.id === me.id} />
        <PlayerCard player={opp} isMe={false} isWinner={winner?.id === opp.id} />
      </div>

      {/* Rematch needs both players: each tap is a vote. */}
      <div className="flex flex-col gap-3 w-full pt-2 pb-6" data-testid="rematch-area">
        {partnerLeft ? (
          <p className="rounded-xl border border-border bg-card px-4 py-3 text-sm text-muted-foreground break-anywhere">
            {opp.name} left the lobby.
          </p>
        ) : myVote ? (
          <Button size="lg" disabled className="w-full font-bold text-lg whitespace-normal h-auto min-h-11 py-2" data-testid="btn-play-again">
            Waiting for {opp.name} to accept…
          </Button>
        ) : (
          <>
            {oppVote && (
              <p className="text-sm font-semibold text-amber-400 break-anywhere">{opp.name} wants a rematch!</p>
            )}
            <Button
              onClick={onRematch}
              disabled={rematchPending}
              size="lg"
              className="w-full font-bold text-xl touch-manipulation"
              data-testid="btn-play-again"
            >
              {oppVote ? "Accept Rematch" : "Rematch"}
            </Button>
          </>
        )}
        <Button onClick={onLeave} size="lg" variant="outline" className="w-full font-bold text-xl touch-manipulation" data-testid="btn-leave">
          {partnerLeft ? "Back to Lobby" : "Leave Lobby"}
        </Button>
      </div>

      <BottomSheet open={logOpen} onClose={() => setLogOpen(false)} title="Rally Log">
        <CombatLog rallies={state.rallyLog ?? []} players={state.players} myId={myPlayerId} />
      </BottomSheet>
    </motion.div>
  );
}
