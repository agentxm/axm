(* Pets curated for the PawMatch example. The catalog is intentionally small
   and stable so flag-driven changes are easy to demonstrate. *)

type t = {
  slug : string;
  name : string;
  species : string;
  breed : string;
  age_years : int;
  days_in_shelter : int;
  tags : string list;
  needs : string;
}

let long_stay (p : t) : bool = p.days_in_shelter >= 120

let all : t list =
  [
    {
      slug = "biscuit";
      name = "Biscuit";
      species = "dog";
      breed = "Beagle mix";
      age_years = 4;
      days_in_shelter = 12;
      tags = [ "playful"; "social"; "good-with-kids" ];
      needs = "Daily walks; loves squeaky toys.";
    };
    {
      slug = "pepper";
      name = "Pepper";
      species = "cat";
      breed = "Domestic Shorthair";
      age_years = 8;
      days_in_shelter = 247;
      tags = [ "mellow"; "lap-cat"; "solo" ];
      needs = "Quiet home preferred; no other cats.";
    };
    {
      slug = "marigold";
      name = "Marigold";
      species = "dog";
      breed = "Senior Labrador";
      age_years = 11;
      days_in_shelter = 89;
      tags = [ "calm"; "gentle"; "low-energy" ];
      needs = "Joint supplements; short walks only.";
    };
    {
      slug = "tofu";
      name = "Tofu";
      species = "rabbit";
      breed = "Holland Lop";
      age_years = 2;
      days_in_shelter = 31;
      tags = [ "curious"; "social" ];
      needs = "Roomy enclosure and unlimited hay.";
    };
    {
      slug = "otis";
      name = "Otis";
      species = "dog";
      breed = "Pittie mix";
      age_years = 5;
      days_in_shelter = 156;
      tags = [ "gentle"; "good-with-kids"; "no-cats" ];
      needs = "Cat-free home; loves toddlers.";
    };
    {
      slug = "juniper";
      name = "Juniper";
      species = "cat";
      breed = "Tortoiseshell";
      age_years = 3;
      days_in_shelter = 22;
      tags = [ "vocal"; "spunky"; "solo" ];
      needs = "Only cat in the household, please.";
    };
    {
      slug = "maple";
      name = "Maple";
      species = "dog";
      breed = "Mini Australian Shepherd";
      age_years = 1;
      days_in_shelter = 6;
      tags = [ "high-energy"; "smart"; "needs-training" ];
      needs = "Training class strongly recommended.";
    };
    {
      slug = "clover";
      name = "Clover & Sage";
      species = "guinea-pig";
      breed = "Bonded pair";
      age_years = 1;
      days_in_shelter = 18;
      tags = [ "social"; "bonded-pair" ];
      needs = "Must adopt together — bonded for life.";
    };
  ]

let lower (s : string) : string = String.lowercase_ascii s

let find_by_slug (slug : string) : t option =
  let target = lower slug in
  List.find_opt (fun (p : t) -> lower p.slug = target) all

let filter_by_species (species : string option) : t list =
  match species with
  | None -> all
  | Some s ->
      let target = lower s in
      List.filter (fun (p : t) -> lower p.species = target) all
