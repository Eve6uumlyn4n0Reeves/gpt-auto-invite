#!/usr/bin/env python3
"""
性能测试脚本 - 验证N+1查询优化效果
"""
import statistics
import time

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app import models
from app.config import settings
from app.database import BaseUsers, BasePool


def get_session():
    engine = create_engine(settings.database_url)
    # 用单库压测：在同一库创建两套表
    BaseUsers.metadata.create_all(bind=engine)
    BasePool.metadata.create_all(bind=engine)
    SessionLocal = sessionmaker(bind=engine)
    return engine, SessionLocal()


def test_query_performance():
    engine, db = get_session()
    try:
        _run_stats_performance(db)
        _run_users_list_performance(db)
    finally:
        db.close()
        engine.dispose()


def _run_stats_performance(db):
    durations = []
    for _ in range(3):
        start = time.time()
        total_codes = db.query(models.RedeemCode).count()
        used_codes = db.query(models.RedeemCode).filter(models.RedeemCode.status == models.CodeStatus.used).count()
        total_invites = db.query(models.InviteRequest).count()
        pending_invites = db.query(models.InviteRequest).filter(models.InviteRequest.status == models.InviteStatus.pending).count()
        _ = (total_codes, used_codes, total_invites, pending_invites)
        durations.append(time.time() - start)
    print(f"统计接口平均耗时: {statistics.mean(durations):.3f}s")


def _run_users_list_performance(db):
    durations = []
    for _ in range(3):
        start = time.time()
        users = db.query(models.InviteRequest).all()
        code_ids = [u.code_id for u in users if u.code_id]
        if code_ids:
            _ = db.query(models.RedeemCode).filter(models.RedeemCode.id.in_(code_ids)).all()
        durations.append(time.time() - start)
    print(f"用户列表平均耗时: {statistics.mean(durations):.3f}s")


if __name__ == "__main__":
    test_query_performance()
