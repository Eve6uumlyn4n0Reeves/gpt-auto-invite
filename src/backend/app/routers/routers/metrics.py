from fastapi import APIRouter, Response, Request, Depends
from app.metrics_prom import CONTENT_TYPE_LATEST, generate_latest
from app.config import settings
from sqlalchemy.orm import Session
from app.routers.admin.dependencies import get_db, require_admin

router = APIRouter()

@router.get("/metrics")
def metrics(request: Request, db: Session = Depends(get_db)):
    if settings.env in ("prod", "production"):
        require_admin(request, db)
    
    data = generate_latest()
    return Response(content=data, media_type=CONTENT_TYPE_LATEST)
