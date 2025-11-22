from __future__ import annotations

from typing import Optional

from app.repositories import UsersRepository
from app import models


class CodeSkuService:
    """Business helper around CodeSku CRUD."""

    def __init__(self, repo: UsersRepository):
        self.repo = repo

    def list_skus(self, *, include_inactive: bool = False) -> list[models.CodeSku]:
        return self.repo.list_code_skus(include_inactive=include_inactive)

    def create_sku(
        self,
        *,
        name: str,
        slug: str,
        description: Optional[str],
        lifecycle_days: int,
        default_refresh_limit: Optional[int],
        price_cents: Optional[int],
        is_active: bool,
    ) -> models.CodeSku:
        existing = self.repo.get_code_sku_by_slug(slug, include_inactive=True)
        if existing:
            raise ValueError(f"SKU {slug} 已存在")
        sku = self.repo.create_code_sku(
            name=name,
            slug=slug,
            description=description,
            lifecycle_days=lifecycle_days,
            default_refresh_limit=default_refresh_limit,
            price_cents=price_cents,
            is_active=is_active,
        )
        return sku

    def update_sku(
        self,
        sku_id: int,
        *,
        name: Optional[str] = None,
        description: Optional[str] = None,
        lifecycle_days: Optional[int] = None,
        default_refresh_limit: Optional[int] = None,
        price_cents: Optional[int] = None,
        is_active: Optional[bool] = None,
    ) -> models.CodeSku:
        sku = self.repo.get_code_sku(sku_id)
        if not sku:
            raise ValueError("兑换码商品不存在")

        if name is not None:
            sku.name = name
        if description is not None:
            sku.description = description
        if lifecycle_days is not None:
            sku.lifecycle_days = lifecycle_days
        if default_refresh_limit is not None:
            sku.default_refresh_limit = default_refresh_limit
        if price_cents is not None:
            sku.price_cents = price_cents
        if is_active is not None:
            sku.is_active = is_active

        self.repo.save_code_sku(sku)
        return sku

