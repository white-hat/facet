# Changelog

All notable changes to Facet are documented in this file.

## [1.0.0] — 2026-03-17

### Scoring & Analysis
- Multi-dimensional scoring: aesthetic, composition, sharpness, exposure, color, face quality, eye sharpness, noise
- TOPIQ IQA (0.93 SRCC), with TOPIQ IAA, TOPIQ NR-Face, and LIQE as supplementary quality metrics
- SAMP-Net composition pattern detection (14 patterns: rule of thirds, golden ratio, vanishing point, symmetry, …)
- BiRefNet subject saliency: sharpness, prominence, placement, and background separation per photo
- CLIP ViT-L-14 (8 GB) and SigLIP 2 NaFlex SO400M (16/24 GB) embedding profiles
- VRAM auto-detection with four profiles: legacy / 8 GB / 16 GB / 24 GB
- Percentile normalization — 90th-percentile maps to 10.0 regardless of library size

### Categories & Weights
- 17 content categories with per-category scoring weights (portrait, landscape, wildlife, macro, street, …)
- Config-driven category determination via `filters` (numeric ranges, booleans, tags) and `modifiers` (bonus/penalty)
- A/B weight comparison: tune weights, preview score changes against a snapshot, apply or discard
- `--compute-recommendations` analyses the database and suggests scoring fixes

### Culling
- Burst detection groups similar photos taken within a configurable time window
- Best-of-burst selection surfaces the top-scoring frame per group
- Blink detection flags closed-eye portraits
- Duplicate detection via perceptual hash (pHash)
- AI similarity culling groups visually similar photos for manual review (`/api/similar-groups`)

### Face Recognition
- InsightFace buffalo_l detection with 106-point landmarks
- HDBSCAN face clustering into named or auto-labelled persons
- Merge suggestions UI with similarity threshold slider and one-click batch merge
- Incremental and force-reprocess modes for extraction and clustering
- Per-face and per-person thumbnails stored in SQLite

### Gallery & Browse
- Gallery modes: mosaic, grid, list
- Real-time filter panel: score, date, camera, lens, aperture, focal length, tag, person, category, composition pattern, GPS radius, Top Picks
- Semantic text-to-image search via CLIP/SigLIP embeddings
- Timeline view with year → month → day drill-down and mini-calendar heatmap
- Map view with marker clustering (Leaflet), GPS filter dialog with radius picker
- Folders browser with breadcrumb navigation and directory cover photos
- Memories — "On This Day" photos from previous years
- Slideshow with per-capsule transitions (crossfade, slide, zoom, Ken Burns)
- Capsules — 30+ AI-curated themed collections: journeys, seasonal, golden, faces of, color story, progress, person pairs, and more
- Albums: manual and smart (filter-based), with sharing via tokenised links

### Organize
- Star ratings and favorites per photo
- Batch tag/rate/favorite/delete operations
- AI captions (VLM-generated) with automatic translation via MarianMT
- Tags from CLIP similarity (8 GB) or Qwen VLM (16/24 GB)
- `photo_tags` lookup table for 10–50× faster tag filtering at scale
- GPS extraction from EXIF into the database; reverse geocoding via `reverse_geocoder`

### Statistics & Understand
- Statistics dashboard: score distribution, top cameras/lenses, composition breakdown, category split
- Per-category weight editor with live recompute
- AI critique: rule-based score breakdown (all profiles) or VLM-powered critique (16/24 GB)

### Web Viewer
- FastAPI backend + Angular 20 zoneless signal-based SPA on port 5000
- Dark/light theme with 10 accent colours; responsive layout
- 5 languages: English, French, German, Spanish, Italian
- Multi-user mode with role-based access (admin / viewer) and per-user ratings
- Edition password for single-user locking
- Photo detail page with EXIF, GPS chip, face chips, clickable tags/persons, caption edit
- Scan trigger from the web UI
- Photo download and CSV/JSON export
- Plugin/webhook system for post-scan automation

### Infrastructure
- SQLite with WAL mode, mmap, and statistics cache (`stats_cache` table, 5-minute TTL)
- RAW support: CR2, CR3, NEF, ARW, RAF, RW2, DNG, ORF, SRW, PEF (via rawpy + exifread)
- Multi-pass GPU scheduling — no inter-batch idle time; single-pass available for high-VRAM setups
- `--doctor` diagnostic command (Python, GPU, deps, config, database)
- `--dry-run` preview mode — scores a sample without writing to the database
- Deployment guides for Linux, Synology NAS, and Docker

### Quality
- 267 automated tests across 20 test files (Python pytest + FastAPI TestClient)
- LIKE wildcard escaping in all path-prefix SQL filters
- No silent `except` blocks — all errors logged via Python `logging`
- CodeQL SSRF alerts resolved

[1.0.0]: https://github.com/ncoevoet/facet/releases/tag/v1.0.0
