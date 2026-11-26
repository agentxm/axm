# Benchmark evidence retention

Evidence for a merged change lives in Git history, not in the tree. Once the
change it supports merges, delete its evidence directory and link to it at a
pinned commit when a document still needs to cite it.

Keep a directory here only while a live gate or current record depends on it.
The [prepared-input reuse ledger](prepared-input-reuse/README.md) stays because
its counts describe the current command and fixture inventory that the checked
[prepared-input allocation](../../apps/cli/src/test-support/prepared-input-allocation.json)
maps. Delete it once that inventory moves on.
