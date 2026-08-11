"""Offline tests for the PxWeb fetch script. Run with `python3 -m unittest discover scripts`.

Everything here is deliberately network-free: what's worth testing is the query the script
builds from a table's metadata and the validation that decides whether a response is safe to
write over good data. The HTTP layer is thin enough to exercise by running the script.
"""

from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path

from fetch_statfi import (
    TABLES,
    FetchError,
    Table,
    _period_from_keys,
    build_query,
    read_manifest,
    released_at,
    validate_json,
    write_if_changed,
)


def table(name: str) -> Table:
    return next(t for t in TABLES if t.name == name)


# Trimmed to the shape `build_query` reads, with the real variable codes.
UNEMPLOYMENT_METADATA = {
    "variables": [
        {"code": "Alue", "text": "Alue", "values": ["SSS", "KU020", "MK01"]},
        {"code": "timeperiod_m", "text": "Kuukausi", "time": True, "values": ["2026M05", "2026M06"]},
        {"code": "contentscode", "text": "Tiedot", "values": ["TYOTOSUUS", "TYOVOIMATK"]},
    ]
}

SOFTWARE_METADATA = {
    "variables": [
        {"code": "Alue", "text": "Alue", "values": ["SSS", "KU020"]},
        {"code": "Ammattiryhmä", "text": "Ammattiryhmä", "values": ["SSS", "2513", "2514", "2519", "9999"]},
        {"code": "timeperiod_m", "text": "Kuukausi", "time": True, "values": ["2026M06"]},
        {"code": "contentscode", "text": "Tiedot", "values": ["TYOTTOMATLOPUSSA"]},
    ]
}


class BuildQueryTest(unittest.TestCase):
    def test_takes_only_the_newest_period(self):
        query = build_query(table("unemployment"), UNEMPLOYMENT_METADATA)
        time_selection = next(q for q in query if q["code"] == "timeperiod_m")["selection"]

        self.assertEqual({"filter": "top", "values": ["1"]}, time_selection)

    def test_takes_every_area_and_measure(self):
        query = build_query(table("unemployment"), UNEMPLOYMENT_METADATA)

        for code in ("Alue", "contentscode"):
            selection = next(q for q in query if q["code"] == code)["selection"]
            self.assertEqual({"filter": "all", "values": ["*"]}, selection)

    def test_covers_every_variable_the_table_declares(self):
        query = build_query(table("unemployment"), UNEMPLOYMENT_METADATA)

        self.assertEqual(["Alue", "timeperiod_m", "contentscode"], [q["code"] for q in query])

    def test_narrows_the_occupation_variable_to_the_software_groups(self):
        query = build_query(table("software"), SOFTWARE_METADATA)
        selection = next(q for q in query if q["code"] == "Ammattiryhmä")["selection"]

        self.assertEqual({"filter": "item", "values": ["2513", "2514", "2519"]}, selection)

    def test_finds_the_occupation_variable_even_if_its_code_is_renamed(self):
        """Codes get renamed (the 8.6.2026 database change did exactly that); values don't."""

        renamed = {
            "variables": [
                {"code": "ammatti_2026", "text": "Ammattiryhmä", "values": ["2513", "2514", "2519"]},
                {"code": "timeperiod_m", "time": True, "values": ["2026M06"]},
            ]
        }
        query = build_query(table("software"), renamed)
        selection = next(q for q in query if q["code"] == "ammatti_2026")["selection"]

        self.assertEqual({"filter": "item", "values": ["2513", "2514", "2519"]}, selection)

    def test_rejects_a_table_that_dropped_a_group_we_need(self):
        thinned = {
            "variables": [
                {"code": "Ammattiryhmä", "values": ["2513", "2514"]},
                {"code": "timeperiod_m", "time": True, "values": ["2026M06"]},
            ]
        }

        with self.assertRaisesRegex(FetchError, "2519"):
            build_query(table("software"), thinned)

    def test_rejects_metadata_with_no_variables(self):
        with self.assertRaisesRegex(FetchError, "no variables"):
            build_query(table("unemployment"), {})


def px(columns: list[tuple[str, str]], data: list[dict]) -> dict:
    return {
        "columns": [{"code": code, "text": code, "type": type_} for code, type_ in columns],
        "data": data,
    }


UNEMPLOYMENT_COLUMNS = [
    ("Alue", "d"),
    ("timeperiod_m", "t"),
    ("HAKIJALOPUSSA", "c"),
    ("TYOTTOMATLOPUSSA", "c"),
    ("TYOVOIMATK", "c"),
    ("TYOTOSUUS", "c"),
    ("AVPAIKATLOPUSSA", "c"),
]


def unemployment_rows(count: int) -> list[dict]:
    rows = [{"key": ["SSS", "2026M06"], "values": ["1", "2", "3", "12.8", "5"]}]
    rows += [{"key": [f"KU{n:03d}", "2026M06"], "values": ["1", "2", "3", "9.0", "5"]} for n in range(count)]

    return rows


class ValidateJsonTest(unittest.TestCase):
    def test_accepts_a_well_formed_export_and_returns_its_period(self):
        payload = px(UNEMPLOYMENT_COLUMNS, unemployment_rows(320))

        self.assertEqual("2026M06", validate_json(table("unemployment"), payload))

    def test_rejects_a_missing_content_column(self):
        columns = [c for c in UNEMPLOYMENT_COLUMNS if c[0] != "TYOTOSUUS"]

        with self.assertRaisesRegex(FetchError, "TYOTOSUUS"):
            validate_json(table("unemployment"), px(columns, unemployment_rows(320)))

    def test_rejects_a_truncated_export(self):
        with self.assertRaisesRegex(FetchError, "at least 300"):
            validate_json(table("unemployment"), px(UNEMPLOYMENT_COLUMNS, unemployment_rows(5)))

    def test_rejects_an_export_with_no_whole_country_row(self):
        rows = [r for r in unemployment_rows(320) if r["key"][0] != "SSS"]

        with self.assertRaisesRegex(FetchError, "SSS"):
            validate_json(table("unemployment"), px(UNEMPLOYMENT_COLUMNS, rows))

    def test_rejects_an_empty_export(self):
        with self.assertRaisesRegex(FetchError, "no data rows"):
            validate_json(table("unemployment"), px(UNEMPLOYMENT_COLUMNS, []))

    def test_matches_population_columns_on_their_suffix(self):
        """121w prefixes every measure `ssaaty-`; the monthly sibling uses `kuol-`."""

        columns = [("timeperiod_y", "t"), ("alue_23_20260101", "d")]
        columns += [
            (f"ssaaty-{name}", "c")
            for name in ("vm01", "vm11", "luonvalisays", "koknetmuutto", "kokmuutos", "vaesto")
        ]
        rows = [{"key": ["2025", "SSS"], "values": ["1"] * 6}]
        rows += [{"key": ["2025", f"KU{n:03d}"], "values": ["1"] * 6} for n in range(320)]

        self.assertEqual("2025", validate_json(table("population"), px(columns, rows)))

    def test_national_only_table_needs_no_whole_country_row(self):
        columns = [("timeperiod_m", "t"), ("tyottaste_trendi", "c"), ("tyti-Tyottomyysaste", "c")]
        payload = px(columns, [{"key": ["2026M06"], "values": ["10.5", "10.0"]}])

        self.assertEqual("2026M06", validate_json(table("survey"), payload))


class PeriodFromKeysTest(unittest.TestCase):
    def test_reads_a_month_regardless_of_its_position(self):
        self.assertEqual("2026M06", _period_from_keys([["KU020", "2026M06"]]))
        self.assertEqual("2026M06", _period_from_keys([["2026M06", "KU020"]]))

    def test_prefers_the_month_over_a_four_digit_occupation_code(self):
        """12ti's keys are [area, occupation, month] — and 2513 is four digits."""

        self.assertEqual("2026M06", _period_from_keys([["KU020", "2513", "2026M06"]]))

    def test_reads_a_year_when_there_is_no_month(self):
        self.assertEqual("2025", _period_from_keys([["2025", "SSS"]]))

    def test_ignores_four_digit_values_outside_any_plausible_year(self):
        self.assertEqual("", _period_from_keys([["KU020", "2513"]]))


class ManifestTest(unittest.TestCase):
    """`--only`, and any run where one table fails, covers a subset of the files."""

    def setUp(self):
        self.dir = Path(tempfile.mkdtemp())
        self.path = self.dir / "manifest.json"

    def write(self, files: dict):
        self.path.write_text(json.dumps({"polled": "2026-08-11T05:00:00Z", "files": files}))

    def test_reads_the_existing_per_file_entries(self):
        self.write({"a.json": {"polled": "x", "period": "2026M06"}})

        self.assertEqual({"a.json": {"polled": "x", "period": "2026M06"}}, read_manifest(self.path))

    def test_a_partial_run_must_not_drop_the_other_files_entries(self):
        # The regression this exists for: refreshing one table used to replace the whole
        # manifest, leaving the maps with no poll date for data that was on disk and current.
        self.write({"a.json": {"polled": "old", "period": "2026M05"}, "b.json": {"polled": "old"}})

        merged = {**read_manifest(self.path), **{"a.json": {"polled": "new", "period": "2026M06"}}}

        self.assertEqual({"polled": "new", "period": "2026M06"}, merged["a.json"])
        self.assertEqual({"polled": "old"}, merged["b.json"])

    def test_starts_empty_when_there_is_no_manifest_yet(self):
        self.assertEqual({}, read_manifest(self.path))

    def test_starts_empty_rather_than_throwing_on_a_corrupt_manifest(self):
        self.path.write_text("{not json")

        self.assertEqual({}, read_manifest(self.path))


class ReleasedAtTest(unittest.TestCase):
    """`updated` in the manifest: when Statistics Finland published, not when we fetched."""

    def test_normalises_pxwebs_dotted_clock_to_real_iso_8601(self):
        # PxWeb emits "2026-07-21T05.00.00Z" — dots where ISO-8601 wants colons, which no
        # date parser on either side of this pipeline accepts.
        payload = {"metadata": [{"updated": "2026-07-21T05.00.00Z"}]}

        self.assertEqual("2026-07-21T05:00:00Z", released_at(payload))

    def test_leaves_an_already_valid_timestamp_alone(self):
        payload = {"metadata": [{"updated": "2026-07-21T05:00:00Z"}]}

        self.assertEqual("2026-07-21T05:00:00Z", released_at(payload))

    def test_does_not_touch_the_date_half(self):
        # Only the clock has dots; the date's hyphens must survive.
        payload = {"metadata": [{"updated": "2026-05-27T05.00.00Z"}]}

        self.assertEqual("2026-05-27", released_at(payload).split("T")[0])

    def test_returns_none_when_the_export_carries_no_release_date(self):
        for payload in ({}, {"metadata": []}, {"metadata": [{}]}, {"metadata": [{"updated": 7}]}):
            self.assertIsNone(released_at(payload), payload)


class WriteIfChangedTest(unittest.TestCase):
    def setUp(self):
        self.path = Path(tempfile.mkdtemp()) / "export.json"

    def test_reports_a_first_write_as_new(self):
        self.assertEqual("new", write_if_changed(self.path, b"one", dry_run=False))
        self.assertEqual(b"one", self.path.read_bytes())

    def test_reports_differing_bytes_as_rewritten(self):
        write_if_changed(self.path, b"one", dry_run=False)

        self.assertEqual("rewritten", write_if_changed(self.path, b"two", dry_run=False))
        self.assertEqual(b"two", self.path.read_bytes())

    def test_skips_the_write_entirely_when_the_bytes_match(self):
        write_if_changed(self.path, b"one", dry_run=False)
        before = self.path.stat().st_mtime_ns

        self.assertEqual("identical", write_if_changed(self.path, b"one", dry_run=False))
        # Not rewritten with identical content: the mtime stays meaningful.
        self.assertEqual(before, self.path.stat().st_mtime_ns)

    def test_a_dry_run_reports_what_would_happen_without_touching_the_file(self):
        write_if_changed(self.path, b"one", dry_run=False)

        self.assertEqual("rewritten", write_if_changed(self.path, b"two", dry_run=True))
        self.assertEqual(b"one", self.path.read_bytes())

    def test_leaves_no_temporary_file_behind(self):
        write_if_changed(self.path, b"one", dry_run=False)

        self.assertEqual(["export.json"], [p.name for p in self.path.parent.iterdir()])


if __name__ == "__main__":
    unittest.main()
