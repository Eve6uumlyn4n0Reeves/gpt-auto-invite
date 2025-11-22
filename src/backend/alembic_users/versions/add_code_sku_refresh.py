"""add code sku tables and refresh tracking

Revision ID: add_code_sku_refresh
Revises: add_code_lifecycle_switch_requests
"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "add_code_sku_refresh"
down_revision = "add_code_lifecycle_switch_requests"
branch_labels = None
depends_on = None


code_refresh_event_enum = sa.Enum(
    "refresh",
    "grant",
    "bind",
    "rebind",
    "health_bonus",
    name="coderefresheventtype",
)


def upgrade() -> None:
    op.create_table(
        "code_skus",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("name", sa.String(length=100), nullable=False),
        sa.Column("slug", sa.String(length=64), nullable=False, unique=True),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("lifecycle_days", sa.Integer(), nullable=False, server_default="7"),
        sa.Column("default_refresh_limit", sa.Integer(), nullable=True),
        sa.Column("price_cents", sa.Integer(), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )

    op.add_column("redeem_codes", sa.Column("sku_id", sa.Integer(), nullable=True))
    op.add_column("redeem_codes", sa.Column("bound_email", sa.String(length=320), nullable=True))
    op.add_column("redeem_codes", sa.Column("bound_team_id", sa.String(length=64), nullable=True))
    op.add_column("redeem_codes", sa.Column("bound_at", sa.DateTime(), nullable=True))
    op.add_column("redeem_codes", sa.Column("current_team_id", sa.String(length=64), nullable=True))
    op.add_column("redeem_codes", sa.Column("current_team_assigned_at", sa.DateTime(), nullable=True))
    op.add_column("redeem_codes", sa.Column("refresh_limit", sa.Integer(), nullable=True))
    op.add_column(
        "redeem_codes",
        sa.Column("refresh_used", sa.Integer(), nullable=False, server_default="0"),
    )
    op.add_column("redeem_codes", sa.Column("refresh_cooldown_until", sa.DateTime(), nullable=True))
    op.add_column("redeem_codes", sa.Column("last_refresh_at", sa.DateTime(), nullable=True))
    op.add_column("redeem_codes", sa.Column("updated_at", sa.DateTime(), nullable=True))

    op.create_foreign_key(
        "fk_redeem_codes_sku_id",
        "redeem_codes",
        "code_skus",
        ["sku_id"],
        ["id"],
        ondelete="SET NULL",
    )

    op.create_index("ix_redeem_sku_id", "redeem_codes", ["sku_id"])
    op.create_index("ix_redeem_bound_email", "redeem_codes", ["bound_email"])

    op.execute(sa.text("UPDATE redeem_codes SET refresh_used = 0 WHERE refresh_used IS NULL"))

    code_refresh_event_enum.create(op.get_bind(), checkfirst=True)

    op.create_table(
        "code_refresh_history",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "code_id",
            sa.Integer(),
            sa.ForeignKey("redeem_codes.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("event_type", code_refresh_event_enum, nullable=False),
        sa.Column("delta_refresh", sa.Integer(), nullable=True),
        sa.Column("triggered_by", sa.String(length=64), nullable=True),
        sa.Column("metadata_json", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )
    op.create_index(
        "ix_code_refresh_history_code_id",
        "code_refresh_history",
        ["code_id"],
    )
    op.create_index(
        "ix_code_refresh_history_event",
        "code_refresh_history",
        ["event_type"],
    )


def downgrade() -> None:
    op.drop_index("ix_code_refresh_history_event", table_name="code_refresh_history")
    op.drop_index("ix_code_refresh_history_code_id", table_name="code_refresh_history")
    op.drop_table("code_refresh_history")
    code_refresh_event_enum.drop(op.get_bind(), checkfirst=True)

    op.drop_index("ix_redeem_bound_email", table_name="redeem_codes")
    op.drop_index("ix_redeem_sku_id", table_name="redeem_codes")
    op.drop_constraint("fk_redeem_codes_sku_id", "redeem_codes", type_="foreignkey")

    op.drop_column("redeem_codes", "updated_at")
    op.drop_column("redeem_codes", "last_refresh_at")
    op.drop_column("redeem_codes", "refresh_cooldown_until")
    op.drop_column("redeem_codes", "refresh_used")
    op.drop_column("redeem_codes", "refresh_limit")
    op.drop_column("redeem_codes", "current_team_assigned_at")
    op.drop_column("redeem_codes", "current_team_id")
    op.drop_column("redeem_codes", "bound_at")
    op.drop_column("redeem_codes", "bound_team_id")
    op.drop_column("redeem_codes", "bound_email")
    op.drop_column("redeem_codes", "sku_id")

    op.drop_table("code_skus")

