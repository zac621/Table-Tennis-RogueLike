import { useCallback, useEffect, useRef, useState } from "react";
import { GameAction, GameState, PlayerId } from "./types";
import { buildWsUrl } from "./websocket";
import { applyAction } from "../../shared/engine.js";

// Actions whose outcome is fully deterministic, so the client can apply them
// immediately (same engine as the server) instead of waiting a round trip.
// The server's state replaces the prediction once it acks the action.
const PREDICTED_ACTIONS = new Set<GameAction["type"]>(["shop_buy", "shop_done"]);

interface PendingAction {
  seq: number;
  action: GameAction;
}

// Connection lifecycle:
//   idle        – no lobby; user is on the lobby screen
//   connecting  – opening a socket to create/join a lobby
//   connected   – socket open and bound to a lobby session
//   reconnecting– session exists but the socket dropped; retrying
export type ConnectionStatus = "idle" | "connecting" | "connected" | "reconnecting";

export interface Session {
  code: string;
  sessionToken: string;
  playerId: PlayerId;
}

export interface PartnerInfo {
  joined: boolean;
  connected: boolean;
  name: string | null;
}

type ServerMessage =
  | { type: "welcome" }
  | { type: "pong" }
  | { type: "session"; code: string; sessionToken: string; playerId: PlayerId }
  | { type: "partner_status"; joined: boolean; connected: boolean; name: string | null }
  | { type: "partner_left" }
  | { type: "state"; state: GameState; ack?: number }
  | { type: "action_rejected"; message: string }
  | { type: "reconnect_failed" }
  | { type: "error"; message: string };

const SESSION_KEY = "ttr-online-session";
const PING_INTERVAL_MS = 15000;
const DEAD_SOCKET_MS = 40000; // no traffic for this long → assume half-open socket
const MAX_RETRY_DELAY_MS = 8000;

function loadSession(): Session | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as Session;
    return s && s.sessionToken && s.code && (s.playerId === "p1" || s.playerId === "p2") ? s : null;
  } catch {
    return null;
  }
}

function saveSession(s: Session | null) {
  try {
    if (s) localStorage.setItem(SESSION_KEY, JSON.stringify(s));
    else localStorage.removeItem(SESSION_KEY);
  } catch {
    /* storage unavailable (private mode) — reconnect after reload won't work, that's all */
  }
}

interface Options {
  onRejected?: (message: string) => void;
  onPartnerLeft?: () => void;
}

export function useGameConnection({ onRejected, onPartnerLeft }: Options = {}) {
  const [status, setStatus] = useState<ConnectionStatus>(() => (loadSession() ? "reconnecting" : "idle"));
  const [session, setSession] = useState<Session | null>(() => loadSession());
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [partner, setPartner] = useState<PartnerInfo>({ joined: false, connected: false, name: null });
  const [error, setError] = useState("");

  const socketRef = useRef<WebSocket | null>(null);
  const sessionRef = useRef<Session | null>(session);
  const retryAttemptsRef = useRef(0);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastMessageAtRef = useRef(Date.now());
  const callbacksRef = useRef({ onRejected, onPartnerLeft });
  callbacksRef.current = { onRejected, onPartnerLeft };

  // Client-side prediction: the last state the server sent, plus our own
  // actions it hasn't processed yet. What we render is the server state with
  // those pending actions re-applied on top, so an opponent's update arriving
  // mid-shopping never makes our own purchases flicker back.
  const serverStateRef = useRef<GameState | null>(null);
  const pendingRef = useRef<PendingAction[]>([]);
  const seqRef = useRef(0);

  const predictedState = (): GameState | null => {
    const base = serverStateRef.current;
    const me = sessionRef.current?.playerId;
    if (!base || !me) return base;
    return pendingRef.current.reduce((s, p) => applyAction(s, me, p.action).state, base);
  };

  const publishState = () => setGameState(predictedState());

  const resetPrediction = () => {
    pendingRef.current = [];
    seqRef.current = 0;
  };

  const clearRetry = () => {
    if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
    retryTimerRef.current = null;
  };

  const updateSession = (s: Session | null) => {
    sessionRef.current = s;
    saveSession(s);
    setSession(s);
  };

  const closeSocket = () => {
    const sock = socketRef.current;
    socketRef.current = null;
    if (sock) {
      sock.onopen = sock.onmessage = sock.onclose = sock.onerror = null;
      try { sock.close(); } catch { /* ignore */ }
    }
  };

  const resetToIdle = useCallback((message = "") => {
    clearRetry();
    closeSocket();
    updateSession(null);
    serverStateRef.current = null;
    resetPrediction();
    setGameState(null);
    setPartner({ joined: false, connected: false, name: null });
    setStatus("idle");
    setError(message);
  }, []);

  // Opens a socket whose first message is `hello`. All handlers are attached
  // synchronously here, so no server message can be missed.
  const open = useCallback((hello: object) => {
    clearRetry();
    closeSocket();

    let sock: WebSocket;
    try {
      sock = new WebSocket(buildWsUrl());
    } catch {
      setError("Could not reach the game server.");
      setStatus(sessionRef.current ? "reconnecting" : "idle");
      return;
    }
    socketRef.current = sock;
    lastMessageAtRef.current = Date.now();
    // seq/ack are per socket. Anything unacked on the old socket either reached
    // the server (and will be in the state we get back) or was lost.
    resetPrediction();
    publishState();

    sock.onopen = () => {
      lastMessageAtRef.current = Date.now();
      sock.send(JSON.stringify(hello));
    };

    sock.onmessage = (event) => {
      if (socketRef.current !== sock) return;
      lastMessageAtRef.current = Date.now();
      let msg: ServerMessage;
      try { msg = JSON.parse(event.data as string) as ServerMessage; } catch { return; }

      switch (msg.type) {
        case "session":
          retryAttemptsRef.current = 0;
          updateSession({ code: msg.code, sessionToken: msg.sessionToken, playerId: msg.playerId });
          setStatus("connected");
          setError("");
          break;
        case "partner_status":
          setPartner({ joined: msg.joined, connected: msg.connected, name: msg.name });
          break;
        case "state":
          serverStateRef.current = msg.state;
          pendingRef.current = pendingRef.current.filter(p => p.seq > (msg.ack ?? 0));
          publishState();
          break;
        case "action_rejected":
          callbacksRef.current.onRejected?.(msg.message);
          break;
        case "partner_left":
          callbacksRef.current.onPartnerLeft?.();
          resetToIdle("Your opponent left the game.");
          break;
        case "reconnect_failed":
          resetToIdle("Your previous game is no longer available.");
          break;
        case "error":
          if (!sessionRef.current) {
            // Create/join failed: drop the socket and go back to the lobby form.
            resetToIdle(msg.message);
          } else {
            setError(msg.message);
          }
          break;
      }
    };

    sock.onclose = () => {
      if (socketRef.current !== sock) return;
      socketRef.current = null;
      if (!sessionRef.current) {
        setStatus("idle");
        setError("Connection failed. Check your internet connection and try again.");
        return;
      }
      // Keep retrying for as long as we hold a session.
      setStatus("reconnecting");
      retryAttemptsRef.current += 1;
      const delay = Math.min(MAX_RETRY_DELAY_MS, 500 * 2 ** Math.min(retryAttemptsRef.current, 4));
      clearRetry();
      retryTimerRef.current = setTimeout(() => {
        const s = sessionRef.current;
        if (s) open({ type: "reconnect", sessionToken: s.sessionToken });
      }, delay);
    };

    sock.onerror = () => { /* onclose follows and handles it */ };
  }, [resetToIdle]);

  const reconnectNow = useCallback(() => {
    const s = sessionRef.current;
    if (!s) return;
    const sock = socketRef.current;
    if (sock && (sock.readyState === WebSocket.OPEN || sock.readyState === WebSocket.CONNECTING)) return;
    retryAttemptsRef.current = 0;
    setStatus("reconnecting");
    open({ type: "reconnect", sessionToken: s.sessionToken });
  }, [open]);

  // Resume a saved session on load (e.g. after a page refresh).
  useEffect(() => {
    if (sessionRef.current) open({ type: "reconnect", sessionToken: sessionRef.current.sessionToken });
    return () => { clearRetry(); closeSocket(); };
  }, [open]);

  // Keepalive + half-open socket detection, and fast reconnect when a phone
  // wakes up or regains network.
  useEffect(() => {
    const interval = setInterval(() => {
      const sock = socketRef.current;
      if (!sock || sock.readyState !== WebSocket.OPEN) return;
      if (Date.now() - lastMessageAtRef.current > DEAD_SOCKET_MS) {
        sock.close(); // triggers onclose → reconnect
        return;
      }
      sock.send(JSON.stringify({ type: "ping" }));
    }, PING_INTERVAL_MS);

    const onWake = () => {
      if (document.visibilityState !== "visible") return;
      const sock = socketRef.current;
      if (sock && sock.readyState === WebSocket.OPEN) {
        // The socket may have died silently while the phone slept. Probe it,
        // and force a reconnect if the server doesn't answer quickly.
        const probedAt = Date.now();
        sock.send(JSON.stringify({ type: "ping" }));
        setTimeout(() => {
          if (socketRef.current === sock && lastMessageAtRef.current < probedAt) sock.close();
        }, 4000);
      } else {
        reconnectNow();
      }
    };
    const onOnline = () => reconnectNow();

    document.addEventListener("visibilitychange", onWake);
    window.addEventListener("online", onOnline);
    window.addEventListener("focus", onWake);
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onWake);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("focus", onWake);
    };
  }, [reconnectNow]);

  const createLobby = useCallback((playerName: string) => {
    setError("");
    setStatus("connecting");
    open({ type: "create_lobby", playerName });
  }, [open]);

  const joinLobby = useCallback((code: string, playerName: string) => {
    setError("");
    setStatus("connecting");
    open({ type: "join_lobby", code, playerName });
  }, [open]);

  // "offline": not connected, nothing sent.
  // "invalid": a predicted action that our up-to-date local state already rules
  //   out (e.g. a second tap on a card that was just bought and is still fading
  //   out). It's dropped instead of bouncing off the server.
  const sendAction = useCallback((action: GameAction): "sent" | "offline" | "invalid" => {
    const sock = socketRef.current;
    const s = sessionRef.current;
    if (!sock || sock.readyState !== WebSocket.OPEN || !s) return "offline";
    const predicted = PREDICTED_ACTIONS.has(action.type);
    if (predicted) {
      const current = predictedState();
      if (!current || applyAction(current, s.playerId, action).error) return "invalid";
    }
    const seq = ++seqRef.current;
    sock.send(JSON.stringify({ type: "action", seq, action }));
    if (predicted) {
      pendingRef.current = [...pendingRef.current, { seq, action }];
      publishState();
    }
    return "sent";
  }, []);

  const leave = useCallback(() => {
    const sock = socketRef.current;
    if (sock && sock.readyState === WebSocket.OPEN) sock.send(JSON.stringify({ type: "leave" }));
    resetToIdle();
  }, [resetToIdle]);

  return { status, session, gameState, partner, error, createLobby, joinLobby, sendAction, leave };
}
