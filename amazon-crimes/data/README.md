# Amazon Crimes — Canonical Data

This directory is the single canonical source for the Amazon Crimes environmental crime event database.

## Canonical file

`events.json`

Public raw URL:

`https://raw.githubusercontent.com/acarvalho-wcs/WCS/amazon-crimes-pages/amazon-crimes/data/events.json`

The public dashboard does **not** maintain a separate authoritative event list. During deployment, GitHub Actions validates this file and copies it to:

`amazon-crimes/public/data/events.json`

## Update workflow

1. Add or update records only in `amazon-crimes/data/events.json`.
2. Run the automatic validator.
3. GitHub Actions copies the validated canonical file into the public site.
4. GitHub Pages deploys the updated dashboard.

This makes GitHub the source of truth and allows ChatGPT, through the connected GitHub account, to update the database directly without editing the site layout.

## Required ingestion rules

Each new event must:
- have a unique stable `id`;
- include `title`, `summary`, and `case_context` in Portuguese, English, and Spanish;
- include valid `occurred_at`, `published_at`, `added_at`, and `updated_at` timestamps;
- include geographic coordinates and a stated location precision;
- include at least one verifiable source with a working HTTP(S) URL;
- use a supported crime type;
- include the primary crime type in `crime_types`;
- distinguish confirmed facts from analytical context;
- avoid inferring criminal guilt beyond the cited source;
- use `source_media` only for media linked to the event/source;
- be checked for duplication against existing records before insertion.

## Deduplication

Before adding a new record, compare at least:
- date/time window;
- locality and coordinates;
- operation name;
- agencies;
- crime type;
- quantities/objects involved;
- source URL;
- event description.

When a new source adds detail to an existing event, update the existing record instead of creating a duplicate.
