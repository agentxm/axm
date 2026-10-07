---
observed_at: "2026-10-07T15:14:32Z"
session: "rci-r7c9"
area: "GitHub Actions cancellation"
---

# Failed CI cancellation requests did not establish cancellation

While replacing failed verification runs for PR 534, `gh run cancel` returned
HTTP 500 for runs 37642151785 and 37642183610. Direct cancellation API calls
then returned `unexpected end of JSON input`. Subsequent readback still showed
both runs in progress. The cancellation attempts and status reads were extra
work; no cancellation was assumed. Source repair and verification continued.
