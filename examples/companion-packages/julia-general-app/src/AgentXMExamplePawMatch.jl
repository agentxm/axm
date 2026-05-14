"""
    AgentXMExamplePawMatch

PawMatch is a tiny CLI for a fictional community pet adoption center, used as
a reference consumer of [`AgentXMExampleTinyFlags`](@ref).
"""
module AgentXMExamplePawMatch

include("pets.jl")
include("charities.jl")
include("flags.jl")
include("cli.jl")

using .Cli: run_cli

export run_cli, Cli, Pets, Charities, Flags

const VERSION = v"0.1.0"

"""
    julia_main()::Cint

Entry point for `julia --project bin/pawmatch.jl ...` and for compiled
binaries via PackageCompiler. Returns the CLI status as a `Cint`.
"""
function julia_main()::Cint
    return Cint(run_cli(copy(ARGS)))
end

end # module AgentXMExamplePawMatch
