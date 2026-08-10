import { useEffect, useRef, useState } from "react";
import { buildWsUrl, WS_RECONNECT_BASE_DELAY_MS, WS_RECONNECT_MAX_ATTEMPTS } from "./websocket";

type ConnectMessage = { type: string; [key: string]: unknown };

type MessageHandler = (event: MessageEvent, ws: WebSocket) => void;

export function useReconnectableWebSocket(
  initialMessage: ConnectMessage,
  handleRemoteMessage: MessageHandler,
  onOpen?: (ws: WebSocket) => void,
  onClose?: () => void
) {
  const [status, setStatus] = useState("idle");
  const [ws, setWs] = useState<WebSocket | null>(null);
  const reconnectAttempts = useRef(0);
  const userMessageRef = useRef(initialMessage);

  const connect = () => {
    setStatus("connecting");
    const socket = new WebSocket(buildWsUrl());

    socket.onopen = () => {
      reconnectAttempts.current = 0;
      setStatus("open");
      socket.send(JSON.stringify(userMessageRef.current));
      onOpen?.(socket);
      setWs(socket);
    };

    socket.onmessage = (event) => {
      handleRemoteMessage(event, socket);
    };

    socket.onerror = () => {
      setStatus("error");
    };

    socket.onclose = () => {
      setWs(null);
      onClose?.();
      if (reconnectAttempts.current < WS_RECONNECT_MAX_ATTEMPTS) {
        reconnectAttempts.current += 1;
        const delay = WS_RECONNECT_BASE_DELAY_MS * reconnectAttempts.current;
        setStatus("reconnecting");
        setTimeout(connect, delay);
      } else {
        setStatus("closed");
      }
    };
  };

  useEffect(() => {
    connect();
    return () => {
      ws?.close();
    };
  }, []);

  return { ws, status, connect };
}
