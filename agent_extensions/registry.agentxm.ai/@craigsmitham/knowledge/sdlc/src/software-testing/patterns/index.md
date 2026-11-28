# Testing pattern collection

Choose the question your team faces. A readable rule can run as a simple
function test. If detecting a violation requires a shared service, you also
have a decision about boundaries and may need someone to operate the test.

## Does an agreed rule need a check its owners can read?

- [Executable specifications](executable-specifications.md) — When intended behavior must be shared with its owners and checked continuously, express accepted rules in readable specifications bound to executable checks while keeping authority separate from verification.

## What must run for this failure to show up?

- [Evidence-matched test world](evidence-matched-test-world.md) — When choosing which components to run and which to substitute, keep the smallest setup in which a failure that matters would still be visible.

## Who can recover the test or diagnose a failed run?

This candidate combines documented practices for ownership and isolation.

- [Owned test worlds](owned-test-world.md) — When a test leaves state behind or a failure crosses team boundaries, give someone responsibility for its setup, recovery, and diagnosis.
