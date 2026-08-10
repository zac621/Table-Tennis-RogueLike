import type { VercelRequest, VercelResponse } from "@vercel/node";
import { attachWebSocketServer } from "../backend/ws-manager.js";

export const config = {
  runtime: "nodejs",
};

export default function handler(req: VercelRequest, res: VercelResponse) {
  const server = (req.socket as unknown as { server: unknown }).server;
  attachWebSocketServer(server, "/api/ws");
  res.status(200).send("WebSocket endpoint");
}
