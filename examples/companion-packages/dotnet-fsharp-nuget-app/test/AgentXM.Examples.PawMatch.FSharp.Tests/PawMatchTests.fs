module AgentXM.Examples.PawMatch.FSharp.Tests.PawMatchTests

open System.IO
open Expecto
open AgentXM.Examples.PawMatch.FSharp.PawMatchCli

[<Tests>]
let tests =
    testList "pawmatch" [
        testCase "fees exits 0" <| fun _ ->
            use out = new StringWriter()
            use err = new StringWriter()
            let cli = create () |> withWriters out err
            let exitCode = run cli [| "fees" |]
            Expect.equal exitCode 0 "fees should exit with status 0"
    ]
