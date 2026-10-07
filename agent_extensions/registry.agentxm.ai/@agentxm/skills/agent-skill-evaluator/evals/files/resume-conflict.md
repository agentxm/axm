# Synthetic interrupted run

Run `run-23` is `canceled`. Cases 1 and 2 have complete immutable attempt
records. The run binds suite identity `sha256:original-suite`; the current suite
identity is `sha256:changed-suite`. Target, runner, and adapters are unchanged.

The operator asks to resume without restoring the original suite.
