#!/usr/bin/env python3
"""Validate an Open Knowledge Format (OKF) v0.2 bundle.

Severities
  error  Spec violation. §11 conformance, or a field the spec marks REQUIRED
         within a family that the document chose to include.
  warn   Producer SHOULD, or an authoring hazard the spec explicitly tolerates
         (broken links, near-duplicate types). Judge each on its merits.
  info   Recommended-field gaps and low-signal observations. Hidden by default.

Exit codes: 0 clean, 1 errors present (or warnings with --strict), 2 bad usage.
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import re
import sys
from pathlib import Path

try:
    import yaml
except ImportError:
    sys.stderr.write(
        "validate_okf.py requires PyYAML.\n"
        "Install it with:  pip install pyyaml   (or: python3 -m pip install pyyaml)\n"
    )
    raise SystemExit(2)

RESERVED = {"index.md", "log.md"}
STATUS_VALUES = {"draft", "stable", "deprecated"}

RE_DATE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
RE_DATETIME = re.compile(
    r"^\d{4}-\d{2}-\d{2}[Tt ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?\s*([Zz]|[+-]\d{2}:?\d{2})?$"
)
RE_ACTOR_HUMAN = re.compile(r"^human:\S+$")
RE_ACTOR_PROCESS = re.compile(r"^process:\S+$")
RE_ACTOR_AGENT = re.compile(r"^[^\s:/]+/[^\s:]+$")
RE_ACTOR_PREFIXED = re.compile(r"^[A-Za-z][\w-]*:\S+$")

RE_LINK = re.compile(r"(!?)\[([^\]\[]*)\]\(\s*<?([^)>\s]+)>?(?:\s+[\"'][^\"']*[\"'])?\s*\)")
RE_FOOTNOTE_DEF = re.compile(r"^\s{0,3}\[\^([^\]]+)\]:", re.MULTILINE)
RE_FOOTNOTE_REF = re.compile(r"\[\^([^\]]+)\](?!:)")
RE_FENCE = re.compile(r"^\s{0,3}(`{3,}|~{3,})")
RE_URL_SCHEME = re.compile(r"^[a-zA-Z][a-zA-Z0-9+.-]*:")
RE_BULLET = re.compile(r"^\s{0,3}[-*+]\s+")
RE_BULLET_LINK = re.compile(r"^\s{0,3}[-*+]\s+\[[^\]]*\]\([^)]+\)")
RE_INDEX_ENTRY = re.compile(
    r"^\s{0,3}[-*+]\s+\[([^\]]+)\]\(\s*<?([^)>\s]+)>?"
    r"(?:\s+[\"'][^\"']*[\"'])?\s*\)(?:\s+(?:-|–|—)\s*(.*?))?\s*$"
)
RE_HEADING = re.compile(r"^\s{0,3}(#{1,6})\s+(.+?)\s*#*\s*$")


class Findings:
    def __init__(self) -> None:
        self.items: list[dict] = []

    def add(self, severity, code, path, message, line=None) -> None:
        self.items.append(
            {
                "severity": severity,
                "code": code,
                "file": path,
                "line": line,
                "message": message,
            }
        )

    def error(self, *a, **k):
        self.add("error", *a, **k)

    def warn(self, *a, **k):
        self.add("warn", *a, **k)

    def info(self, *a, **k):
        self.add("info", *a, **k)

    def count(self, severity) -> int:
        return sum(1 for i in self.items if i["severity"] == severity)


# --------------------------------------------------------------------------- helpers


def split_frontmatter(text: str):
    """Return (frontmatter_str_or_None, body, body_start_line).

    Frontmatter must open with `---` on the file's first line and close with a
    `---` line, per §4.
    """
    lines = text.split("\n")
    if not lines or lines[0].strip() != "---":
        return None, text, 1
    for i in range(1, len(lines)):
        if lines[i].strip() in ("---", "..."):
            return "\n".join(lines[1:i]), "\n".join(lines[i + 1 :]), i + 2
    return None, text, 1


def strip_code(text: str) -> str:
    """Blank out fenced blocks and inline code so link scanning sees only prose."""
    out, fence = [], None
    for line in text.split("\n"):
        m = RE_FENCE.match(line)
        if fence is None and m:
            fence = m.group(1)[0] * 3
            out.append("")
            continue
        if fence is not None:
            if m and m.group(1)[0] * 3 == fence:
                fence = None
            out.append("")
            continue
        out.append(re.sub(r"`[^`]*`", "", line))
    return "\n".join(out)


def line_of(text: str, offset: int) -> int:
    return text.count("\n", 0, offset) + 1


def is_date(v) -> bool:
    if isinstance(v, dt.date) and not isinstance(v, dt.datetime):
        return True
    return isinstance(v, str) and bool(RE_DATE.match(v.strip()))


def is_datetime(v) -> bool:
    if isinstance(v, dt.datetime):
        return True
    return isinstance(v, str) and bool(RE_DATETIME.match(v.strip()))


def as_date(v):
    if isinstance(v, dt.datetime):
        return v.date()
    if isinstance(v, dt.date):
        return v
    if isinstance(v, str) and RE_DATE.match(v.strip()):
        try:
            return dt.date.fromisoformat(v.strip())
        except ValueError:
            return None
    return None


def actor_kind(v):
    """Return 'human', 'process', 'agent', 'prefixed', or None."""
    if not isinstance(v, str):
        return None
    v = v.strip()
    if RE_ACTOR_HUMAN.match(v):
        return "human"
    if RE_ACTOR_PROCESS.match(v):
        return "process"
    if RE_ACTOR_AGENT.match(v):
        return "agent"
    if RE_ACTOR_PREFIXED.match(v):
        return "prefixed"
    return None


def normalize_type(t: str) -> str:
    return re.sub(r"[^a-z0-9]", "", t.lower())


def is_external(target: str) -> bool:
    return bool(RE_URL_SCHEME.match(target)) and not target.startswith("/")


def looks_like_file_path(value: str) -> bool:
    """True when a path-valued string clearly names a file rather than a scope
    descriptor (§5.1) or an opaque external identifier."""
    v = value.strip()
    if not v or " " in v:
        return False
    if v.startswith(("/", "./", "../")):
        return True
    return bool(re.search(r"\.[A-Za-z0-9]{1,8}$", v))


def resolve(target: str, file_path: Path, root: Path):
    """Resolve an in-bundle path. Returns a Path, or None if not in-bundle."""
    target = target.split("#", 1)[0].split("?", 1)[0]
    if not target or is_external(target) or target.startswith("#"):
        return None
    if target.startswith("/"):
        return root / target.lstrip("/")
    return (file_path.parent / target).resolve()


def normalize_space(value) -> str:
    return re.sub(r"\s+", " ", str(value)).strip()


def normalize_label(value) -> str:
    """Normalize light Markdown styling when comparing display titles."""
    plain = re.sub(r"[`*_~]", "", str(value))
    return normalize_space(plain).casefold()


def parse_mapping_frontmatter(text: str):
    """Return frontmatter as a mapping when it parses, otherwise None.

    Validation reports malformed frontmatter elsewhere. Discovery checks use
    only metadata they can read reliably and avoid duplicating those findings.
    """
    fm_text, _, _ = split_frontmatter(text)
    if fm_text is None:
        return None
    try:
        value = yaml.safe_load(fm_text)
    except yaml.YAMLError:
        return None
    return value if isinstance(value, dict) else None


def parse_index_entries(body: str):
    """Return linked list entries, joining indented description continuations."""
    lines = body.split("\n")
    entries = []
    i = 0
    while i < len(lines):
        match = RE_INDEX_ENTRY.match(lines[i])
        if not match:
            i += 1
            continue
        description = (match.group(3) or "").strip()
        j = i + 1
        continuations = []
        while j < len(lines):
            line = lines[j]
            if not line.strip():
                break
            if RE_BULLET.match(line) or RE_HEADING.match(line) or not re.match(r"^\s{2,}\S", line):
                break
            continuations.append(line.strip())
            j += 1
        if continuations:
            description = normalize_space(" ".join([description, *continuations]))
        entries.append(
            {
                "title": match.group(1).strip(),
                "target": match.group(2).strip(),
                "description": description,
                "line": i + 1,
            }
        )
        i = max(j, i + 1)
    return entries


def has_index_introduction(body: str) -> bool:
    """True when prose before the first entry explains the index's scope."""
    in_comment = False
    for line in body.split("\n"):
        stripped = line.strip()
        if RE_BULLET.match(line):
            break
        if in_comment:
            if "-->" in stripped:
                in_comment = False
            continue
        if stripped.startswith("<!--"):
            in_comment = "-->" not in stripped
            continue
        if not stripped or RE_HEADING.match(line):
            continue
        return True
    return False


def resolve_discovery_target(target: str, index_path: Path, root: Path):
    """Resolve an index entry, mapping directory links to their index.md."""
    resolved = resolve(target, index_path, root)
    if resolved is None:
        return None
    target_path = target.split("#", 1)[0].split("?", 1)[0]
    if resolved.is_dir() or target_path.endswith("/"):
        resolved = resolved / "index.md"
    return resolved.resolve()


# --------------------------------------------------------------------------- checks


def check_actor(f, rel, field, value, allow_prefixed=False):
    kind = actor_kind(value)
    if kind in ("human", "process", "agent"):
        return kind
    if kind == "prefixed" and allow_prefixed:
        return kind
    f.warn(
        "actor-format",
        rel,
        f"{field} is {value!r}; expected <producer>/<version>, human:<id>, or process:<id>",
    )
    return kind


def check_verified(f, rel, fm) -> str:
    """Validate `verified` and return the derived trust tier."""
    if "verified" not in fm:
        return "unverified"
    raw = fm["verified"]
    entries = [raw] if isinstance(raw, dict) else raw
    if not isinstance(entries, list):
        f.warn("verified-shape", rel, "`verified` must be a mapping or a list of mappings")
        return "unverified"

    tier = "machine-confirmed"
    for i, entry in enumerate(entries):
        where = f"verified[{i}]"
        if not isinstance(entry, dict):
            f.warn("verified-shape", rel, f"{where} is not a mapping")
            continue
        if "by" not in entry:
            f.warn("verified-by-missing", rel, f"{where} has no `by` actor")
        elif check_actor(f, rel, f"{where}.by", entry["by"]) == "human":
            tier = "human-reviewed"
        if "at" not in entry:
            f.warn("verified-at-missing", rel, f"{where} has no `at` timestamp")
        elif not is_datetime(entry["at"]):
            f.warn("datetime-format", rel, f"{where}.at is not an ISO 8601 datetime: {entry['at']!r}")
    return tier


def check_sources(f, rel, fm) -> set[str]:
    """Validate `sources` / `usage_window`; return the set of declared source ids."""
    ids: set[str] = set()
    if "sources" not in fm:
        return ids
    sources = fm["sources"]
    if not isinstance(sources, list):
        f.warn("sources-shape", rel, "`sources` must be a list of mappings")
        return ids

    has_usage_count = False
    for i, src in enumerate(sources):
        where = f"sources[{i}]"
        if not isinstance(src, dict):
            f.warn("sources-shape", rel, f"{where} is not a mapping")
            continue
        if not str(src.get("resource", "")).strip():
            f.error("source-resource-missing", rel, f"{where} has no `resource` (required per entry)")
        sid = src.get("id")
        if sid is not None:
            if str(sid) in ids:
                f.warn("source-id-duplicate", rel, f"duplicate sources id {str(sid)!r}")
            ids.add(str(sid))
        if "author" in src:
            check_actor(f, rel, f"{where}.author", src["author"], allow_prefixed=True)
        if "last_modified" in src and not is_date(src["last_modified"]):
            f.warn("date-format", rel, f"{where}.last_modified is not YYYY-MM-DD: {src['last_modified']!r}")
        if "usage_count" in src:
            has_usage_count = True
            if not isinstance(src["usage_count"], int) or isinstance(src["usage_count"], bool):
                f.warn("usage-count-type", rel, f"{where}.usage_count is not an integer")
            if "usage_window" not in src and "usage_window" not in fm:
                f.info("usage-window-missing", rel, f"{where}.usage_count has no framing `usage_window`")

    window = fm.get("usage_window")
    if window is not None:
        if not isinstance(window, dict):
            f.warn("usage-window-shape", rel, "`usage_window` must be a mapping with `from` and `to`")
        else:
            for key in ("from", "to"):
                if key not in window:
                    f.warn("usage-window-incomplete", rel, f"`usage_window` has no `{key}`")
                elif not is_date(window[key]):
                    f.warn("date-format", rel, f"usage_window.{key} is not YYYY-MM-DD: {window[key]!r}")
        if not has_usage_count:
            f.info("usage-window-unused", rel, "`usage_window` present but no source declares `usage_count`")
    return ids


def check_attested_computation(f, rel, fm, body, path, root):
    if not str(fm.get("runtime", "")).strip():
        f.error("runtime-missing", rel, "`runtime` is REQUIRED for type: Attested Computation")

    params = fm.get("parameters")
    if params is not None:
        if not isinstance(params, list):
            f.warn("parameters-shape", rel, "`parameters` must be a list of {name, type, required}")
        else:
            for i, p in enumerate(params):
                if not isinstance(p, dict):
                    f.warn("parameters-shape", rel, f"parameters[{i}] is not a mapping")
                    continue
                for key in ("name", "type", "required"):
                    if key not in p:
                        f.info("parameter-incomplete", rel, f"parameters[{i}] has no `{key}`")

    has_path = bool(str(fm.get("computation", "")).strip())
    has_fence = has_computation_block(body)
    if has_path and has_fence:
        f.warn(
            "computation-duplicated",
            rel,
            "`computation` path is set AND a `# Computation` code block is present; use exactly one",
        )
    elif not has_path and not has_fence:
        f.warn(
            "computation-missing",
            rel,
            "no `computation` path and no code block under `# Computation`",
        )

    for field, value in (
        ("executor", fm.get("executor")),
        ("attester", fm.get("attester")),
    ):
        if value is None:
            f.warn("attestation-incomplete", rel, f"no `{field}`; the computation cannot be run or checked")
            continue
        if not isinstance(value, dict):
            f.warn("attestation-shape", rel, f"`{field}` must be a mapping")
            continue
        if not str(value.get("resource", "")).strip():
            f.warn("attestation-incomplete", rel, f"`{field}.resource` is missing")
    executor = fm.get("executor")
    if isinstance(executor, dict):
        receipt = executor.get("receipt")
        if receipt is None:
            f.warn("attestation-incomplete", rel, "`executor.receipt` is missing; the attester has nothing to inspect")
        elif not isinstance(receipt, list) or not receipt:
            f.warn("attestation-shape", rel, "`executor.receipt` must be a non-empty list of field names")


def has_computation_block(body: str) -> bool:
    """True if a fenced or indented code block sits under a `# Computation` heading."""
    lines = body.split("\n")
    start = None
    for i, line in enumerate(lines):
        if re.match(r"^\s{0,3}#{1,6}\s+Computation\s*$", line, re.IGNORECASE):
            start = i + 1
            break
    if start is None:
        return False
    for line in lines[start:]:
        if re.match(r"^\s{0,3}#{1,6}\s+\S", line):
            break
        if RE_FENCE.match(line):
            return True
        if line.startswith("    ") and line.strip():
            return True
    return False


def check_paths(f, rel, fm, path, root):
    """Warn on in-bundle path-valued fields that do not resolve."""
    candidates = [("computation", fm.get("computation"))]
    for field in ("executor", "attester"):
        value = fm.get(field)
        if isinstance(value, dict):
            candidates.append((f"{field}.resource", value.get("resource")))

    for i, src in enumerate(fm.get("sources") or []):
        if isinstance(src, dict):
            res = src.get("resource")
            # A sources[].resource may be a scope descriptor or an opaque external
            # identifier rather than a path (§5.1), so only check ones that clearly
            # name a file: rooted/relative prefixes, or a trailing file extension.
            if isinstance(res, str) and not is_external(res) and looks_like_file_path(res):
                candidates.append((f"sources[{i}].resource", res))

    for field, value in candidates:
        if not isinstance(value, str) or not value.strip() or is_external(value):
            continue
        target = resolve(value, path, root)
        if target is not None and not target.exists():
            f.warn("path-unresolved", rel, f"`{field}` points at a missing file: {value}")


def check_links(f, rel, body, body_start, path, root):
    prose = strip_code(body)
    for m in RE_LINK.finditer(prose):
        if m.group(1) == "!":  # image
            continue
        target = m.group(3)
        if target.startswith("#") or is_external(target):
            continue
        resolved = resolve(target, path, root)
        if resolved is None:
            continue
        if not resolved.exists():
            f.warn(
                "link-broken",
                rel,
                f"link target does not exist: {target} (advisory — §11 permits broken links)",
                line=body_start + line_of(prose, m.start()) - 1,
            )


def check_footnotes(f, rel, body, source_ids):
    prose = strip_code(body)
    defined = {m.group(1) for m in RE_FOOTNOTE_DEF.finditer(prose)}
    referenced = {m.group(1) for m in RE_FOOTNOTE_REF.finditer(prose)}

    for label in sorted(referenced - defined):
        f.warn("footnote-undefined", rel, f"footnote [^{label}] is referenced but never defined")
    for label in sorted(referenced & defined):
        if source_ids and label not in source_ids:
            f.warn(
                "footnote-unmatched",
                rel,
                f"footnote [^{label}] has no matching sources[].id; attribution will not resolve",
            )
    for sid in sorted(source_ids - referenced):
        f.info("source-uncited", rel, f"sources id {sid!r} is declared but never cited in the body")


def check_index(f, rel, path, root, text, is_root):
    fm_text, body, _ = split_frontmatter(text)
    if fm_text is not None:
        if not is_root:
            f.error(
                "index-frontmatter",
                rel,
                "only the bundle-root index.md may carry frontmatter (§8)",
            )
        else:
            try:
                fm = yaml.safe_load(fm_text) or {}
            except yaml.YAMLError as e:
                f.error("frontmatter-parse", rel, f"unparseable YAML frontmatter: {first_line(e)}")
                fm = {}
            if isinstance(fm, dict):
                extra = sorted(k for k in fm if k != "okf_version")
                if extra:
                    f.error(
                        "index-frontmatter",
                        rel,
                        f"root index.md frontmatter may only contain `okf_version`; found: {', '.join(extra)}",
                    )
                version = fm.get("okf_version")
                if version is not None and str(version) != "0.2":
                    f.warn("okf-version", rel, f"bundle declares okf_version {version!r}; this skill targets 0.2")
    elif is_root:
        f.info("okf-version-missing", rel, "root index.md declares no `okf_version: \"0.2\"`")

    seen_heading = False
    has_entry = False
    for n, line in enumerate(body.split("\n"), start=1):
        if re.match(r"^\s{0,3}#{1,6}\s+\S", line):
            seen_heading = True
            continue
        if RE_BULLET.match(line):
            has_entry = True
            if not seen_heading:
                f.warn("index-structure", rel, "entry appears before any section heading (§8)", line=n)
            if not RE_BULLET_LINK.match(line):
                f.warn("index-entry", rel, "entry is not a `* [Title](url)` link", line=n)
            elif " - " not in line:
                f.info("index-entry", rel, "entry has no ` - description` suffix", line=n)
    if not has_entry and body.strip():
        f.info("index-empty", rel, "index.md lists no entries")


def audit_discovery(f, root: Path, documents: dict[Path, str]):
    """Check progressive-discovery quality without changing OKF conformance."""
    indexes = {path for path in documents if path.name == "index.md"}
    concepts = {path for path in documents if path.name not in RESERVED}
    root_index = (root / "index.md").resolve()

    if root_index not in indexes:
        f.warn(
            "discovery-root-missing",
            "index.md",
            "no bundle-root index.md; OKF permits this, but the bundle has no authored discovery root",
        )
        return

    edges: dict[Path, set[Path]] = {path: set() for path in indexes}
    metadata = {path: parse_mapping_frontmatter(documents[path]) for path in concepts}

    for index_path in sorted(indexes):
        rel = index_path.relative_to(root).as_posix()
        _, body, body_start = split_frontmatter(documents[index_path])
        if not re.search(r"^\s{0,3}#\s+\S", body, re.MULTILINE):
            f.info("index-title-missing", rel, "index has no level-one title heading")
        if not has_index_introduction(body):
            f.info(
                "index-introduction-missing",
                rel,
                "index has no introductory prose stating its scope or grouping principle",
            )

        for entry in parse_index_entries(body):
            target = resolve_discovery_target(entry["target"], index_path, root)
            if target is None:
                continue
            try:
                target.relative_to(root)
            except ValueError:
                continue

            if target in indexes or target in concepts:
                edges[index_path].add(target)
            elif entry["target"].split("#", 1)[0].split("?", 1)[0].endswith("/"):
                f.info(
                    "index-directory-missing",
                    rel,
                    f"directory entry {entry['target']!r} has no index.md to continue authored discovery",
                    line=body_start + entry["line"] - 1,
                )
                continue

            if target not in concepts:
                continue
            fm = metadata.get(target)
            if not fm:
                continue
            title = fm.get("title")
            if isinstance(title, str) and title.strip() and normalize_label(entry["title"]) != normalize_label(title):
                f.warn(
                    "index-title-mismatch",
                    rel,
                    f"entry title {entry['title']!r} does not match {target.relative_to(root).as_posix()} title {title!r}",
                    line=body_start + entry["line"] - 1,
                )
            description = fm.get("description")
            if (
                isinstance(description, str)
                and description.strip()
                and entry["description"]
                and normalize_space(entry["description"]) != normalize_space(description)
            ):
                f.warn(
                    "index-description-mismatch",
                    rel,
                    f"entry description does not match {target.relative_to(root).as_posix()} frontmatter",
                    line=body_start + entry["line"] - 1,
                )

    reached_indexes: set[Path] = set()
    reached_concepts: set[Path] = set()
    pending = [root_index]
    while pending:
        index_path = pending.pop()
        if index_path in reached_indexes:
            continue
        reached_indexes.add(index_path)
        for target in edges.get(index_path, set()):
            if target in indexes:
                pending.append(target)
            elif target in concepts:
                reached_concepts.add(target)

    for concept in sorted(concepts - reached_concepts):
        rel = concept.relative_to(root).as_posix()
        f.warn(
            "discovery-unreachable",
            rel,
            "concept is not reachable from the bundle-root index through index entries",
        )


def check_log(f, rel, text):
    fm_text, body, _ = split_frontmatter(text)
    if fm_text is not None:
        f.warn("log-frontmatter", rel, "log.md is not specified to carry frontmatter (§9)")

    dates, seen_date = [], False
    for n, line in enumerate(body.split("\n"), start=1):
        m = re.match(r"^\s{0,3}##\s+(.*?)\s*$", line)
        if m:
            label = m.group(1)
            parsed = as_date(label) if RE_DATE.match(label) else None
            if parsed is None:
                f.error("log-date", rel, f"date heading must be ISO YYYY-MM-DD, got {label!r} (§9)", line=n)
            else:
                dates.append(parsed)
                seen_date = True
            continue
        if RE_BULLET.match(line) and not seen_date:
            f.warn("log-structure", rel, "entry appears before any date heading (§9)", line=n)

    if dates and dates != sorted(dates, reverse=True):
        f.warn("log-order", rel, "date headings are not newest-first (§9)")


def first_line(exc) -> str:
    return str(exc).split("\n")[0]


# --------------------------------------------------------------------------- concept


def check_concept(f, rel, path, root, text, today, stats):
    fm_text, body, body_start = split_frontmatter(text)
    if fm_text is None:
        f.error("frontmatter-missing", rel, "no YAML frontmatter block at the start of the file (§4.1)")
        return
    try:
        fm = yaml.safe_load(fm_text)
    except yaml.YAMLError as e:
        f.error("frontmatter-parse", rel, f"unparseable YAML frontmatter: {first_line(e)}")
        return
    if fm is None:
        f.error("type-missing", rel, "frontmatter is empty; `type` is required (§11)")
        return
    if not isinstance(fm, dict):
        f.error("frontmatter-shape", rel, "frontmatter must be a YAML mapping")
        return

    ctype = fm.get("type")
    if ctype is None:
        f.error("type-missing", rel, "frontmatter has no `type` (§11)")
    elif not isinstance(ctype, str) or not ctype.strip():
        f.error("type-empty", rel, f"`type` must be a non-empty string, got {ctype!r} (§11)")
    else:
        stats["types"].setdefault(ctype.strip(), []).append(rel)

    for field in ("title", "description"):
        if not str(fm.get(field, "")).strip():
            f.info("recommended-field", rel, f"no `{field}` (recommended, §4.1)")
    if "tags" in fm and not isinstance(fm["tags"], list):
        f.warn("tags-shape", rel, "`tags` must be a YAML list")

    status = fm.get("status")
    if status is not None and (not isinstance(status, str) or status not in STATUS_VALUES):
        f.warn("status-value", rel, f"`status` must be draft|stable|deprecated, got {status!r} (§5.4)")
    stats["status"][status if status in STATUS_VALUES else "stable"] = (
        stats["status"].get(status if status in STATUS_VALUES else "stable", 0) + 1
    )

    if "stale_after" in fm:
        if not is_date(fm["stale_after"]):
            f.warn("date-format", rel, f"`stale_after` must be YYYY-MM-DD, got {fm['stale_after']!r}")
        else:
            when = as_date(fm["stale_after"])
            if when and today >= when:
                stats["stale"] += 1
                f.warn("stale", rel, f"content is stale: today >= stale_after ({when.isoformat()})")

    generated = fm.get("generated")
    if generated is not None:
        if not isinstance(generated, dict):
            f.warn("generated-shape", rel, "`generated` must be a mapping with `by` and `at`")
        else:
            if "by" not in generated:
                f.error("generated-by-missing", rel, "`by` is REQUIRED within `generated` (§5.2)")
            else:
                check_actor(f, rel, "generated.by", generated["by"])
            if "at" not in generated:
                f.info("generated-at-missing", rel, "`generated` has no `at` timestamp")
            elif not is_datetime(generated["at"]):
                f.warn("datetime-format", rel, f"generated.at is not an ISO 8601 datetime: {generated['at']!r}")

    if "timestamp" in fm and generated is None:
        f.warn("legacy-timestamp", rel, "legacy v0.1 `timestamp`; migrate to `generated: { by, at }` (§13.1)")
    if re.search(r"^\s{0,3}#{1,6}\s+Citations\s*$", body, re.MULTILINE | re.IGNORECASE) and "sources" not in fm:
        f.warn("legacy-citations", rel, "legacy v0.1 `# Citations` body list; migrate to `sources` (§13.1)")

    tier = check_verified(f, rel, fm)
    stats["tiers"][tier] = stats["tiers"].get(tier, 0) + 1

    source_ids = check_sources(f, rel, fm)

    if isinstance(ctype, str) and normalize_type(ctype) == "attestedcomputation":
        check_attested_computation(f, rel, fm, body, path, root)

    check_paths(f, rel, fm, path, root)
    check_links(f, rel, body, body_start, path, root)
    check_footnotes(f, rel, body, source_ids)


# --------------------------------------------------------------------------- driver


def validate(root: Path, today: dt.date):
    f = Findings()
    stats = {"types": {}, "tiers": {}, "status": {}, "stale": 0, "concepts": 0, "reserved": 0}
    documents: dict[Path, str] = {}

    files = sorted(p for p in root.rglob("*.md") if p.is_file() and ".git" not in p.parts)
    for path in files:
        rel = path.relative_to(root).as_posix()
        try:
            text = path.read_text(encoding="utf-8")
        except UnicodeDecodeError:
            f.error("encoding", rel, "file is not valid UTF-8 (§4)")
            continue
        documents[path.resolve()] = text

        if path.name in RESERVED:
            stats["reserved"] += 1
            if path.name == "index.md":
                check_index(f, rel, path, root, text, is_root=(path.parent == root))
            else:
                check_log(f, rel, text)
            continue

        stats["concepts"] += 1
        check_concept(f, rel, path, root, text, today, stats)

    audit_discovery(f, root, documents)

    # Near-duplicate type values across the bundle (§4.1 leaves `type` uncontrolled).
    groups: dict[str, dict] = {}
    for value, paths in stats["types"].items():
        groups.setdefault(normalize_type(value), {})[value] = paths
    for variants in groups.values():
        if len(variants) > 1:
            listed = ", ".join(repr(v) for v in sorted(variants))
            for value, paths in variants.items():
                for rel in paths:
                    f.warn("type-variant", rel, f"`type` {value!r} collides with sibling spellings: {listed}")

    return f, stats


SEV_ORDER = {"error": 0, "warn": 1, "info": 2}
SEV_LABEL = {"error": "ERROR", "warn": "warn ", "info": "info "}


def render_text(f: Findings, stats, root: Path, show_info: bool, show_summary: bool) -> str:
    out = []
    items = [i for i in f.items if show_info or i["severity"] != "info"]
    items.sort(key=lambda i: (SEV_ORDER[i["severity"]], i["file"], i["line"] or 0, i["code"]))

    current = None
    for item in items:
        if item["file"] != current:
            current = item["file"]
            out.append(f"\n{current}")
        loc = f":{item['line']}" if item["line"] else ""
        out.append(f"  {SEV_LABEL[item['severity']]} [{item['code']}]{loc} {item['message']}")

    if show_summary:
        out.append("\nSummary")
        out.append(f"  bundle          {root}")
        out.append(f"  concepts        {stats['concepts']}  (+{stats['reserved']} reserved files)")
        if stats["types"]:
            out.append("  types")
            for value in sorted(stats["types"], key=lambda v: (-len(stats["types"][v]), v)):
                out.append(f"    {len(stats['types'][value]):4d}  {value}")
        if stats["tiers"]:
            tiers = "  ".join(
                f"{k}={stats['tiers'][k]}"
                for k in ("unverified", "machine-confirmed", "human-reviewed")
                if k in stats["tiers"]
            )
            out.append(f"  trust tiers     {tiers}")
        if stats["status"]:
            out.append("  status          " + "  ".join(f"{k}={v}" for k, v in sorted(stats["status"].items())))
        out.append(f"  stale           {stats['stale']}")

    errors, warns, infos = f.count("error"), f.count("warn"), f.count("info")
    tail = f"\n{errors} error(s), {warns} warning(s), {infos} info"
    if not show_info and infos:
        tail += " (hidden; pass --info)"
    out.append(tail)
    if errors == 0:
        out.append("Conformant with OKF v0.2." if warns == 0 else "Conformant with OKF v0.2; see warnings above.")
    return "\n".join(out).lstrip("\n")


def main() -> int:
    ap = argparse.ArgumentParser(description="Validate an OKF v0.2 knowledge bundle.")
    ap.add_argument("bundle", help="path to the bundle root")
    ap.add_argument("--json", action="store_true", help="emit machine-readable JSON")
    ap.add_argument("--info", action="store_true", help="include info-level findings")
    ap.add_argument("--summary", action="store_true", help="print type inventory, trust tiers, staleness")
    ap.add_argument("--strict", action="store_true", help="exit non-zero on warnings too")
    ap.add_argument("--today", help="override today's date (YYYY-MM-DD) for staleness checks")
    args = ap.parse_args()

    root = Path(args.bundle).resolve()
    if not root.is_dir():
        sys.stderr.write(f"not a directory: {args.bundle}\n")
        return 2

    if args.today:
        try:
            today = dt.date.fromisoformat(args.today)
        except ValueError:
            sys.stderr.write(f"--today must be YYYY-MM-DD, got {args.today!r}\n")
            return 2
    else:
        today = dt.date.today()

    f, stats = validate(root, today)

    if args.json:
        items = [i for i in f.items if args.info or i["severity"] != "info"]
        print(
            json.dumps(
                {
                    "bundle": str(root),
                    "okf_version": "0.2",
                    "findings": items,
                    "counts": {s: f.count(s) for s in ("error", "warn", "info")},
                    "summary": {
                        "concepts": stats["concepts"],
                        "reserved_files": stats["reserved"],
                        "types": {k: len(v) for k, v in sorted(stats["types"].items())},
                        "trust_tiers": stats["tiers"],
                        "status": stats["status"],
                        "stale": stats["stale"],
                    },
                },
                indent=2,
                default=str,
            )
        )
    else:
        print(render_text(f, stats, root, args.info, args.summary))

    if f.count("error"):
        return 1
    if args.strict and f.count("warn"):
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
