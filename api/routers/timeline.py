"""
Timeline router — date-grouped photo browsing and calendar heatmap.

"""

import logging
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query

from api.auth import CurrentUser, get_optional_user
from api.config import VIEWER_CONFIG
from api.database import get_db_connection
from api.db_helpers import (
    build_hide_clauses, build_photo_select_columns, sanitize_float_values,
    split_photo_tags, attach_person_data,
    get_visibility_clause, get_photos_from_clause,
    format_date,
)

logger = logging.getLogger(__name__)

router = APIRouter(tags=["timeline"])

def _get_photos_per_group():
    """Read timeline.photos_per_group from scoring_config.json."""
    try:
        from api.config import _FULL_CONFIG
        return _FULL_CONFIG.get('timeline', {}).get('photos_per_group', 30)
    except Exception:
        return 30



@router.get("/api/timeline")
async def api_timeline(
    cursor: Optional[str] = Query(None),
    limit: int = Query(50, ge=1, le=500),
    direction: str = Query("older"),
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    hide_blinks: str = Query('0'),
    hide_bursts: str = Query('0'),
    hide_duplicates: str = Query('0'),
    user: Optional[CurrentUser] = Depends(get_optional_user),
):
    """Return photos grouped by date for timeline view.

    Uses cursor-based pagination on DATE(date_taken).
    """
    user_id = user.user_id if user else None
    conn = get_db_connection()
    try:
        from_clause, from_params = get_photos_from_clause(user_id)
        vis_sql, vis_params = get_visibility_clause(user_id)

        where_clauses = [vis_sql, "date_taken IS NOT NULL", "date_taken != ''"]
        sql_params = list(from_params) + list(vis_params)

        where_clauses.extend(build_hide_clauses(hide_blinks, hide_bursts, hide_duplicates))

        if date_from:
            where_clauses.append("DATE(REPLACE(SUBSTR(date_taken,1,10),':','-')) >= ?")
            sql_params.append(date_from)
        if date_to:
            where_clauses.append("DATE(REPLACE(SUBSTR(date_taken,1,10),':','-')) <= ?")
            sql_params.append(date_to)

        if cursor:
            if direction == "newer":
                where_clauses.append("DATE(REPLACE(SUBSTR(date_taken,1,10),':','-')) > ?")
            else:
                where_clauses.append("DATE(REPLACE(SUBSTR(date_taken,1,10),':','-')) < ?")
            sql_params.append(cursor)

        where_str = " WHERE " + " AND ".join(where_clauses)

        date_order = "ASC" if direction == "newer" else "DESC"

        # Fetch distinct dates with counts
        date_query = (
            f"SELECT DATE(REPLACE(SUBSTR(date_taken,1,10),':','-')) as photo_date, COUNT(*) as cnt "
            f"FROM {from_clause}{where_str} "
            f"GROUP BY photo_date "
            f"ORDER BY photo_date {date_order} "
            f"LIMIT ?"
        )
        # Fetch one extra to detect has_more
        date_rows = conn.execute(date_query, sql_params + [limit + 1]).fetchall()

        has_more = len(date_rows) > limit
        date_rows = date_rows[:limit]

        # Build select columns
        select_cols = build_photo_select_columns(conn, user_id)

        tags_limit = VIEWER_CONFIG['display']['tags_per_photo']
        groups = []
        next_cursor = None

        if date_rows:
            # Collect date list and counts
            date_list = [row['photo_date'] for row in date_rows]
            date_counts = {row['photo_date']: row['cnt'] for row in date_rows}

            # Single query: fetch top photos for ALL dates using ROW_NUMBER()
            photos_per_group = _get_photos_per_group()
            placeholders = ','.join('?' * len(date_list))

            batch_where = [vis_sql, "date_taken IS NOT NULL", "date_taken != ''"]
            batch_params = list(from_params) + list(vis_params)
            batch_where.extend(build_hide_clauses(hide_blinks, hide_bursts, hide_duplicates))
            batch_where.append(f"DATE(REPLACE(SUBSTR(date_taken,1,10),':','-')) IN ({placeholders})")
            batch_params.extend(date_list)

            batch_where_str = " WHERE " + " AND ".join(batch_where)

            photo_query = (
                f"SELECT * FROM ("
                f"  SELECT {', '.join(select_cols)}, "
                f"    DATE(REPLACE(SUBSTR(date_taken,1,10),':','-')) AS _photo_date, "
                f"    ROW_NUMBER() OVER ("
                f"      PARTITION BY DATE(REPLACE(SUBSTR(date_taken,1,10),':','-')) "
                f"      ORDER BY aggregate DESC, path ASC"
                f"    ) AS _rn "
                f"  FROM {from_clause}{batch_where_str}"
                f") WHERE _rn <= ?"
            )
            batch_params.append(photos_per_group)

            rows = conn.execute(photo_query, batch_params).fetchall()
            all_photos = split_photo_tags(rows, tags_limit)

            for photo in all_photos:
                photo['date_formatted'] = format_date(photo.get('date_taken'))

            attach_person_data(all_photos, conn)
            sanitize_float_values(all_photos)

            # Group photos by date, preserving the paginated date order
            photos_by_date: dict[str, list] = {d: [] for d in date_list}
            for photo in all_photos:
                pd = photo.pop('_photo_date', None)
                photo.pop('_rn', None)
                if pd in photos_by_date:
                    photos_by_date[pd].append(photo)

            for photo_date in date_list:
                groups.append({
                    'date': photo_date,
                    'count': date_counts[photo_date],
                    'photos': photos_by_date[photo_date],
                })

            next_cursor = date_list[-1]

    except HTTPException:
        raise
    except Exception:
        logger.exception("Failed to fetch timeline")
        return {'groups': [], 'next_cursor': None, 'has_more': False}
    finally:
        conn.close()

    return {
        'groups': groups,
        'next_cursor': next_cursor if has_more else None,
        'has_more': has_more,
    }


@router.get("/api/timeline/dates")
async def api_timeline_dates(
    year: int = Query(..., ge=1900, le=2100),
    month: Optional[int] = Query(None, ge=1, le=12),
    hide_blinks: str = Query('0'),
    hide_bursts: str = Query('0'),
    hide_duplicates: str = Query('0'),
    user: Optional[CurrentUser] = Depends(get_optional_user),
):
    """Return date counts for a calendar heatmap.

    Returns dates with photo counts for the given year (and optionally month).
    """
    user_id = user.user_id if user else None
    conn = get_db_connection()
    try:
        from_clause, from_params = get_photos_from_clause(user_id)
        vis_sql, vis_params = get_visibility_clause(user_id)

        where_clauses = [vis_sql, "date_taken IS NOT NULL", "date_taken != ''"]
        sql_params = list(from_params) + list(vis_params)

        where_clauses.extend(build_hide_clauses(hide_blinks, hide_bursts, hide_duplicates))

        # Filter by year (EXIF format: YYYY:MM:DD)
        year_prefix = str(year)
        if month is not None:
            date_prefix = f"{year}:{month:02d}"
            where_clauses.append("SUBSTR(date_taken,1,7) = ?")
            sql_params.append(date_prefix)
        else:
            where_clauses.append("SUBSTR(date_taken,1,4) = ?")
            sql_params.append(year_prefix)

        where_str = " WHERE " + " AND ".join(where_clauses)

        query = (
            f"SELECT DATE(REPLACE(SUBSTR(date_taken,1,10),':','-')) as photo_date, COUNT(*) as cnt "
            f"FROM {from_clause}{where_str} "
            f"GROUP BY photo_date "
            f"ORDER BY photo_date ASC"
        )
        rows = conn.execute(query, sql_params).fetchall()

        dates = [{'date': row['photo_date'], 'count': row['cnt']} for row in rows]

    except HTTPException:
        raise
    except Exception:
        logger.exception("Failed to fetch timeline dates")
        return {'dates': []}
    finally:
        conn.close()

    return {'dates': dates}
