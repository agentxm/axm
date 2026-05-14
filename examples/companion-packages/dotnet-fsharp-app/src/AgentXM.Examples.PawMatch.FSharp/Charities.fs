module AgentXM.Examples.PawMatch.FSharp.Charities

open System

type Charity =
    { Slug: string
      Name: string
      Focus: string
      Description: string
      Url: string
      RatingNote: string }

let all: Charity list =
    [ { Slug = "best-friends"
        Name = "Best Friends Animal Society"
        Focus = "shelters"
        Description = "No-kill movement; supports adoptions, shelters, and advocacy nationwide."
        Url = "https://bestfriends.org/donate"
        RatingNote = "Charity Navigator 4-star" }
      { Slug = "petsmart-charities"
        Name = "PetSmart Charities"
        Focus = "shelters"
        Description = "Grants to local shelters; spay/neuter; adoption events."
        Url = "https://petsmartcharities.org/donate"
        RatingNote = "Charity Navigator 4-star (96% program ratio)" }
      { Slug = "brother-wolf"
        Name = "Brother Wolf Animal Rescue"
        Focus = "rescue"
        Description = "Local rescue with national-impact outreach programs."
        Url = "https://bwar.org/donate"
        RatingNote = "Charity Navigator 4-star, GuideStar Platinum" }
      { Slug = "animal-welfare-institute"
        Name = "Animal Welfare Institute"
        Focus = "policy"
        Description = "Policy and advocacy reducing cruelty inflicted on animals."
        Url = "https://awionline.org/donate"
        RatingNote = "Charity Navigator 4-star" }
      { Slug = "aspca"
        Name = "ASPCA"
        Focus = "shelters"
        Description = "Adoption, anti-cruelty programs, and animal welfare advocacy."
        Url = "https://www.aspca.org/donate"
        RatingNote = "Charity Navigator 4-star" } ]

[<Literal>]
let disclaimer =
    "Curated example list — verify current ratings on Charity Navigator or GuideStar before giving."

let private bySlug =
    all
    |> List.map (fun charity -> charity.Slug, charity)
    |> Map.ofList

let findBySlug (slug: string) =
    bySlug |> Map.tryFind (slug.ToLowerInvariant())

let filterByFocus (focus: string) =
    if String.Equals(focus, "all", StringComparison.OrdinalIgnoreCase) then
        all
    else
        all |> List.filter (fun c -> String.Equals(c.Focus, focus, StringComparison.OrdinalIgnoreCase))
