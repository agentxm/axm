module Charities

export Charity, ALL, DISCLAIMER, find_by_slug, filter_by_focus

struct Charity
    slug::String
    name::String
    focus::String
    description::String
    url::String
    rating_note::String
end

const ALL = Charity[
    Charity("best-friends", "Best Friends Animal Society", "shelters",
        "No-kill movement; supports adoptions, shelters, and advocacy nationwide.",
        "https://bestfriends.org/donate",
        "Charity Navigator 4-star"),
    Charity("petsmart-charities", "PetSmart Charities", "shelters",
        "Grants to local shelters; spay/neuter; adoption events.",
        "https://petsmartcharities.org/donate",
        "Charity Navigator 4-star (96% program ratio)"),
    Charity("brother-wolf", "Brother Wolf Animal Rescue", "rescue",
        "Local rescue with national-impact outreach programs.",
        "https://bwar.org/donate",
        "Charity Navigator 4-star, GuideStar Platinum"),
    Charity("animal-welfare-institute", "Animal Welfare Institute", "policy",
        "Policy and advocacy reducing cruelty inflicted on animals.",
        "https://awionline.org/donate",
        "Charity Navigator 4-star"),
    Charity("aspca", "ASPCA", "shelters",
        "Adoption, anti-cruelty programs, and animal welfare advocacy.",
        "https://www.aspca.org/donate",
        "Charity Navigator 4-star"),
]

const DISCLAIMER =
    "Curated example list — verify current ratings on Charity Navigator or " *
    "GuideStar before giving."

const BY_SLUG = Dict{String,Charity}(lowercase(c.slug) => c for c in ALL)

function find_by_slug(slug)
    slug === nothing && return nothing
    return get(BY_SLUG, lowercase(String(slug)), nothing)
end

function filter_by_focus(focus)
    if focus === nothing || lowercase(String(focus)) == "all"
        return ALL
    end
    target = lowercase(String(focus))
    return filter(c -> lowercase(c.focus) == target, ALL)
end

end # module Charities
