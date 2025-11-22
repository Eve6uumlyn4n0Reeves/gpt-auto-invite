"""通用分页工具

提供统一的分页计算，避免各路由重复实现。
保持现有返回结构：
{
  "items": [...],
  "pagination": { "page", "page_size", "total", "total_pages" }
}
"""
from __future__ import annotations

from dataclasses import dataclass


DEFAULT_MAX_PAGE_SIZE = 200


@dataclass
class PageMeta:
    page: int
    page_size: int
    total: int
    total_pages: int

    def as_dict(self) -> dict:
        return {
            "page": self.page,
            "page_size": self.page_size,
            "total": self.total,
            "total_pages": self.total_pages,
        }


def _clamp(value: int, lo: int, hi: int) -> int:
    return max(lo, min(value, hi))


def compute_pagination(
    total: int,
    page: int,
    page_size: int,
    *,
    max_page_size: int = DEFAULT_MAX_PAGE_SIZE,
) -> tuple[PageMeta, int]:
    """计算分页元数据与偏移量。

    Returns: (meta, offset)
    - 当 total == 0 时，meta.total_pages=0，offset=0，page 保持传入值。
    - 其他情况将 page 截断到有效范围。
    """
    page_size = _clamp(int(page_size or 1), 1, max_page_size)

    if total <= 0:
        return PageMeta(page=int(page or 1), page_size=page_size, total=0, total_pages=0), 0

    total_pages = max(1, (total + page_size - 1) // page_size)
    current_page = _clamp(int(page or 1), 1, total_pages)
    offset = (current_page - 1) * page_size
    return PageMeta(page=current_page, page_size=page_size, total=total, total_pages=total_pages), offset


__all__ = ["compute_pagination", "PageMeta", "DEFAULT_MAX_PAGE_SIZE"]

