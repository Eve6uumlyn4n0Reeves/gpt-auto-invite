import threading
import time
from collections import defaultdict
from typing import Optional

class ProviderMetrics:
    def __init__(self):
        self._lock = threading.Lock()
        # key: (endpoint, team_id, status_code)
        self._counts = defaultdict(int)
        self._latency = defaultdict(float)
    
    def record(self, endpoint: str, team_id: Optional[str], status: int, latency_ms: float):
        key = (endpoint, team_id or "-", status)
        with self._lock:
            self._counts[key] += 1
            self._latency[key] += latency_ms
        
        # Also export to Prometheus if available
        try:
            from app.metrics_prom import provider_calls_total, provider_latency_ms
            provider_calls_total.labels(endpoint=endpoint, team_id=team_id or "-", status=str(status)).inc()
            provider_latency_ms.labels(endpoint=endpoint, team_id=team_id or "-", status=str(status)).observe(latency_ms)
        except Exception:
            pass
    
    def snapshot(self):
        with self._lock:
            items = []
            for (endpoint, team_id, status), count in self._counts.items():
                total_ms = self._latency[(endpoint, team_id, status)]
                avg_ms = total_ms / count if count else 0
                items.append({
                    "endpoint": endpoint,
                    "team_id": team_id,
                    "status": status,
                    "count": count,
                    "avg_ms": round(avg_ms, 1),
                })
            return sorted(items, key=lambda x: (-x["count"], x["endpoint"]))

provider_metrics = ProviderMetrics()
