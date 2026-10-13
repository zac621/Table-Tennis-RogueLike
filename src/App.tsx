import type { ReactNode } from "react";
import { motion } from "framer-motion";
import { Clock, Loader2, WifiOff } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Toaster } from "@/components/ui/toaster";
import { Button } from "@/components/ui/button";
import { useGameConnection } from "./lib/connection";
import { GameAction, PlayerId, Upgrade } from "./lib/types";

import OnlineLobbyScreen from "./pages/OnlineLobbyScreen";
import SetupScreen from "./pages/SetupScreen";
import RallyDetermination from "./pages/RallyDetermination";
import UpgradeDraft from "./pages/UpgradeDraft";
import OnlineGameScreen from "./pages/OnlineGameScreen";
import ShopPhase from "./pages/ShopPhase";
import GameOver from "./pages/GameOver";

function CenteredMessage({ icon, title, children }: { icon: ReactNode; title: string; children?: ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="min-h-screen flex flex-col items-center justify-center p-6 text-center gap-6"
    >
      {icon}
      <h2 className="text-3xl font-bold text-primary">{title}</h2>
      {children}
    </motion.div>
  );
}

export default function App() {
  const { toast } = useToast();
  const conn = useGameConnection({
    onRejected: (message) => toast({ title: "Action not allowed", description: message }),
  });
  const { status, session, gameState, partner } = conn;

  const send = (action: GameAction) => {
    const result = conn.sendAction(action);
    if (result === "offline") {
      toast({ title: "Not connected", description: "Reconnecting to the server — try again in a moment." });
    }
    return result === "sent";
  };

  const renderGame = () => {
    // No lobby yet, or the host is waiting for an opponent to join.
    if (!session || (!gameState && !partner.joined && status !== "reconnecting")) {
      return (
        <OnlineLobbyScreen
          status={status}
          lobbyCode={session?.code ?? null}
          error={conn.error}
          onCreate={conn.createLobby}
          onJoin={conn.joinLobby}
          onCancel={conn.leave}
        />
      );
    }

    if (!gameState) {
      return (
        <CenteredMessage icon={<Loader2 className="w-12 h-12 text-primary animate-spin" />} title="Reconnecting…">
          <p className="text-muted-foreground">Restoring your game <span className="font-bold tracking-widest">{session.code}</span></p>
          <Button variant="outline" onClick={conn.leave}>Leave game</Button>
        </CenteredMessage>
      );
    }

    const myId: PlayerId = session.playerId;
    const opponentName = gameState.players[myId === "p1" ? "p2" : "p1"].name;

    switch (gameState.phase) {
      case "setup":
        return myId === "p1" ? (
          <SetupScreen
            p1Name={gameState.players.p1.name}
            p2Name={gameState.players.p2.name}
            onStart={(hp, ralliesPerRound) => send({ type: "start_game", hp, ralliesPerRound })}
          />
        ) : (
          <CenteredMessage icon={<Clock className="w-12 h-12 text-primary animate-pulse" />} title="Lobby Connected!">
            <p className="text-muted-foreground text-lg">
              Waiting for <span className="text-foreground font-bold">{opponentName}</span> to configure and start the game…
            </p>
            <p className="text-xs text-muted-foreground">Code: <span className="font-bold tracking-widest">{session.code}</span></p>
          </CenteredMessage>
        );

      case "rally-determination":
        return (
          <RallyDetermination
            p1Name={gameState.players.p1.name}
            p2Name={gameState.players.p2.name}
            myPlayerId={myId}
            onWinner={(winnerId) => send({ type: "first_rally_winner", winnerId })}
          />
        );

      case "upgrade-draft":
        return (
          <UpgradeDraft
            pool={gameState.draftPool}
            draftTurn={gameState.draftTurn!}
            p1Name={gameState.players.p1.name}
            p2Name={gameState.players.p2.name}
            myPlayerId={myId}
            onSelect={(upgrade: Upgrade) => send({ type: "draft_pick", instanceId: upgrade.instanceId! })}
          />
        );

      case "battle":
        return (
          <OnlineGameScreen
            state={gameState}
            myPlayerId={myId}
            onWin={() => send({ type: "rally_win", rallyNumber: gameState.rallyNumber })}
          />
        );

      case "shop":
        return (
          <ShopPhase
            state={gameState}
            myPlayerId={myId}
            onBuy={(upgrade) => {
              if (send({ type: "shop_buy", instanceId: upgrade.instanceId! })) {
                toast({ title: "Upgrade Purchased", description: `You bought ${upgrade.name}` });
              }
            }}
            onDone={() => send({ type: "shop_done" })}
            onRefresh={() => send({ type: "shop_refresh" })}
          />
        );

      case "game-over":
        return (
          <GameOver
            state={gameState}
            myPlayerId={myId}
            onRematch={() => send({ type: "rematch" })}
            onLeave={conn.leave}
          />
        );
    }
  };

  const showReconnectOverlay = !!session && !!gameState && status !== "connected";
  const showPartnerBanner = !!gameState && status === "connected" && partner.joined && !partner.connected;

  return (
    <div className="dark bg-background text-foreground min-h-screen">
      {showPartnerBanner && (
        <div className="sticky top-0 z-40 bg-yellow-500/15 border-b border-yellow-500/40 text-yellow-300 text-sm text-center px-4 py-2 flex items-center justify-center gap-2">
          <WifiOff className="w-4 h-4 shrink-0" />
          {partner.name ?? "Your opponent"} disconnected — waiting for them to reconnect…
        </div>
      )}

      {renderGame()}

      {/* Block input while our own socket is down so taps aren't silently lost. */}
      {showReconnectOverlay && (
        <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex flex-col items-center justify-center gap-4 p-6 text-center">
          <Loader2 className="w-10 h-10 text-primary animate-spin" />
          <p className="text-xl font-bold">Connection lost — reconnecting…</p>
          <p className="text-sm text-muted-foreground">Your game is saved on the server.</p>
          <Button variant="outline" onClick={conn.leave}>Leave game</Button>
        </div>
      )}

      <Toaster />
    </div>
  );
}
