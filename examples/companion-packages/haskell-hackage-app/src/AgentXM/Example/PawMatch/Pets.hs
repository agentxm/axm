{-# LANGUAGE OverloadedStrings #-}

module AgentXM.Example.PawMatch.Pets
  ( Pet (..)
  , allPets
  , findBySlug
  , filterBySpecies
  , isLongStay
  ) where

import           Data.Text (Text)
import qualified Data.Text as T

data Pet = Pet
  { petSlug          :: !Text
  , petName          :: !Text
  , petSpecies       :: !Text
  , petBreed         :: !Text
  , petAgeYears      :: !Int
  , petDaysInShelter :: !Int
  , petTags          :: ![Text]
  , petNeeds         :: !Text
  } deriving (Eq, Show)

isLongStay :: Pet -> Bool
isLongStay p = petDaysInShelter p >= 120

allPets :: [Pet]
allPets =
  [ Pet "biscuit"  "Biscuit"        "dog"        "Beagle mix"
        4   12  ["playful", "social", "good-with-kids"]
        "Daily walks; loves squeaky toys."
  , Pet "pepper"   "Pepper"         "cat"        "Domestic Shorthair"
        8   247 ["mellow", "lap-cat", "solo"]
        "Quiet home preferred; no other cats."
  , Pet "marigold" "Marigold"       "dog"        "Senior Labrador"
        11  89  ["calm", "gentle", "low-energy"]
        "Joint supplements; short walks only."
  , Pet "tofu"     "Tofu"           "rabbit"     "Holland Lop"
        2   31  ["curious", "social"]
        "Roomy enclosure and unlimited hay."
  , Pet "otis"     "Otis"           "dog"        "Pittie mix"
        5   156 ["gentle", "good-with-kids", "no-cats"]
        "Cat-free home; loves toddlers."
  , Pet "juniper"  "Juniper"        "cat"        "Tortoiseshell"
        3   22  ["vocal", "spunky", "solo"]
        "Only cat in the household, please."
  , Pet "maple"    "Maple"          "dog"        "Mini Australian Shepherd"
        1   6   ["high-energy", "smart", "needs-training"]
        "Training class strongly recommended."
  , Pet "clover"   "Clover & Sage"  "guinea-pig" "Bonded pair"
        1   18  ["social", "bonded-pair"]
        "Must adopt together — bonded for life."
  ]

findBySlug :: Text -> Maybe Pet
findBySlug slug =
  let target = T.toLower slug
  in case filter ((== target) . T.toLower . petSlug) allPets of
       (p : _) -> Just p
       []      -> Nothing

filterBySpecies :: Maybe Text -> [Pet]
filterBySpecies Nothing = allPets
filterBySpecies (Just species) =
  let target = T.toLower species
  in filter ((== target) . T.toLower . petSpecies) allPets
