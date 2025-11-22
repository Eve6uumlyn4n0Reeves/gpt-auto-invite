"""initial pool db

Revision ID: initial_pool
Revises:
Create Date: 2025-10-27
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "initial_pool"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Enums
    mother_status = sa.Enum("active", "invalid", "disabled", name="mother_status")
    seat_status = sa.Enum("free", "held", "used", name="seat_status")

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

    op.create_table(
        "pool_groups",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("name", sa.String(length=100), nullable=False, unique=True),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("1")),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
    )

    op.create_table(
        "pool_group_settings",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("group_id", sa.Integer(), nullable=False, unique=True),
        sa.Column("team_template", sa.String(length=200), nullable=True),
        sa.Column("child_name_template", sa.String(length=200), nullable=True),
        sa.Column("child_email_template", sa.String(length=200), nullable=True),
        sa.Column("email_domain", sa.String(length=255), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("1")),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["group_id"], ["pool_groups.id"], ondelete="CASCADE"),
    )

    op.create_table(
        "group_daily_sequences",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("group_id", sa.Integer(), nullable=False),
        sa.Column("seq_type", sa.String(length=16), nullable=False),
        sa.Column("date_yyyymmdd", sa.String(length=8), nullable=False),
        sa.Column("current_value", sa.Integer(), nullable=False, server_default="0"),
        sa.ForeignKeyConstraint(["group_id"], ["pool_groups.id"], ondelete="CASCADE"),
        sa.UniqueConstraint("group_id", "seq_type", "date_yyyymmdd", name="uq_group_seq_date"),
    )
    op.create_index("ix_group_seq", "group_daily_sequences", ["group_id", "seq_type", "date_yyyymmdd"], unique=False)

    op.create_table(
        "mother_accounts",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("access_token_enc", sa.Text(), nullable=False),
        sa.Column("token_expires_at", sa.DateTime(), nullable=True),
        sa.Column("status", mother_status, nullable=False, server_default="active"),
        sa.Column("seat_limit", sa.Integer(), nullable=False, server_default="7"),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("group_id", sa.Integer(), nullable=True),
        sa.Column("pool_group_id", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["group_id"], ["mother_groups.id"], ondelete=None),
        sa.ForeignKeyConstraint(["pool_group_id"], ["pool_groups.id"], ondelete="SET NULL"),
    )

    op.create_table(
        "mother_teams",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("mother_id", sa.Integer(), nullable=False),
        sa.Column("team_id", sa.String(length=64), nullable=False),
        sa.Column("team_name", sa.String(length=255), nullable=True),
        sa.Column("is_enabled", sa.Boolean(), nullable=False, server_default=sa.text("1")),
        sa.Column("is_default", sa.Boolean(), nullable=False, server_default=sa.text("0")),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["mother_id"], ["mother_accounts.id"], ondelete="CASCADE"),
        sa.UniqueConstraint("mother_id", "team_id", name="uq_mother_team"),
    )
    op.create_index("ix_team_enabled", "mother_teams", ["team_id", "is_enabled"], unique=False)

    op.create_table(
        "child_accounts",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("child_id", sa.String(length=100), nullable=False, unique=True),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("email", sa.String(length=255), nullable=False),
        sa.Column("mother_id", sa.Integer(), nullable=False),
        sa.Column("team_id", sa.String(length=100), nullable=False),
        sa.Column("team_name", sa.String(length=200), nullable=False),
        sa.Column("status", sa.String(length=50), nullable=False, server_default="active"),
        sa.Column("access_token_enc", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
        sa.Column("member_id", sa.String(length=128), nullable=True),
        sa.ForeignKeyConstraint(["mother_id"], ["mother_accounts.id"], ondelete=None),
        sa.UniqueConstraint("mother_id", "team_id", "email", name="uq_child_one_team"),
    )
    op.create_index("ix_child_mother", "child_accounts", ["mother_id"], unique=False)

    op.create_table(
        "seats",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("mother_id", sa.Integer(), nullable=False),
        sa.Column("slot_index", sa.Integer(), nullable=False),
        sa.Column("team_id", sa.String(length=64), nullable=True),
        sa.Column("email", sa.String(length=320), nullable=True),
        sa.Column("status", seat_status, nullable=False, server_default="free"),
        sa.Column("held_until", sa.DateTime(), nullable=True),
        sa.Column("invite_request_id", sa.Integer(), nullable=True),
        sa.Column("invite_id", sa.String(length=128), nullable=True),
        sa.Column("member_id", sa.String(length=128), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["mother_id"], ["mother_accounts.id"], ondelete="CASCADE"),
        sa.UniqueConstraint("mother_id", "slot_index", name="uq_mother_slot"),
        sa.UniqueConstraint("team_id", "email", name="uq_team_email_single_seat"),
    )
    op.create_index("ix_seat_mother", "seats", ["mother_id"], unique=False)
    op.create_index("ix_seat_status", "seats", ["status"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_seat_status", table_name="seats")
    op.drop_index("ix_seat_mother", table_name="seats")
    op.drop_table("seats")
    op.drop_index("ix_child_mother", table_name="child_accounts")
    op.drop_table("child_accounts")
    op.drop_index("ix_team_enabled", table_name="mother_teams")
    op.drop_table("mother_teams")
    op.drop_table("mother_accounts")
    op.drop_index("ix_group_seq", table_name="group_daily_sequences")
    op.drop_table("group_daily_sequences")
    op.drop_table("pool_group_settings")
    op.drop_table("pool_groups")
    op.drop_table("mother_groups")
