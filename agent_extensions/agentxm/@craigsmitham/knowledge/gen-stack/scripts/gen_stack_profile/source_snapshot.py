"""Materialize stable repository views for Gen Stack inspection."""

from __future__ import annotations

import io
import subprocess
import tarfile
import tempfile
from contextlib import AbstractContextManager
from pathlib import Path, PurePosixPath

from .inspection import InspectionFailure


MAX_ARCHIVE_BYTES = 512 * 1024 * 1024
MAX_ARCHIVE_MEMBERS = 100_000


def _git(repository_root: Path, *arguments: str) -> bytes:
    try:
        result = subprocess.run(
            ["git", "-C", str(repository_root), *arguments],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            check=False,
            timeout=60,
        )
    except FileNotFoundError as exc:
        raise InspectionFailure(
            "git-unavailable", "Git is required for the selected repository view."
        ) from exc
    except subprocess.TimeoutExpired as exc:
        raise InspectionFailure(
            "git-timeout", "Git did not produce the selected repository view within 60 seconds."
        ) from exc
    if result.returncode != 0:
        raise InspectionFailure(
            "git-snapshot",
            "Git could not produce the selected repository view. Check the repository state and requested revision.",
        )
    return result.stdout


def _repository_tree(repository_root: Path) -> Path:
    root = repository_root.resolve()
    top = _git(root, "rev-parse", "--show-toplevel").decode().strip()
    if Path(top).resolve() != root:
        raise InspectionFailure(
            "git-repository-root",
            "Git-backed views require --repository-root to name the Git repository root exactly.",
        )
    return root


def _safe_members(archive: tarfile.TarFile) -> list[tarfile.TarInfo]:
    members = archive.getmembers()
    if len(members) > MAX_ARCHIVE_MEMBERS:
        raise InspectionFailure(
            "git-archive-limit",
            f"The Git tree contains more than {MAX_ARCHIVE_MEMBERS} archive members.",
        )
    total = 0
    for member in members:
        relative = PurePosixPath(member.name)
        if relative.is_absolute() or ".." in relative.parts:
            raise InspectionFailure("git-archive-path", "Git produced an unsafe archive path.")
        if not (member.isdir() or member.isfile() or member.issym() or member.islnk()):
            raise InspectionFailure(
                "git-archive-member",
                f"Git produced an unsupported archive member {member.name!r}.",
            )
        total += member.size
        if total > MAX_ARCHIVE_BYTES:
            raise InspectionFailure(
                "git-archive-limit",
                f"The Git tree exceeds the extraction limit of {MAX_ARCHIVE_BYTES} bytes.",
            )
    return members


def _extract_tree(repository_root: Path, tree: str, target: Path) -> None:
    archive_bytes = _git(repository_root, "archive", "--format=tar", tree)
    if len(archive_bytes) > MAX_ARCHIVE_BYTES:
        raise InspectionFailure(
            "git-archive-limit",
            f"The Git archive exceeds the extraction limit of {MAX_ARCHIVE_BYTES} bytes.",
        )
    try:
        with tarfile.open(fileobj=io.BytesIO(archive_bytes), mode="r:") as archive:
            members = _safe_members(archive)
            archive.extractall(target, members=members, filter="data")
    except (tarfile.TarError, OSError) as exc:
        raise InspectionFailure(
            "git-archive-read", f"Unable to materialize the selected Git tree: {exc}"
        ) from exc


class RepositoryView(AbstractContextManager["RepositoryView"]):
    """A working tree or temporary exact Git tree used by one operation."""

    def __init__(
        self,
        repository_root: Path,
        *,
        view: str = "working-tree",
        revision: str | None = None,
    ) -> None:
        self.requested_root = repository_root
        self.view = view
        self.revision = revision
        self.repository_root = repository_root.resolve()
        self.input_identity: dict[str, object] = {"kind": "working-tree"}
        self._temporary: tempfile.TemporaryDirectory[str] | None = None

    def __enter__(self) -> "RepositoryView":
        if self.revision is not None:
            root = _repository_tree(self.requested_root)
            tree = _git(root, "rev-parse", "--verify", f"{self.revision}^{{tree}}").decode().strip()
            self.input_identity = {
                "kind": "git-tree",
                "tree": tree,
                "revision": self.revision,
            }
        elif self.view == "git-index":
            root = _repository_tree(self.requested_root)
            if _git(root, "ls-files", "--unmerged").strip():
                raise InspectionFailure(
                    "git-index-unmerged",
                    "The Git index contains unmerged entries and cannot form one exact tree.",
                )
            tree = _git(root, "write-tree").decode().strip()
            self.input_identity = {"kind": "git-index", "tree": tree}
        elif self.view == "working-tree":
            if self.revision is not None:
                raise AssertionError("revision handled above")
            self.repository_root = self.requested_root.resolve()
            return self
        else:
            raise InspectionFailure("invalid-view", f"Unsupported repository view {self.view!r}.")

        self._temporary = tempfile.TemporaryDirectory(prefix="gen-stack-view-")
        materialized = Path(self._temporary.name)
        _extract_tree(root, tree, materialized)
        if self.view == "git-index":
            stable_tree = _git(root, "write-tree").decode().strip()
            if stable_tree != tree:
                raise InspectionFailure(
                    "git-index-changed",
                    "The Git index changed while its tree was being materialized; retry the check.",
                )
        self.repository_root = materialized
        return self

    def __exit__(self, exc_type: object, exc: object, traceback: object) -> None:
        if self._temporary is not None:
            self._temporary.cleanup()
        return None
