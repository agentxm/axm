#!/usr/bin/env julia
# Run the PawMatch CLI: `julia --project bin/pawmatch.jl <command> [options]`.

using AgentXMExamplePawMatch

exit(AgentXMExamplePawMatch.run_cli(ARGS))
