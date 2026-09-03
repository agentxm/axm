---
__default__: minor
---

# Uninstall retires a pack whose package cannot be read

- `axm packs uninstall` and `axm uninstall <fqn>` now retire a desired pack
  whose own package manifest is missing or cannot be decoded. The pack's
  `axm.json` entry and its `axm-lock.yaml` resolution are removed; no content
  is deleted, because none of it could be verified. Restoring a manifest purely
  to satisfy the graph gate is no longer necessary.
- The result reports such a removal as registration-only. The plan unit carries
  a warning naming the pack, the reason, the unreadable manifest path, what was
  left in place, and the remedy, and the pack's canonical path is reported
  unchanged rather than removed.
- Uninstall still fails closed, and changes nothing, when a pack other than the
  target is incomplete, or when the target's manifest is readable and
  disagrees with the workspace. The
  `packs/uninstall/desired-state-graph-complete` blocker keeps its identity;
  its detail now names the remedy for each blocking pack that was not selected.
