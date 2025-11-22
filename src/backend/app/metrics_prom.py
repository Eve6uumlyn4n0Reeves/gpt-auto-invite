try:
    from prometheus_client import Counter, Histogram, CONTENT_TYPE_LATEST, generate_latest
except Exception:
    Counter = Histogram = None
    CONTENT_TYPE_LATEST = 'text/plain'
    def generate_latest():
        return b''

if Counter is not None:
    provider_calls_total = Counter(
        'provider_calls_total',
        'Total number of provider API calls',
        labelnames=('endpoint', 'team_id', 'status'),
    )
    
    provider_latency_ms = Histogram(
        'provider_latency_ms',
        'Latency of provider API calls in milliseconds',
        labelnames=('endpoint', 'team_id', 'status'),
        buckets=(5, 10, 25, 50, 100, 200, 400, 800, 1600, 3200)
    )
    maintenance_lock_acquired_total = Counter(
        'maintenance_lock_acquired_total',
        'Total number of times maintenance lock acquired'
    )
    maintenance_lock_miss_total = Counter(
        'maintenance_lock_miss_total',
        'Total number of times maintenance lock acquisition missed'
    )
    admin_api_requests_total = Counter(
        'admin_api_requests_total',
        'Admin API requests count',
        labelnames=('path','method','domain','status'),
    )
    pool_sync_actions_total = Counter(
        'pool_sync_actions_total',
        'Pool sync actions count',
        labelnames=('action','result'),
    )
    child_ops_total = Counter(
        'child_ops_total',
        'Child account operations count',
        labelnames=('action','result'),
    )
else:
    class _Dummy:
        def labels(self, **kwargs):
            return self
        def inc(self, *args, **kwargs):
            pass
        def observe(self, *args, **kwargs):
            pass
    
    provider_calls_total = _Dummy()
    provider_latency_ms = _Dummy()
    maintenance_lock_acquired_total = _Dummy()
    maintenance_lock_miss_total = _Dummy()
    admin_api_requests_total = _Dummy()
    pool_sync_actions_total = _Dummy()
    child_ops_total = _Dummy()
