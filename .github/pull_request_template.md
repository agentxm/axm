<!--
This repository is public. Do not include private Linear or other tracker IDs,
links, titles, descriptions, or comments. Do not link private repositories or
include customer details, internal plans, credentials, or private screenshots.
-->

## Summary

<!-- Explain the public problem and solution without private context. -->

## Public context

<!-- Link a sanitized public GitHub issue when useful. -->

## Scope

- [ ] AXM-only change
- [ ] Cross-repository change with a separately coordinated dependency

<!-- For cross-repo work, describe only the public contract or released dependency. -->

## Specification impact

<!--
Paste the rendered verdict, including its "No requirement contract changes."
line when nothing changed. Specifications are `*.spec.ts` files beside the
source they specify; the verdict discovers both sides by project ownership.
-->

```
pnpm exec nx run axm:specification-verdict -- --base "$(git merge-base main HEAD)"
```

## Verification

<!-- List commands and behavioral evidence. -->

- [ ] `pnpm run ci` passes
- [ ] The specification verdict above is rendered from this branch, and every
      removed identity is explained in `specifications/disposition-ledger.json`
- [ ] User-visible behavior is verified when applicable
- [ ] Branch, commits, and PR content contain no private coordination data
