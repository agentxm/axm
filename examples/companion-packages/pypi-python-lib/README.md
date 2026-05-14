# PyPI Python TinyFlags

This example shows how a PyPI package can ship companion AXM extensions for its
users. The package is a small Python feature flag library named
`agentxm-example-tinyflags`.

The AXM extensions are published to AgentXM.ai under `@examples`. The Python
package uses the PyPI distribution name `agentxm-example-tinyflags`.

The package metadata embeds AXM recommendations directly in `pyproject.toml`:

```toml
[tool.axm]
recommendedExtensions = ["@examples/packs/pypi-python-tinyflags@^0.1.0"]
```

When this package is installed in another project, `axm discover` can read
that metadata from the installed distribution and surface the companion pack as
a package-author recommendation.

A working consumer is in `../pypi-python-app/` (the `pawmatch` CLI).

## Package

Targets Python 3.12+. Build backend is Hatchling. Tests use `pytest`. Build
output goes to `artifacts/` (gitignored) to align with the other companion
package examples.

```bash
uv sync --group test
uv run pytest
uv run python -m build --outdir artifacts
```

Without `uv`, pip 25.1+ reads the same dependency group:

```bash
pip install -e . --group test
pytest
python -m build --outdir artifacts
```

Publishing the wheel and sdist (Trusted Publishing OIDC):

```bash
# TODO: configure PyPI Trusted Publishing for agentxm-example-tinyflags,
# then run inside the publishing workflow:
# twine upload artifacts/*
```

The library lives in `src/agentxm_example_tinyflags/__init__.py` and exposes:

- `BooleanFlag(default=..., rollout=...)`
- `VariantFlag(variants=..., default=..., rollout=...)`
- `TinyFlags(definitions)` — `enabled(name, context)`, `variant(name, context)`,
  `evaluate(name, context)`

Flag dataclasses are frozen and validate inputs on construction. Bucketing is
deterministic by `user_id`, `account_id`, or `session_id` from the evaluation
context.

## Companion Extensions

The authored extension sources live under `.axm/extensions/@examples/`.

| Type     | FQN                                                     |
| -------- | ------------------------------------------------------- |
| Skill    | `@examples/skills/pypi-python-tinyflags-add-flag`       |
| Skill    | `@examples/skills/pypi-python-tinyflags-rollout-review` |
| Skill    | `@examples/skills/pypi-python-tinyflags-cleanup-flag`   |
| Subagent | `@examples/subagents/pypi-python-tinyflags-maintainer`  |
| Pack     | `@examples/packs/pypi-python-tinyflags`                 |

The pack bundles the three skills and the maintainer subagent. Each manifest
declares `pkg:pypi/agentxm-example-tinyflags@0.1.0` as its companion package.

## Scenario

A PyPI package author can use this layout as a model:

1. Implement the normal Python package.
2. Embed package-native AXM metadata under `[tool.axm]` in `pyproject.toml`.
3. Add AXM extension sources in `.axm/extensions/<owner>/`.
4. Mark the extensions as authored in `.axm/settings.json`.
5. Publish the extensions independently or as a companion pack.
