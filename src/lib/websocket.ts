export function buildWsUrl() {
  const envUrl = import.meta.env.VITE_WS_URL as string | undefined;
  if (envUrl && envUrl.length > 0) {
    return envUrl;
  }

  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${window.location.host}/api/ws`;
}

export const WS_RECONNECT_MAX_ATTEMPTS = 6;
export const WS_RECONNECT_BASE_DELAY_MS = 1000;
