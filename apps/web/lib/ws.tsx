"use client";

import { useEffect, useRef, useState } from "react";

export interface WsEvent {
  type: string;
  task_id?: string;
  node_run_id?: string;
  payload?: unknown;
}

export function useEvents(handler: (ev: WsEvent) => void) {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    let ws: WebSocket | null = null;
    let alive = true;
    let retry = 0;

    const connect = () => {
      if (!alive) return;
      const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
      // Talk to server directly (Next.js doesn't proxy WS by default)
      const host = process.env.NEXT_PUBLIC_API_HOST ?? window.location.hostname + ":8080";
      ws = new WebSocket(`${proto}//${host}/ws`);
      ws.onmessage = (e) => {
        try {
          const ev = JSON.parse(e.data) as WsEvent;
          handlerRef.current(ev);
        } catch {/* ignore */}
      };
      ws.onclose = () => {
        if (!alive) return;
        retry += 1;
        setTimeout(connect, Math.min(1000 * retry, 5000));
      };
    };
    connect();
    return () => {
      alive = false;
      ws?.close();
    };
  }, []);
}

export function useTick() {
  const [n, setN] = useState(0);
  useEvents(() => setN((x) => x + 1));
  return n;
}
