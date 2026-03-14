"""Shared date parsing utilities for Facet."""

from datetime import datetime


def parse_date(date_str):
    """Parse a date string to datetime, handling various EXIF and ISO formats.

    Supported formats:
        - ``2025:03:14 10:30:00`` (EXIF)
        - ``2025-03-14 10:30:00``
        - ``2025-03-14T10:30:00`` (ISO 8601)
        - ``2025-03-14`` (date only)

    Returns:
        datetime or None
    """
    if not date_str:
        return None
    for fmt in ('%Y:%m:%d %H:%M:%S', '%Y-%m-%d %H:%M:%S', '%Y-%m-%dT%H:%M:%S', '%Y-%m-%d'):
        try:
            return datetime.strptime(date_str[:19], fmt)
        except (ValueError, TypeError):
            continue
    return None
