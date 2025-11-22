"""add code lifecycle fields and switch requests table

Revision ID: add_code_lifecycle_switch_requests
Revises: add_mother_groups_users
Create Date: 2025-11-22 12:00:00.000000
"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "add_code_lifecycle_switch_requests"
down_revision = "add_mother_groups_users"
branch_labels = None
depends_on = None


redeem_code_lifecycle_enum = sa.Enum(
    "weekly",
    "monthly",
    name="redeemcodelifecycle",
)


def upgrade() -> None:
    bind = op.get_bind()
    dialect_name = bind.dialect.name if bind else ""
    
    # 获取现有列
    inspector = sa.inspect(bind)
    existing_columns = {col['name'] for col in inspector.get_columns('redeem_codes')}

    redeem_code_lifecycle_enum.create(op.get_bind(), checkfirst=True)

    # 仅添加不存在的列
    if 'lifecycle_plan' not in existing_columns:
        op.add_column(
            "redeem_codes",
            sa.Column("lifecycle_plan", redeem_code_lifecycle_enum, nullable=True),
        )
    if 'lifecycle_started_at' not in existing_columns:
        op.add_column(
            "redeem_codes",
            sa.Column("lifecycle_started_at", sa.DateTime(), nullable=True),
        )
    if 'lifecycle_expires_at' not in existing_columns:
        op.add_column(
            "redeem_codes",
            sa.Column("lifecycle_expires_at", sa.DateTime(), nullable=True),
        )
    if 'switch_limit' not in existing_columns:
        op.add_column(
            "redeem_codes",
            sa.Column("switch_limit", sa.Integer(), nullable=True),
        )
    if 'switch_count' not in existing_columns:
        op.add_column(
            "redeem_codes",
            sa.Column("switch_count", sa.Integer(), nullable=False, server_default="0"),
        )
    if 'last_switch_at' not in existing_columns:
        op.add_column(
            "redeem_codes",
            sa.Column("last_switch_at", sa.DateTime(), nullable=True),
        )
    if 'active' not in existing_columns:
        op.add_column(
            "redeem_codes",
            sa.Column("active", sa.Boolean(), nullable=False, server_default=sa.text("1" if dialect_name != "postgresql" else "true")),
        )

    # 检查表是否已存在
    existing_tables = inspector.get_table_names()
    if 'switch_requests' not in existing_tables:
        op.create_table(
            "switch_requests",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("redeem_code_id", sa.Integer(), sa.ForeignKey("redeem_codes.id", ondelete="CASCADE"), nullable=False),
            sa.Column("email", sa.String(length=320), nullable=False),
            sa.Column(
                "status",
                sa.Enum(
                    "pending",
                    "running",
                    "succeeded",
                    "failed",
                    "expired",
                    name="switchrequeststatus",
                ),
                nullable=False,
                server_default="pending",
            ),
            sa.Column("reason", sa.String(length=64), nullable=True),
            sa.Column("attempts", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("queued_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
            sa.Column("expires_at", sa.DateTime(), nullable=False),
            sa.Column("last_error", sa.Text(), nullable=True),
            sa.Column("mother_id_prev", sa.Integer(), nullable=True),
            sa.Column("mother_id_next", sa.Integer(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
            sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        )
        op.create_index("ix_switch_requests_status", "switch_requests", ["status"])
        op.create_index("ix_switch_requests_email", "switch_requests", ["email"])
        op.create_index("ix_switch_requests_expires", "switch_requests", ["expires_at"])

    # 确保现有行有默认值（SQLite 不支持 ALTER COLUMN DROP DEFAULT）
    op.execute("UPDATE redeem_codes SET active = 1 WHERE active IS NULL")
    op.execute("UPDATE redeem_codes SET switch_count = 0 WHERE switch_count IS NULL")
    
    # 对于 PostgreSQL，可以移除 server_default；SQLite 保留即可
    if dialect_name == "postgresql":
        op.alter_column("redeem_codes", "switch_count", server_default=None)
        op.alter_column("redeem_codes", "active", server_default=None)


def downgrade() -> None:
    op.drop_index("ix_switch_requests_expires", table_name="switch_requests")
    op.drop_index("ix_switch_requests_email", table_name="switch_requests")
    op.drop_index("ix_switch_requests_status", table_name="switch_requests")
    op.drop_table("switch_requests")

    op.drop_column("redeem_codes", "active")
    op.drop_column("redeem_codes", "last_switch_at")
    op.drop_column("redeem_codes", "switch_count")
    op.drop_column("redeem_codes", "switch_limit")
    op.drop_column("redeem_codes", "lifecycle_expires_at")
    op.drop_column("redeem_codes", "lifecycle_started_at")
    op.drop_column("redeem_codes", "lifecycle_plan")

    redeem_code_lifecycle_enum.drop(op.get_bind(), checkfirst=True)

