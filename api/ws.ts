import { attachWebSocketServer } from "../backend/ws-manager.js";

export const config = {
  runtime: "nodejs",
};

export default function handler(req, res) {
  attachWebSocketServer(req.socket.server, "/api/ws");
  res.status(200).send("WebSocket endpoint");
}
