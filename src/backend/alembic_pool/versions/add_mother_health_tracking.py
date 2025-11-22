"""add mother health tracking timestamps

Revision ID: add_mother_health_tracking
Revises: add_pool_api_keys
"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "add_mother_health_tracking"
down_revision = "add_pool_api_keys"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "mother_accounts",
        sa.Column("last_health_check_at", sa.DateTime(), nullable=True),
    )
    op.add_column(
        "mother_accounts",
        sa.Column("last_seen_alive_at", sa.DateTime(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("mother_accounts", "last_seen_alive_at")
    op.drop_column("mother_accounts", "last_health_check_at")

