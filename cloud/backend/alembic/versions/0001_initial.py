"""initial schema

Revision ID: 0001_initial
Revises: 
Create Date: 2025-10-16 12:00:00

"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '0001_initial'
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    # enums
    mother_status = sa.Enum('active', 'invalid', 'disabled', name='motherstatus')
    seat_status = sa.Enum('free', 'held', 'used', name='seatstatus')
    invite_status = sa.Enum('pending', 'sent', 'accepted', 'failed', 'cancelled', name='invitestatus')
    code_status = sa.Enum('unused', 'used', 'expired', 'blocked', name='codestatus')
    bulk_op_type = sa.Enum('mother_import', 'mother_import_text', 'code_generate', 'code_bulk_action', name='bulkoperationtype')
    batch_job_status = sa.Enum('pending', 'running', 'succeeded', 'failed', name='batchjobstatus')
    batch_job_type = sa.Enum('users_resend', 'users_cancel', 'users_remove', 'codes_disable', name='batchjobtype')

    op.create_table(
        'mother_accounts',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('name', sa.String(200), nullable=False),
        sa.Column('access_token_enc', sa.Text(), nullable=False),
        sa.Column('token_expires_at', sa.DateTime(), nullable=True),
        sa.Column('status', mother_status, nullable=False, server_default='active'),
        sa.Column('seat_limit', sa.Integer(), nullable=False, server_default='7'),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
    )

    op.create_table(
        'mother_teams',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('mother_id', sa.Integer(), sa.ForeignKey('mother_accounts.id', ondelete='CASCADE'), nullable=False),
        sa.Column('team_id', sa.String(64), nullable=False),
        sa.Column('team_name', sa.String(255), nullable=True),
        sa.Column('is_enabled', sa.Boolean(), nullable=False, server_default=sa.text('1')),
        sa.Column('is_default', sa.Boolean(), nullable=False, server_default=sa.text('0')),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.UniqueConstraint('mother_id', 'team_id', name='uq_mother_team'),
    )
    op.create_index('ix_team_enabled', 'mother_teams', ['team_id', 'is_enabled'])

    op.create_table(
        'seats',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('mother_id', sa.Integer(), sa.ForeignKey('mother_accounts.id', ondelete='CASCADE'), nullable=False),
        sa.Column('slot_index', sa.Integer(), nullable=False),
        sa.Column('team_id', sa.String(64), nullable=True),
        sa.Column('email', sa.String(320), nullable=True),
        sa.Column('status', seat_status, nullable=False, server_default='free'),
        sa.Column('held_until', sa.DateTime(), nullable=True),
        sa.Column('invite_request_id', sa.Integer(), sa.ForeignKey('invite_requests.id', ondelete='SET NULL'), nullable=True),
        sa.Column('invite_id', sa.String(128), nullable=True),
        sa.Column('member_id', sa.String(128), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.UniqueConstraint('mother_id', 'slot_index', name='uq_mother_slot'),
        sa.UniqueConstraint('team_id', 'email', name='uq_team_email_single_seat'),
    )
    op.create_index('ix_seat_mother', 'seats', ['mother_id'])
    op.create_index('ix_seat_status', 'seats', ['status'])

    op.create_table(
        'invite_requests',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('mother_id', sa.Integer(), sa.ForeignKey('mother_accounts.id', ondelete='SET NULL'), nullable=True),
        sa.Column('team_id', sa.String(64), nullable=False),
        sa.Column('email', sa.String(320), nullable=False),
        sa.Column('code_id', sa.Integer(), sa.ForeignKey('redeem_codes.id', ondelete='SET NULL'), nullable=True),
        sa.Column('status', invite_status, nullable=False, server_default='pending'),
        sa.Column('error_code', sa.String(64), nullable=True),
        sa.Column('error_msg', sa.Text(), nullable=True),
        sa.Column('attempt_count', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('last_attempt_at', sa.DateTime(), nullable=True),
        sa.Column('invite_id', sa.String(128), nullable=True),
        sa.Column('member_id', sa.String(128), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
    )
    op.create_index('ix_invite_email_team', 'invite_requests', ['email', 'team_id'])
    op.create_index('ix_invite_status', 'invite_requests', ['status'])

    op.create_table(
        'redeem_codes',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('code_hash', sa.String(128), unique=True, nullable=False),
        sa.Column('batch_id', sa.String(64), nullable=True),
        sa.Column('status', code_status, nullable=False, server_default='unused'),
        sa.Column('used_by_email', sa.String(320), nullable=True),
        sa.Column('used_by_mother_id', sa.Integer(), sa.ForeignKey('mother_accounts.id', ondelete='SET NULL'), nullable=True),
        sa.Column('used_by_team_id', sa.String(64), nullable=True),
        sa.Column('used_at', sa.DateTime(), nullable=True),
        sa.Column('expires_at', sa.DateTime(), nullable=True),
        sa.Column('meta_json', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
    )
    op.create_index('ix_redeem_status_exp', 'redeem_codes', ['status', 'expires_at'])

    op.create_table(
        'admin_config',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('password_hash', sa.String(128), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
    )

    op.create_table(
        'admin_sessions',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('session_id', sa.String(64), unique=True, nullable=False),
        sa.Column('expires_at', sa.DateTime(), nullable=False),
        sa.Column('revoked', sa.Boolean(), nullable=False, server_default=sa.text('0')),
        sa.Column('ip', sa.String(45), nullable=True),
        sa.Column('ua', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('last_seen_at', sa.DateTime(), nullable=False),
    )

    op.create_table(
        'audit_logs',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('actor', sa.String(64), nullable=False),
        sa.Column('action', sa.String(64), nullable=False),
        sa.Column('target_type', sa.String(64), nullable=True),
        sa.Column('target_id', sa.String(128), nullable=True),
        sa.Column('payload_redacted', sa.Text(), nullable=True),
        sa.Column('ip', sa.String(45), nullable=True),
        sa.Column('ua', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
    )

    op.create_table(
        'bulk_operation_logs',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('operation_type', bulk_op_type, nullable=False),
        sa.Column('actor', sa.String(64), nullable=False, server_default='admin'),
        sa.Column('total_count', sa.Integer(), nullable=True),
        sa.Column('success_count', sa.Integer(), nullable=True),
        sa.Column('failed_count', sa.Integer(), nullable=True),
        sa.Column('metadata_json', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
    )
    op.create_index('ix_bulk_operation_created_at', 'bulk_operation_logs', ['created_at'])

    op.create_table(
        'batch_jobs',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('job_type', batch_job_type, nullable=False),
        sa.Column('status', batch_job_status, nullable=False, server_default='pending'),
        sa.Column('actor', sa.String(64), nullable=True),
        sa.Column('payload_json', sa.Text(), nullable=True),
        sa.Column('total_count', sa.Integer(), nullable=True),
        sa.Column('success_count', sa.Integer(), nullable=True),
        sa.Column('failed_count', sa.Integer(), nullable=True),
        sa.Column('last_error', sa.Text(), nullable=True),
        sa.Column('metadata_json', sa.Text(), nullable=True),
        sa.Column('started_at', sa.DateTime(), nullable=True),
        sa.Column('finished_at', sa.DateTime(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
    )
    op.create_index('ix_batch_job_status', 'batch_jobs', ['status'])
    op.create_index('ix_batch_job_created_at', 'batch_jobs', ['created_at'])


def downgrade() -> None:
    # drop in reverse order
    op.drop_index('ix_batch_job_created_at', table_name='batch_jobs')
    op.drop_index('ix_batch_job_status', table_name='batch_jobs')
    op.drop_table('batch_jobs')

    op.drop_index('ix_bulk_operation_created_at', table_name='bulk_operation_logs')
    op.drop_table('bulk_operation_logs')

    op.drop_table('audit_logs')

    op.drop_table('admin_sessions')
    op.drop_table('admin_config')

    op.drop_index('ix_redeem_status_exp', table_name='redeem_codes')
    op.drop_table('redeem_codes')

    op.drop_index('ix_invite_status', table_name='invite_requests')
    op.drop_index('ix_invite_email_team', table_name='invite_requests')
    op.drop_table('invite_requests')

    op.drop_index('ix_seat_status', table_name='seats')
    op.drop_index('ix_seat_mother', table_name='seats')
    op.drop_table('seats')

    op.drop_index('ix_team_enabled', table_name='mother_teams')
    op.drop_table('mother_teams')

    op.drop_table('mother_accounts')

    # drop enums
    sa.Enum(name='batchjobtype').drop(op.get_bind(), checkfirst=False)
    sa.Enum(name='batchjobstatus').drop(op.get_bind(), checkfirst=False)
    sa.Enum(name='bulkoperationtype').drop(op.get_bind(), checkfirst=False)
    sa.Enum(name='codestatus').drop(op.get_bind(), checkfirst=False)
    sa.Enum(name='invitestatus').drop(op.get_bind(), checkfirst=False)
    sa.Enum(name='seatstatus').drop(op.get_bind(), checkfirst=False)
    sa.Enum(name='motherstatus').drop(op.get_bind(), checkfirst=False)

