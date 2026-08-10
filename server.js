import http from "http";
import { WebSocketServer } from "ws";

const port = process.env.PORT ? Number(process.env.PORT) : 4174;
const codeChars = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

const lobbies = new Map();

function makeLobbyCode() {
  let code = "";
  for (let i = 0; i < 6; i += 1) {
    code += codeChars[Math.floor(Math.random() * codeChars.length)];
  }
  return code;
}

function createLobby(playerName, socket) {
  let code = makeLobbyCode();
  while (lobbies.has(code)) {
    code = makeLobbyCode();
  }

  const lobby = {
    code,
    host: { socket, playerName },
    guest: null,
  };

  socket.lobbyCode = code;
  socket.role = "p1";
  socket.playerName = playerName;
  lobbies.set(code, lobby);

  return lobby;
}

function cleanupLobby(code) {
  if (!code) return;
  const lobby = lobbies.get(code);
  if (!lobby) return;

  lobbies.delete(code);
}

function sendJson(ws, message) {
  try {
    ws.send(JSON.stringify(message));
  } catch (error) {
    console.error("Failed to send message", error);
  }
}

const server = http.createServer();
const wss = new WebSocketServer({ server });

wss.on("connection", (ws) => {
  ws.on("message", (data) => {
    let message;
    try {
      message = JSON.parse(data.toString());
    } catch (error) {
      sendJson(ws, { type: "error", message: "Invalid JSON payload." });
      return;
    }

    const { type } = message;
    if (type === "create_lobby") {
      const playerName = String(message.playerName || "Player 1");
      const lobby = createLobby(playerName, ws);
      sendJson(ws, { type: "lobby_created", code: lobby.code });
      return;
    }

    if (type === "join_lobby") {
      const code = String(message.code || "").toUpperCase();
      const playerName = String(message.playerName || "Player 2");
      const lobby = lobbies.get(code);

      if (!lobby) {
        sendJson(ws, { type: "error", message: "That lobby does not exist." });
        return;
      }

      if (lobby.guest) {
        sendJson(ws, { type: "error", message: "That lobby is already full." });
        return;
      }

      lobby.guest = { socket: ws, playerName };
      ws.lobbyCode = code;
      ws.role = "p2";
      ws.playerName = playerName;

      sendJson(ws, {
        type: "lobby_joined",
        code,
        partnerName: lobby.host.playerName,
      });

      sendJson(lobby.host.socket, {
        type: "partner_joined",
        code,
        partnerName: playerName,
      });

      return;
    }

    if (type === "state_update") {
      const code = ws.lobbyCode;
      if (!code) {
        sendJson(ws, { type: "error", message: "Not connected to a lobby." });
        return;
      }

      const lobby = lobbies.get(code);
      if (!lobby) {
        sendJson(ws, { type: "error", message: "Lobby no longer exists." });
        return;
      }

      const target = ws.role === "p1" ? lobby.guest?.socket : lobby.host.socket;
      if (!target) {
        return;
      }

      sendJson(target, { type: "state_update", state: message.state });
      return;
    }

    sendJson(ws, { type: "error", message: "Unsupported message type." });
  });

  ws.on("close", () => {
    const code = ws.lobbyCode;
    if (!code) return;

    const lobby = lobbies.get(code);
    if (!lobby) return;

    const peer = ws.role === "p1" ? lobby.guest?.socket : lobby.host.socket;
    if (peer) {
      sendJson(peer, { type: "partner_left" });
      peer.close();
    }

    cleanupLobby(code);
  });
});

server.listen(port, () => {
  console.log(`WebSocket backend listening on port ${port}`);
});
