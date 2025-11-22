#!/usr/bin/env python3
"""
测试分离后数据库的功能
验证Users库和Pool库的独立操作和跨库查询
"""

import os
import sys

# 设置环境变量
os.environ['DATABASE_URL_USERS'] = "sqlite:////Users/jin/Desktop/gpt invite/cloud/data/users.db"
os.environ['DATABASE_URL_POOL'] = "sqlite:////Users/jin/Desktop/gpt invite/cloud/data/pool.db"

def main():
    print("🧪 测试分离后的数据库功能...")

    try:
        # 导入相关模块
        from app.database import get_db_users, get_db_pool, BaseUsers, BasePool
        from app import models
        from app.repositories.users_repository import UsersRepository
        from app.repositories.mother_repository import MotherRepository
        from app.services.services.mother_query import MotherQueryService
        from app.services.services.invites import InviteService

        print("✅ 模块导入成功")

        # 测试数据库连接
        print("\n🔗 测试数据库连接...")
        users_db = next(get_db_users())
        pool_db = next(get_db_pool())

        print(f"  Users库连接: {type(users_db.bind).__name__}")
        print(f"  Pool库连接: {type(pool_db.bind).__name__}")

        # 测试Users库操作
        print("\n👤 测试Users库操作...")
        users_repo = UsersRepository(users_db)

        # 查询管理员配置
        admin_config = users_db.query(models.AdminConfig).first()
        if admin_config:
            print(f"  管理员配置: 存在 (ID: {admin_config.id})")
        else:
            print("  管理员配置: 不存在")

        # 查询兑换码
        codes = users_db.query(models.RedeemCode).all()
        print(f"  兑换码数量: {len(codes)}")

        # 测试Pool库操作
        print("\n🏊 测试Pool库操作...")
        mother_repo = MotherRepository(pool_db)

        # 查询母号账户
        mothers = pool_db.query(models.MotherAccount).all()
        print(f"  母号数量: {len(mothers)}")
        for mother in mothers:
            print(f"    - {mother.name} (组: {mother.group_id}, 池组: {mother.pool_group_id})")

        # 查询用户组和号池组
        mother_groups = pool_db.query(models.MotherGroup).all()
        pool_groups = pool_db.query(models.PoolGroup).all()
        print(f"  用户组数量: {len(mother_groups)}")
        print(f"  号池组数量: {len(pool_groups)}")

        # 测试服务层
        print("\n🔧 测试服务层...")

        # Mother查询服务
        mother_query_svc = MotherQueryService(pool_db, mother_repo)
        mother_summaries = mother_query_svc.list_mothers()
        print(f"  Mother查询服务: 查到 {len(mother_summaries.items)} 个母号")

        # Invite服务
        invite_svc = InviteService(users_repo, mother_repo)
        print(f"  Invite服务: 初始化成功")

        # 测试跨库查询
        print("\n📊 测试独立库查询...")

        # 测试两个库完全独立查询
        for mother in mothers:
            # 在Users库中按team_id查找相关的invite请求（通过team_id关联，而不是mother_id）
            teams = pool_db.query(models.MotherTeam).filter(
                models.MotherTeam.mother_id == mother.id
            ).all()

            total_invites = 0
            for team in teams:
                invites = users_db.query(models.InviteRequest).filter(
                    models.InviteRequest.team_id == team.team_id
                ).all()
                total_invites += len(invites)

            print(f"  母号 {mother.name} 的邀请请求数: {total_invites} (通过团队关联)")

        print("\n✅ 所有测试通过！数据库完全分离成功！")

        # 关闭连接
        users_db.close()
        pool_db.close()

        return 0

    except Exception as e:
        print(f"\n❌ 测试失败: {e}")
        import traceback
        traceback.print_exc()
        return 1

if __name__ == "__main__":
    sys.exit(main())