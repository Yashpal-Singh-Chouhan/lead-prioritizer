"""A simple 'max N requests per minute per visitor' guard, kept in server memory."""
import time
from collections import defaultdict, deque

from fastapi import HTTPException, Request

_hits: dict[str, deque] = defaultdict(deque)


def rate_limit(bucket: str, per_minute: int):
    def check(request: Request) -> None:
        forwarded = request.headers.get("x-forwarded-for")
        ip = (forwarded or (request.client.host if request.client else "?")).split(",")[0].strip()
        now, window = time.time(), _hits[f"{bucket}:{ip}"]
        while window and now - window[0] > 60:
            window.popleft()
        if len(window) >= per_minute:
            raise HTTPException(status_code=429, detail="Too many requests. Please wait a minute.")
        window.append(now)

    return check
