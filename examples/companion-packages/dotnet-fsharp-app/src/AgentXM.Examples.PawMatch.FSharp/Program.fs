module AgentXM.Examples.PawMatch.FSharp.Program

open AgentXM.Examples.PawMatch.FSharp.PawMatchCli

[<EntryPoint>]
let main argv = run (create ()) argv
