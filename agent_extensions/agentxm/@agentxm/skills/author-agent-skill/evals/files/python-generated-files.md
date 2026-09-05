# Commissioned Python skill

Create the workspace-authored AXM package `skills/build-report` for a recurring
local report-building workflow.

The skill must:

- bundle `src/scripts/build_report.py` and a sibling imported Python module;
- accept caller-selected input and output paths under the caller's working
  directory;
- keep versioned evaluation source under `evals/`;
- remain safe to copy as a complete extension into a consuming Git repository;
  that repository has no Python ignore rules; and
- remain clean when AXM packages or projects it.

Ordinary Python imports can create `__pycache__` and `.pyc` files beside the
bundled modules. The complete extension package, including files outside
`src/`, is the independent distribution boundary. Do not install, enable, or
publish the package.
