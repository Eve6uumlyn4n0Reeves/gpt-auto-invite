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
