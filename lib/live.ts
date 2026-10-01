// Live updates from the server (server-sent events), so a teammate's claim shows up within a moment.
// We read the stream with fetch() instead of the browser's EventSource, because EventSource
// can't send our login token in a header (it would have to go in the URL, where it gets logged).
import type { LeadEvent } from "./types";
import { API_URL } from "./client";
import { clearSession, readSession } from "./auth";

// Opens the stream and keeps it open: if the connection drops (server restart, Wi-Fi blip) it
// reconnects, waiting a little longer each time. Returns a function that closes it for good.
export function openLiveUpdates(onEvent: (event: LeadEvent) => void, onStatus: (connected: boolean) => void): () => void {
  let stopped = false;
  let controller = new AbortController();
  let everConnected = false;

  async function run() {
    let delay = 1000;
    while (!stopped) {
      controller = new AbortController();
      try {
        const session = readSession();
        if (!session) return;
        const res = await fetch(`${API_URL}/events`, {
          headers: { Authorization: `Bearer ${session.token}` },
          signal: controller.signal,
          cache: "no-store",
        });
        if (res.status === 401) {
          clearSession(); // login expired: the app layout sends the user to the login page
          return;
        }
        if (!res.ok || !res.body) throw new Error(`stream failed (${res.status})`);

        onStatus(true);
        // after a reconnect we may have missed events, so the app reloads its lists
        if (everConnected) onEvent({ type: "resync" });
        everConnected = true;
        delay = 1000;

        const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
        let buffer = "";
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += value;
          // events are separated by a blank line; lines starting with ":" are keep-alive pings
          let end;
          while ((end = buffer.indexOf("\n\n")) >= 0) {
            const block = buffer.slice(0, end);
            buffer = buffer.slice(end + 2);
            const data = block
              .split("\n")
              .filter((line) => line.startsWith("data: "))
              .map((line) => line.slice(6))
              .join("\n");
            if (data) onEvent(JSON.parse(data) as LeadEvent);
          }
        }
      } catch {
        if (stopped) return;
      }
      onStatus(false);
      await new Promise((resolve) => setTimeout(resolve, delay));
      delay = Math.min(delay * 2, 15000);
    }
  }

  run();
  return () => {
    stopped = true;
    controller.abort();
  };
}
