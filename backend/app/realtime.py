"""Live updates: when someone claims, releases, adds or changes a lead, every open screen
in that team hears about it within a moment, without refreshing.

How it works: each open browser tab keeps one long-lived request open to GET /events
("server-sent events"). The server keeps a small mailbox (queue) per open tab and drops each
team event into the mailboxes of that team's tabs. Everything lives in this server's memory,
which is fine for our single server process (see "Known limitations" in the README)."""
import asyncio
import json
from collections import defaultdict


class Broker:
    def __init__(self) -> None:
        self._queues: dict[str, set[asyncio.Queue]] = defaultdict(set)
        self._loop: asyncio.AbstractEventLoop | None = None

    def start(self, loop: asyncio.AbstractEventLoop) -> None:
        self._loop = loop

    def subscribe(self, team_id: str) -> asyncio.Queue:
        queue: asyncio.Queue = asyncio.Queue(maxsize=100)
        self._queues[team_id].add(queue)
        return queue

    def unsubscribe(self, team_id: str, queue: asyncio.Queue) -> None:
        self._queues[team_id].discard(queue)
        if not self._queues[team_id]:
            del self._queues[team_id]

    def publish(self, team_id: str, event: dict) -> None:
        """Safe to call from our normal endpoints, which FastAPI runs on worker threads:
        the actual delivery is handed over to the server's event loop."""
        if not self._loop:
            return
        data = json.dumps(event, default=str)
        try:
            self._loop.call_soon_threadsafe(self._deliver, team_id, data)
        except RuntimeError:  # the server is shutting down
            pass

    def _deliver(self, team_id: str, data: str) -> None:
        for queue in list(self._queues.get(team_id, ())):
            try:
                queue.put_nowait(data)
            except asyncio.QueueFull:
                pass  # a stuck tab misses this event; it reloads everything when it reconnects


broker = Broker()
