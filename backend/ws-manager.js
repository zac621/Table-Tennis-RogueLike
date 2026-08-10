import crypto from "crypto";
import { WebSocketServer } from "ws";

const LOBBY_EXPIRATION_MS = 60_000;
const PROTOCOL_PATH = "/api/ws";

const globalStore = globalThis.__tableTennisWsManager ??= {
  wss: null,
  attachedServers: new WeakSet(),
  lobbies: new Map(),
};

function generateCode() {
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i += 1) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

function generateToken() {
  return crypto.randomBytes(16).toString("hex");
}

function sendJson(ws, payload) {
  try {
    ws.send(JSON.stringify(payload));
  } catch (error) {
    console.error("sendJson error", error);
  }
}

function scheduleLobbyCleanup(lobby) {
  if (lobby.cleanupTimer) {
    clearTimeout(lobby.cleanupTimer);
  }

  lobby.cleanupTimer = setTimeout(() => {
    globalStore.lobbies.delete(lobby.code);
  }, LOBBY_EXPIRATION_MS);
}

function clearLobbyCleanup(lobby) {
  if (lobby.cleanupTimer) {
    clearTimeout(lobby.cleanupTimer);
    lobby.cleanupTimer = null;
  }
}

function getPeer(lobby, role) {
  return role === "host" ? lobby.guest : lobby.host;
}

function getRoleByToken(lobby, token) {
  if (lobby.host?.token === token) return "host";
  if (lobby.guest?.token === token) return "guest";
  return null;
}

function createLobby(playerName, ws) {
  let code = generateCode();
  while (globalStore.lobbies.has(code)) {
    code = generateCode();
  }

  const host = {
    socket: ws,
    playerName,
    role: "host",
    token: generateToken(),
    connected: true,
  };

  const lobby = {
    code,
    host,
    guest: null,
    lastState: null,
    cleanupTimer: null,
  };

  ws.lobbyCode = code;
  ws.playerToken = host.token;
  ws.playerRole = "host";
  globalStore.lobbies.set(code, lobby);
  return lobby;
}

function joinLobby(code, playerName, ws) {
  const lobby = globalStore.lobbies.get(code);
  if (!lobby) {
    return { error: "That lobby does not exist." };
  }

  if (lobby.guest && lobby.guest.connected) {
    return { error: "That lobby is already full." };
  }

  const guest = {
    socket: ws,
    playerName,
    role: "guest",
    token: generateToken(),
    connected: true,
  };

  lobby.guest = guest;
  ws.lobbyCode = code;
  ws.playerToken = guest.token;
  ws.playerRole = "guest";

  clearLobbyCleanup(lobby);
  return { lobby, guest };
}

function reconnectPlayer(code, token, ws) {
  const lobby = globalStore.lobbies.get(code);
  if (!lobby) {
    return { error: "That lobby no longer exists." };
  }

  const role = getRoleByToken(lobby, token);
  if (!role) {
    return { error: "Invalid reconnect token." };
  }

  const player = lobby[role];
  const peer = getPeer(lobby, role);

  if (!player) {
    return { error: "Reconnect target not found." };
  }

  if (player.socket && player.socket !== ws) {
    try {
      player.socket.close();
    } catch (err) {
      // ignore
    }
  }

  player.socket = ws;
  player.connected = true;
  ws.lobbyCode = code;
  ws.playerToken = token;
  ws.playerRole = role;

  clearLobbyCleanup(lobby);

  if (peer?.connected && peer.socket) {
    sendJson(peer.socket, { type: "partner_reconnected" });
  }

  if (lobby.lastState && player.socket) {
    sendJson(player.socket, { type: "state_update", state: lobby.lastState });
  }

  return { lobby, player, role };
}

function handleStateUpdate(ws, message) {
  const code = ws.lobbyCode;
  if (!code) {
    sendJson(ws, { type: "error", message: "Not connected to a lobby." });
    return;
  }

  const lobby = globalStore.lobbies.get(code);
  if (!lobby) {
    sendJson(ws, { type: "error", message: "Lobby no longer exists." });
    return;
  }

  const role = ws.playerRole;
  const peer = role === "host" ? lobby.guest : lobby.host;
  if (!peer || !peer.connected || !peer.socket) {
    lobby.lastState = message.state || null;
    return;
  }

  lobby.lastState = message.state || null;
  sendJson(peer.socket, { type: "state_update", state: lobby.lastState });
}

function handleLeave(ws) {
  const code = ws.lobbyCode;
  const role = ws.playerRole;
  if (!code || !role) {
    return;
  }

  const lobby = globalStore.lobbies.get(code);
  if (!lobby) {
    return;
  }

  const player = lobby[role];
  const peer = getPeer(lobby, role);

  if (player) {
    player.connected = false;
    player.socket = null;
  }

  if (peer?.connected && peer.socket) {
    sendJson(peer.socket, { type: "partner_disconnected" });
  }

  if ((!lobby.host.connected && !lobby.guest?.connected) || !lobby.guest) {
    scheduleLobbyCleanup(lobby);
  }
}

function handleJsonMessage(ws, message) {
  if (!message || typeof message !== "object" || typeof message.type !== "string") {
    sendJson(ws, { type: "error", message: "Invalid payload." });
    return;
  }

  switch (message.type) {
    case "create_lobby": {
      const playerName = String(message.playerName || "Player 1");
      const lobby = createLobby(playerName, ws);
      sendJson(ws, {
        type: "lobby_created",
        code: lobby.code,
        sessionToken: lobby.host.token,
      });
      return;
    }

    case "join_lobby": {
      const code = String(message.code || "").toUpperCase();
      const playerName = String(message.playerName || "Player 2");
      const result = joinLobby(code, playerName, ws);
      if (result.error) {
        sendJson(ws, { type: "error", message: result.error });
        return;
      }

      const { lobby, guest } = result;
      sendJson(ws, {
        type: "lobby_joined",
        code: lobby.code,
        partnerName: lobby.host.playerName,
        sessionToken: guest.token,
      });
      sendJson(lobby.host.socket, {
        type: "partner_joined",
        code: lobby.code,
        partnerName: guest.playerName,
      });
      return;
    }

    case "reconnect": {
      const code = String(message.code || "").toUpperCase();
      const token = String(message.sessionToken || "");
      const result = reconnectPlayer(code, token, ws);
      if (result.error) {
        sendJson(ws, { type: "reconnect_failed", message: result.error });
        ws.close();
        return;
      }

      const peer = getPeer(result.lobby, result.role);
      sendJson(ws, {
        type: "reconnect_success",
        code: result.lobby.code,
        partnerName: peer?.playerName || "Opponent",
      });
      return;
    }

    case "state_update": {
      handleStateUpdate(ws, message);
      return;
    }

    default:
      sendJson(ws, { type: "error", message: "Unsupported message type." });
  }
}

function attachWebSocketServer(server, path = PROTOCOL_PATH) {
  if (globalStore.attachedServers.has(server)) {
    return;
  }

  if (!globalStore.wss) {
    globalStore.wss = new WebSocketServer({ noServer: true });
    globalStore.wss.on("connection", (ws) => {
      ws.on("message", (data) => {
        let message;
        try {
          message = JSON.parse(data.toString());
        } catch (error) {
          sendJson(ws, { type: "error", message: "Invalid JSON payload." });
          return;
        }
        handleJsonMessage(ws, message);
      });

      ws.on("close", () => {
        handleLeave(ws);
      });
    });
  }

  server.on("upgrade", (request, socket, head) => {
    if (request.url !== path) {
      socket.destroy();
      return;
    }

    globalStore.wss.handleUpgrade(request, socket, head, (ws) => {
      globalStore.wss.emit("connection", ws, request);
    });
  });

  globalStore.attachedServers.add(server);
}

export { attachWebSocketServer };
