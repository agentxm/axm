"""Round-trip only the profile-owned relationships block."""

from __future__ import annotations

from pathlib import Path

import yaml


def render_relationships(relationships: dict[str, list[str]]) -> str:
    normalized = {
        role: sorted(targets)
        for role, targets in sorted(relationships.items())
        if targets
    }
    if not normalized:
        return ""
    lines = ["relationships:\n"]
    for role, targets in normalized.items():
        lines.append(f"  {role}:\n")
        for target in targets:
            scalar = yaml.safe_dump(
                target,
                allow_unicode=True,
                default_flow_style=True,
            ).splitlines()[0]
            lines.append(f"    - {scalar}\n")
    return "".join(lines)


def replace_relationships(path: Path, relationships: dict[str, list[str]]) -> bool:
    text = path.read_text(encoding="utf-8")
    if not text.startswith("---\n"):
        raise ValueError(f"{path}: frontmatter opening delimiter is missing")
    marker = text.find("\n---\n", 4)
    if marker < 0:
        raise ValueError(f"{path}: frontmatter closing delimiter is missing")

    frontmatter = text[4:marker]
    body = text[marker + 1 :]
    lines = frontmatter.splitlines(keepends=True)
    start: int | None = None
    end: int | None = None
    for index, line in enumerate(lines):
        if line.rstrip("\r\n") == "relationships:":
            start = index
            end = len(lines)
            for candidate in range(index + 1, len(lines)):
                stripped = lines[candidate].rstrip("\r\n")
                if stripped and not stripped[0].isspace():
                    end = candidate
                    break
            break

    rendered = render_relationships(relationships)
    replacement = rendered.splitlines(keepends=True)
    if start is not None and end is not None:
        if start and not lines[start - 1].endswith(("\n", "\r")):
            lines[start - 1] += "\n"
        new_lines = lines[:start] + replacement + lines[end:]
    elif replacement:
        insertion = len(lines)
        if insertion and not lines[insertion - 1].endswith(("\n", "\r")):
            lines[insertion - 1] += "\n"
        new_lines = lines[:insertion] + replacement + lines[insertion:]
    else:
        return False

    new_frontmatter = "".join(new_lines).rstrip("\r\n")
    updated = f"---\n{new_frontmatter}\n{body}"
    if updated == text:
        return False
    path.write_text(updated, encoding="utf-8")
    return True
