## PawMatch (PyPI Python consumer app)

`pawmatch` is a tiny Python CLI for a fictional community pet adoption center.
It is a reference _consumer_ of the `agentxm-example-tinyflags` library —
exactly the codebase the companion AXM skills and subagent in
`../python-pypi-lib/.axm/extensions/` are designed to operate on.

`pawmatch` is not packable — it exists to demonstrate consumption, not to
publish.

The app also ships its own companion AXM skill,
[`python-pypi-pawmatch-find-a-pet`](./.axm/extensions/@examples/skills/python-pypi-pawmatch-find-a-pet/src/SKILL.md),
which guides an agent through using `pawmatch` to help an end user find and
apply for an adoptable pet. See the
[parent README](../README.md#app-extension--pawmatch) for the spec.

## Run

Until `agentxm-example-tinyflags` is published to pypi.org, install it from
the sibling library directory and run from a local virtualenv:

```bash
python -m venv .venv
.venv/bin/pip install -e ../python-pypi-lib -e . pytest
.venv/bin/pawmatch browse
.venv/bin/pawmatch show pepper
.venv/bin/pawmatch match --has-kids --active
.venv/bin/pawmatch apply biscuit
.venv/bin/pawmatch fees
.venv/bin/pawmatch return-support
.venv/bin/pawmatch donate
.venv/bin/pawmatch donate brother-wolf --open
```

With `uv` you can use the `[tool.uv.sources]` table already in `pyproject.toml`
that points at the sibling library:

```bash
uv sync --group test
uv run pawmatch browse
uv run pytest
```

## Library dependency

The app consumes `agentxm-example-tinyflags` as a regular Python dependency:

```toml
[project]
dependencies = [
    "agentxm-example-tinyflags>=0.1.0",
    "typer>=0.12",
]

[tool.uv.sources]
agentxm-example-tinyflags = { path = "../python-pypi-lib", editable = true }
```

Once `agentxm-example-tinyflags` is published to pypi.org, the
`[tool.uv.sources]` override can be removed and the dependency will resolve
from the public index. The sibling `../python-pypi-lib/` is the source of
that package but is otherwise not referenced.

## Flag seams

Flag definitions live in `flags.py`. Each is wired into at least one command
so the companion skills have realistic targets:

| Flag                            | Type    | Used in  |
| ------------------------------- | ------- | -------- |
| `home-check-followup`           | bool    | `apply`  |
| `fee-breakdown-detailed`        | bool    | `fees`   |
| `long-stay-highlight`           | bool    | `browse` |
| `suggest-donate-after-adoption` | bool    | `apply`  |
| `show-charity-ratings`          | bool    | `donate` |
| `recommendation-strategy`       | variant | `match`  |
| `match-quiz-depth`              | variant | `match`  |
| `pet-card-style`                | variant | `browse` |
| `donate-focus-default`          | variant | `donate` |

Rollouts are deterministic per user (the CLI uses `getpass.getuser()` as the
`session_id`), so running the same command twice produces the same flag
values.

## Domain framing

The CLI is intentionally framed as a shelter / rescue adoption center — not a
retail pet store — following mainstream animal-welfare best practices:

- "Adopt, don't shop"
- Matching over transacting (counselor-style questionnaire, see `match`)
- Hold and meet-and-greet periods are present in the `apply` flow
- Transparent adoption fees (`fees`) that itemize spay/neuter, vaccines, microchip
- No-judgment return support (`return-support`)
- Long-stay animals highlighted in `browse`

## Donate command

`donate` shows a curated, static list of well-known, highly-rated
animal-welfare organizations with their official donation URLs. The CLI never
processes payments. Every output includes a disclaimer to verify ratings
independently before giving. See `charities.py`.
