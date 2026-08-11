#!/usr/bin/env python3
"""Fetch the interactive maps' statistics from Statistics Finland's PxWeb API.

The four exports this writes are *runtime* data, not build input: the browser reads them from
``/data/`` on page load (see ``src/lib/interactive/liveData.ts``), so refreshing the maps in
production is this script plus nothing — no rebuild, no redeploy, no container restart.

Run it locally to refresh the copy committed under ``static/data`` (which is what dev, the e2e
suite and a freshly built image serve), or on the production host with ``--out ./data`` to write
the directory nginx mounts in front of that copy.

    python3 scripts/fetch_statfi.py --dry-run --verbose
    python3 scripts/fetch_statfi.py
    python3 scripts/fetch_statfi.py --out ./data

Standard library only, on purpose: the production host runs it with a bare ``python3``, no venv
and no pip.

The output is PxWeb's own JSON export verbatim, because it *is* that export — the parsers in
``src/lib/interactive`` read the API response unchanged.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
import urllib.error
import urllib.request
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path

BASE_URL = "https://pxdata.stat.fi/PxWeb/api/v1/fi/StatFin"
USER_AGENT = "oskarwestmeijer-maps/1.0 (+https://github.com/OskarWestmeijer/maps)"

# PxWeb asks for no more than 30 queries per 10 seconds. We make eight, but be polite anyway.
REQUEST_SPACING_SECONDS = 1.0
RETRY_STATUSES = {429, 500, 502, 503, 504}
MAX_ATTEMPTS = 4

# The three occupation groups the software-jobs panel sums: web/multimedia developers,
# applications programmers, and software/app developers n.e.c. See `softwareJobs.ts`.
SOFTWARE_OCCUPATION_GROUPS = ["2513", "2514", "2519"]


@dataclass(frozen=True)
class Table:
    """One PxWeb table and the file it becomes."""

    name: str
    """Short handle for --only, and how the table is referred to in output."""

    path: str
    """Path under BASE_URL, e.g. "tyonv/12r5.px"."""

    filename: str
    """What it is written as, inside the output directory."""

    required_contents: tuple[str, ...] = ()
    """Content-column codes the TypeScript parsers demand. Missing any = refuse to write."""

    content_suffix_match: bool = False
    """Match `required_contents` against the part after the last "-" in each column code.

    The population statistics family shares column names but not their prefix (`ssaaty-vaesto`
    in 121w, `kuol-vaesto` in the monthly sibling), and `population.ts` matches on the suffix
    for exactly that reason — so validating on the full code here would be stricter than the
    consumer and would reject a file the site can actually read.
    """

    min_rows: int = 0
    """Refuse to write a suspiciously short response. 0 disables the check."""

    expect_whole_country: bool = True
    """Require an `SSS` row. False for national-only tables, which have no area dimension."""

    select: dict[str, list[str]] = field(default_factory=dict)
    """Explicit value selection for a variable, keyed by a marker value it must contain.

    Keyed by marker rather than by variable code because Statistics Finland renames variable
    codes (the 8.6.2026 database change did exactly that, and `alue_23_20260101` is already a
    dated code). The values a variable *offers* are the stable thing.
    """


TABLES: tuple[Table, ...] = (
    Table(
        name="unemployment",
        path="tyonv/12r5.px",
        filename="unemployment_register_kunnat_12r5.json",
        required_contents=(
            "TYOTOSUUS",
            "TYOVOIMATK",
            "HAKIJALOPUSSA",
            "TYOTTOMATLOPUSSA",
            "AVPAIKATLOPUSSA",
        ),
        min_rows=300,
    ),
    Table(
        name="software",
        path="tyonv/12ti.px",
        filename="software_occupations_register_kunnat_12ti.json",
        required_contents=("TYOTTOMATLOPUSSA", "AVPAIKATLOPUSSA"),
        min_rows=300,
        select={"2513": SOFTWARE_OCCUPATION_GROUPS},
    ),
    Table(
        name="population",
        path="ssaaty/121w.px",
        filename="population_register_kunnat_121w.json",
        required_contents=(
            "vaesto",
            "vm01",
            "vm11",
            "luonvalisays",
            "koknetmuutto",
            "kokmuutos",
        ),
        content_suffix_match=True,
        min_rows=300,
    ),
    Table(
        name="survey",
        path="tyti/135z.px",
        filename="unemployment_survey_national_135z.json",
        # The trend series is the number stat.fi advertises as the headline rate; the
        # unadjusted one sits beside it in `survey.ts`. Both are looked up by these codes
        # rather than by their Finnish display text, where "Työttömyysaste, %" is a strict
        # prefix of "Työttömyysaste, %, trendi" and a loose match reads the wrong series.
        required_contents=("tyottaste_trendi", "tyti-Tyottomyysaste"),
        # National figures — this table has no area dimension at all, so no `SSS` row.
        expect_whole_country=False,
    ),
)

MANIFEST_FILENAME = "manifest.json"


class FetchError(Exception):
    """Anything that means we must not write a file."""


# --------------------------------------------------------------------------- http


def _request(url: str, body: bytes | None = None) -> bytes:
    """GET or POST with retries on the statuses PxWeb uses for "come back later"."""

    headers = {"User-Agent": USER_AGENT}

    if body is not None:
        headers["Content-Type"] = "application/json"

    for attempt in range(1, MAX_ATTEMPTS + 1):
        request = urllib.request.Request(url, data=body, headers=headers)

        try:
            with urllib.request.urlopen(request, timeout=120) as response:
                return response.read()
        except urllib.error.HTTPError as error:
            retriable = error.code in RETRY_STATUSES
            detail = f"HTTP {error.code} for {url}"
        except (urllib.error.URLError, TimeoutError) as error:
            retriable = True
            detail = f"{type(error).__name__} for {url}: {error}"

        if not retriable or attempt == MAX_ATTEMPTS:
            raise FetchError(detail)

        backoff = 2**attempt
        print(f"  {detail} — retrying in {backoff}s", file=sys.stderr)
        time.sleep(backoff)

    raise FetchError(f"unreachable: {url}")  # pragma: no cover


# ------------------------------------------------------------------- query building


def is_time_variable(variable: dict) -> bool:
    return bool(variable.get("time"))


def build_query(table: Table, metadata: dict) -> list[dict]:
    """Turn PxWeb's variable metadata into a selection covering exactly what we need.

    Roles are resolved from the metadata rather than hardcoded, so a renamed variable code
    doesn't silently produce an empty or wrong export: the time variable is the one flagged
    `time`, an explicitly-selected variable is found by a marker value it offers, and
    everything else — areas, measures — is taken whole.
    """

    variables = metadata.get("variables") or []

    if not variables:
        raise FetchError(f"{table.name}: no variables in table metadata")

    query = []

    for variable in variables:
        code = variable.get("code")
        values = variable.get("values") or []

        if is_time_variable(variable):
            # Only the newest period. These tables carry 200+ months of history and the maps
            # show one; asking for all of it would be a 200x heavier query for no gain.
            selection = {"filter": "top", "values": ["1"]}
        else:
            wanted = next(
                (picked for marker, picked in table.select.items() if marker in values),
                None,
            )

            if wanted is not None:
                missing = [value for value in wanted if value not in values]

                if missing:
                    raise FetchError(
                        f"{table.name}: variable {code!r} no longer offers {missing}"
                    )

                selection = {"filter": "item", "values": list(wanted)}
            else:
                selection = {"filter": "all", "values": ["*"]}

        query.append({"code": code, "selection": selection})

    return query


# ---------------------------------------------------------------------- validation


def _content_codes(payload: dict) -> list[str]:
    """PxWeb splits columns into dimensions (type d/t) and measures (type c)."""

    return [column.get("code", "") for column in payload.get("columns", []) if column.get("type") == "c"]


def validate_json(table: Table, payload: dict) -> str:
    """Check a JSON export is something the site's parsers can actually read.

    This is the gate that keeps a bad upstream release from overwriting good data: it runs
    before anything is written, and failing it leaves the previous file in place.

    Returns the statistics period.
    """

    if not isinstance(payload.get("data"), list) or not payload["data"]:
        raise FetchError(f"{table.name}: response has no data rows")

    present = _content_codes(payload)

    if table.content_suffix_match:
        present_keys = {code.rsplit("-", 1)[-1] for code in present}
    else:
        present_keys = set(present)

    missing = [code for code in table.required_contents if code not in present_keys]

    if missing:
        raise FetchError(
            f"{table.name}: response is missing content column(s) {missing}; "
            f"got {sorted(present)}"
        )

    rows = payload["data"]

    if table.min_rows and len(rows) < table.min_rows:
        raise FetchError(f"{table.name}: only {len(rows)} rows, expected at least {table.min_rows}")

    keys = [row.get("key") or [] for row in rows]

    if table.expect_whole_country and not any("SSS" in key for key in keys):
        raise FetchError(f"{table.name}: no whole-country (SSS) row in response")

    return _period_from_keys(keys)


def _is_month(part: str) -> bool:
    return len(part) == 7 and part[4] in "MQ" and part[:4].isdigit() and part[5:].isdigit()


def _is_year(part: str) -> bool:
    # Range-checked, because 12ti's keys also carry bare four-digit occupation codes — 2513
    # is digits and four long, but it is not a year.
    return part.isdigit() and len(part) == 4 and 1900 <= int(part) <= 2100


def _period_from_keys(keys: list[list[str]]) -> str:
    """The period is a key element, but not at a fixed index.

    121w keys are [year, area]; 12r5's are [area, month]; 12ti's are [area, occupation,
    month]. `population.ts` has the same problem and solves it the same way — identify by
    shape, not by position. Months are looked for across every key before falling back to
    years, so a table carrying both can't be misread.
    """

    parts = [part for key in keys for part in key]

    return next(
        (part for part in parts if _is_month(part)),
        next((part for part in parts if _is_year(part)), ""),
    )


# --------------------------------------------------------------------------- output


def write_if_changed(path: Path, content: bytes, dry_run: bool) -> bool:
    """Atomic replace, skipped when the bytes already match. Returns whether it changed."""

    unchanged = path.exists() and path.read_bytes() == content

    if unchanged or dry_run:
        return not unchanged

    temporary = path.with_name(path.name + ".tmp")
    temporary.write_bytes(content)
    os.replace(temporary, path)

    return True


def fetch_table(table: Table, out: Path, dry_run: bool, verbose: bool) -> dict:
    """Fetch, validate and write one table. Raises FetchError rather than writing bad data."""

    url = f"{BASE_URL}/{table.path}"

    if verbose:
        print(f"  GET  {url}")

    metadata = json.loads(_request(url))
    query = build_query(table, metadata)

    if verbose:
        print(f"  POST {url}\n       {json.dumps(query, ensure_ascii=False)}")

    time.sleep(REQUEST_SPACING_SECONDS)
    body = json.dumps({"query": query, "response": {"format": "json"}}).encode("utf-8")
    raw = _request(url, body)

    try:
        payload = json.loads(raw)
    except json.JSONDecodeError as error:
        raise FetchError(f"{table.name}: response is not valid JSON ({error})") from error

    period = validate_json(table, payload)
    changed = write_if_changed(out / table.filename, raw, dry_run)

    return {"period": period, "changed": changed, "bytes": len(raw)}


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument(
        "--out",
        type=Path,
        default=Path("static/data"),
        help="directory to write into (default: static/data, the copy committed to the repo)",
    )
    parser.add_argument(
        "--only",
        action="append",
        choices=[table.name for table in TABLES],
        help="fetch just this table; repeatable",
    )
    parser.add_argument("--dry-run", action="store_true", help="fetch and validate, write nothing")
    parser.add_argument("--verbose", action="store_true", help="print every request")
    args = parser.parse_args(argv)

    tables = [table for table in TABLES if not args.only or table.name in args.only]
    out: Path = args.out

    if not args.dry_run:
        out.mkdir(parents=True, exist_ok=True)

    polled = datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")
    results: dict[str, dict] = {}
    failures: list[str] = []

    for index, table in enumerate(tables):
        if index:
            time.sleep(REQUEST_SPACING_SECONDS)

        print(f"{table.name} ({table.path})")

        try:
            result = fetch_table(table, out, args.dry_run, args.verbose)
        except FetchError as error:
            print(f"  FAILED {error}", file=sys.stderr)
            failures.append(table.name)
            continue

        state = "changed" if result["changed"] else "unchanged"
        print(f"  {table.filename} — period {result['period']}, {result['bytes']} bytes, {state}")
        results[table.filename] = {"polled": polled, "period": result["period"]}

    # The manifest carries per-file entries rather than one timestamp because the four tables
    # are on independent release cycles, and a partially-failed run must not claim all four are
    # fresh. A file skipped as unchanged still counts as polled — we did check it.
    if results and not args.dry_run:
        manifest = json.dumps({"polled": polled, "files": results}, indent=2, ensure_ascii=False) + "\n"
        write_if_changed(out / MANIFEST_FILENAME, manifest.encode("utf-8"), False)
        print(f"{MANIFEST_FILENAME} — polled {polled}")

    if failures:
        print(f"\n{len(failures)} table(s) failed: {', '.join(failures)}", file=sys.stderr)
        return 1

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
