"""Reject missing, empty, skipped-only or failing JUnit reports."""

import sys
import xml.etree.ElementTree as ET
from pathlib import Path


def check_report(path: Path) -> int:
    cases = list(ET.parse(path).getroot().iter("testcase"))
    failed = sum(
        c.find("failure") is not None or c.find("error") is not None for c in cases
    )
    skipped = sum(c.find("skipped") is not None for c in cases)
    passed = len(cases) - failed - skipped
    if failed or passed < 1:
        raise ValueError(f"{path}: passed={passed}, failed={failed}, skipped={skipped}")
    return passed


if __name__ == "__main__":
    if len(sys.argv) < 2:
        raise SystemExit("usage: check-test-report.py REPORT.xml [...]")
    try:
        for report in sys.argv[1:]:
            print(f"{report}: {check_report(Path(report))} passed")
    except (OSError, ET.ParseError, ValueError) as exc:
        raise SystemExit(str(exc)) from exc
