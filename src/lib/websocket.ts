export function buildWsUrl(): string {
  const envUrl = import.meta.env.VITE_WS_URL as string | undefined;
  if (envUrl && envUrl.length > 0) {
    return envUrl;
  }

  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";

  // Local dev: Vite serves the client, the backend runs separately on :8080.
  if (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1") {
    return `${protocol}//localhost:8080`;
  }

  return `${protocol}//${window.location.host}`;
}
