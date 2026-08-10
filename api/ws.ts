import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createWebSocketServer } from "../backend/ws-manager";

export const config = {
  runtime: "nodejs",
};

export default function handler(req: VercelRequest, res: VercelResponse) {
  createWebSocketServer(req, res);
}
