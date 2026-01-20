"""add user_id to comments

Revision ID: 44993a22dac3
Revises:
Create Date: 2026-01-20 16:30:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '44993a22dac3'
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Check if column exists to avoid error in development env where we manually updated it
    # But standard way is to just add it. For SQLite/Postgres compatibility we use standard ops.
    # Note: SQLite limitation on alter table constraints, but add_column usually works.

    op.add_column('comments', sa.Column('user_id', sa.String(), nullable=True))

    # Add foreign key constraint
    # Note: For SQLite, this requires render_as_batch=True in env.py for some operations,
    # but simple add_column might work depending on version.
    # Postgres handles this fine.

    op.create_foreign_key(
        'fk_comments_user_id_users',
        'comments', 'users',
        ['user_id'], ['id']
    )


def downgrade() -> None:
    op.drop_constraint('fk_comments_user_id_users', 'comments', type_='foreignkey')
    op.drop_column('comments', 'user_id')
