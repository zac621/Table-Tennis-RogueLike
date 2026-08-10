export function buildWsUrl(): string {
  const envUrl = import.meta.env.VITE_WS_URL as string | undefined;
  if (envUrl && envUrl.length > 0) {
    return envUrl;
  }

  const host = window.location.hostname === "localhost" ? "localhost:8080" : window.location.host;
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";

  if (host === "localhost" || host.startsWith("localhost:")) {
    return `${protocol}//localhost:8080`;
  }

  return `${protocol}//${window.location.host}`;
}

export const WS_RECONNECT_MAX_ATTEMPTS = 6;
export const WS_RECONNECT_BASE_DELAY_MS = 1000;
