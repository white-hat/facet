"""
FTS5 full-text search management for Facet.

Rebuilds the photos_fts index from existing caption and tags data.
"""

import logging
import sqlite3

from db.connection import get_connection
from db.schema import PHOTOS_FTS_CREATE, PHOTOS_FTS_TRIGGERS

logger = logging.getLogger("facet.db_fts")


def rebuild_fts(db_path='photo_scores_pro.db'):
    """Rebuild the FTS5 index from existing photos data.

    Creates the virtual table and triggers if they don't exist,
    then runs a full rebuild from the content table.

    Args:
        db_path: Path to the SQLite database file
    """
    with get_connection(db_path, row_factory=False) as conn:
        conn.execute(PHOTOS_FTS_CREATE)
        for trigger_sql in PHOTOS_FTS_TRIGGERS:
            conn.execute(trigger_sql)

        conn.execute("INSERT INTO photos_fts(photos_fts) VALUES('rebuild')")
        conn.commit()

        count = conn.execute(
            "SELECT COUNT(*) FROM photos WHERE caption IS NOT NULL OR tags IS NOT NULL"
        ).fetchone()[0]

    logger.info("FTS index rebuilt: %d photos indexed", count)
    return count


def has_fts_table(conn):
    """Check if the photos_fts virtual table exists."""
    try:
        row = conn.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='photos_fts'"
        ).fetchone()
        return row is not None
    except sqlite3.OperationalError:
        return False
