import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { motion } from "framer-motion";
import { Clock, Loader2, MonitorSmartphone, WifiOff } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Toaster } from "@/components/ui/toaster";
import { Button } from "@/components/ui/button";
import { useGameConnection } from "./lib/connection";
import { GameAction, PlayerId, Upgrade } from "./lib/types";
import BottomSheet from "@/components/game/BottomSheet";

import OnlineLobbyScreen from "./pages/OnlineLobbyScreen";
import SetupScreen from "./pages/SetupScreen";
import RallyDetermination from "./pages/RallyDetermination";
import UpgradeDraft from "./pages/UpgradeDraft";
import OnlineGameScreen from "./pages/OnlineGameScreen";
import ShopPhase from "./pages/ShopPhase";
import GameOver from "./pages/GameOver";

// After the screen changes (new phase, or a new draft turn), ignore taps for a
// moment: the second tap of a double tap would otherwise land on whatever
// button now sits under the finger (a phantom rally win, a blind draft pick…).
const PHASE_TAP_GUARD_MS = 500;

function CenteredMessage({ icon, title, children }: { icon: ReactNode; title: string; children?: ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="min-h-screen flex flex-col items-center justify-center p-6 text-center gap-6"
    >
      {icon}
      <h2 className="text-3xl font-bold text-primary break-anywhere max-w-full">{title}</h2>
      {children}
    </motion.div>
  );
}

export default function App() {
  const { toast } = useToast();
  const conn = useGameConnection({
    onRejected: (message) => toast({ title: "Action not allowed", description: message }),
  });
  const { status, session, gameState, partner, inFlight } = conn;
  const [confirmQuit, setConfirmQuit] = useState(false);
  // Nothing left to quit once the game has ended for us (e.g. the opponent quit).
  useEffect(() => {
    if (!session) setConfirmQuit(false);
  }, [session]);

  // Remember who we are, so the game-over summary can stay up after the
  // opponent leaves (the session is gone by then).
  const myIdRef = useRef<PlayerId | null>(null);
  if (session) myIdRef.current = session.playerId;

  const screenKey = `${gameState?.phase ?? "none"}|${gameState?.draftTurn ?? ""}`;
  const screenChangedAtRef = useRef(0);
  useLayoutEffect(() => {
    screenChangedAtRef.current = performance.now();
  }, [screenKey]);

  const send = (action: GameAction) => {
    if (performance.now() - screenChangedAtRef.current < PHASE_TAP_GUARD_MS) return false;
    const result = conn.sendAction(action);
    if (result === "offline") {
      toast({ title: "Not connected", description: "Reconnecting to the server — try again in a moment." });
    }
    return result === "sent";
  };

  const quit = () => {
    setConfirmQuit(false);
    conn.leave();
  };

  const quitLink = (
    <div className="flex justify-center pb-6">
      <button
        type="button"
        onClick={() => setConfirmQuit(true)}
        className="text-xs text-muted-foreground underline underline-offset-4 px-3 py-2 touch-manipulation"
        data-testid="btn-quit"
      >
        Quit game
      </button>
    </div>
  );

  const renderGame = (): ReactNode => {
    // The opponent left after the game ended: keep the summary on screen.
    if (conn.partnerLeft && gameState?.phase === "game-over" && myIdRef.current) {
      return (
        <GameOver
          state={gameState}
          myPlayerId={myIdRef.current}
          partnerLeft
          onRematch={() => {}}
          onLeave={conn.leave}
        />
      );
    }

    if (status === "replaced" && session) {
      return (
        <CenteredMessage icon={<MonitorSmartphone className="w-12 h-12 text-primary" />} title="Game open elsewhere">
          <p className="text-muted-foreground">This game was opened in another tab or on another device.</p>
          <div className="flex flex-col gap-3 w-full max-w-xs">
            <Button onClick={conn.takeOver} data-testid="btn-continue-here">Continue here</Button>
            <Button variant="outline" onClick={() => setConfirmQuit(true)}>Quit game</Button>
          </div>
        </CenteredMessage>
      );
    }

    if (!session) {
      return (
        <OnlineLobbyScreen
          status={status}
          lobbyCode={null}
          error={conn.error}
          onCreate={conn.createLobby}
          onJoin={conn.joinLobby}
          onCancel={conn.cancelConnect}
        />
      );
    }

    if (!gameState) {
      // Host waiting for an opponent — only once the server has confirmed
      // nobody has joined yet (avoids flashing this screen during a reload).
      if (session.playerId === "p1" && status === "connected" && partner.known && !partner.joined) {
        return (
          <OnlineLobbyScreen
            status={status}
            lobbyCode={session.code}
            error={conn.error}
            onCreate={conn.createLobby}
            onJoin={conn.joinLobby}
            onCancel={conn.leave}
          />
        );
      }
      return (
        <CenteredMessage
          icon={<Loader2 className="w-12 h-12 text-primary animate-spin" />}
          title={status === "connected" ? "Loading game…" : "Reconnecting…"}
        >
          <p className="text-muted-foreground">Game <span className="font-bold tracking-widest">{session.code}</span></p>
          <Button variant="outline" onClick={() => setConfirmQuit(true)}>Quit game</Button>
        </CenteredMessage>
      );
    }

    const myId: PlayerId = session.playerId;
    const opponentName = gameState.players[myId === "p1" ? "p2" : "p1"].name;
    const busy = (type: GameAction["type"]) => inFlight.includes(type);

    switch (gameState.phase) {
      case "setup":
        return myId === "p1" ? (
          <>
            <SetupScreen
              p1Name={gameState.players.p1.name}
              p2Name={gameState.players.p2.name}
              pending={busy("start_game")}
              onStart={(hp, ralliesPerRound) => send({ type: "start_game", hp, ralliesPerRound })}
            />
            {quitLink}
          </>
        ) : (
          <>
            <CenteredMessage icon={<Clock className="w-12 h-12 text-primary animate-pulse" />} title="Lobby Connected!">
              <p className="text-muted-foreground text-lg break-anywhere max-w-full">
                Waiting for <span className="text-foreground font-bold">{opponentName}</span> to configure and start the game…
              </p>
              <p className="text-xs text-muted-foreground">Code: <span className="font-bold tracking-widest">{session.code}</span></p>
            </CenteredMessage>
            {quitLink}
          </>
        );

      case "rally-determination":
        return (
          <>
            <RallyDetermination
              p1Name={gameState.players.p1.name}
              p2Name={gameState.players.p2.name}
              myPlayerId={myId}
              pending={busy("first_rally_winner")}
              onWinner={(winnerId) => send({ type: "first_rally_winner", winnerId })}
            />
            {quitLink}
          </>
        );

      case "upgrade-draft":
        return (
          <>
            <UpgradeDraft
              pool={gameState.draftPool}
              draftTurn={gameState.draftTurn!}
              p1Name={gameState.players.p1.name}
              p2Name={gameState.players.p2.name}
              myPlayerId={myId}
              pending={busy("draft_pick")}
              onSelect={(upgrade: Upgrade) => send({ type: "draft_pick", instanceId: upgrade.instanceId! })}
            />
            {quitLink}
          </>
        );

      case "battle":
        return (
          <>
            <OnlineGameScreen
              state={gameState}
              myPlayerId={myId}
              onWin={() => send({ type: "rally_win", rallyNumber: gameState.rallyNumber })}
            />
            {quitLink}
          </>
        );

      case "shop":
        return (
          <>
            <ShopPhase
              state={gameState}
              myPlayerId={myId}
              refreshPending={busy("shop_refresh")}
              onBuy={(upgrade) => send({ type: "shop_buy", instanceId: upgrade.instanceId! })}
              onDone={() => send({ type: "shop_done" })}
              onRefresh={() => send({ type: "shop_refresh" })}
            />
            {quitLink}
          </>
        );

      case "game-over":
        return (
          <GameOver
            state={gameState}
            myPlayerId={myId}
            rematchPending={busy("rematch")}
            onRematch={() => send({ type: "rematch" })}
            onLeave={conn.leave}
          />
        );
    }
  };

  const showReconnectOverlay = !!session && !!gameState && (status === "reconnecting" || status === "connecting");
  const showPartnerBanner = !!gameState && status === "connected" && partner.joined && !partner.connected;

  return (
    <div className="dark bg-background text-foreground min-h-screen">
      {showPartnerBanner && (
        <div className="sticky top-0 z-40 bg-yellow-500/15 border-b border-yellow-500/40 text-yellow-300 text-sm px-4 py-2 flex items-center justify-center gap-2" data-testid="partner-banner">
          <WifiOff className="w-4 h-4 shrink-0" />
          <span className="min-w-0 break-anywhere">
            {partner.name ?? "Your opponent"} disconnected — waiting for them to reconnect…
          </span>
          <button
            type="button"
            onClick={() => setConfirmQuit(true)}
            className="shrink-0 text-xs font-semibold underline underline-offset-2 touch-manipulation"
          >
            Leave
          </button>
        </div>
      )}

      {renderGame()}

      {/* Block input while our own socket is down so taps aren't silently lost.
          Sits above bottom sheets (z-60) so it can't hide behind an open sheet. */}
      {showReconnectOverlay && (
        <div className="fixed inset-0 z-[70] bg-background/80 backdrop-blur-sm flex flex-col items-center justify-center gap-4 p-6 text-center">
          <Loader2 className="w-10 h-10 text-primary animate-spin" />
          <p className="text-xl font-bold">Connection lost — reconnecting…</p>
          <p className="text-sm text-muted-foreground">Your game is saved on the server.</p>
          <Button variant="outline" onClick={() => setConfirmQuit(true)}>Quit game</Button>
        </div>
      )}

      <BottomSheet open={confirmQuit} onClose={() => setConfirmQuit(false)} title="Quit this game?" zIndexClass="z-[80]">
        <div className="space-y-4 pb-2">
          <p className="text-muted-foreground">
            The game ends for both players and can't be resumed. Your opponent will be told you left.
          </p>
          <div className="flex flex-col gap-2">
            <Button variant="destructive" onClick={quit} data-testid="btn-confirm-quit">Quit game</Button>
            <Button variant="outline" onClick={() => setConfirmQuit(false)}>Keep playing</Button>
          </div>
        </div>
      </BottomSheet>

      <Toaster />
    </div>
  );
}
