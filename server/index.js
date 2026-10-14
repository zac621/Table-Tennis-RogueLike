// server/index.js
// Authoritative game server. Clients send intents ({ type: "action" }); the
// server validates them with the shared engine, updates the lobby's state and
// broadcasts the full state to both players. Clients never write state.
import express from "express";
import http from "http";
import { WebSocketServer } from "ws";
import { randomUUID, randomInt } from "crypto";
import { applyAction, createInitialState } from "../shared/engine.js";

const app = express();
app.use(express.json());

const server = http.createServer(app);
// Compress messages over 1KB: full-state JSON (with the rally log) shrinks ~8x.
// maxPayload caps the *inflated* size of incoming messages. Clients only send a
// few hundred bytes; without a cap a tiny compressed frame can inflate to ~100MB.
const wss = new WebSocketServer({ noServer: true, maxPayload: 16 * 1024, perMessageDeflate: { threshold: 1024 } });

const lobbies = new Map(); // code -> lobby
const sessions = new Map(); // sessionToken -> { code, role }

const LOBBY_IDLE_TTL_MS = 1000 * 60 * 60 * 2; // games in progress: drop after 2h with nobody connected
const UNSTARTED_LOBBY_TTL_MS = 1000 * 60 * 15; // lobbies that never got past setup: 15 min
const MAX_LOBBIES = 2000;
const HEARTBEAT_INTERVAL = 30000;
const CODE_CHARS = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const MAX_NAME_LENGTH = 24;

function now() { return Date.now(); }

function makeLobbyCode() {
  let code;
  do {
    code = "";
    for (let i = 0; i < 6; i++) code += CODE_CHARS[randomInt(CODE_CHARS.length)];
  } while (lobbies.has(code));
  return code;
}

// Client fields are untrusted JSON: anything that isn't a string is treated as
// empty (never String()-coerced — an object like {"toString":1} would throw).
function str(value) {
  return typeof value === "string" ? value : "";
}

function cleanName(name, fallback) {
  const s = str(name).trim().slice(0, MAX_NAME_LENGTH);
  return s || fallback;
}

function other(role) { return role === "p1" ? "p2" : "p1"; }

function sendSafe(ws, obj) {
  if (!ws || ws.readyState !== ws.OPEN) return;
  try { ws.send(JSON.stringify(obj)); } catch { /* socket went away */ }
}

function deleteLobby(code) {
  const lobby = lobbies.get(code);
  if (!lobby) return;
  for (const role of ["p1", "p2"]) {
    const slot = lobby.players[role];
    if (slot) sessions.delete(slot.token);
  }
  lobbies.delete(code);
}

function cleanupIdleLobbies() {
  const t = now();
  for (const [code, lobby] of lobbies) {
    const anyConnected = ["p1", "p2"].some(r => lobby.players[r]?.ws);
    if (anyConnected) continue;
    const started = !!lobby.players.p2 && lobby.state && lobby.state.phase !== "setup";
    const ttl = started ? LOBBY_IDLE_TTL_MS : UNSTARTED_LOBBY_TTL_MS;
    if (t - lobby.lastSeen > ttl) deleteLobby(code);
  }
}

// Ends a lobby on a player's request: tells the partner, frees both sessions.
function leaveLobby(code, role) {
  const lobby = lobbies.get(code);
  if (!lobby) return;
  const partner = lobby.players[other(role)];
  if (partner?.ws) {
    partner.ws.meta = null;
    sendSafe(partner.ws, { type: "partner_left" });
  }
  deleteLobby(code);
}

function partnerStatus(lobby, role) {
  const partner = lobby.players[other(role)];
  return { type: "partner_status", joined: !!partner, connected: !!partner?.ws, name: partner?.name ?? null };
}

// `ack` is the seq of the last action this socket sent that the server has
// processed. Clients use it to drop locally-predicted actions once the server
// state includes them.
function sendState(lobby, role) {
  const slot = lobby.players[role];
  if (slot?.ws && lobby.state) sendSafe(slot.ws, { type: "state", state: lobby.state, ack: slot.ws.lastSeq });
}

function broadcastState(lobby) {
  sendState(lobby, "p1");
  sendState(lobby, "p2");
}

// Bind a socket to a lobby slot, replacing (and closing) any previous socket.
function attachToSlot(ws, lobby, role) {
  const slot = lobby.players[role];
  const previous = slot.ws;
  slot.ws = ws;
  ws.meta = { code: lobby.code, role };
  lobby.lastSeen = now();
  if (previous && previous !== ws) {
    previous.meta = null; // so its close event doesn't detach the new socket
    try { previous.close(4000, "Replaced by a newer connection"); } catch { /* ignore */ }
  }
}

function handleDisconnect(ws) {
  if (!ws.meta) return;
  const { code, role } = ws.meta;
  ws.meta = null;
  const lobby = lobbies.get(code);
  if (!lobby) return;
  const slot = lobby.players[role];
  // Only detach if this socket is still the active one for the slot. A stale
  // socket closing after a reconnect must not clobber the new connection.
  if (!slot || slot.ws !== ws) return;
  slot.ws = null;
  lobby.lastSeen = now();
  const partner = lobby.players[other(role)];
  if (partner?.ws) sendSafe(partner.ws, partnerStatus(lobby, other(role)));
}

function handleMessage(ws, msg) {
  const { type } = msg;

  if (type === "ping") { sendSafe(ws, { type: "pong" }); return; }

  if (type === "create_lobby") {
    if (ws.meta) { sendSafe(ws, { type: "error", message: "Already in a lobby." }); return; }
    if (lobbies.size >= MAX_LOBBIES) {
      cleanupIdleLobbies();
      if (lobbies.size >= MAX_LOBBIES) {
        sendSafe(ws, { type: "error", message: "The server is busy right now. Try again in a minute." });
        return;
      }
    }
    const code = makeLobbyCode();
    const token = randomUUID();
    const lobby = {
      code,
      players: { p1: { name: cleanName(msg.playerName, "Player 1"), token, ws: null }, p2: null },
      state: null,
      lastSeen: now(),
    };
    lobbies.set(code, lobby);
    sessions.set(token, { code, role: "p1" });
    attachToSlot(ws, lobby, "p1");
    sendSafe(ws, { type: "session", code, sessionToken: token, playerId: "p1" });
    sendSafe(ws, partnerStatus(lobby, "p1"));
    return;
  }

  if (type === "join_lobby") {
    if (ws.meta) { sendSafe(ws, { type: "error", message: "Already in a lobby." }); return; }
    const code = str(msg.code).trim().toUpperCase();
    const lobby = lobbies.get(code);
    if (!lobby) { sendSafe(ws, { type: "error", message: "Lobby not found. Check the code and try again." }); return; }
    if (lobby.players.p2) { sendSafe(ws, { type: "error", message: "That lobby is already full." }); return; }

    const token = randomUUID();
    lobby.players.p2 = { name: cleanName(msg.playerName, "Player 2"), token, ws: null };
    sessions.set(token, { code, role: "p2" });
    attachToSlot(ws, lobby, "p2");
    lobby.state = createInitialState(lobby.players.p1.name, lobby.players.p2.name);

    sendSafe(ws, { type: "session", code, sessionToken: token, playerId: "p2" });
    sendSafe(ws, partnerStatus(lobby, "p2"));
    const host = lobby.players.p1;
    if (host.ws) sendSafe(host.ws, partnerStatus(lobby, "p1"));
    broadcastState(lobby);
    return;
  }

  if (type === "reconnect") {
    const meta = sessions.get(str(msg.sessionToken));
    const lobby = meta && lobbies.get(meta.code);
    if (!meta || !lobby) { sendSafe(ws, { type: "reconnect_failed" }); return; }
    if (ws.meta && (ws.meta.code !== meta.code || ws.meta.role !== meta.role)) {
      sendSafe(ws, { type: "error", message: "Already in a different lobby." });
      return;
    }
    const { role } = meta;
    attachToSlot(ws, lobby, role);
    sendSafe(ws, { type: "session", code: lobby.code, sessionToken: msg.sessionToken, playerId: role });
    sendSafe(ws, partnerStatus(lobby, role));
    sendState(lobby, role);
    const partner = lobby.players[other(role)];
    if (partner?.ws) sendSafe(partner.ws, partnerStatus(lobby, other(role)));
    return;
  }

  if (type === "action") {
    if (Number.isInteger(msg.seq)) ws.lastSeq = msg.seq;
    if (!ws.meta) { sendSafe(ws, { type: "error", message: "Not connected to a lobby." }); return; }
    const lobby = lobbies.get(ws.meta.code);
    if (!lobby || !lobby.state) {
      sendSafe(ws, { type: "action_rejected", seq: ws.lastSeq, message: "The game hasn't started yet." });
      if (lobby) sendSafe(ws, { type: "state", state: lobby.state, ack: ws.lastSeq });
      return;
    }
    let result;
    try {
      result = applyAction(lobby.state, ws.meta.role, msg.action);
    } catch (err) {
      console.error("applyAction failed", err);
      sendSafe(ws, { type: "action_rejected", seq: ws.lastSeq, message: "Server error while applying that action." });
      sendState(lobby, ws.meta.role);
      return;
    }
    lobby.lastSeen = now();
    if (result.error) {
      sendSafe(ws, { type: "action_rejected", seq: ws.lastSeq, message: result.error });
      sendState(lobby, ws.meta.role); // acks the rejected action so the client rolls it back
      return;
    }
    lobby.state = result.state;
    broadcastState(lobby);
    return;
  }

  // Leave works from the bound socket, or — when the player's own connection
  // was down — from any socket that presents the session token.
  if (type === "leave") {
    const meta = ws.meta ?? sessions.get(str(msg.sessionToken));
    ws.meta = null;
    if (meta) leaveLobby(meta.code, meta.role);
    sendSafe(ws, { type: "left" });
    return;
  }

  sendSafe(ws, { type: "error", message: "Unsupported message type." });
}

app.get("/.health", (req, res) => res.json({ ok: true, lobbies: lobbies.size }));

server.on("upgrade", (req, socket, head) => {
  wss.handleUpgrade(req, socket, head, (ws) => wss.emit("connection", ws, req));
});

wss.on("connection", (ws) => {
  ws.isAlive = true;
  ws.meta = null;
  ws.lastSeq = 0;
  ws.on("pong", () => { ws.isAlive = true; });
  ws.on("message", (raw) => {
    ws.isAlive = true;
    let msg;
    try { msg = JSON.parse(raw.toString()); } catch { return; }
    if (!msg || typeof msg !== "object") return;
    // A bad message must never take the process (and every game) down.
    try {
      handleMessage(ws, msg);
    } catch (err) {
      console.error("handleMessage failed", err);
      sendSafe(ws, { type: "error", message: "Bad request." });
    }
  });
  ws.on("close", () => handleDisconnect(ws));
  ws.on("error", () => handleDisconnect(ws));
  sendSafe(ws, { type: "welcome", serverTime: now() });
});

setInterval(() => {
  cleanupIdleLobbies();
  wss.clients.forEach((ws) => {
    if (ws.isAlive === false) { ws.terminate(); return; }
    ws.isAlive = false;
    ws.ping(() => {});
  });
}, HEARTBEAT_INTERVAL);

const PORT = process.env.PORT || 8080;
server.listen(PORT, () => console.log(`WS server listening on ${PORT}`));
