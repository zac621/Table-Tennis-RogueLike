// server/index.js
import express from "express";
import http from "http";
import { WebSocketServer } from "ws";
import { randomUUID } from "crypto";

const app = express();
app.use(express.json());

const server = http.createServer(app);
const wss = new WebSocketServer({ noServer: true });

const lobbies = new Map();
const sessions = new Map();

const SESSION_TTL_MS = 1000 * 60 * 60; // 1 hour
const HEARTBEAT_INTERVAL = 30000; // 30s

function now() { return Date.now(); }
function createSession(lobbyId, role) {
  const token = randomUUID();
  sessions.set(token, { lobbyId, role, expiresAt: now() + SESSION_TTL_MS });
  return token;
}
function cleanupExpiredSessions() {
  const t = now();
  for (const [token, meta] of sessions.entries()) if (meta.expiresAt < t) sessions.delete(token);
  for (const [lobbyId, lobby] of lobbies.entries()) {
    if (!lobby.p1 && !lobby.p2 && (!lobby.lastSeen || (t - lobby.lastSeen) > SESSION_TTL_MS)) {
      lobbies.delete(lobbyId);
    }
  }
}

app.get("/.health", (req, res) => res.json({ ok: true }));

server.on("upgrade", (req, socket, head) => {
  wss.handleUpgrade(req, socket, head, (ws) => wss.emit("connection", ws, req));
});

function sendSafe(ws, obj) {
  try { ws.send(JSON.stringify(obj)); } catch (e) {}
}

function attachWsHandlers(ws) {
  ws.isAlive = true;
  ws.on("pong", () => { ws.isAlive = true; });
  ws.on("message", (raw) => {
    let msg;
    try { msg = JSON.parse(raw.toString()); } catch (e) { return; }
    handleMessage(ws, msg);
  });
  ws.on("close", () => handleDisconnect(ws));
  ws.on("error", () => handleDisconnect(ws));
}

function handleDisconnect(ws) {
  if (!ws.meta) return;
  const { lobbyId, role } = ws.meta;
  const lobby = lobbies.get(lobbyId);
  if (!lobby) return;
  if (role === "p1") lobby.p1 = undefined;
  if (role === "p2") lobby.p2 = undefined;
  lobby.lastSeen = now();
  const partner = role === "p1" ? lobby.p2 : lobby.p1;
  if (partner) sendSafe(partner, { type: "partner_left" });
}

function handleMessage(ws, msg) {
  const { type } = msg;
  if (type === "create_lobby") {
    const lobbyId = randomUUID().slice(0, 8);
    const hostToken = createSession(lobbyId, "p1");
    const guestToken = createSession(lobbyId, "p2");
    const lobby = { lobbyId, hostToken, guestToken, state: null, lastSeen: now() };
    lobbies.set(lobbyId, lobby);
    lobby.p1 = ws;
    ws.meta = { lobbyId, role: "p1", sessionToken: hostToken };
    sendSafe(ws, { type: "lobby_created", lobbyId, sessionToken: hostToken, guestToken });
    return;
  }

  if (type === "join_lobby") {
    const { lobbyId } = msg;
    const lobby = lobbies.get(lobbyId);
    if (!lobby) { sendSafe(ws, { type: "error", message: "Lobby not found" }); return; }
    lobby.p2 = ws;
    ws.meta = { lobbyId, role: "p2", sessionToken: lobby.guestToken };
    lobby.lastSeen = now();
    sendSafe(ws, { type: "joined", lobbyId, sessionToken: lobby.guestToken });
    if (lobby.p1) sendSafe(lobby.p1, { type: "partner_joined" });
    return;
  }

  if (type === "reconnect") {
    const { sessionToken } = msg;
    const meta = sessions.get(sessionToken);
    if (!meta) { sendSafe(ws, { type: "reconnect_failed" }); return; }
    const { lobbyId, role } = meta;
    const lobby = lobbies.get(lobbyId);
    if (!lobby) { sendSafe(ws, { type: "reconnect_failed" }); return; }
    if (role === "p1") lobby.p1 = ws; else lobby.p2 = ws;
    ws.meta = { lobbyId, role, sessionToken };
    lobby.lastSeen = now();
    const partner = role === "p1" ? lobby.p2 : lobby.p1;
    sendSafe(ws, { type: "reconnect_ok", lobbyId, state: lobby.state, partnerConnected: !!partner });
    if (partner) sendSafe(partner, { type: "partner_reconnected" });
    return;
  }

  if (type === "state_update") {
    const { state } = msg;
    if (!ws.meta) return;
    const { lobbyId } = ws.meta;
    const lobby = lobbies.get(lobbyId);
    if (!lobby) return;
    lobby.state = state;
    lobby.lastSeen = now();
    const partner = ws.meta.role === "p1" ? lobby.p2 : lobby.p1;
    if (partner) sendSafe(partner, { type: "state_update", state });
    return;
  }

  if (type === "ping") { sendSafe(ws, { type: "pong" }); return; }
}

setInterval(() => {
  cleanupExpiredSessions();
  wss.clients.forEach((ws) => {
    if (ws.isAlive === false) return ws.terminate();
    ws.isAlive = false;
    ws.ping(() => {});
  });
}, HEARTBEAT_INTERVAL);

wss.on("connection", (ws) => {
  attachWsHandlers(ws);
  sendSafe(ws, { type: "welcome", serverTime: now() });
});

const PORT = process.env.PORT || 8080;
server.listen(PORT, () => console.log(`WS server listening on ${PORT}`));
