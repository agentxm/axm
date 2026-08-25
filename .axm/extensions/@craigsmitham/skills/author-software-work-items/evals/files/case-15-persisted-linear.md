# ENG-704 — Billing retries drop the original service problem

## Summary

Billing retries replace the original service problem with a generic transport
error, preventing operators from seeing the actionable status and detail.

## Source

- MonitorCo occurrence: BILLING-901

## Verification conditions

- The original service status and problem detail survive the retry boundary.
