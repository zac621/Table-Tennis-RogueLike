import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { motion } from "framer-motion";
import { Copy, Check, Wifi, ArrowLeft, Loader2 } from "lucide-react";

interface Props {
  onReady: (
    ws: WebSocket,
    myPlayerId: "p1" | "p2",
    myName: string,
    partnerName: string,
    lobbyCode: string
  ) => void;
  onBack: () => void;
}

type Mode = "choose" | "create" | "join";
type Status =
  | "idle"
  | "connecting"
  | "waiting_partner"
  | "joining"
  | "joined";

function buildWsUrl() {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${window.location.host}/api/ws`;
}

export default function OnlineLobbyScreen({ onReady, onBack }: Props) {
  const [mode, setMode] = useState<Mode>("choose");
  const [status, setStatus] = useState<Status>("idle");
  const [myName, setMyName] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [lobbyCode, setLobbyCode] = useState("");
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);

  const connectAndSend = (msg: object, onMessage: (ws: WebSocket, data: { type: string; [k: string]: unknown }) => void) => {
    setError("");
    const ws = new WebSocket(buildWsUrl());
    wsRef.current = ws;

    ws.onopen = () => {
      ws.send(JSON.stringify(msg));
    };

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data as string);
      if (data.type === "error") {
        setError(data.message as string);
        setStatus("idle");
        ws.close();
        return;
      }
      onMessage(ws, data);
    };

    ws.onerror = () => {
      setError("Connection failed. Make sure both devices are online.");
      setStatus("idle");
    };

    ws.onclose = () => {
      if (status !== "joined") {
        setStatus("idle");
      }
    };
  };

  const handleCreate = () => {
    if (!myName.trim()) { setError("Enter your name first."); return; }
    setStatus("connecting");
    connectAndSend(
      { type: "create_lobby", playerName: myName.trim() },
      (ws, data) => {
        if (data.type === "lobby_created") {
          setLobbyCode(data.code as string);
          setStatus("waiting_partner");
        } else if (data.type === "partner_joined") {
          setStatus("joined");
          onReady(ws, "p1", myName.trim(), data.partnerName as string, lobbyCode || (data.code as string));
        }
      }
    );
  };

  const handleJoin = () => {
    if (!myName.trim()) { setError("Enter your name first."); return; }
    if (!joinCode.trim()) { setError("Enter the lobby code."); return; }
    setStatus("joining");
    connectAndSend(
      { type: "join_lobby", code: joinCode.trim().toUpperCase(), playerName: myName.trim() },
      (ws, data) => {
        if (data.type === "lobby_joined") {
          setStatus("joined");
          onReady(ws, "p2", myName.trim(), data.partnerName as string, joinCode.trim().toUpperCase());
        }
      }
    );
  };

  const copyCode = () => {
    navigator.clipboard.writeText(lobbyCode).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const busy = status === "connecting" || status === "joining";

  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-col items-center justify-center min-h-screen p-4 bg-background text-foreground"
    >
      <Card className="w-full max-w-md border-border bg-card">
        <CardHeader className="pb-2">
          <div className="flex items-center gap-3">
            <button onClick={onBack} className="text-muted-foreground hover:text-foreground transition-colors">
              <ArrowLeft className="w-5 h-5" />
            </button>
            <CardTitle className="text-2xl font-bold text-primary flex items-center gap-2">
              <Wifi className="w-6 h-6" /> Online Game
            </CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-6 pt-4">

          {/* Name */}
          <div className="space-y-2">
            <Label className="text-muted-foreground uppercase text-xs tracking-widest">Your Name</Label>
            <Input
              placeholder="Enter your name"
              value={myName}
              onChange={e => setMyName(e.target.value)}
              disabled={status !== "idle"}
              className="bg-input border-border text-lg"
              autoFocus
            />
          </div>

          {/* Mode picker */}
          {mode === "choose" && (
            <div className="grid grid-cols-2 gap-3">
              <Button size="lg" className="h-20 text-base font-bold flex-col gap-1" onClick={() => setMode("create")}>
                <span className="text-2xl">🎯</span> Create Game
              </Button>
              <Button size="lg" variant="outline" className="h-20 text-base font-bold flex-col gap-1" onClick={() => setMode("join")}>
                <span className="text-2xl">🔗</span> Join Game
              </Button>
            </div>
          )}

          {/* Create flow */}
          {mode === "create" && (
            <div className="space-y-4">
              {status === "idle" && (
                <Button onClick={handleCreate} className="w-full font-bold text-lg" size="lg" disabled={busy}>
                  {busy ? <Loader2 className="animate-spin w-4 h-4 mr-2" /> : null}
                  Create Lobby
                </Button>
              )}

              {status === "connecting" && (
                <div className="flex items-center justify-center gap-2 text-muted-foreground py-4">
                  <Loader2 className="animate-spin w-4 h-4" /> Connecting…
                </div>
              )}

              {status === "waiting_partner" && lobbyCode && (
                <div className="space-y-4 text-center">
                  <p className="text-sm text-muted-foreground">Share this code with your opponent:</p>
                  <div className="flex items-center justify-center gap-3">
                    <span className="text-5xl font-black tracking-widest text-primary">{lobbyCode}</span>
                    <button onClick={copyCode} className="text-muted-foreground hover:text-primary transition-colors">
                      {copied ? <Check className="w-5 h-5 text-green-400" /> : <Copy className="w-5 h-5" />}
                    </button>
                  </div>
                  <div className="flex items-center justify-center gap-2 text-muted-foreground text-sm">
                    <Loader2 className="animate-spin w-4 h-4" /> Waiting for opponent…
                  </div>
                </div>
              )}

              {status === "idle" && (
                <button onClick={() => setMode("choose")} className="text-sm text-muted-foreground hover:text-foreground w-full text-center">
                  ← Back
                </button>
              )}
            </div>
          )}

          {/* Join flow */}
          {mode === "join" && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label className="text-muted-foreground uppercase text-xs tracking-widest">Lobby Code</Label>
                <Input
                  placeholder="ABC123"
                  value={joinCode}
                  onChange={e => setJoinCode(e.target.value.toUpperCase())}
                  disabled={status !== "idle"}
                  maxLength={6}
                  className="bg-input border-border text-2xl font-bold tracking-widest text-center uppercase"
                />
              </div>

              {status === "idle" && (
                <Button onClick={handleJoin} className="w-full font-bold text-lg" size="lg" disabled={busy}>
                  Join Game
                </Button>
              )}

              {(status === "joining" || status === "joined") && (
                <div className="flex items-center justify-center gap-2 text-muted-foreground py-4">
                  <Loader2 className="animate-spin w-4 h-4" />
                  {status === "joining" ? "Joining…" : "Connected! Waiting for host to start…"}
                </div>
              )}

              {status === "idle" && (
                <button onClick={() => setMode("choose")} className="text-sm text-muted-foreground hover:text-foreground w-full text-center">
                  ← Back
                </button>
              )}
            </div>
          )}

          {error && (
            <p className="text-red-400 text-sm text-center font-semibold">{error}</p>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}
