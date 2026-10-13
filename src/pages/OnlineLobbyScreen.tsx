import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { motion } from "framer-motion";
import { Copy, Check, Wifi, Loader2 } from "lucide-react";
import type { ConnectionStatus } from "@/lib/connection";

interface Props {
  status: ConnectionStatus;
  lobbyCode: string | null; // set once the host's lobby exists
  error: string;
  onCreate: (playerName: string) => void;
  onJoin: (code: string, playerName: string) => void;
  onCancel: () => void;
}

type Mode = "choose" | "create" | "join";

export default function OnlineLobbyScreen({ status, lobbyCode, error, onCreate, onJoin, onCancel }: Props) {
  const [selectedMode, setMode] = useState<Mode>("choose");
  const [myName, setMyName] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [localError, setLocalError] = useState("");
  const [copied, setCopied] = useState(false);

  const busy = status === "connecting";
  const waiting = !!lobbyCode;
  const locked = busy || waiting;
  const shownError = localError || error;
  // A host that reloads while waiting comes back here with a lobby code.
  const mode: Mode = waiting ? "create" : selectedMode;

  const handleCreate = () => {
    if (!myName.trim()) { setLocalError("Enter your name first."); return; }
    setLocalError("");
    onCreate(myName.trim());
  };

  const handleJoin = () => {
    if (!myName.trim()) { setLocalError("Enter your name first."); return; }
    const code = joinCode.trim().toUpperCase();
    if (code.length !== 6) { setLocalError("Lobby code must be exactly 6 characters."); return; }
    setLocalError("");
    onJoin(code, myName.trim());
  };

  const copyCode = () => {
    if (!lobbyCode) return;
    navigator.clipboard?.writeText(lobbyCode).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => { /* clipboard blocked; code is visible anyway */ });
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-col items-center justify-center min-h-screen p-4 bg-background text-foreground"
    >
      <Card className="w-full max-w-md border-border bg-card">
        <CardHeader className="pb-2">
          <CardTitle className="text-3xl font-bold text-center text-primary tracking-tight flex items-center justify-center gap-2">
            <Wifi className="w-7 h-7" /> Ping Pong RPG
          </CardTitle>
          <p className="text-center text-muted-foreground text-sm pt-1">
            Each player joins from their own phone
          </p>
        </CardHeader>
        <CardContent className="space-y-6 pt-4">

          {/* Name */}
          <div className="space-y-2">
            <Label className="text-muted-foreground uppercase text-xs tracking-widest">Your Name</Label>
            <Input
              placeholder="Enter your name"
              value={myName}
              onChange={e => setMyName(e.target.value)}
              onKeyDown={e => e.key === "Enter" && mode === "create" && handleCreate()}
              disabled={locked}
              maxLength={24}
              className="bg-input border-border text-lg"
              autoFocus
            />
          </div>

          {/* Mode picker */}
          {mode === "choose" && (
            <div className="grid grid-cols-2 gap-3">
              <Button size="lg" className="h-20 text-base font-bold flex-col gap-1" onClick={() => { setLocalError(""); setMode("create"); }}>
                <span className="text-2xl">🎯</span> Create Game
              </Button>
              <Button size="lg" variant="outline" className="h-20 text-base font-bold flex-col gap-1" onClick={() => { setLocalError(""); setMode("join"); }}>
                <span className="text-2xl">🔗</span> Join Game
              </Button>
            </div>
          )}

          {/* Create flow */}
          {mode === "create" && (
            <div className="space-y-4">
              {!locked && (
                <Button onClick={handleCreate} className="w-full font-bold text-lg" size="lg">
                  Create Lobby
                </Button>
              )}

              {busy && (
                <div className="flex flex-col items-center justify-center text-muted-foreground py-4">
                  <div className="flex items-center gap-2">
                    <Loader2 className="animate-spin w-4 h-4" /> Connecting…
                  </div>
                  <div className="text-xs mt-1">(may take up to one minute)</div>
                </div>
              )}

              {waiting && (
                <div className="space-y-4 text-center">
                  <p className="text-sm text-muted-foreground">Share this code with your opponent:</p>
                  <div className="flex items-center justify-center gap-3">
                    <span className="text-5xl font-black tracking-widest text-primary">{lobbyCode}</span>
                    <button onClick={copyCode} className="text-muted-foreground hover:text-primary transition-colors" aria-label="Copy code">
                      {copied ? <Check className="w-5 h-5 text-green-400" /> : <Copy className="w-5 h-5" />}
                    </button>
                  </div>
                  <div className="flex items-center justify-center gap-2 text-muted-foreground text-sm">
                    <Loader2 className="animate-spin w-4 h-4" /> Waiting for opponent…
                  </div>
                  <button onClick={onCancel} className="text-sm text-muted-foreground hover:text-foreground w-full text-center">
                    Cancel
                  </button>
                </div>
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
                  onKeyDown={e => e.key === "Enter" && handleJoin()}
                  disabled={locked}
                  maxLength={6}
                  autoCapitalize="characters"
                  autoCorrect="off"
                  className="bg-input border-border text-2xl font-bold tracking-widest text-center uppercase"
                />
              </div>

              {!locked && (
                <Button onClick={handleJoin} className="w-full font-bold text-lg" size="lg">
                  Join Game
                </Button>
              )}

              {busy && (
                <div className="flex items-center justify-center gap-2 text-muted-foreground py-4">
                  <Loader2 className="animate-spin w-4 h-4" /> Joining…
                </div>
              )}
            </div>
          )}

          {mode !== "choose" && !locked && (
            <button onClick={() => { setLocalError(""); setMode("choose"); }} className="text-sm text-muted-foreground hover:text-foreground w-full text-center">
              ← Back
            </button>
          )}

          {shownError && (
            <p className="text-red-400 text-sm text-center font-semibold">{shownError}</p>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}
