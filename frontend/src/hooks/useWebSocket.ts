import { useEffect, useRef } from "react";

export function useWebSocket(
  url: string,
  onMessage: (data: unknown) => void
) {
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    let reconnectTimeout: ReturnType<typeof setTimeout>;

    function connect() {
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log("[WS] Connected to", url);
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data as string);
          onMessage(data);
        } catch (e) {
          console.error("[WS] Parse error:", e);
        }
      };

      ws.onclose = () => {
        console.log("[WS] Disconnected, reconnecting in 2s...");
        reconnectTimeout = setTimeout(connect, 2000);
      };

      ws.onerror = (err) => {
        console.error("[WS] Error:", err);
        ws.close();
      };
    }

    connect();

    return () => {
      clearTimeout(reconnectTimeout);
      wsRef.current?.close();
    };
  }, [url]);
}
