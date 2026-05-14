(* Curated, static list of well-known animal-welfare charities. The CLI
   never processes payments; it shows information and links to official
   donation pages. Verify current ratings independently before giving. *)

type t = {
  slug : string;
  name : string;
  focus : string;
  description : string;
  url : string;
  rating_note : string;
}

let disclaimer : string =
  "Curated example list — verify current ratings on Charity Navigator or \
   GuideStar before giving."

let all : t list =
  [
    {
      slug = "best-friends";
      name = "Best Friends Animal Society";
      focus = "shelters";
      description =
        "No-kill movement; supports adoptions, shelters, and advocacy \
         nationwide.";
      url = "https://bestfriends.org/donate";
      rating_note = "Charity Navigator 4-star";
    };
    {
      slug = "petsmart-charities";
      name = "PetSmart Charities";
      focus = "shelters";
      description =
        "Grants to local shelters; spay/neuter; adoption events.";
      url = "https://petsmartcharities.org/donate";
      rating_note = "Charity Navigator 4-star (96% program ratio)";
    };
    {
      slug = "brother-wolf";
      name = "Brother Wolf Animal Rescue";
      focus = "rescue";
      description = "Local rescue with national-impact outreach programs.";
      url = "https://bwar.org/donate";
      rating_note = "Charity Navigator 4-star, GuideStar Platinum";
    };
    {
      slug = "animal-welfare-institute";
      name = "Animal Welfare Institute";
      focus = "policy";
      description =
        "Policy and advocacy reducing cruelty inflicted on animals.";
      url = "https://awionline.org/donate";
      rating_note = "Charity Navigator 4-star";
    };
    {
      slug = "aspca";
      name = "ASPCA";
      focus = "shelters";
      description =
        "Adoption, anti-cruelty programs, and animal welfare advocacy.";
      url = "https://www.aspca.org/donate";
      rating_note = "Charity Navigator 4-star";
    };
  ]

let lower (s : string) : string = String.lowercase_ascii s

let find_by_slug (slug : string) : t option =
  let target = lower slug in
  List.find_opt (fun (c : t) -> lower c.slug = target) all

let filter_by_focus (focus : string) : t list =
  let target = lower focus in
  if target = "all" || target = "" then all
  else List.filter (fun (c : t) -> lower c.focus = target) all
