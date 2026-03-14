"""
Burst culling router — burst group listing and selection for culling mode,
plus similarity-based group culling using CLIP/SigLIP embeddings.

Uses precomputed burst_group_id from the database (populated by --recompute-burst).
Groups marked as burst_reviewed=1 are skipped so confirmed decisions persist.
"""

import logging
import math
import random
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from api.auth import CurrentUser, get_optional_user, require_edition
from api.database import get_db_connection
from api.db_helpers import get_visibility_clause
from api.similarity_groups import compute_similarity_groups

logger = logging.getLogger(__name__)

router = APIRouter(tags=["burst_culling"])


# --- Request models ---

class BurstSelectionBody(BaseModel):
    burst_id: int
    keep_paths: list[str]
    seed: int = 0


class SimilarSelectionBody(BaseModel):
    paths: list[str]
    keep_paths: list[str]


# --- Helpers ---

def _get_burst_weights():
    """Read burst_scoring weights from scoring_config.json."""
    try:
        from api.config import _FULL_CONFIG
        bs = _FULL_CONFIG.get('burst_scoring', {})
        return (
            bs.get('weight_aggregate', 0.4),
            bs.get('weight_aesthetic', 0.25),
            bs.get('weight_sharpness', 0.2),
            bs.get('weight_blink', 0.15),
        )
    except Exception:
        return (0.4, 0.25, 0.2, 0.15)


def _compute_burst_score(photo):
    """Compute burst culling score for ranking photos within a group."""
    w_agg, w_aes, w_sharp, w_blink = _get_burst_weights()
    aggregate = photo.get('aggregate') or 0
    aesthetic = photo.get('aesthetic') or 0
    sharpness = photo.get('tech_sharpness') or 0
    is_blink = photo.get('is_blink') or 0
    blink_score = 0 if is_blink else 10
    return (aggregate * w_agg + aesthetic * w_aes
            + sharpness * w_sharp + blink_score * w_blink)


def _format_group(photos, burst_group_id):
    """Format a burst group for the API response."""
    scored = []
    for p in photos:
        scored.append({
            'path': p['path'],
            'filename': p['filename'],
            'aggregate': p.get('aggregate'),
            'aesthetic': p.get('aesthetic'),
            'tech_sharpness': p.get('tech_sharpness'),
            'is_blink': p.get('is_blink') or 0,
            'is_burst_lead': p.get('is_burst_lead') or 0,
            'date_taken': p.get('date_taken'),
            'burst_score': round(_compute_burst_score(p), 2),
        })

    scored.sort(key=lambda x: x['burst_score'], reverse=True)
    best_path = scored[0]['path'] if scored else None

    return {
        'burst_id': burst_group_id,
        'photos': scored,
        'best_path': best_path,
        'count': len(scored),
    }


# --- Endpoints ---

@router.get("/api/burst-groups")
async def get_burst_groups(
    user: Optional[CurrentUser] = Depends(get_optional_user),
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
):
    """Return unreviewed burst groups for culling mode.

    Uses precomputed burst_group_id. Groups where burst_reviewed=1 are excluded.
    """
    conn = get_db_connection()
    try:
        user_id = user.user_id if user else None
        vis_sql, vis_params = get_visibility_clause(user_id)

        # Count distinct unreviewed burst groups
        count_row = conn.execute(
            f"""SELECT COUNT(DISTINCT burst_group_id) as cnt
                FROM photos
                WHERE burst_group_id IS NOT NULL
                  AND burst_reviewed = 0
                  AND {vis_sql}""",
            vis_params,
        ).fetchone()
        total_groups = count_row['cnt'] if count_row else 0
        total_pages = max(1, math.ceil(total_groups / per_page))

        # Get the distinct group IDs for this page
        offset = (page - 1) * per_page
        group_ids = conn.execute(
            f"""SELECT DISTINCT burst_group_id
                FROM photos
                WHERE burst_group_id IS NOT NULL
                  AND burst_reviewed = 0
                  AND {vis_sql}
                ORDER BY burst_group_id
                LIMIT ? OFFSET ?""",
            vis_params + [per_page, offset],
        ).fetchall()

        gid_list = [row['burst_group_id'] for row in group_ids]
        formatted = []
        if gid_list:
            placeholders = ','.join('?' * len(gid_list))
            all_photos = conn.execute(
                f"""SELECT path, filename, date_taken, aggregate, aesthetic,
                           tech_sharpness, is_blink, is_burst_lead, burst_group_id
                    FROM photos
                    WHERE burst_group_id IN ({placeholders}) AND {vis_sql}
                    ORDER BY burst_group_id, date_taken""",
                gid_list + vis_params,
            ).fetchall()

            # Group photos by burst_group_id
            from itertools import groupby
            for gid, group_photos in groupby(all_photos, key=lambda p: p['burst_group_id']):
                photos_list = [dict(p) for p in group_photos]
                if len(photos_list) >= 2:
                    formatted.append(_format_group(photos_list, gid))

        return {
            'groups': formatted,
            'total_groups': total_groups,
            'page': page,
            'per_page': per_page,
            'total_pages': total_pages,
        }
    except Exception:
        logger.exception("Failed to fetch burst groups")
        raise HTTPException(status_code=500, detail='Internal server error')
    finally:
        conn.close()


@router.post("/api/burst-groups/select")
async def select_burst_photos(
    body: BurstSelectionBody,
    user: CurrentUser = Depends(require_edition),
):
    """Mark selected photos as 'kept' and others as burst rejects.

    Sets is_burst_lead=1 for kept photos, is_rejected=1 for non-kept,
    and burst_reviewed=1 for all photos in the group.
    """
    conn = get_db_connection()
    try:
        user_id = user.user_id if user else None
        vis_sql, vis_params = get_visibility_clause(user_id)

        # Fetch photos in this burst group
        photos = conn.execute(
            f"""SELECT path FROM photos
                WHERE burst_group_id = ? AND {vis_sql}""",
            [body.burst_id] + vis_params,
        ).fetchall()

        if not photos:
            raise HTTPException(status_code=404, detail='Burst group not found')

        group_paths = {p['path'] for p in photos}
        keep_set = set(body.keep_paths)

        # Validate that all keep_paths are in the burst group
        invalid = keep_set - group_paths
        if invalid:
            raise HTTPException(
                status_code=400,
                detail=f'Paths not in burst group: {list(invalid)[:3]}',
            )

        # Batch update burst lead status and mark as reviewed
        keep_paths = list(keep_set)
        reject_paths = list(group_paths - keep_set)
        if keep_paths:
            placeholders = ','.join('?' * len(keep_paths))
            conn.execute(
                f"UPDATE photos SET is_burst_lead = 1, burst_reviewed = 1 WHERE path IN ({placeholders})",
                keep_paths,
            )
        if reject_paths:
            placeholders = ','.join('?' * len(reject_paths))
            conn.execute(
                f"UPDATE photos SET is_burst_lead = 0, is_rejected = 1, burst_reviewed = 1 WHERE path IN ({placeholders})",
                reject_paths,
            )

        conn.commit()
        return {'status': 'ok', 'kept': len(keep_set), 'rejected': len(group_paths - keep_set)}

    except HTTPException:
        raise
    except Exception:
        logger.exception("Failed to select burst photos")
        raise HTTPException(status_code=500, detail='Internal server error')
    finally:
        conn.close()


# --- Similar Groups (AI Culling) ---

@router.get("/api/similar-groups")
async def get_similar_groups(
    user: Optional[CurrentUser] = Depends(get_optional_user),
    threshold: float = Query(0.85, ge=0.5, le=0.99),
    page: int = Query(1, ge=1),
    per_page: int = Query(10, ge=1, le=50),
    seed: int = Query(0, ge=0),
):
    """Return groups of visually similar photos for AI culling.

    Uses CLIP/SigLIP embeddings to find visually similar photos across the
    entire library (not limited to temporal bursts). Groups are shuffled
    randomly using the provided seed for consistent pagination.
    """
    conn = get_db_connection()
    try:
        user_id = user.user_id if user else None
        all_groups = compute_similarity_groups(conn, threshold=threshold, user_id=user_id)

        # Shuffle so the user sees different groups each session
        shuffled = list(all_groups)
        random.Random(seed).shuffle(shuffled)

        total_groups = len(shuffled)
        total_pages = max(1, math.ceil(total_groups / per_page))
        offset = (page - 1) * per_page
        page_groups = shuffled[offset:offset + per_page]

        formatted = []
        for group_idx, group in enumerate(page_groups, start=offset):
            paths = group['paths']
            # Limit photos displayed per group to keep UI usable
            max_per_group = 20
            placeholders = ','.join('?' * len(paths))
            photos = conn.execute(
                f"""SELECT path, filename, date_taken, aggregate, aesthetic,
                           tech_sharpness, is_blink
                    FROM photos
                    WHERE path IN ({placeholders})
                    ORDER BY aggregate DESC
                    LIMIT {max_per_group}""",
                paths,
            ).fetchall()

            photo_list = []
            for p in photos:
                pd = dict(p)
                pd['is_blink'] = pd.get('is_blink') or 0
                pd['is_burst_lead'] = 0
                pd['burst_score'] = round(_compute_burst_score(pd), 2)
                photo_list.append(pd)

            formatted.append({
                'burst_id': group_idx,
                'photos': photo_list,
                'best_path': group['best_path'],
                'count': group['count'],
            })

        return {
            'groups': formatted,
            'total_groups': total_groups,
            'page': page,
            'per_page': per_page,
            'total_pages': total_pages,
        }
    except Exception:
        logger.exception("Failed to fetch similar groups")
        raise HTTPException(status_code=500, detail='Internal server error')
    finally:
        conn.close()


@router.post("/api/similar-groups/select")
async def select_similar_photos(
    body: SimilarSelectionBody,
    user: CurrentUser = Depends(require_edition),
):
    """Mark selected photos as 'kept' and others as rejected within a similarity group.

    Accepts the full list of group photo paths and keep paths directly from the
    client, avoiding an expensive recomputation of all similarity groups.
    Non-kept photos are marked as is_rejected=1.
    """
    conn = get_db_connection()
    try:
        user_id = user.user_id if user else None
        vis_sql, vis_params = get_visibility_clause(user_id)

        group_paths = set(body.paths)
        keep_set = set(body.keep_paths)

        # Validate that all keep_paths are in the group
        invalid = keep_set - group_paths
        if invalid:
            raise HTTPException(
                status_code=400,
                detail=f'Paths not in similarity group: {list(invalid)[:3]}',
            )

        # Mark non-kept photos as rejected (batch UPDATE with visibility check)
        reject_paths = list(group_paths - keep_set)
        if reject_paths:
            placeholders = ','.join('?' * len(reject_paths))
            conn.execute(
                f"UPDATE photos SET is_rejected = 1 WHERE path IN ({placeholders}) AND {vis_sql}",
                reject_paths + vis_params,
            )

        conn.commit()
        return {'status': 'ok', 'kept': len(keep_set), 'rejected': len(reject_paths)}

    except HTTPException:
        raise
    except Exception:
        logger.exception("Failed to select similar photos")
        raise HTTPException(status_code=500, detail='Internal server error')
    finally:
        conn.close()
