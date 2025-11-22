"""initial users db

Revision ID: initial_users
Revises:
Create Date: 2025-10-27
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "initial_users"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Enums
    invite_status = sa.Enum(
        "pending", "sent", "accepted", "failed", "cancelled", name="invite_status"
    )
    code_status = sa.Enum("unused", "used", "expired", "blocked", name="code_status")
    bulk_op_type = sa.Enum(
        "mother_import",
        "mother_import_text",
        "code_generate",
        "code_bulk_action",
        name="bulk_operation_type",
    )
    batch_job_status = sa.Enum("pending", "running", "succeeded", "failed", name="batch_job_status")
    batch_job_type = sa.Enum(
        "users_resend",
        "users_cancel",
        "users_remove",
        "codes_disable",
        "pool_sync_mother",
        name="batch_job_type",
    )

    op.create_table(
        "invite_requests",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("mother_id", sa.Integer(), nullable=True),
        sa.Column("team_id", sa.String(length=64), nullable=False),
        sa.Column("email", sa.String(length=320), nullable=False),
        sa.Column("code_id", sa.Integer(), nullable=True),
        sa.Column("status", invite_status, nullable=False, server_default="pending"),
        sa.Column("error_code", sa.String(length=64), nullable=True),
        sa.Column("error_msg", sa.Text(), nullable=True),
        sa.Column("attempt_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("last_attempt_at", sa.DateTime(), nullable=True),
        sa.Column("invite_id", sa.String(length=128), nullable=True),
        sa.Column("member_id", sa.String(length=128), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
    )
    op.create_index("ix_invite_email_team", "invite_requests", ["email", "team_id"], unique=False)
    op.create_index("ix_invite_status", "invite_requests", ["status"], unique=False)

    op.create_table(
        "redeem_codes",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("code_hash", sa.String(length=128), nullable=False, unique=True),
        sa.Column("batch_id", sa.String(length=64), nullable=True),
        sa.Column("status", code_status, nullable=False, server_default="unused"),
        sa.Column("used_by_email", sa.String(length=320), nullable=True),
        sa.Column("used_by_mother_id", sa.Integer(), nullable=True),
        sa.Column("used_by_team_id", sa.String(length=64), nullable=True),
        sa.Column("used_at", sa.DateTime(), nullable=True),
        sa.Column("expires_at", sa.DateTime(), nullable=True),
        sa.Column("meta_json", sa.Text(), nullable=True),
    )
    op.create_index("ix_redeem_status_exp", "redeem_codes", ["status", "expires_at"], unique=False)

    op.create_table(
        "admin_config",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("password_hash", sa.String(length=128), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
    )

    op.create_table(
        "admin_sessions",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("session_id", sa.String(length=64), nullable=False, unique=True),
        sa.Column("expires_at", sa.DateTime(), nullable=False),
        sa.Column("revoked", sa.Boolean(), nullable=False, server_default=sa.text("0")),
        sa.Column("ip", sa.String(length=45), nullable=True),
        sa.Column("ua", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("last_seen_at", sa.DateTime(), nullable=False),
    )

    op.create_table(
        "audit_logs",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("actor", sa.String(length=64), nullable=False),
        sa.Column("action", sa.String(length=64), nullable=False),
        sa.Column("target_type", sa.String(length=64), nullable=True),
        sa.Column("target_id", sa.String(length=128), nullable=True),
        sa.Column("payload_redacted", sa.Text(), nullable=True),
        sa.Column("ip", sa.String(length=45), nullable=True),
        sa.Column("ua", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
    )

    op.create_table(
        "bulk_operation_logs",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("operation_type", bulk_op_type, nullable=False),
        sa.Column("actor", sa.String(length=64), nullable=False),
        sa.Column("total_count", sa.Integer(), nullable=True),
        sa.Column("success_count", sa.Integer(), nullable=True),
        sa.Column("failed_count", sa.Integer(), nullable=True),
        sa.Column("metadata_json", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
    )
    op.create_index("ix_bulk_operation_created_at", "bulk_operation_logs", ["created_at"], unique=False)

    op.create_table(
        "batch_jobs",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("job_type", batch_job_type, nullable=False),
        sa.Column("status", batch_job_status, nullable=False, server_default="pending"),
        sa.Column("actor", sa.String(length=64), nullable=True),
        sa.Column("payload_json", sa.Text(), nullable=True),
        sa.Column("total_count", sa.Integer(), nullable=True),
        sa.Column("success_count", sa.Integer(), nullable=True),
        sa.Column("failed_count", sa.Integer(), nullable=True),
        sa.Column("last_error", sa.Text(), nullable=True),
        sa.Column("metadata_json", sa.Text(), nullable=True),
        sa.Column("started_at", sa.DateTime(), nullable=True),
        sa.Column("finished_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
        sa.Column("attempts", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("max_attempts", sa.Integer(), nullable=False, server_default="3"),
        sa.Column("visible_until", sa.DateTime(), nullable=True),
    )
    op.create_index("ix_batch_job_status", "batch_jobs", ["status"], unique=False)
    op.create_index("ix_batch_job_created_at", "batch_jobs", ["created_at"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_batch_job_created_at", table_name="batch_jobs")
    op.drop_index("ix_batch_job_status", table_name="batch_jobs")
    op.drop_table("batch_jobs")
    op.drop_index("ix_bulk_operation_created_at", table_name="bulk_operation_logs")
    op.drop_table("bulk_operation_logs")
    op.drop_table("audit_logs")
    op.drop_table("admin_sessions")
    op.drop_table("admin_config")
    op.drop_index("ix_redeem_status_exp", table_name="redeem_codes")
    op.drop_table("redeem_codes")
    op.drop_index("ix_invite_status", table_name="invite_requests")
    op.drop_index("ix_invite_email_team", table_name="invite_requests")
    op.drop_table("invite_requests")

