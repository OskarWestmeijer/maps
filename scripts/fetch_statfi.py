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

# PxWeb asks for no more than 30 queries per 10 seconds. We make ten, but be polite anyway.
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

    max_rows: int = 0
    """Refuse to write a suspiciously *long* one. 0 disables the check.

    A floor catches a table that stopped publishing; it cannot catch a query that stopped
    narrowing. `omit` below is exactly that risk — 12bs answers a query that forgot to drop its
    age and sex breakdowns with 14 850 perfectly valid rows, and the only thing wrong with them
    is that the browser fetches the file on every page load.
    """

    expect_whole_country: bool = True
    """Require an `SSS` row. False for national-only tables, which have no area dimension."""

    select: dict[str, list[str]] = field(default_factory=dict)
    """Explicit value selection for a variable, keyed by a marker value it must contain.

    Keyed by marker rather than by variable code because Statistics Finland renames variable
    codes (the 8.6.2026 database change did exactly that, and `alue_23_20260101` is already a
    dated code). The values a variable *offers* are the stable thing.
    """

    omit: tuple[tuple[str, ...], ...] = ()
    """Variables to leave out of the query entirely, each identified by markers it must offer.

    PxWeb returns a variable's own total when an `elimination: true` variable is simply not
    asked for, which is how a table with breakdowns we don't want becomes one row per area.
    12bs declares age (15 values) and sex (3), and taking them whole would multiply its 330 rows
    into 14 850 and the file the browser downloads with them.

    Identified by markers for the same reason `select` is, and by *several* markers because one
    is not enough to tell these variables apart: `SSS` is offered by the area, age and sex
    variables alike, while ("15-19", "20-24") and ("1", "2") each match exactly one.
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
        name="income",
        path="tjt/14ww.px",
        filename="income_register_kunnat_14ww.json",
        # Suffix-matched like the population table: this export mixes prefixed column codes
        # (`tjt-ekvikturaha_med`, `tjt-henkiloita`) with unprefixed ones (`gini_kturaha`,
        # `rpt_aste`), and `income.ts` matches the suffix so a prefix rename doesn't empty
        # the map. Codes without a "-" are their own suffix, so the two kinds coexist.
        required_contents=(
            "ekvikturaha_med",
            "hkturaha18_med",
            "gini_kturaha",
            "rpt_aste",
            "henkiloita",
        ),
        content_suffix_match=True,
        min_rows=300,
    ),
    Table(
        name="education",
        path="vkour/12bs.px",
        filename="education_register_kunnat_12bs.json",
        # Unprefixed today (`kaste5T8osuus`, not `vkour-kaste5T8osuus`), but suffix-matched like
        # the other two annual tables so a later prefix rename can't empty the map: a code with
        # no "-" is simply its own suffix.
        # The three shares the panel renders, the three counts behind them (a share is only
        # aggregable through its numerator — see `aggregateEducationStats`), and the denominator.
        required_contents=(
            "kaste5T8osuus",
            "kaste0osuus",
            "kaste3osuus",
            "kaste5T8",
            "kaste0",
            "kaste3",
            "vktm",
            "vaesto_15_",
        ),
        content_suffix_match=True,
        min_rows=300,
        # 330 rows: SSS + 19 maakuntas + 308 municipalities + 2 mainland/Åland. Anything near
        # 14 850 means the age or sex breakdown came back.
        max_rows=1000,
        omit=(("15-19", "20-24"), ("1", "2")),
    ),
    Table(
        name="age",
        path="vaerak/11ra.px",
        filename="age_register_kunnat_11ra.json",
        # Suffix-matched, because this export mixes the two forms in one file again:
        # `vaerak-vaesto` carries the statistic's prefix, `vaesto_keski_ika` doesn't.
        required_contents=(
            "vaesto_keski_ika",
            "vaesto_alle15_p",
            "vaesto_yli64_p",
            "vaesto",
        ),
        content_suffix_match=True,
        min_rows=300,
        # 568 rows: SSS plus sixteen area levels, of which only KU and MK are ever drawn.
        max_rows=1000,
        # 11ra is a key-figures table — 43 measures, of which the map needs four. Narrowed by
        # marker like 12ti's occupations, rather than omitted like 12bs's breakdowns: this is a
        # content variable, so there is no total to fall back to, and `all` would quadruple the
        # file for columns nothing reads. The population is here as the weight the Tampere Metro
        # roll-up needs, not to be shown.
        select={
            "vaesto_keski_ika": [
                "vaesto_keski_ika",
                "vaesto_alle15_p",
                "vaesto_yli64_p",
                "vaerak-vaesto",
            ]
        },
    ),
    Table(
        name="sex",
        path="vaerak/11re.px",
        filename="sex_register_kunnat_11re.json",
        required_contents=("vaesto",),
        content_suffix_match=True,
        # 927 rows: 309 areas (whole country + the 308 municipalities — this one publishes no
        # region rows at all) times the three values of the sex dimension, which is kept rather
        # than omitted because it *is* the measure. Only the 102 single-year ages are dropped.
        min_rows=900,
        max_rows=2000,
        omit=(("000", "001"),),
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
    `time`, an explicitly-selected or omitted variable is found by the marker values it offers,
    and everything else — areas, measures — is taken whole.
    """

    variables = metadata.get("variables") or []

    if not variables:
        raise FetchError(f"{table.name}: no variables in table metadata")

    query = []
    omitted: list[tuple[str, ...]] = []

    for variable in variables:
        code = variable.get("code")
        values = variable.get("values") or []
        dropped = next((rule for rule in table.omit if all(m in values for m in rule)), None)

        if dropped is not None:
            # Only an eliminable variable answers with a total when left out; a required one
            # makes PxWeb reject the whole query, so say which variable and why here rather
            # than reading it out of an HTTP 400.
            if not variable.get("elimination"):
                raise FetchError(
                    f"{table.name}: variable {code!r} is no longer eliminable, so omitting it "
                    f"would not return its total"
                )

            omitted.append(dropped)
            continue

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

    # A rule that matches nothing is the dangerous case: the variable it was meant to drop is
    # still there, still requested `all`, and the response is a valid file several megabytes
    # too big. `max_rows` is the second net under this one.
    unmatched = [rule for rule in table.omit if rule not in omitted]

    if unmatched:
        raise FetchError(
            f"{table.name}: no variable offers {list(unmatched[0])}, so the breakdown it names "
            f"can no longer be omitted"
        )

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

    if table.max_rows and len(rows) > table.max_rows:
        raise FetchError(
            f"{table.name}: {len(rows)} rows, expected at most {table.max_rows} — a breakdown "
            f"this table declares is probably no longer being omitted"
        )

    keys = [row.get("key") or [] for row in rows]

    if table.expect_whole_country and not any("SSS" in key for key in keys):
        raise FetchError(f"{table.name}: no whole-country (SSS) row in response")

    return _period_from_keys(keys)


def released_at(payload: dict) -> str | None:
    """When Statistics Finland published this release, from the export's own metadata.

    Normalised from PxWeb's odd `2026-07-21T05.00.00Z` (dots, not colons) to real ISO-8601,
    so the manifest is parseable by anything that reads it.
    """

    raw = (payload.get("metadata") or [{}])[0].get("updated")

    if not isinstance(raw, str) or "T" not in raw:
        return None

    date, _, clock = raw.partition("T")

    return f"{date}T{clock.replace('.', ':')}"


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


def write_if_changed(path: Path, content: bytes, dry_run: bool) -> str:
    """Write the file, unless the bytes on disk are already identical.

    Skipping an identical write is what keeps the file's mtime meaningful and keeps `git diff`
    empty on a run that fetched the same figures again.

    Returns what happened, for the summary: "new", "rewritten", "identical" — or, under
    --dry-run, what *would* have happened.
    """

    if not path.exists():
        outcome = "new"
    elif path.read_bytes() == content:
        outcome = "identical"
    else:
        outcome = "rewritten"

    if dry_run or outcome == "identical":
        return outcome

    temporary = path.with_name(path.name + ".tmp")
    temporary.write_bytes(content)
    os.replace(temporary, path)

    return outcome


# What each outcome means in the summary, spelled out — the distinction that matters is
# whether the file on disk was touched, not whether the figures happened to differ.
OUTCOMES = {
    "new": "written (no local copy existed)",
    "rewritten": "written (the figures differ from the local copy)",
    "identical": "left alone (byte-identical to the local copy — nothing to write)",
}


def read_manifest(path: Path) -> dict[str, dict]:
    """The existing per-file entries, or empty if there is no readable manifest yet."""

    try:
        existing = json.loads(path.read_bytes())
    except (OSError, json.JSONDecodeError):
        return {}

    files = existing.get("files")

    return files if isinstance(files, dict) else {}


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
    outcome = write_if_changed(out / table.filename, raw, dry_run)

    return {
        "period": period,
        "updated": released_at(payload),
        "outcome": outcome,
        "bytes": len(raw)
    }


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
    # What the per-file entries are merged into at the end, so a partial run keeps the rest.
    previous = read_manifest(out / MANIFEST_FILENAME)
    results: dict[str, dict] = {}
    outcomes: dict[str, str] = {}
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

        verb = "would be " if args.dry_run else ""
        print(f"  period {result['period']} · {result['bytes']} bytes")
        print(f"  {out / table.filename}")
        print(f"  -> {verb}{OUTCOMES[result['outcome']]}")
        outcomes[table.filename] = result["outcome"]
        # Three dates, three different questions: `period` is what the figures describe,
        # `updated` is when Statistics Finland published them, `polled` is when we last
        # checked. Only the last moves on a run that changes nothing — which is what makes a
        # stale `updated` next to a fresh `polled` readable as "checked today, still June's
        # release", the thing the console's "left alone" only says in passing.
        #
        # `updated` is read from the export's own metadata rather than recorded when we happen
        # to write the file: it's exact, identical on every machine, and has no unknown case
        # for a file that was on disk before this manifest existed.
        results[table.filename] = {
            "period": result["period"],
            "updated": result["updated"],
            "polled": polled
        }

    # The manifest carries per-file entries rather than one timestamp because the four tables
    # are on independent release cycles, and a partially-failed run must not claim all four are
    # fresh. A file left alone still counts as polled — we did check it, and that check is the
    # only evidence the pipeline is alive, so this file is rewritten on every successful run.
    #
    # Merged into whatever is already there, never replacing it: --only, or a run where one
    # table failed, covers a subset of the files, and overwriting would silently drop the
    # entries for the others — leaving the maps with no poll date for data that is on disk and
    # perfectly current.
    if results and not args.dry_run:
        merged = {**previous, **results}
        manifest = json.dumps({"polled": polled, "files": merged}, indent=2, ensure_ascii=False) + "\n"
        write_if_changed(out / MANIFEST_FILENAME, manifest.encode("utf-8"), False)
        print(f"\n{out / MANIFEST_FILENAME}")
        print(f"  -> written, polled {polled} (this one changes on every run)")

        for filename, entry in results.items():
            print(
                f"     {filename}: period {entry['period']}, "
                f"released {entry['updated'] or 'unknown'}"
            )

    written = [name for name, outcome in outcomes.items() if outcome != "identical"]
    print(
        f"\nSummary: {len(outcomes)} table(s) fetched and validated, "
        f"{len(written)} file(s) {'would be ' if args.dry_run else ''}written"
        + (f": {', '.join(written)}" if written else " — every file already up to date")
    )

    if failures:
        print(f"\n{len(failures)} table(s) failed: {', '.join(failures)}", file=sys.stderr)
        return 1

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
