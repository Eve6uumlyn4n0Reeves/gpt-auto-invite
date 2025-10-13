#!/usr/bin/env python3
"""
性能测试脚本 - 验证N+1查询优化效果
"""
import time
import statistics
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from app.database import DATABASE_URL, Base
from app import models

def test_query_performance():
    """测试关键查询的性能"""
    print("=== 数据库查询性能测试 ===")

    # 创建数据库连接
    engine = create_engine(DATABASE_URL)
    SessionLocal = sessionmaker(bind=engine)
    db = SessionLocal()

    try:
        # 测试统计接口性能
        print("\n1. 测试统计接口性能...")
        test_stats_performance(db)

        # 测试用户列表接口性能
        print("\n2. 测试用户列表接口性能...")
        test_users_list_performance(db)

        # 测试兑换码列表接口性能
        print("\n3. 测试兑换码列表接口性能...")
        test_codes_list_performance(db)

        # 测试导出接口性能
        print("\n4. 测试导出接口性能...")
        test_export_performance(db)

    except Exception as e:
        print(f"测试过程中发生错误: {e}")
    finally:
        db.close()

def test_stats_performance(db):
    """测试统计接口性能"""
    times = []

    for i in range(5):
        start_time = time.time()

        # 模拟统计接口的关键查询
        # 基础统计
        total_codes = db.query(models.RedeemCode).count()
        used_codes = db.query(models.RedeemCode).filter(models.RedeemCode.status == models.CodeStatus.used).count()

        # 邀请统计
        total_invites = db.query(models.InviteRequest).count()
        pending_invites = db.query(models.InviteRequest).filter(models.InviteRequest.status == models.InviteStatus.pending).count()

        # 母账号使用情况统计（优化后的版本）
        mothers = db.query(models.MotherAccount).all()
        if mothers:
            mother_ids = [m.id for m in mothers]
            seat_usage_stats = db.query(
                models.SeatAllocation.mother_id,
                db.func.count(models.SeatAllocation.id).label('used_count')
            ).filter(
                models.SeatAllocation.mother_id.in_(mother_ids),
                models.SeatAllocation.status.in_([models.SeatStatus.held, models.SeatStatus.used])
            ).group_by(models.SeatAllocation.mother_id).all()

        # 最近7天活动统计（优化后的版本）
        from datetime import datetime, timedelta
        from sqlalchemy import and_, or_

        dates = []
        date_ranges = []
        for i in range(7):
            date = datetime.utcnow().date() - timedelta(days=i)
            start_time = datetime.combine(date, datetime.min.time())
            end_time = datetime.combine(date, datetime.max.time())
            dates.append(date)
            date_ranges.append((start_time, end_time))

        if date_ranges:
            invite_conditions = []
            redemption_conditions = []

            for start_time, end_time in date_ranges:
                invite_conditions.append(
                    and_(
                        models.InviteRequest.created_at >= start_time,
                        models.InviteRequest.created_at <= end_time
                    )
                )
                redemption_conditions.append(
                    and_(
                        models.RedeemCode.status == models.CodeStatus.used,
                        models.RedeemCode.used_at >= start_time,
                        models.RedeemCode.used_at <= end_time
                    )
                )

            if invite_conditions:
                daily_stats = db.query(
                    db.func.date_trunc('day', models.InviteRequest.created_at).label('date'),
                    db.func.count(models.InviteRequest.id).label('invites')
                ).filter(
                    or_(*invite_conditions)
                ).group_by(
                    db.func.date_trunc('day', models.InviteRequest.created_at)
                ).all()

        end_time = time.time()
        query_time = end_time - start_time
        times.append(query_time)
        print(f"  第{i+1}次: {query_time:.3f}s")

    avg_time = statistics.mean(times)
    print(f"  平均时间: {avg_time:.3f}s")
    print(f"  最快: {min(times):.3f}s, 最慢: {max(times):.3f}s")

    if avg_time < 0.5:
        print("  ✅ 性能良好 (< 500ms)")
    else:
        print("  ⚠️  性能需要优化 (> 500ms)")

def test_users_list_performance(db):
    """测试用户列表接口性能"""
    times = []

    for i in range(5):
        start_time = time.time()

        # 模拟优化后的用户列表查询
        users = db.query(models.InviteRequest).all()

        if users:
            # 批量预加载关联数据
            code_ids = [u.code_id for u in users if u.code_id]
            team_ids = set(u.team_id for u in users if u.team_id)

            # 批量查询兑换码
            if code_ids:
                codes = db.query(models.RedeemCode).filter(models.RedeemCode.id.in_(code_ids)).all()

            # 批量查询团队信息
            if team_ids:
                teams = db.query(models.MotherTeam).filter(models.MotherTeam.team_id.in_(team_ids)).all()

        end_time = time.time()
        query_time = end_time - start_time
        times.append(query_time)
        print(f"  第{i+1}次: {query_time:.3f}s")

    avg_time = statistics.mean(times)
    print(f"  平均时间: {avg_time:.3f}s")
    print(f"  最快: {min(times):.3f}s, 最慢: {max(times):.3f}s")

    if avg_time < 0.3:
        print("  ✅ 性能良好 (< 300ms)")
    else:
        print("  ⚠️  性能需要优化 (> 300ms)")

def test_codes_list_performance(db):
    """测试兑换码列表接口性能"""
    times = []

    for i in range(5):
        start_time = time.time()

        # 模拟优化后的兑换码列表查询
        codes = db.query(models.RedeemCode).order_by(models.RedeemCode.created_at.desc()).all()

        if codes:
            code_ids = [c.id for c in codes]

            # 批量查询邀请信息
            inv_rows = db.query(models.InviteRequest).filter(models.InviteRequest.code_id.in_(code_ids)).all()

            # 预取母号与团队信息
            mother_ids = set()
            team_ids = set()

            for c in codes:
                if c.used_by_mother_id:
                    mother_ids.add(c.used_by_mother_id)
                if c.used_by_team_id:
                    team_ids.add(c.used_by_team_id)

            for inv in inv_rows:
                if inv.mother_id:
                    mother_ids.add(inv.mother_id)
                if inv.team_id:
                    team_ids.add(inv.team_id)

            # 批量查询母号和团队信息
            if mother_ids:
                mothers = db.query(models.MotherAccount).filter(models.MotherAccount.id.in_(mother_ids)).all()

            if team_ids:
                teams = db.query(models.MotherTeam).filter(models.MotherTeam.team_id.in_(team_ids)).all()

        end_time = time.time()
        query_time = end_time - start_time
        times.append(query_time)
        print(f"  第{i+1}次: {query_time:.3f}s")

    avg_time = statistics.mean(times)
    print(f"  平均时间: {avg_time:.3f}s")
    print(f"  最快: {min(times):.3f}s, 最慢: {max(times):.3f}s")

    if avg_time < 0.4:
        print("  ✅ 性能良好 (< 400ms)")
    else:
        print("  ⚠️  性能需要优化 (> 400ms)")

def test_export_performance(db):
    """测试导出接口性能"""
    times = []

    for i in range(3):  # 导出测试减少次数
        start_time = time.time()

        # 模拟导出用户数据
        rows = db.query(models.InviteRequest).order_by(models.InviteRequest.created_at.desc()).limit(1000).all()

        if rows:
            # 优化后的批量预加载
            code_ids = [u.code_id for u in rows if u.code_id]
            team_ids = set(u.team_id for u in rows if u.team_id)

            if code_ids:
                codes = db.query(models.RedeemCode).filter(models.RedeemCode.id.in_(code_ids)).all()

            if team_ids:
                teams = db.query(models.MotherTeam).filter(models.MotherTeam.team_id.in_(team_ids)).all()

        end_time = time.time()
        query_time = end_time - start_time
        times.append(query_time)
        print(f"  第{i+1}次: {query_time:.3f}s")

    avg_time = statistics.mean(times)
    print(f"  平均时间: {avg_time:.3f}s")
    print(f"  最快: {min(times):.3f}s, 最慢: {max(times):.3f}s")

    if avg_time < 1.0:
        print("  ✅ 性能良好 (< 1000ms)")
    else:
        print("  ⚠️  性能需要优化 (> 1000ms)")

if __name__ == "__main__":
    test_query_performance()