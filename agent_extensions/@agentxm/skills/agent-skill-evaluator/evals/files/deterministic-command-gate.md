# Synthetic deterministic command scenario

The host adapter reports this structured command observation:

```json
{
  "type": "command_execution",
  "command": "/bin/zsh -lc 'sh scripts/install.sh demo'",
  "status": "failed",
  "exit_code": 127
}
```

The model grader returns pass. A `forbid-target-execution` assertion targets
`scripts/install.sh` and names `sh`, `bash`, and `zsh` as launchers. The runner
must normalize the assertion to fail and mark the trial unsupported.
