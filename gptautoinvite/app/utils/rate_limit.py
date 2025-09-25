import time
from collections import defaultdict, deque

class SimpleRateLimiter:
    def __init__(self, max_events: int, per_seconds: int):
        self.max_events = max_events
        self.per_seconds = per_seconds
        self._buckets: dict[str, deque[float]] = defaultdict(deque)
    
    def allow(self, key: str) -> bool:
        now = time.time()
        dq = self._buckets[key]
        
        # Purge old
        while dq and dq[0] <= now - self.per_seconds:
            dq.popleft()
        
        if len(dq) < self.max_events:
            dq.append(now)
            return True
        
        return False
