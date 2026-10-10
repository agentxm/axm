# Failure diagnostics

Use `axm diagnostics --help` for the command reference.

A failed invocation prints a Diagnostic ID in human output and carries
`diagnosticId` in its JSON failure document. The same ID identifies the local
record and, when error telemetry is enabled, its remote report. An ID does not
prove a remote report was delivered.

Record contents are implementation-owned support evidence and may change
between releases. They remain unfrozen when shown under `result.record` or
exported to a file, and carry no diagnostic-record contract identifier.
Automation uses the public failure envelope's error code, recovery suggestions,
and optional `diagnosticId`.

Review a retained record before sharing it:

```bash
axm diagnostics show <id>
axm diagnostics show <id> --json
```

Local records include redacted cause messages and stacks and may contain
filesystem paths. Review the displayed content and copy its SHA-256 to export
exactly that record:

```bash
axm diagnostics export --review-sha256 <sha256> <id> ./diagnostic.json
```

Export writes a new restricted local file. It refuses an existing filename or
content that changed after review. AXM does not upload these records.

Records live under `.axm/diagnostics/` in the selected AXM user home. Each record
is limited to 64 KiB; retention keeps at most twenty records for seven days.
Recording is independent of remote telemetry consent. If local storage is
unavailable, the original failure and its Diagnostic ID still reach available
output channels.

See `axm help environment` for user-home selection and telemetry controls and
`axm help machine-output` for JSON failure documents.
