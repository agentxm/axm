#!/usr/bin/env python3

import sys
from pathlib import Path

from report_utils import render_report


def main() -> int:
    if len(sys.argv) != 3:
        raise SystemExit("Usage: build_report.py <input> <output>")
    source = Path(sys.argv[1])
    destination = Path(sys.argv[2])
    destination.write_text(render_report(source.read_text(encoding="utf-8")), encoding="utf-8")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
