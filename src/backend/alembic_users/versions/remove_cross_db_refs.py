"""remove cross-database references

Revision ID: remove_cross_db_refs
Revises: initial_users
Create Date: 2025-10-28

"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "remove_cross_db_refs"
down_revision = "initial_users"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 移除跨库引用字段
    op.drop_index("ix_invite_email_team", table_name="invite_requests")
    op.drop_column("invite_requests", "mother_id")
    # 重新创建索引（不包含mother_id）
    op.create_index("ix_invite_email_team", "invite_requests", ["email", "team_id"], unique=False)

    op.drop_column("redeem_codes", "used_by_mother_id")


def downgrade() -> None:
    # 重新添加跨库引用字段（用于回滚）
    op.add_column("redeem_codes", sa.Column("used_by_mother_id", sa.Integer(), nullable=True))

    op.drop_index("ix_invite_email_team", table_name="invite_requests")
    op.add_column("invite_requests", sa.Column("mother_id", sa.Integer(), nullable=True))
    # 重新创建原始索引
    op.create_index("ix_invite_email_team", "invite_requests", ["email", "team_id"], unique=False)