#!/usr/bin/env python3
"""
粗粒度扫描：找出同一个 Python 文件同时引用 Users 与 Pool 域标识（Session/Repository/Model）的场景。

执行方式：
    python scripts/check_domain_isolation.py [--root src/backend/app]

输出：
    - 发现跨域文件时打印告警列表并返回非零 exit code；
    - 若未发现，则打印“OK”并返回 0。

用途：
    - 作为开发阶段的快速自检工具；
    - 可集成至 CI，阻止新的跨域代码进入仓库。
"""
from __future__ import annotations

import argparse
import pathlib
import sys

USERS_MARKERS = {
    "SessionUsers",
    "BaseUsers",
    "UsersRepository",
    "get_db_users",
    "get_db",
}

POOL_MARKERS = {
    "SessionPool",
    "BasePool",
    "MotherRepository",
    "get_db_pool",
    "PoolGroup",
    "MotherAccount",
}

EXPLICIT_WHITELIST: set[str] = set()


def scan_file(path: pathlib.Path) -> tuple[bool, bool]:
    try:
        text = path.read_text(encoding="utf-8")
    except UnicodeDecodeError:
        return False, False

    has_users = any(marker in text for marker in USERS_MARKERS)
    has_pool = any(marker in text for marker in POOL_MARKERS)
    return has_users, has_pool


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--root",
        default="src/backend/app",
        help="需要扫描的根目录（默认：src/backend/app）",
    )
    args = parser.parse_args()

    root = pathlib.Path(args.root).resolve()
    if not root.exists():
        print(f"[check-domain] 根目录不存在: {root}", file=sys.stderr)
        return 2

    offending: list[str] = []
    for py_file in root.rglob("*.py"):
        rel = py_file.relative_to(root)
        rel_str = rel.as_posix()
        if rel_str in EXPLICIT_WHITELIST:
            continue
        has_users, has_pool = scan_file(py_file)
        if has_users and has_pool:
            offending.append(rel_str)

    if offending:
        print("[check-domain] 发现同时引用 Users 与 Pool 的文件：", file=sys.stderr)
        for rel_str in sorted(offending):
            print(f"  - {rel_str}", file=sys.stderr)
        print(
            "\n请将上述文件拆分为单域实现，或将其加入 EXPLICIT_WHITELIST（仅在短期过渡期内允许）。",
            file=sys.stderr,
        )
        return 1

    print("[check-domain] OK：未检测到跨域引用。")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

