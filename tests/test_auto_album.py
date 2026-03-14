"""Tests for auto-album generation (analyzers/auto_album.py)."""

import struct
from unittest import mock

import numpy as np
import pytest

from analyzers.auto_album import (
    generate_auto_albums,
    _parse_date,
    _generate_album_name,
    _create_album_in_db,
    _cluster_by_embeddings,
)


class TestParseDate:
    """Tests for _parse_date helper."""

    def test_exif_format(self):
        result = _parse_date("2025:03:14 10:30:00")
        assert result is not None
        assert result.year == 2025
        assert result.month == 3
        assert result.day == 14

    def test_iso_datetime_format(self):
        result = _parse_date("2025-03-14 10:30:00")
        assert result is not None
        assert result.year == 2025

    def test_iso_t_format(self):
        result = _parse_date("2025-03-14T10:30:00")
        assert result is not None

    def test_date_only_format(self):
        result = _parse_date("2025-03-14")
        assert result is not None
        assert result.day == 14

    def test_none_input(self):
        assert _parse_date(None) is None

    def test_empty_string(self):
        assert _parse_date("") is None

    def test_invalid_format(self):
        assert _parse_date("not-a-date") is None


class TestGenerateAlbumName:
    """Tests for _generate_album_name helper."""

    def test_tag_and_date(self):
        photos = [
            {"tags": '["landscape", "sunset"]', "date_taken": "2025:03:14 10:00:00"},
            {"tags": '["landscape", "mountain"]', "date_taken": "2025:03:14 15:00:00"},
        ]
        name = _generate_album_name(photos)
        # "landscape" appears twice, should be top tag
        assert "Landscape" in name
        assert "March 2025" in name

    def test_csv_tags(self):
        photos = [
            {"tags": "portrait, person", "date_taken": "2025:06:10 10:00:00"},
            {"tags": "portrait, indoor", "date_taken": "2025:06:11 10:00:00"},
        ]
        name = _generate_album_name(photos)
        assert "Portrait" in name

    def test_no_tags(self):
        photos = [
            {"tags": "", "date_taken": "2025:03:14 10:00:00"},
            {"tags": None, "date_taken": "2025:03:15 10:00:00"},
        ]
        name = _generate_album_name(photos)
        assert "March 2025" in name

    def test_no_dates(self):
        photos = [
            {"tags": '["wildlife"]', "date_taken": None},
        ]
        name = _generate_album_name(photos)
        assert name == "Wildlife"

    def test_multi_month_same_year(self):
        photos = [
            {"tags": "", "date_taken": "2025:03:01 10:00:00"},
            {"tags": "", "date_taken": "2025:06:15 10:00:00"},
        ]
        name = _generate_album_name(photos)
        assert "March" in name
        assert "June" in name

    def test_fallback_name(self):
        photos = [{"tags": "", "date_taken": None}]
        name = _generate_album_name(photos)
        assert name == "Auto Album"


class TestCreateAlbumInDb:
    """Tests for _create_album_in_db."""

    def test_creates_album_and_photos(self):
        mock_conn = mock.MagicMock()
        mock_conn.execute.return_value.lastrowid = 42

        _create_album_in_db(mock_conn, "Test Album", ["/a.jpg", "/b.jpg", "/c.jpg"])

        # Should insert album
        calls = mock_conn.execute.call_args_list
        assert any("INSERT INTO albums" in str(c) for c in calls)

        # Should insert 3 album_photos
        photo_inserts = [c for c in calls if "album_photos" in str(c)]
        assert len(photo_inserts) == 3

        # Should set cover photo
        cover_calls = [c for c in calls if "cover_photo_path" in str(c)]
        assert len(cover_calls) == 1

    def test_empty_photo_list(self):
        mock_conn = mock.MagicMock()
        mock_conn.execute.return_value.lastrowid = 1

        _create_album_in_db(mock_conn, "Empty", [])

        # No cover photo update when no photos
        calls = mock_conn.execute.call_args_list
        cover_calls = [c for c in calls if "cover_photo_path" in str(c)]
        assert len(cover_calls) == 0


class TestGenerateAutoAlbums:
    """Tests for generate_auto_albums."""

    def _make_row(self, path, date_taken, tags="", embedding=None, aggregate=5.0):
        return {
            "path": path,
            "date_taken": date_taken,
            "tags": tags,
            "clip_embedding": embedding,
            "aggregate": aggregate,
        }

    def test_no_photos_returns_empty(self):
        mock_conn = mock.MagicMock()
        mock_conn.execute.return_value.fetchall.side_effect = [
            [],  # photo query
        ]

        result = generate_auto_albums(mock_conn)
        assert result == []

    def test_temporal_grouping(self):
        """Photos separated by >4 hours form different groups."""
        # 25 photos in one time window (tagged "landscape"), 25 in another (tagged "portrait", >4h gap)
        group1 = [
            self._make_row(f"/g1_{i}.jpg", f"2025:03:14 {10 + i // 60:02d}:{i % 60:02d}:00", tags="landscape")
            for i in range(25)
        ]
        group2 = [
            self._make_row(f"/g2_{i}.jpg", f"2025:03:14 {20 + i // 60:02d}:{i % 60:02d}:00", tags="portrait")
            for i in range(25)
        ]

        call_results = [group1 + group2, []]  # photos, then album names
        mock_conn = mock.MagicMock()

        def execute_side_effect(*args, **kwargs):
            result_mock = mock.MagicMock()
            result_mock.fetchall.return_value = call_results.pop(0) if call_results else []
            return result_mock

        mock_conn.execute.side_effect = execute_side_effect

        result = generate_auto_albums(
            mock_conn,
            config={"auto_albums": {"min_photos_per_album": 5, "time_gap_hours": 4, "embedding_threshold": 0.6}},
            dry_run=True,
        )

        assert len(result) == 2
        assert result[0]["photo_count"] == 25
        assert result[1]["photo_count"] == 25

    def test_min_photos_filter(self):
        """Groups with fewer than min_photos are excluded."""
        # 3 photos — too few for default min_photos=20
        rows = [
            self._make_row(f"/{i}.jpg", f"2025:03:14 10:{i:02d}:00")
            for i in range(3)
        ]

        call_results = [rows, []]
        mock_conn = mock.MagicMock()

        def execute_side_effect(*args, **kwargs):
            result_mock = mock.MagicMock()
            result_mock.fetchall.return_value = call_results.pop(0) if call_results else []
            return result_mock

        mock_conn.execute.side_effect = execute_side_effect

        result = generate_auto_albums(mock_conn, dry_run=True)
        assert result == []

    def test_duplicate_name_detection(self):
        """Albums with existing names are skipped."""
        rows = [
            self._make_row(f"/{i}.jpg", f"2025:03:14 10:{i:02d}:00", tags="landscape")
            for i in range(25)
        ]

        call_results = [rows, [{"name": "Landscape \u2014 March 2025"}]]
        mock_conn = mock.MagicMock()

        def execute_side_effect(*args, **kwargs):
            result_mock = mock.MagicMock()
            result_mock.fetchall.return_value = call_results.pop(0) if call_results else []
            return result_mock

        mock_conn.execute.side_effect = execute_side_effect

        result = generate_auto_albums(
            mock_conn,
            config={"auto_albums": {"min_photos_per_album": 5}},
            dry_run=True,
        )

        assert len(result) == 0

    def test_dry_run_does_not_write(self):
        """dry_run=True should not create albums or commit."""
        rows = [
            self._make_row(f"/{i}.jpg", f"2025:03:14 10:{i:02d}:00")
            for i in range(25)
        ]

        call_results = [rows, []]
        execute_calls = []
        mock_conn = mock.MagicMock()

        def execute_side_effect(*args, **kwargs):
            execute_calls.append(args)
            result_mock = mock.MagicMock()
            result_mock.fetchall.return_value = call_results.pop(0) if call_results else []
            return result_mock

        mock_conn.execute.side_effect = execute_side_effect

        result = generate_auto_albums(
            mock_conn,
            config={"auto_albums": {"min_photos_per_album": 5}},
            dry_run=True,
        )

        assert len(result) == 1
        mock_conn.commit.assert_not_called()
        # No INSERT INTO albums call
        insert_calls = [c for c in execute_calls if len(c) > 0 and "INSERT INTO albums" in str(c[0])]
        assert len(insert_calls) == 0

    def test_creates_album_when_not_dry_run(self):
        """When dry_run=False, creates album in DB and commits."""
        rows = [
            self._make_row(f"/{i}.jpg", f"2025:03:14 10:{i:02d}:00")
            for i in range(25)
        ]

        call_results = [rows, []]
        mock_conn = mock.MagicMock()

        def execute_side_effect(*args, **kwargs):
            result_mock = mock.MagicMock()
            result_mock.fetchall.return_value = call_results.pop(0) if call_results else []
            result_mock.lastrowid = 1
            return result_mock

        mock_conn.execute.side_effect = execute_side_effect

        result = generate_auto_albums(
            mock_conn,
            config={"auto_albums": {"min_photos_per_album": 5}},
            dry_run=False,
        )

        assert len(result) == 1
        mock_conn.commit.assert_called_once()

    def test_default_config(self):
        """Uses default min_photos=5 when no config provided."""
        rows = [
            self._make_row(f"/{i}.jpg", f"2025:03:14 10:{i:02d}:00")
            for i in range(4)
        ]

        call_results = [rows, []]
        mock_conn = mock.MagicMock()

        def execute_side_effect(*args, **kwargs):
            result_mock = mock.MagicMock()
            result_mock.fetchall.return_value = call_results.pop(0) if call_results else []
            return result_mock

        mock_conn.execute.side_effect = execute_side_effect

        result = generate_auto_albums(mock_conn, dry_run=True)
        # 4 photos < 5 min_photos default
        assert result == []


class TestClusterByEmbeddings:
    """Tests for _cluster_by_embeddings."""

    def _make_embedding(self, values):
        return struct.pack(f"{len(values)}f", *values)

    def test_insufficient_embeddings(self):
        photos = [
            {"clip_embedding": None},
            {"clip_embedding": None},
        ]
        result = _cluster_by_embeddings(photos, threshold=0.6, min_size=2)
        assert result is None

    def test_clusters_similar_embeddings(self):
        photos = [
            {"clip_embedding": self._make_embedding([1.0, 0.0, 0.0])},
            {"clip_embedding": self._make_embedding([0.99, 0.01, 0.0])},
            {"clip_embedding": self._make_embedding([0.0, 0.0, 1.0])},
            {"clip_embedding": self._make_embedding([0.01, 0.0, 0.99])},
        ]
        result = _cluster_by_embeddings(photos, threshold=0.9, min_size=2)
        assert result is not None
        assert len(result) == 2
