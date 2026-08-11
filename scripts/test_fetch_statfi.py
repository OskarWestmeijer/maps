"""Offline tests for the PxWeb fetch script. Run with `python3 -m unittest discover scripts`.

Everything here is deliberately network-free: what's worth testing is the query the script
builds from a table's metadata and the validation that decides whether a response is safe to
write over good data. The HTTP layer is thin enough to exercise by running the script.
"""

from __future__ import annotations

import unittest

from fetch_statfi import (
    TABLES,
    FetchError,
    Table,
    _period_from_keys,
    build_query,
    validate_json,
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


if __name__ == "__main__":
    unittest.main()
