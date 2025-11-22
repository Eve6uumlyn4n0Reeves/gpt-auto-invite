#!/usr/bin/env python3
"""
数据库物理分离脚本
将单一的app.db按照用户组和号池组业务逻辑分离为两个独立的数据库文件
"""

import sqlite3
import os
import sys
from datetime import datetime

def main():
    data_dir = "../data"
    original_db = os.path.join(data_dir, "app.db")
    users_db = os.path.join(data_dir, "users.db")
    pool_db = os.path.join(data_dir, "pool.db")

    print("🚀 开始数据库物理分离...")
    print(f"原始数据库: {original_db}")
    print(f"目标用户库: {users_db}")
    print(f"目标号池库: {pool_db}")

    # 检查原始数据库存在
    if not os.path.exists(original_db):
        print(f"❌ 错误: 原始数据库 {original_db} 不存在")
        return 1

    # 创建新的数据库文件
    print("\n📁 创建新的数据库文件...")
    for db_path in [users_db, pool_db]:
        if os.path.exists(db_path):
            os.remove(db_path)
            print(f"  删除已存在的: {db_path}")

    # 连接到原始数据库
    print("\n🔗 连接到原始数据库...")
    try:
        orig_conn = sqlite3.connect(original_db)
        orig_cursor = orig_conn.cursor()
    except Exception as e:
        print(f"❌ 连接原始数据库失败: {e}")
        return 1

    # 创建用户库和号池库连接
    users_conn = sqlite3.connect(users_db)
    pool_conn = sqlite3.connect(pool_db)
    users_cursor = users_conn.cursor()
    pool_cursor = pool_conn.cursor()

    try:
        # 获取所有表
        orig_cursor.execute("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
        all_tables = [row[0] for row in orig_cursor.fetchall()]
        print(f"  发现表: {len(all_tables)} 个")

        # 表分类
        users_tables = [
            'admin_config',
            'admin_sessions',
            'audit_logs',
            'invite_requests',
            'redeem_codes',
            'batch_jobs',
            'bulk_operation_logs'
        ]

        pool_tables = [
            'mother_accounts',
            'mother_teams',
            'mother_groups',
            'pool_groups',
            'pool_group_settings',
            'child_accounts',
            'seats',
            'group_daily_sequences'
        ]

        # 系统表（两个库都需要）
        system_tables = ['alembic_version']

        print(f"\n📋 表分类:")
        print(f"  用户库表 ({len(users_tables)}): {users_tables}")
        print(f"  号池库表 ({len(pool_tables)}): {pool_tables}")
        print(f"  系统表 ({len(system_tables)}): {system_tables}")

        # 验证分类完整性
        unclassified = [t for t in all_tables if t not in users_tables + pool_tables + system_tables]
        if unclassified:
            print(f"⚠️  未分类的表: {unclassified}")
            response = input("是否将这些表放入号池库? (y/N): ")
            if response.lower() == 'y':
                pool_tables.extend(unclassified)

        # 复制表结构和数据到用户库
        print(f"\n👤 创建用户库...")
        for table in users_tables + system_tables:
            if table in all_tables:
                copy_table(orig_cursor, users_cursor, table, "用户库")

        # 复制表结构和数据到号池库
        print(f"\n🏊 创建号池库...")
        for table in pool_tables + system_tables:
            if table in all_tables:
                copy_table(orig_cursor, pool_cursor, table, "号池库")

        # 提交更改
        users_conn.commit()
        pool_conn.commit()

        print(f"\n✅ 数据库分离完成!")
        print(f"用户库: {users_db} (大小: {os.path.getsize(users_db)} bytes)")
        print(f"号池库: {pool_db} (大小: {os.path.getsize(pool_db)} bytes)")

        # 验证数据完整性
        print(f"\n🔍 验证数据完整性...")
        verify_data(users_cursor, users_tables, "用户库")
        verify_data(pool_cursor, pool_tables, "号池库")

        return 0

    except Exception as e:
        print(f"❌ 分离过程中出错: {e}")
        # 清理部分创建的文件
        for db_path in [users_db, pool_db]:
            if os.path.exists(db_path):
                os.remove(db_path)
                print(f"  已清理: {db_path}")
        return 1

    finally:
        orig_conn.close()
        users_conn.close()
        pool_conn.close()

def copy_table(src_cursor, dst_cursor, table_name, db_name):
    """复制表结构和数据"""
    try:
        # 获取创建表的SQL
        src_cursor.execute(f"SELECT sql FROM sqlite_master WHERE name='{table_name}' AND type='table'")
        create_sql = src_cursor.fetchone()

        if not create_sql or not create_sql[0]:
            print(f"  ⚠️  表 {table_name} 不存在或无创建语句")
            return

        # 创建表
        dst_cursor.execute(create_sql[0])

        # 获取数据并复制
        src_cursor.execute(f"SELECT * FROM {table_name}")
        rows = src_cursor.fetchall()

        if rows:
            # 获取列数
            src_cursor.execute(f"PRAGMA table_info({table_name})")
            columns = [col[1] for col in src_cursor.fetchall()]
            placeholders = ','.join(['?'] * len(columns))

            dst_cursor.executemany(f"INSERT INTO {table_name} VALUES ({placeholders})", rows)

        print(f"  ✅ {db_name}: 复制表 {table_name} ({len(rows)} 行)")

    except Exception as e:
        print(f"  ❌ {db_name}: 复制表 {table_name} 失败: {e}")
        raise

def verify_data(cursor, tables, db_name):
    """验证数据完整性"""
    print(f"  {db_name} 验证:")
    for table in tables:
        try:
            cursor.execute(f"SELECT COUNT(*) FROM {table}")
            count = cursor.fetchone()[0]
            print(f"    {table}: {count} 行")
        except Exception as e:
            print(f"    {table}: 验证失败 - {e}")

if __name__ == "__main__":
    sys.exit(main())