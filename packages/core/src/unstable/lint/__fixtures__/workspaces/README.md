# Workspace fixture cases

Each subdirectory is a single fixture case containing:

- `case.json` — describes the seed `WorkspaceState` (settings, lockfile,
  existing paths, listings, declared+detected agents) and the expected
  findings, optionally plus `expectedAfterFix` findings for autofixing
  cases where the post-apply invariant is non-trivial.

Fixture `state` structure (JSON-compatible mirror of
`WorkspaceState`):

```jsonc
{
  "description": "",
  "state": {
    "settings": { "agents": ["claude-code"], "skills": {} },
    "lockfile": { "lockfileVersion": 1, "skills": {} },
    "existingPaths": [".axm", ".axm/settings.json"],
    "writablePaths": [],
    "listings": { ".claude/skills": [] },
    "detectedProjectAgents": []
  },
  "scope": "project",
  "expectedFindings": [
    { "ruleId": "workspace/skills-lockfile-aligned", "severity": "error" }
  ],
  "expectedAfterFix": []
}
```

`expectedAfterFix` is optional — when omitted, the harness checks only
the pre-apply findings. When present, the harness applies the rule's
autofix and asserts the post-apply findings list matches.
