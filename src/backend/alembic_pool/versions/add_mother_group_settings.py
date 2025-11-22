"""
add mother_group_settings table (pool DB)

Revision ID: add_mother_group_settings
Revises: initial_pool
Create Date: 2025-10-31
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "add_mother_group_settings"
down_revision = "initial_pool"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'mother_group_settings',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('group_id', sa.Integer(), nullable=False),  # no cross-db FK
        sa.Column('team_name_template', sa.String(length=200), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
    )
    op.create_index('ix_mother_group_settings_group', 'mother_group_settings', ['group_id'], unique=True)


def downgrade() -> None:
    op.drop_index('ix_mother_group_settings_group', table_name='mother_group_settings')
    op.drop_table('mother_group_settings')

