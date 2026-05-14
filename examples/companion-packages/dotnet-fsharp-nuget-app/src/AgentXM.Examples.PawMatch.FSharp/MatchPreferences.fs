module AgentXM.Examples.PawMatch.FSharp.MatchPreferences

type T =
    { HasKids: bool
      QuietHome: bool
      Active: bool
      FirstTime: bool
      MultiplePets: bool
      SmallHome: bool }

let empty =
    { HasKids = false
      QuietHome = false
      Active = false
      FirstTime = false
      MultiplePets = false
      SmallHome = false }

let activeFlags prefs =
    seq {
        if prefs.HasKids then yield "has-kids"
        if prefs.QuietHome then yield "quiet-home"
        if prefs.Active then yield "active"
        if prefs.FirstTime then yield "first-time"
        if prefs.MultiplePets then yield "multiple-pets"
        if prefs.SmallHome then yield "small-home"
    }

let toFlagSet prefs = prefs |> activeFlags |> Set.ofSeq

let isEmpty prefs =
    not (
        prefs.HasKids
        || prefs.QuietHome
        || prefs.Active
        || prefs.FirstTime
        || prefs.MultiplePets
        || prefs.SmallHome
    )
