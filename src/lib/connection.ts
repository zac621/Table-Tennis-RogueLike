import { useCallback, useEffect, useRef, useState } from "react";
import { GameAction, GameState, PlayerId } from "./types";
import { buildWsUrl } from "./websocket";
import { applyAction } from "../../shared/engine.js";

// Actions whose outcome is fully deterministic, so the client can apply them
// immediately (same engine as the server) instead of waiting a round trip.
// The server's state replaces the prediction once it acks the action.
const PREDICTED_ACTIONS = new Set<GameAction["type"]>(["shop_buy", "shop_done"]);

// One-shot actions: while one is waiting for the server, another of the same
// type is a duplicate tap and is dropped (instead of bouncing off the server
// with a confusing error, or — for refresh — being charged twice).
const ONE_AT_A_TIME = new Set<GameAction["type"]>([
  "start_game", "first_rally_winner", "draft_pick", "rally_win", "shop_refresh", "shop_done", "rematch",
]);

// Not safe to resend after a reconnect: if the first copy did reach the server
// (only its ack was lost) a resend would be applied twice.
const NEVER_RESEND = new Set<GameAction["type"]>(["shop_refresh"]);

interface PendingAction {
  seq: number;
  action: GameAction;
  predicted: boolean;
  resent: boolean;
}

// Connection lifecycle:
//   idle        – no lobby; user is on the lobby screen
//   connecting  – opening a socket to create/join a lobby
//   connected   – socket open and bound to a lobby session
//   reconnecting– session exists but the socket dropped; retrying
//   replaced    – the same session was opened in another tab/device
export type ConnectionStatus = "idle" | "connecting" | "connected" | "reconnecting" | "replaced";

export interface Session {
  code: string;
  sessionToken: string;
  playerId: PlayerId;
}

export interface PartnerInfo {
  known: boolean; // a partner_status has arrived on the current socket
  joined: boolean;
  connected: boolean;
  name: string | null;
}

type ServerMessage =
  | { type: "welcome" }
  | { type: "pong" }
  | { type: "left" }
  | { type: "session"; code: string; sessionToken: string; playerId: PlayerId }
  | { type: "partner_status"; joined: boolean; connected: boolean; name: string | null }
  | { type: "partner_left" }
  | { type: "session_ended" }
  | { type: "state"; state: GameState; ack?: number }
  | { type: "action_rejected"; message: string; seq?: number }
  | { type: "reconnect_failed" }
  | { type: "error"; message: string };

const SESSION_KEY = "ttr-online-session";
const PENDING_LEAVE_KEY = "ttr-pending-leave";
const PING_INTERVAL_MS = 15000;
const DEAD_SOCKET_MS = 40000;      // no traffic for this long → assume a half-open socket
const PROBE_TIMEOUT_MS = 8000;     // wake/online probe: no answer in this long → reconnect
const ACK_TIMEOUT_MS = 5000;       // an action got no reply at all in this long → probe the socket
const CONNECT_TIMEOUT_MS = 12000;  // socket still not open (grows with each failed attempt)
const SESSION_TIMEOUT_MS = 30000;  // socket open but no 'session' reply yet (slow links are fine)
const CREATE_JOIN_HANDSHAKE_MS = 75000; // Render cold starts can take ~1 min
const STALE_CONNECTING_MS = 6000;
const MAX_RETRY_DELAY_MS = 8000;

const NO_PARTNER: PartnerInfo = { known: false, joined: false, connected: false, name: null };

function readStorage(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}

function writeStorage(key: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    /* storage unavailable (private mode) — resume-after-reload won't work, that's all */
  }
}

function loadSession(): Session | null {
  try {
    const raw = readStorage(SESSION_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as Session;
    return s && s.sessionToken && s.code && (s.playerId === "p1" || s.playerId === "p2") ? s : null;
  } catch {
    return null;
  }
}

// Tells the server we left using only the session token, on a throwaway
// socket. Used when our own connection is down (or might be half-open), so the
// opponent is still told and the lobby is freed. Retried on the next page load
// until the server confirms.
let leaveInFlight: WebSocket | null = null;

function sendLeave(sessionToken: string) {
  writeStorage(PENDING_LEAVE_KEY, sessionToken);
  if (leaveInFlight) return;
  let sock: WebSocket;
  try { sock = new WebSocket(buildWsUrl()); } catch { return; }
  leaveInFlight = sock;
  // Short give-up: a socket stuck connecting would queue the next create/join
  // behind it. A failed leave is retried on the next wake/online/create/join.
  const giveUp = setTimeout(() => { try { sock.close(); } catch { /* ignore */ } }, 6000);
  sock.onclose = () => {
    clearTimeout(giveUp);
    if (leaveInFlight === sock) leaveInFlight = null;
  };
  sock.onopen = () => sock.send(JSON.stringify({ type: "leave", sessionToken }));
  sock.onmessage = (event) => {
    try {
      if (JSON.parse(event.data as string).type !== "left") return;
    } catch { return; }
    if (readStorage(PENDING_LEAVE_KEY) === sessionToken) writeStorage(PENDING_LEAVE_KEY, null);
    clearTimeout(giveUp);
    sock.close();
  };
}

// Finishes a leave that couldn't reach the server earlier (no network then).
function retryPendingLeave() {
  const token = readStorage(PENDING_LEAVE_KEY);
  if (token) sendLeave(token);
}

interface Options {
  onRejected?: (message: string) => void;
}

export function useGameConnection({ onRejected }: Options = {}) {
  const [status, setStatus] = useState<ConnectionStatus>(() => (loadSession() ? "reconnecting" : "idle"));
  const [session, setSession] = useState<Session | null>(() => loadSession());
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [partner, setPartner] = useState<PartnerInfo>(NO_PARTNER);
  const [partnerLeft, setPartnerLeft] = useState(false);
  const [inFlight, setInFlight] = useState<GameAction["type"][]>([]);
  const [error, setError] = useState("");

  const socketRef = useRef<WebSocket | null>(null);
  const socketOpenedAtRef = useRef(0);
  const sessionRef = useRef<Session | null>(session);
  const retryAttemptsRef = useRef(0);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handshakeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastMessageAtRef = useRef(Date.now());
  const callbacksRef = useRef({ onRejected });
  callbacksRef.current = { onRejected };

  // Client-side prediction: the last state the server sent, plus our own
  // actions it hasn't processed yet. What we render is the server state with
  // the pending predicted actions re-applied on top, so an opponent's update
  // arriving mid-shopping never makes our own purchases flicker back.
  // Every sent action stays pending until the server acks or rejects it, so
  // actions lost on a dead socket can be resent after a reconnect.
  const serverStateRef = useRef<GameState | null>(null);
  const pendingRef = useRef<PendingAction[]>([]);
  const seqRef = useRef(0);

  const predictedState = (): GameState | null => {
    const base = serverStateRef.current;
    const me = sessionRef.current?.playerId;
    if (!base || !me) return base;
    return pendingRef.current
      .filter(p => p.predicted)
      .reduce((s, p) => applyAction(s, me, p.action).state, base);
  };

  const syncPending = () => {
    setGameState(predictedState());
    const types = [...new Set(pendingRef.current.map(p => p.action.type))].sort();
    setInFlight(prev => (prev.join() === types.join() ? prev : types));
  };

  const clearRetry = () => {
    if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
    retryTimerRef.current = null;
  };

  const clearHandshake = () => {
    if (handshakeTimerRef.current) clearTimeout(handshakeTimerRef.current);
    handshakeTimerRef.current = null;
  };

  const updateSession = (s: Session | null) => {
    sessionRef.current = s;
    writeStorage(SESSION_KEY, s ? JSON.stringify(s) : null);
    setSession(s);
  };

  // Detaches and closes the current socket without waiting for the close
  // handshake (a half-open socket can take ~60s to report onclose).
  const closeSocket = () => {
    clearHandshake();
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
    pendingRef.current = [];
    seqRef.current = 0;
    setGameState(null);
    setInFlight([]);
    setPartner(NO_PARTNER);
    setPartnerLeft(false);
    setStatus("idle");
    setError(message);
  }, []);

  // Opens a socket whose first message is `hello`. All handlers are attached
  // synchronously here, so no server message can be missed.
  const open = useCallback((hello: { type: string; [k: string]: unknown }) => {
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
    socketOpenedAtRef.current = Date.now();
    lastMessageAtRef.current = Date.now();
    seqRef.current = 0; // seq/ack are per socket
    setPartner(prev => ({ ...prev, known: false }));

    // Give up on a handshake that never completes (lost upgrade on a dead
    // path). The short limit only applies until the socket opens — after that
    // the link demonstrably works, so a slow one gets plenty of time.
    const isReconnect = hello.type === "reconnect";
    const armHandshakeTimer = (ms: number) => {
      clearHandshake();
      handshakeTimerRef.current = setTimeout(() => {
        if (socketRef.current !== sock) return;
        if (sessionRef.current) dropAndReconnect();
        else resetToIdle("Couldn't reach the game server. Check your connection and try again.");
      }, ms);
    };
    armHandshakeTimer(isReconnect
      ? Math.min(40000, CONNECT_TIMEOUT_MS + 6000 * retryAttemptsRef.current)
      : CREATE_JOIN_HANDSHAKE_MS);

    sock.onopen = () => {
      lastMessageAtRef.current = Date.now();
      if (isReconnect) armHandshakeTimer(SESSION_TIMEOUT_MS);
      sock.send(JSON.stringify(hello));
    };

    sock.onmessage = (event) => {
      if (socketRef.current !== sock) return;
      lastMessageAtRef.current = Date.now();
      let msg: ServerMessage;
      try { msg = JSON.parse(event.data as string) as ServerMessage; } catch { return; }

      switch (msg.type) {
        case "session":
          clearHandshake();
          retryAttemptsRef.current = 0;
          updateSession({ code: msg.code, sessionToken: msg.sessionToken, playerId: msg.playerId });
          setStatus("connected");
          setError("");
          resendPending(sock);
          break;
        case "partner_status":
          setPartner({ known: true, joined: msg.joined, connected: msg.connected, name: msg.name });
          break;
        case "state":
          serverStateRef.current = msg.state;
          pendingRef.current = pendingRef.current.filter(p => p.seq > (msg.ack ?? 0));
          syncPending();
          break;
        case "action_rejected": {
          const rejected = pendingRef.current.find(p => p.seq === msg.seq);
          pendingRef.current = pendingRef.current.filter(p => p.seq !== msg.seq);
          syncPending();
          // A resent action was most likely applied before the old socket died
          // (only its ack was lost), so its rejection isn't news to the player.
          if (!rejected?.resent) callbacksRef.current.onRejected?.(msg.message);
          break;
        }
        case "partner_left":
          if (serverStateRef.current?.phase === "game-over") {
            // Keep the final summary on screen; the lobby no longer exists.
            clearRetry();
            closeSocket();
            updateSession(null);
            pendingRef.current = [];
            syncPending();
            setPartnerLeft(true);
            setStatus("idle");
          } else {
            resetToIdle("Your opponent left the game.");
          }
          break;
        case "reconnect_failed":
          resetToIdle("Your previous game is no longer available.");
          break;
        case "session_ended":
          // We quit this game from another tab/device.
          resetToIdle("You left this game on another tab or device.");
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

    sock.onclose = (event) => {
      if (socketRef.current !== sock) return;
      clearHandshake();
      socketRef.current = null;
      if (event.code === 4000) {
        // The same session connected from another tab/device. Don't fight it
        // for the slot — let the player choose to continue here.
        setStatus("replaced");
        return;
      }
      if (!sessionRef.current) {
        setStatus("idle");
        setError("Connection failed. Check your internet connection and try again.");
        return;
      }
      scheduleReconnect();
    };

    sock.onerror = () => { /* onclose follows and handles it */ };
  }, [resetToIdle]);

  // Resends everything still pending from the previous socket, with fresh seqs.
  function resendPending(sock: WebSocket) {
    const keep: PendingAction[] = [];
    for (const p of pendingRef.current) {
      if (NEVER_RESEND.has(p.action.type)) continue;
      const seq = ++seqRef.current;
      sock.send(JSON.stringify({ type: "action", seq, action: p.action }));
      keep.push({ ...p, seq, resent: true });
    }
    pendingRef.current = keep;
    syncPending();
  }

  function scheduleReconnect() {
    setStatus("reconnecting");
    retryAttemptsRef.current += 1;
    const delay = Math.min(MAX_RETRY_DELAY_MS, 250 * 2 ** Math.min(retryAttemptsRef.current, 5));
    clearRetry();
    retryTimerRef.current = setTimeout(() => {
      const s = sessionRef.current;
      if (s) open({ type: "reconnect", sessionToken: s.sessionToken });
    }, delay);
  }

  // A socket we've decided is dead: replace it now instead of waiting for close().
  function dropAndReconnect() {
    if (!sessionRef.current) return;
    closeSocket();
    scheduleReconnect();
  }

  function probe(sock: WebSocket) {
    const probedAt = Date.now();
    try { sock.send(JSON.stringify({ type: "ping" })); } catch { /* ignore */ }
    setTimeout(() => {
      if (socketRef.current === sock && lastMessageAtRef.current < probedAt) dropAndReconnect();
    }, PROBE_TIMEOUT_MS);
  }

  const reconnectNow = useCallback(() => {
    const s = sessionRef.current;
    if (!s) return;
    const sock = socketRef.current;
    if (sock?.readyState === WebSocket.OPEN) return;
    if (sock?.readyState === WebSocket.CONNECTING && Date.now() - socketOpenedAtRef.current < STALE_CONNECTING_MS) return;
    retryAttemptsRef.current = 0;
    setStatus("reconnecting");
    open({ type: "reconnect", sessionToken: s.sessionToken });
  }, [open]);

  // Resume a saved session on load (e.g. after a page refresh), and finish a
  // leave that couldn't reach the server last time.
  useEffect(() => {
    retryPendingLeave();
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
        dropAndReconnect();
        return;
      }
      sock.send(JSON.stringify({ type: "ping" }));
    }, PING_INTERVAL_MS);

    const onWake = () => {
      if (document.visibilityState !== "visible") return;
      retryPendingLeave();
      const sock = socketRef.current;
      // The socket may have died silently while the phone slept or switched networks.
      if (sock?.readyState === WebSocket.OPEN) probe(sock);
      else reconnectNow();
    };

    document.addEventListener("visibilitychange", onWake);
    window.addEventListener("online", onWake);
    window.addEventListener("focus", onWake);
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onWake);
      window.removeEventListener("online", onWake);
      window.removeEventListener("focus", onWake);
    };
  }, [reconnectNow]);

  const createLobby = useCallback((playerName: string) => {
    retryPendingLeave();
    setError("");
    setStatus("connecting");
    open({ type: "create_lobby", playerName });
  }, [open]);

  const joinLobby = useCallback((code: string, playerName: string) => {
    retryPendingLeave();
    setError("");
    setStatus("connecting");
    open({ type: "join_lobby", code, playerName });
  }, [open]);

  // "offline": not connected, nothing sent.
  // "invalid": dropped locally — a duplicate of a one-shot action that is still
  //   waiting for the server, a buy while a refresh is in flight, or a predicted
  //   action our up-to-date local state already rules out (e.g. a second tap on
  //   a card that was just bought and is still fading out).
  const sendAction = useCallback((action: GameAction): "sent" | "offline" | "invalid" => {
    const sock = socketRef.current;
    const s = sessionRef.current;
    if (!sock || sock.readyState !== WebSocket.OPEN || !s) return "offline";
    const pendingTypes = new Set(pendingRef.current.map(p => p.action.type));
    if (ONE_AT_A_TIME.has(action.type) && pendingTypes.has(action.type)) return "invalid";
    if (action.type === "shop_buy" && pendingTypes.has("shop_refresh")) return "invalid";
    const predicted = PREDICTED_ACTIONS.has(action.type);
    if (predicted) {
      const current = predictedState();
      if (!current || applyAction(current, s.playerId, action).error) return "invalid";
    }
    const seq = ++seqRef.current;
    const sentAt = Date.now();
    sock.send(JSON.stringify({ type: "action", seq, action }));
    pendingRef.current = [...pendingRef.current, { seq, action, predicted, resent: false }];
    syncPending();
    // The server answers every action within milliseconds. Long silence means
    // the link is slow or the socket is half-open: probe it, and reconnect only
    // if the probe gets no answer either (the action is resent afterwards).
    setTimeout(() => {
      if (socketRef.current === sock && lastMessageAtRef.current < sentAt) probe(sock);
    }, ACK_TIMEOUT_MS);
    return "sent";
  }, []);

  const leave = useCallback(() => {
    const s = sessionRef.current;
    const sock = socketRef.current;
    if (s) {
      if (sock?.readyState === WebSocket.OPEN) sock.send(JSON.stringify({ type: "leave" }));
      // Also send it on a fresh socket: our own may be down or half-open.
      sendLeave(s.sessionToken);
    }
    resetToIdle();
  }, [resetToIdle]);

  // Abandon an in-progress create/join.
  const cancelConnect = useCallback(() => resetToIdle(), [resetToIdle]);

  // After "replaced": take the session back from the other tab/device.
  const takeOver = useCallback(() => {
    const s = sessionRef.current;
    if (!s) return;
    retryAttemptsRef.current = 0;
    setStatus("reconnecting");
    open({ type: "reconnect", sessionToken: s.sessionToken });
  }, [open]);

  return {
    status, session, gameState, partner, partnerLeft, inFlight, error,
    createLobby, joinLobby, sendAction, leave, cancelConnect, takeOver,
  };
}
