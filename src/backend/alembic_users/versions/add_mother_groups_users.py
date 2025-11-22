"""
add mother_groups and mother_group_settings to Users DB

Revision ID: add_mother_groups_users
Revises: add_mother_group_id_to_redeem_codes
Create Date: 2025-11-08
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "add_mother_groups_users"
down_revision = "add_mother_group_id_to_redeem_codes"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "mother_groups",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("name", sa.String(length=100), nullable=False, unique=True),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("team_name_template", sa.String(length=200), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("1")),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
    )
    op.create_index("ix_mother_groups_is_active", "mother_groups", ["is_active"], unique=False)
    op.create_index("ix_mother_groups_created_at", "mother_groups", ["created_at"], unique=False)

    op.create_table(
        "mother_group_settings",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("group_id", sa.Integer(), nullable=False, unique=True),
        sa.Column("team_name_template", sa.String(length=200), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
    )


def downgrade() -> None:
    op.drop_table("mother_group_settings")
    op.drop_index("ix_mother_groups_created_at", table_name="mother_groups")
    op.drop_index("ix_mother_groups_is_active", table_name="mother_groups")
    op.drop_table("mother_groups")

