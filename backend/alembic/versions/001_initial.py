"""initial schema

Revision ID: 001
Revises:
Create Date: 2026-05-28
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("email", sa.String(255), nullable=False, unique=True),
        sa.Column("password_hash", sa.String(255), nullable=False),
        sa.Column("role", sa.String(50), nullable=False, server_default="user"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
    )
    op.create_index("ix_users_email", "users", ["email"])

    op.create_table(
        "sessions",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE")),
        sa.Column("token_hash", sa.String(64), nullable=False, unique=True),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
    )
    op.create_index("ix_sessions_token_hash", "sessions", ["token_hash"])

    op.create_table(
        "system_settings",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("disk_display_name", sa.String(255), nullable=False, server_default="Depolama"),
        sa.Column("smb_host", sa.String(255), nullable=False, server_default=""),
        sa.Column("smb_share", sa.String(255), nullable=False, server_default=""),
        sa.Column("smb_username", sa.String(255), nullable=False, server_default=""),
        sa.Column("smb_password_encrypted", sa.Text(), nullable=False, server_default=""),
        sa.Column("smb_root_path", sa.String(512), nullable=False, server_default="/"),
        sa.Column("is_configured", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("configured_at", sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_table("system_settings")
    op.drop_table("sessions")
    op.drop_table("users")
