"""Auto-album generation using temporal grouping and embedding clustering."""

import json
import logging
from collections import defaultdict

import numpy as np

from utils.date_utils import parse_date as _parse_date
from utils.embedding import bytes_to_normalized_embedding
from utils.union_find import UnionFind

logger = logging.getLogger("facet.auto_album")


def generate_auto_albums(conn, config=None, dry_run=False, user_id=None):
    """
    Generate albums automatically from photo clusters.

    Strategy:
    1. Group photos by date gaps (>4 hours = new event)
    2. Sub-cluster by embedding similarity (cosine > 0.6) within temporal groups
    3. Filter groups < 5 photos
    4. Name from most common tags + date ("Landscape — March 2025")
    5. Create albums (is_smart=0), add photos sorted by date

    Args:
        conn: SQLite connection
        config: Optional config dict with auto_albums settings
        dry_run: If True, don't create albums, just return what would be created
        user_id: Optional user ID for visibility filtering in multi-user mode

    Returns:
        List of dicts: [{ name, description, photo_paths, photo_count }]
    """
    from api.db_helpers import get_visibility_clause

    if config is None:
        config = {}

    auto_config = config.get('auto_albums', {})
    min_photos = auto_config.get('min_photos_per_album', 5)
    time_gap_hours = auto_config.get('time_gap_hours', 4)
    embedding_threshold = auto_config.get('embedding_threshold', 0.6)

    vis_sql, vis_params = get_visibility_clause(user_id)

    # Step 1: Load all photos with date and embeddings
    rows = conn.execute(
        f"""SELECT path, date_taken, tags, clip_embedding, aggregate
           FROM photos
           WHERE date_taken IS NOT NULL AND {vis_sql}
           ORDER BY date_taken ASC""",
        vis_params
    ).fetchall()

    if not rows:
        logger.info("No photos with dates found")
        return []

    # Step 2: Group by temporal gaps
    temporal_groups = []
    current_group = [rows[0]]

    for i in range(1, len(rows)):
        prev_date = _parse_date(rows[i - 1]['date_taken'])
        curr_date = _parse_date(rows[i]['date_taken'])

        if prev_date and curr_date:
            gap = (curr_date - prev_date).total_seconds() / 3600
            if gap > time_gap_hours:
                temporal_groups.append(current_group)
                current_group = []

        current_group.append(rows[i])

    if current_group:
        temporal_groups.append(current_group)

    logger.info("Found %d temporal groups", len(temporal_groups))

    # Step 3: Sub-cluster by embedding similarity within large groups
    final_groups = []
    for tg in temporal_groups:
        if len(tg) < min_photos:
            continue

        # Try to sub-cluster by embeddings
        sub_groups = _cluster_by_embeddings(tg, embedding_threshold, min_photos)
        if sub_groups:
            final_groups.extend(sub_groups)
        else:
            final_groups.append(tg)

    # Step 4: Generate album names and create (skip if name already exists)
    existing_names = {
        row['name'] for row in conn.execute(
            "SELECT name FROM albums WHERE user_id = ? OR user_id IS NULL",
            (user_id,)
        ).fetchall()
    }
    albums_created = []
    for group in final_groups:
        if len(group) < min_photos:
            continue

        name = _generate_album_name(group)
        if name in existing_names:
            logger.info("Skipping album '%s' — already exists", name)
            continue

        photo_paths = [r['path'] for r in group]

        album_info = {
            'name': name,
            'description': f'{len(group)} photos',
            'photo_paths': photo_paths,
            'photo_count': len(group),
        }

        if not dry_run:
            _create_album_in_db(conn, name, photo_paths, user_id=user_id)

        existing_names.add(name)
        albums_created.append(album_info)

    if not dry_run:
        conn.commit()

    logger.info("Generated %d auto-albums", len(albums_created))
    return albums_created


def _cluster_by_embeddings(photos, threshold, min_size):
    """Sub-cluster a temporal group by embedding similarity."""
    embeddings = []
    valid_photos = []

    for photo in photos:
        emb = bytes_to_normalized_embedding(photo['clip_embedding'])
        if emb is not None:
            embeddings.append(emb)
            valid_photos.append(photo)

    if len(embeddings) < min_size:
        return None

    emb_matrix = np.stack(embeddings)
    n = len(emb_matrix)

    # Skip embedding sub-clustering for very large groups to avoid O(n^2)
    # memory and compute cost from the full similarity matrix.
    if n > 500:
        return None

    # Simple connected components via cosine similarity
    uf = UnionFind(n)

    # Compute similarities
    sims = emb_matrix @ emb_matrix.T
    for i in range(n):
        for j in range(i + 1, n):
            if sims[i, j] >= threshold:
                uf.union(i, j)

    groups_map = defaultdict(list)
    for idx in range(n):
        groups_map[uf.find(idx)].append(valid_photos[idx])

    result = [g for g in groups_map.values() if len(g) >= min_size]
    return result if result else None


def _generate_album_name(photos):
    """Generate a name for an auto-album based on tags and dates."""
    # Get most common tags
    tag_counts = defaultdict(int)
    for photo in photos:
        tags_str = photo['tags'] or ''
        if tags_str:
            try:
                tag_list = json.loads(tags_str) if tags_str.startswith('[') else tags_str.split(',')
                for tag in tag_list:
                    tag = tag.strip().strip('"')
                    if tag:
                        tag_counts[tag] += 1
            except (json.JSONDecodeError, AttributeError):
                pass

    # Get date range
    dates = [_parse_date(p['date_taken']) for p in photos if p['date_taken']]
    dates = [d for d in dates if d]

    # Build name
    top_tag = ''
    if tag_counts:
        top_tag = max(tag_counts, key=tag_counts.get).title()

    date_part = ''
    if dates:
        min_date = min(dates)
        max_date = max(dates)
        if min_date.month == max_date.month and min_date.year == max_date.year:
            date_part = min_date.strftime('%B %Y')
        elif min_date.year == max_date.year:
            date_part = f"{min_date.strftime('%B')}\u2013{max_date.strftime('%B %Y')}"
        else:
            date_part = f"{min_date.strftime('%B %Y')}\u2013{max_date.strftime('%B %Y')}"

    if top_tag and date_part:
        return f"{top_tag} \u2014 {date_part}"
    elif top_tag:
        return top_tag
    elif date_part:
        return date_part
    else:
        return "Auto Album"


def _create_album_in_db(conn, name, photo_paths, user_id=None):
    """Create an album and add photos to it."""
    cursor = conn.execute(
        """INSERT INTO albums (name, description, is_smart, user_id, created_at, updated_at)
           VALUES (?, ?, 0, ?, datetime('now'), datetime('now'))""",
        (name, f'{len(photo_paths)} photos', user_id)
    )
    album_id = cursor.lastrowid

    failed_count = 0
    for i, path in enumerate(photo_paths):
        try:
            conn.execute(
                "INSERT OR IGNORE INTO album_photos (album_id, photo_path, position) VALUES (?, ?, ?)",
                (album_id, path, i)
            )
        except Exception:
            failed_count += 1
            logger.debug("Failed to add photo '%s' to album %d", path, album_id)

    if failed_count == len(photo_paths):
        logger.error("All %d photo inserts failed for album '%s' (id=%d) — deleting empty album",
                      len(photo_paths), name, album_id)
        conn.execute("DELETE FROM albums WHERE id = ?", (album_id,))
        return
    elif failed_count > 0:
        logger.warning("%d of %d photo inserts failed for album '%s' (id=%d)",
                        failed_count, len(photo_paths), name, album_id)

    # Set first photo as cover
    if photo_paths:
        conn.execute(
            "UPDATE albums SET cover_photo_path = ? WHERE id = ?",
            (photo_paths[0], album_id)
        )
