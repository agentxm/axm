# Source verification at700aa5ecf

The source-only integration workflow passed on clean commit `700aa5ecf0908411a7cd2e4dbb93c0f36907b62d` against `187ebf03a2bb81c140ed135689e9af269914f516`. The final source graph completed89 tasks across20 projects, with42 input-cache hits. This package does not claim the final main-integration gate, CLI E2E execution or repeated timing.

[source-verification-700aa5ecf.tar.gz](source-verification-700aa5ecf.tar.gz) contains the original provenance, the gate log with only the absolute checkout prefix projected, and17 exact JUnit reports selected by the log. SHA-256: `5629e1f8c7e70bf301f3c66deeb6d520e06045aa471a2c18b3f020b6fb58e808`. `index.json` records every file hash, the exact command, task/cache status, skipped tests and five omitted older E2E reports. `privacy-review.json` records the content audit.

Current executed results include CLI4220 passed; workspace-kernel2914 passed/four skipped; workspace-features3558 passed/one skipped; and axm634 passed in `reports/scripts/junit.xml`. Skips remain skips. The integration-hook prerequisite reused its input cache. Log-only architecture, workspace-conventions and policy-coverage results are retained without inventing XML reports.

Extract with `tar -xzf source-verification-700aa5ecf.tar.gz -C <empty-directory>`. All19 entries were read back and checked against their indexed hashes; normalized archive metadata does not alter payload content. The log projection replaces only35 occurrences of the absolute checkout prefix; original/projected hashes and affected lines remain in the index. Synthetic paths in test names were validated against the frozen source. No whole coverage output, unrelated E2E XML, fixture homes or host process inventories are included.
