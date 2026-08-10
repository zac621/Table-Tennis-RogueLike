import { useState, useRef, useEffect, useCallback } from "react";
import { GameState, PlayerState, Upgrade } from "./lib/types";
import { drawUpgrades, resolveRally } from "./lib/gameLogic";
import { buildWsUrl } from "@/lib/websocket";
import { hasUpgrade, countUpgrade, applyUpgradeCombining } from "./lib/upgrades";
import { useToast } from "@/hooks/use-toast";
import { motion } from "framer-motion";
import { Clock } from "lucide-react";

import NameEntryScreen from "./pages/NameEntryScreen";
import SetupScreen from "./pages/SetupScreen";
import RallyDetermination from "./pages/RallyDetermination";
import UpgradeDraft from "./pages/UpgradeDraft";
import GameScreen from "./pages/GameScreen";
import OnlineGameScreen from "./pages/OnlineGameScreen";
import ShopPhase from "./pages/ShopPhase";
import GameOver from "./pages/GameOver";
import OnlineLobbyScreen from "./pages/OnlineLobbyScreen";

// suppress unused import warning — hasUpgrade is used indirectly via gameLogic
void hasUpgrade;

const initialPlayerState = (id: "p1" | "p2", name: string, maxHp: number): PlayerState => ({
  id, name, maxHp, hp: maxHp,
  gold: 5,
  winStreak: 0, lossStreak: 0, totalWins: 0,
  upgrades: [],
  counterStrikeActive: false,
  vampireOverflow: 0,
});

function buildExcludeList(upgrades: Upgrade[]): string[] {
  const exclude: string[] = [];

  if (upgrades.some(u => u.id === 'rare-5')) exclude.push('rare-5');
  if (upgrades.some(u => u.id === 'epic-3')) exclude.push('epic-3');
  if (countUpgrade(upgrades, 'rare-6') >= 5) exclude.push('rare-6');

  const shopDiscount = countUpgrade(upgrades, 'common-5') + countUpgrade(upgrades, 'legendary-3') * 3;
  if (shopDiscount >= 17) exclude.push('common-5', 'legendary-3');

  return exclude;
}

const makeInitialState = (): GameState => ({
  phase: "name-entry",
  players: {
    p1: initialPlayerState("p1", "Player 1", 100),
    p2: initialPlayerState("p2", "Player 2", 100),
  },
  servingPlayerId: null,
  rallyNumber: 1,
  ralliesPerRound: 5,
  ralliesThisRound: 0,
  lastRallyResult: null,
  roundGoldTotals: { p1: 0, p2: 0 },
  draftPool: [],
  draftTurn: null,
  shopPool: { p1: [], p2: [] },
  shopState: { p1Done: false, p2Done: false },
});

interface OnlineSession {
  myPlayerId: "p1" | "p2";
  lobbyCode: string;
  partnerName: string;
  sessionToken: string;
}

export default function App() {
  const { toast } = useToast();
  const [gameState, setGameState] = useState<GameState>(makeInitialState());
  const [onlineSession, setOnlineSession] = useState<OnlineSession | null>(null);
  const [ws, setWs] = useState<WebSocket | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const manualCloseRef = useRef(false);
  const reconnectAttemptsRef = useRef(0);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearReconnectTimer = () => {
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    reconnectAttemptsRef.current = 0;
  };

  // Broadcast current state to online partner (reads wsRef so never stale)
  const broadcast = useCallback((state: GameState) => {
    const sock = wsRef.current;
    if (sock && sock.readyState === WebSocket.OPEN) {
      sock.send(JSON.stringify({ type: "state_update", state }));
    }
  }, []);

  // Listen for incoming state from partner
  useEffect(() => {
    if (!ws) return;
    const handler = (event: MessageEvent) => {
      const msg = JSON.parse(event.data as string) as { type: string; state?: GameState };
      if (msg.type === "state_update" && msg.state) {
        const received = msg.state;
        setGameState(prev => {
          // Monotonic merge for shop done-flags: once a player is marked done, never unmark them.
          // This prevents a stale broadcast from the opponent overwriting our own done flag.
          if (prev.phase === "shop" && received.phase === "shop") {
            const p1Done = prev.shopState.p1Done || received.shopState.p1Done;
            const p2Done = prev.shopState.p2Done || received.shopState.p2Done;
            const merged: GameState = { ...received, shopState: { p1Done, p2Done } };
            // Both done: transition to battle
            if (p1Done && p2Done) {
              return {
                ...merged,
                phase: "battle",
                lastRallyResult: null,
                roundGoldTotals: { p1: 0, p2: 0 },
              };
            }
            return merged;
          }
          return received;
        });
      } else if (msg.type === "partner_left" || msg.type === "partner_disconnected") {
        toast({ title: "Opponent Disconnected", description: "Your partner has disconnected." });
      } else if (msg.type === "reconnect_success") {
        toast({ title: "Reconnected", description: "Your online game connection has been restored." });
      }
    };
    const closeHandler = () => {
      if (manualCloseRef.current) return;
      if (!onlineSession?.sessionToken || !onlineSession?.lobbyCode) return;
      reconnectAttemptsRef.current += 1;
      const delay = Math.min(5000, 1000 * reconnectAttemptsRef.current);
      reconnectTimerRef.current = setTimeout(() => {
        const socket = new WebSocket(buildWsUrl());
        socket.onopen = () => {
          reconnectAttemptsRef.current = 0;
          socket.send(JSON.stringify({
            type: "reconnect",
            code: onlineSession.lobbyCode,
            sessionToken: onlineSession.sessionToken,
          }));
          wsRef.current = socket;
          setWs(socket);
        };
        socket.onerror = () => {
          toast({ title: "Reconnect Failed", description: "Trying again..." });
        };
        socket.onclose = () => {
          if (reconnectAttemptsRef.current < 5) return;
          toast({ title: "Connection Lost", description: "Could not restore your online game." });
        };
      }, delay);
    };

    ws.addEventListener("message", handler);
    ws.addEventListener("close", closeHandler);
    return () => {
      ws.removeEventListener("message", handler);
      ws.removeEventListener("close", closeHandler);
    };
  }, [ws, toast, onlineSession]);

  // ─── Online lobby ──────────────────────────────────────────────────────────

  const handlePlayOnline = () => {
    manualCloseRef.current = false;
    clearReconnectTimer();
    setGameState(prev => ({ ...prev, phase: "online-lobby" }));
  };

  const handleOnlineReady = (
    socket: WebSocket,
    myPlayerId: "p1" | "p2",
    myName: string,
    partnerName: string,
    lobbyCode: string,
    sessionToken: string
  ) => {
    wsRef.current = socket;
    setWs(socket);
    setOnlineSession({ myPlayerId, lobbyCode, partnerName, sessionToken });
    clearReconnectTimer();

    const p1Name = myPlayerId === "p1" ? myName : partnerName;
    const p2Name = myPlayerId === "p2" ? myName : partnerName;

    setGameState(prev => ({
      ...prev,
      // Host (p1) proceeds to setup; guest (p2) waits in online-lobby for host to broadcast state
      phase: myPlayerId === "p1" ? "setup" : "online-lobby",
      players: {
        p1: { ...prev.players.p1, name: p1Name },
        p2: { ...prev.players.p2, name: p2Name },
      },
    }));
  };

  const handleBackToLocal = () => {
    manualCloseRef.current = true;
    wsRef.current?.close();
    wsRef.current = null;
    setWs(null);
    setOnlineSession(null);
    clearReconnectTimer();
    setGameState(prev => ({ ...prev, phase: "name-entry" }));
  };

  // ─── Local name entry ──────────────────────────────────────────────────────

  const handleNamesEntered = (p1Name: string, p2Name: string) => {
    setGameState(prev => ({
      ...prev,
      phase: "setup",
      players: {
        p1: { ...prev.players.p1, name: p1Name },
        p2: { ...prev.players.p2, name: p2Name },
      },
    }));
  };

  // ─── Setup ─────────────────────────────────────────────────────────────────

  const handleStartSetup = (hp: number, ralliesPerRound: number) => {
    setGameState(prev => {
      const newState: GameState = {
        ...prev,
        phase: "rally-determination",
        ralliesPerRound,
        players: {
          p1: initialPlayerState("p1", prev.players.p1.name, hp),
          p2: initialPlayerState("p2", prev.players.p2.name, hp),
        },
      };
      broadcast(newState);
      return newState;
    });
  };

  // ─── Rally determination ───────────────────────────────────────────────────

  const handleRallyWinner = (winnerId: "p1" | "p2") => {
    setGameState(prev => {
      const newState: GameState = {
        ...prev,
        servingPlayerId: winnerId,
        phase: "upgrade-draft",
        draftTurn: winnerId,
        draftPool: drawUpgrades(3, Date.now(), "legendary"),
      };
      broadcast(newState);
      return newState;
    });
  };

  // ─── Upgrade draft ─────────────────────────────────────────────────────────

  const handleDraftSelect = (upgrade: Upgrade, index: number) => {
    setGameState(prev => {
      const isP1 = prev.draftTurn === "p1";
      const activeId = isP1 ? "p1" : "p2";
      const newPlayers = { ...prev.players };
      newPlayers[activeId] = {
        ...newPlayers[activeId],
        // Apply combining after adding (handles cascading promotions automatically)
        upgrades: applyUpgradeCombining([...newPlayers[activeId].upgrades, upgrade]),
      };
      const newPool = prev.draftPool.filter((_, i) => i !== index);

      const newState: GameState = isP1
        ? { ...prev, players: newPlayers, draftTurn: "p2", draftPool: newPool }
        : { ...prev, players: newPlayers, phase: "battle" };

      broadcast(newState);
      return newState;
    });
  };

  // ─── Battle (rally-based) ──────────────────────────────────────────────────

  const handleBattleWin = (winnerId: "p1" | "p2") => {
    setGameState(prev => {
      const loserId = winnerId === "p1" ? "p2" : "p1";
      const { winner, loser, result } = resolveRally(prev.players[winnerId], prev.players[loserId]);

      const newPlayers = { ...prev.players };
      newPlayers[winnerId] = winner;
      newPlayers[loserId] = loser;

      const newRallyNumber = prev.rallyNumber + 1;
      const newRalliesThisRound = prev.ralliesThisRound + 1;
      const newServing: "p1" | "p2" = prev.servingPlayerId === "p1" ? "p2" : "p1";

      // Check game-over (hp ≤ 0 after Phoenix resolution)
      if (newPlayers.p1.hp <= 0 || newPlayers.p2.hp <= 0) {
        const newState: GameState = { ...prev, players: newPlayers, lastRallyResult: result, phase: "game-over" };
        broadcast(newState);
        return newState;
      }

      // Eternal Flame (legendary-4): +2 HP per copy after every rally
      const ef1 = countUpgrade(newPlayers.p1.upgrades, "legendary-4") * 2;
      if (ef1 > 0) newPlayers.p1 = { ...newPlayers.p1, hp: Math.min(newPlayers.p1.maxHp, newPlayers.p1.hp + ef1) };
      const ef2 = countUpgrade(newPlayers.p2.upgrades, "legendary-4") * 2;
      if (ef2 > 0) newPlayers.p2 = { ...newPlayers.p2, hp: Math.min(newPlayers.p2.maxHp, newPlayers.p2.hp + ef2) };

      const fullResult = ef1 > 0 || ef2 > 0 ? {
        ...result,
        healAmounts: { p1: result.healAmounts.p1 + ef1, p2: result.healAmounts.p2 + ef2 },
      } : result;

      const newRoundGoldTotals: Record<"p1" | "p2", number> = {
        p1: prev.roundGoldTotals.p1 + result.goldEarned.p1.total,
        p2: prev.roundGoldTotals.p2 + result.goldEarned.p2.total,
      };

      const goToShop = newRalliesThisRound >= prev.ralliesPerRound;

      let newState: GameState;
      if (goToShop) {
        const p1Exclude = buildExcludeList(newPlayers.p1.upgrades);
        const p2Exclude = buildExcludeList(newPlayers.p2.upgrades);
        newState = {
          ...prev,
          players: newPlayers,
          lastRallyResult: fullResult,
          roundGoldTotals: newRoundGoldTotals,
          rallyNumber: newRallyNumber,
          ralliesThisRound: 0,
          servingPlayerId: newServing,
          phase: "shop",
          shopState: { p1Done: false, p2Done: false },
          shopPool: {
            p1: drawUpgrades(3, Date.now(), null, p1Exclude),
            p2: drawUpgrades(3, Date.now() + 1, null, p2Exclude),
          },
        };
      } else {
        newState = {
          ...prev,
          players: newPlayers,
          lastRallyResult: fullResult,
          roundGoldTotals: newRoundGoldTotals,
          rallyNumber: newRallyNumber,
          ralliesThisRound: newRalliesThisRound,
          servingPlayerId: newServing,
          phase: "battle",
        };
      }

      broadcast(newState);
      return newState;
    });
  };

  // ─── Shop ──────────────────────────────────────────────────────────────────

  const handleShopBuy = (playerId: "p1" | "p2", upgrade: Upgrade) => {
    setGameState(prev => {
      const newPlayers = { ...prev.players };
      const player = { ...newPlayers[playerId] };

      const discountCount =
        countUpgrade(player.upgrades, "common-5") +
        countUpgrade(player.upgrades, "legendary-3") * 3;
      const finalCost = Math.max(1, upgrade.cost - discountCount);

      if (player.gold < finalCost) return prev;

      player.gold -= finalCost;
      // Apply combining after adding — combined upgrades retain full stack power
      player.upgrades = applyUpgradeCombining([...player.upgrades, upgrade]);
      newPlayers[playerId] = player;

      const newPool = upgrade.instanceId
        ? prev.shopPool[playerId].filter(u => u.instanceId !== upgrade.instanceId)
        : prev.shopPool[playerId].filter(u => u !== upgrade);

      toast({ title: "Upgrade Purchased", description: `${player.name} bought ${upgrade.name}` });

      const newState: GameState = {
        ...prev,
        players: newPlayers,
        shopPool: { ...prev.shopPool, [playerId]: newPool },
      };
      broadcast(newState);
      return newState;
    });
  };

  const handleShopDone = (playerId: "p1" | "p2") => {
    setGameState(prev => {
      const newShopState = { ...prev.shopState };
      if (playerId === "p1") newShopState.p1Done = true;
      else newShopState.p2Done = true;

      let newState: GameState;
      if (newShopState.p1Done && newShopState.p2Done) {
        if (prev.players.p1.hp <= 0 || prev.players.p2.hp <= 0) {
          newState = { ...prev, shopState: newShopState, phase: "game-over" };
        } else {
          newState = {
            ...prev,
            shopState: newShopState,
            phase: "battle",
            lastRallyResult: null,
            roundGoldTotals: { p1: 0, p2: 0 },
          };
        }
      } else {
        newState = { ...prev, shopState: newShopState };
      }

      broadcast(newState);
      return newState;
    });
  };

  const handleShopRefresh = (playerId: "p1" | "p2") => {
    setGameState(prev => {
      const player = prev.players[playerId];
      if (player.gold < 5) return prev;

      const exclude = buildExcludeList(player.upgrades);
      const newState: GameState = {
        ...prev,
        players: {
          ...prev.players,
          [playerId]: { ...player, gold: player.gold - 5 },
        },
        shopPool: {
          ...prev.shopPool,
          [playerId]: drawUpgrades(3, Date.now(), null, exclude),
        },
      };
      broadcast(newState);
      return newState;
    });
  };

  // ─── Reset ─────────────────────────────────────────────────────────────────

  const resetGame = () => {
    manualCloseRef.current = true;
    wsRef.current?.close();
    wsRef.current = null;
    setWs(null);
    setOnlineSession(null);
    clearReconnectTimer();
    setGameState(makeInitialState());
  };

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="dark bg-background text-foreground min-h-screen">

      {gameState.phase === "name-entry" && (
        <NameEntryScreen onNext={handleNamesEntered} onPlayOnline={handlePlayOnline} />
      )}

      {/* Online lobby — setup phase */}
      {gameState.phase === "online-lobby" && !onlineSession && (
        <OnlineLobbyScreen onReady={handleOnlineReady} onBack={handleBackToLocal} />
      )}

      {/* Online lobby — guest waiting for host to start */}
      {gameState.phase === "online-lobby" && onlineSession && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="min-h-screen flex flex-col items-center justify-center p-6 text-center gap-6"
        >
          <Clock className="w-12 h-12 text-primary animate-pulse" />
          <h2 className="text-3xl font-bold text-primary">Lobby Connected!</h2>
          <p className="text-muted-foreground text-lg">
            Waiting for <span className="text-foreground font-bold">{onlineSession.partnerName}</span> to configure and start the game…
          </p>
          <p className="text-xs text-muted-foreground">Code: <span className="font-bold tracking-widest">{onlineSession.lobbyCode}</span></p>
        </motion.div>
      )}

      {gameState.phase === "setup" && (
        <SetupScreen
          p1Name={gameState.players.p1.name}
          p2Name={gameState.players.p2.name}
          onStart={handleStartSetup}
          isOnline={onlineSession !== null}
        />
      )}

      {gameState.phase === "rally-determination" && (
        <RallyDetermination
          p1Name={gameState.players.p1.name}
          p2Name={gameState.players.p2.name}
          onWinner={handleRallyWinner}
        />
      )}

      {gameState.phase === "upgrade-draft" && (
        <UpgradeDraft
          pool={gameState.draftPool}
          draftTurn={gameState.draftTurn!}
          p1Name={gameState.players.p1.name}
          p2Name={gameState.players.p2.name}
          myPlayerId={onlineSession?.myPlayerId}
          onSelect={handleDraftSelect}
        />
      )}

      {/* Online battle: each player has their own "I Won" button */}
      {gameState.phase === "battle" && onlineSession && (
        <OnlineGameScreen
          state={gameState}
          myPlayerId={onlineSession.myPlayerId}
          onWin={handleBattleWin}
        />
      )}

      {/* Local battle: shared screen with two buttons */}
      {gameState.phase === "battle" && !onlineSession && (
        <GameScreen
          state={gameState}
          onWin={handleBattleWin}
        />
      )}

      {gameState.phase === "shop" && (
        <ShopPhase
          state={gameState}
          onBuy={handleShopBuy}
          onDone={handleShopDone}
          onRefresh={handleShopRefresh}
          myPlayerId={onlineSession?.myPlayerId}
        />
      )}

      {gameState.phase === "game-over" && (
        <GameOver state={gameState} onReset={resetGame} />
      )}
    </div>
  );
}
