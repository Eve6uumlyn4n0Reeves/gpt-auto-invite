"""
add mother_group_id to redeem_codes (users DB)

Revision ID: add_mother_group_id_to_redeem_codes
Revises: remove_cross_db_refs
Create Date: 2025-10-31
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "add_mother_group_id_to_redeem_codes"
down_revision = "remove_cross_db_refs"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # add nullable column + index (no cross-db FK; enforced at app-level)
    op.add_column('redeem_codes', sa.Column('mother_group_id', sa.Integer(), nullable=True))
    op.create_index('ix_redeem_mother_group', 'redeem_codes', ['mother_group_id'], unique=False)

    # best-effort backfill from meta_json if present
    conn = op.get_bind()
    try:
        result = conn.execute(sa.text("""
            SELECT id, meta_json FROM redeem_codes
            WHERE meta_json IS NOT NULL AND meta_json <> ''
        """))
        rows = result.fetchall()
        for row in rows:
            try:
                import json
                meta = json.loads(row.meta_json or '{}')
                mgid = meta.get('mother_group_id')
                if isinstance(mgid, int):
                    conn.execute(sa.text(
                        "UPDATE redeem_codes SET mother_group_id = :mgid WHERE id = :id"
                    ), {"mgid": mgid, "id": row.id})
            except Exception:
                # ignore malformed json rows
                pass
    except Exception:
        # ignore errors in best-effort backfill to keep migration forward-only
        pass


def downgrade() -> None:
    op.drop_index('ix_redeem_mother_group', table_name='redeem_codes')
    op.drop_column('redeem_codes', 'mother_group_id')

