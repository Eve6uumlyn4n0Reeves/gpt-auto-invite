from app.main import app


def test_auto_ingest_validate_cookie_route_unique():
    paths = [getattr(r, "path", None) for r in app.router.routes]
    count = sum(1 for p in paths if p == "/api/admin/auto-ingest/validate-cookie")
    assert count == 1, f"duplicate route detected for /api/admin/auto-ingest/validate-cookie (count={count})"

