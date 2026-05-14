(** Tiny feature flags library used by AXM companion package examples.

    Flags are defined with {!Bool.make} or {!Variant.make} and evaluated against
    a {!Context.t}. Rollout decisions are deterministic for a given
    [(flag_name, context_id)] pair so the same caller always sees the same
    answer. *)

module Context = struct
  (** Evaluation context for deterministic rollout bucketing. The
      [id] is the caller identity used as bucketing key. An empty [id]
      sends every caller to the same ["anonymous"] slot. *)

  type t = { id : string }

  let make ?(id = "") () = { id }

  let id_or_anonymous (ctx : t) : string =
    if ctx.id = "" then "anonymous" else ctx.id

  (* FNV-1a 32-bit, matching the other TinyFlags ports so bucketing is
     identical across language ecosystems. *)
  let fnv1a (s : string) : int =
    let offset = 2166136261 in
    let prime = 16777619 in
    let mask = 0xFFFFFFFF in
    let h = ref offset in
    String.iter
      (fun c ->
        h := (!h lxor Char.code c) land mask;
        h := (!h * prime) land mask)
      s;
    !h

  (** Bucket (0..99) for [name] under [ctx]. *)
  let bucket_for (name : string) (ctx : t) : int =
    let key = name ^ ":" ^ id_or_anonymous ctx in
    fnv1a key mod 100
end

(** Error type for flag construction and evaluation. *)
type error =
  | Invalid_rollout of string
  | Invalid_default of string
  | Unknown_variant of string
  | Duplicate_variant of string
  | Empty_variants
  | Rollout_total_exceeds_100 of int
  | Unknown_flag of string
  | Wrong_flag_kind of string

let error_message = function
  | Invalid_rollout msg -> "tinyflags: invalid rollout — " ^ msg
  | Invalid_default msg -> "tinyflags: invalid default — " ^ msg
  | Unknown_variant v -> "tinyflags: unknown variant " ^ v
  | Duplicate_variant v -> "tinyflags: duplicate variant " ^ v
  | Empty_variants -> "tinyflags: variants must not be empty"
  | Rollout_total_exceeds_100 t ->
      "tinyflags: rollout total " ^ string_of_int t ^ " exceeds 100"
  | Unknown_flag n -> "tinyflags: unknown flag " ^ n
  | Wrong_flag_kind n -> "tinyflags: flag " ^ n ^ " is the wrong kind"

exception Tinyflags_error of error

module Bool = struct
  (** A feature flag whose treatment is [true] or [false]. *)

  type t = { default : bool; rollout : int option }

  let valid_rollout = function
    | None -> true
    | Some pct -> pct >= 0 && pct <= 100

  (** Construct a boolean flag.

      - [~default]: default value (defaults to [false]).
      - [~rollout]: integer percentage in [[0, 100]]. When set, the value
        flips to [not default] for that share of callers. *)
  let make ?(default = false) ?rollout () : (t, error) result =
    if not (valid_rollout rollout) then
      Error (Invalid_rollout "must be an integer in 0..100")
    else Ok { default; rollout }

  let make_exn ?(default = false) ?rollout () : t =
    match make ~default ?rollout () with
    | Ok flag -> flag
    | Error e -> raise (Tinyflags_error e)

  let default (t : t) : bool = t.default
  let rollout (t : t) : int option = t.rollout

  let get (t : t) ~name ~context : bool =
    match t.rollout with
    | None -> t.default
    | Some pct ->
        let bucket = Context.bucket_for name context in
        if bucket < pct then not t.default else t.default
end

module Variant = struct
  (** A feature flag whose treatment is one of a fixed set of named variants. *)

  type t = {
    variants : string list;
    default : string;
    rollout : (string * int) list;
  }

  let dedup_in_order (xs : string list) : (string list, error) result =
    let seen = Hashtbl.create 8 in
    let rec go acc = function
      | [] -> Ok (List.rev acc)
      | "" :: _ -> Error (Invalid_default "variant names must be non-empty")
      | v :: rest ->
          if Hashtbl.mem seen v then Error (Duplicate_variant v)
          else (
            Hashtbl.add seen v ();
            go (v :: acc) rest)
    in
    go [] xs

  let validate_rollout (variants : string list) (rollout : (string * int) list)
      : (unit, error) result =
    let rec go total = function
      | [] ->
          if total > 100 then Error (Rollout_total_exceeds_100 total)
          else Ok ()
      | (v, pct) :: rest ->
          if not (List.mem v variants) then Error (Unknown_variant v)
          else if pct < 0 || pct > 100 then
            Error (Invalid_rollout (v ^ " percentage must be in 0..100"))
          else go (total + pct) rest
    in
    go 0 rollout

  (** Construct a variant flag.

      - [variants]: non-empty list of unique, non-empty variant names.
      - [~default]: default variant (must be in [variants]). Defaults to the
        first variant.
      - [~rollout]: list of [(variant, percentage)] pairs. Each percentage in
        [[0, 100]]; total must not exceed 100. *)
  let make ?default ?(rollout = []) (variants : string list) :
      (t, error) result =
    match variants with
    | [] -> Error Empty_variants
    | _ -> (
        match dedup_in_order variants with
        | Error e -> Error e
        | Ok ordered -> (
            let resolved_default =
              match default with
              | None -> List.hd ordered
              | Some d -> d
            in
            if not (List.mem resolved_default ordered) then
              Error
                (Invalid_default
                   (resolved_default ^ " is not a declared variant"))
            else
              match validate_rollout ordered rollout with
              | Error e -> Error e
              | Ok () ->
                  Ok { variants = ordered; default = resolved_default; rollout }))

  let make_exn ?default ?(rollout = []) (variants : string list) : t =
    match make ?default ~rollout variants with
    | Ok flag -> flag
    | Error e -> raise (Tinyflags_error e)

  let variants (t : t) : string list = t.variants
  let default (t : t) : string = t.default
  let rollout (t : t) : (string * int) list = t.rollout

  (* Walk variants in declaration order so allocation is stable. Variants
     missing from the rollout list are skipped. *)
  let pick (t : t) ~bucket : string =
    let rec go remaining = function
      | [] -> t.default
      | v :: rest -> (
          match List.assoc_opt v t.rollout with
          | None -> go remaining rest
          | Some pct ->
              if remaining < pct then v else go (remaining - pct) rest)
    in
    match t.rollout with
    | [] -> t.default
    | _ -> go bucket t.variants

  let get (t : t) ~name ~context : string =
    let bucket = Context.bucket_for name context in
    pick t ~bucket
end

(** A flag set holding both boolean and variant flag definitions. *)

type flag = Boolean of Bool.t | VariantFlag of Variant.t

type t = { definitions : (string * flag) list }

let make (definitions : (string * flag) list) : (t, error) result =
  let rec check seen = function
    | [] -> Ok ()
    | ("", _) :: _ -> Error (Invalid_default "flag names must be non-empty")
    | (name, _) :: rest ->
        if List.mem name seen then Error (Duplicate_variant name)
        else check (name :: seen) rest
  in
  match check [] definitions with
  | Error e -> Error e
  | Ok () -> Ok { definitions }

let make_exn (definitions : (string * flag) list) : t =
  match make definitions with
  | Ok flags -> flags
  | Error e -> raise (Tinyflags_error e)

let names (t : t) : string list =
  List.sort compare (List.map fst t.definitions)

let fetch (t : t) (name : string) : (flag, error) result =
  match List.assoc_opt name t.definitions with
  | Some f -> Ok f
  | None -> Error (Unknown_flag name)

(** Return the boolean treatment for the named flag, or an error if the flag
    is unknown or not a boolean flag. *)
let enabled (t : t) ~name ~context : (bool, error) result =
  match fetch t name with
  | Error e -> Error e
  | Ok (Boolean b) -> Ok (Bool.get b ~name ~context)
  | Ok (VariantFlag _) -> Error (Wrong_flag_kind name)

let enabled_exn (t : t) ~name ~context : bool =
  match enabled t ~name ~context with
  | Ok b -> b
  | Error e -> raise (Tinyflags_error e)

(** Return the variant treatment for the named flag, or an error if the flag
    is unknown or not a variant flag. *)
let variant (t : t) ~name ~context : (string, error) result =
  match fetch t name with
  | Error e -> Error e
  | Ok (VariantFlag v) -> Ok (Variant.get v ~name ~context)
  | Ok (Boolean _) -> Error (Wrong_flag_kind name)

let variant_exn (t : t) ~name ~context : string =
  match variant t ~name ~context with
  | Ok v -> v
  | Error e -> raise (Tinyflags_error e)

type value = Bool_value of bool | Variant_value of string

(** Evaluate a flag without knowing its kind ahead of time. *)
let evaluate (t : t) ~name ~context : (value, error) result =
  match fetch t name with
  | Error e -> Error e
  | Ok (Boolean b) -> Ok (Bool_value (Bool.get b ~name ~context))
  | Ok (VariantFlag v) -> Ok (Variant_value (Variant.get v ~name ~context))
