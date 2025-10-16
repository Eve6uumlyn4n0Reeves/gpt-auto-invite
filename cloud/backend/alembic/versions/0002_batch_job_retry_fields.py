"""add retry fields to batch_jobs

Revision ID: 0002_batch_job_retry
Revises: 0001_initial
Create Date: 2025-10-16 12:10:00
"""
from alembic import op
import sqlalchemy as sa


revision = '0002_batch_job_retry'
down_revision = '0001_initial'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('batch_jobs', sa.Column('attempts', sa.Integer(), nullable=False, server_default='0'))
    op.add_column('batch_jobs', sa.Column('max_attempts', sa.Integer(), nullable=False, server_default='3'))
    op.add_column('batch_jobs', sa.Column('visible_until', sa.DateTime(), nullable=True))


def downgrade() -> None:
    op.drop_column('batch_jobs', 'visible_until')
    op.drop_column('batch_jobs', 'max_attempts')
    op.drop_column('batch_jobs', 'attempts')

