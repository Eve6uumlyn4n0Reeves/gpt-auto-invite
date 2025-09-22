from fastapi import APIRouter, Response
from app.metrics_prom import CONTENT_TYPE_LATEST, generate_latest


router = APIRouter()


@router.get("/metrics")
def metrics():
    data = generate_latest()
    return Response(content=data, media_type=CONTENT_TYPE_LATEST)

