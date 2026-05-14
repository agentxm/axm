module AgentXM.Examples.PawMatch.FSharp.Pets

open System

type Pet =
    { Slug: string
      Name: string
      Species: string
      Breed: string
      AgeYears: int
      DaysInShelter: int
      Tags: string list
      Needs: string }

let isLongStay pet = pet.DaysInShelter >= 120

let all: Pet list =
    [ { Slug = "biscuit"
        Name = "Biscuit"
        Species = "dog"
        Breed = "Beagle mix"
        AgeYears = 4
        DaysInShelter = 12
        Tags = [ "playful"; "social"; "good-with-kids" ]
        Needs = "Daily walks; loves squeaky toys." }
      { Slug = "pepper"
        Name = "Pepper"
        Species = "cat"
        Breed = "Domestic Shorthair"
        AgeYears = 8
        DaysInShelter = 247
        Tags = [ "mellow"; "lap-cat"; "solo" ]
        Needs = "Quiet home preferred; no other cats." }
      { Slug = "marigold"
        Name = "Marigold"
        Species = "dog"
        Breed = "Senior Labrador"
        AgeYears = 11
        DaysInShelter = 89
        Tags = [ "calm"; "gentle"; "low-energy" ]
        Needs = "Joint supplements; short walks only." }
      { Slug = "tofu"
        Name = "Tofu"
        Species = "rabbit"
        Breed = "Holland Lop"
        AgeYears = 2
        DaysInShelter = 31
        Tags = [ "curious"; "social" ]
        Needs = "Roomy enclosure and unlimited hay." }
      { Slug = "otis"
        Name = "Otis"
        Species = "dog"
        Breed = "Pittie mix"
        AgeYears = 5
        DaysInShelter = 156
        Tags = [ "gentle"; "good-with-kids"; "no-cats" ]
        Needs = "Cat-free home; loves toddlers." }
      { Slug = "juniper"
        Name = "Juniper"
        Species = "cat"
        Breed = "Tortoiseshell"
        AgeYears = 3
        DaysInShelter = 22
        Tags = [ "vocal"; "spunky"; "solo" ]
        Needs = "Only cat in the household, please." }
      { Slug = "maple"
        Name = "Maple"
        Species = "dog"
        Breed = "Mini Australian Shepherd"
        AgeYears = 1
        DaysInShelter = 6
        Tags = [ "high-energy"; "smart"; "needs-training" ]
        Needs = "Training class strongly recommended." }
      { Slug = "clover"
        Name = "Clover & Sage"
        Species = "guinea-pig"
        Breed = "Bonded pair"
        AgeYears = 1
        DaysInShelter = 18
        Tags = [ "social"; "bonded-pair" ]
        Needs = "Must adopt together — bonded for life." } ]

let private bySlug =
    all
    |> List.map (fun pet -> pet.Slug, pet)
    |> Map.ofList

let findBySlug (slug: string) =
    bySlug |> Map.tryFind (slug.ToLowerInvariant())

let filterBySpecies (species: string option) =
    match species with
    | None -> all
    | Some s -> all |> List.filter (fun p -> String.Equals(p.Species, s, StringComparison.OrdinalIgnoreCase))
