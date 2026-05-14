{-# LANGUAGE OverloadedStrings #-}
{-# LANGUAGE LambdaCase #-}

-- |
-- Module      : AgentXM.Example.PawMatch.Cli
-- Description : optparse-applicative entry point and per-command renderers.
module AgentXM.Example.PawMatch.Cli
  ( runCli
  , Command (..)
  , parseCommand
  , dispatch
  , buildContext
  ) where

import           AgentXM.Example.PawMatch.Charities (Charity (..))
import qualified AgentXM.Example.PawMatch.Charities as Charities
import           AgentXM.Example.PawMatch.Flags
                   ( buildRegistry
                   , donateFocusDefault
                   , feeBreakdownDetailed
                   , homeCheckFollowup
                   , longStayHighlight
                   , matchQuizDepth
                   , petCardStyle
                   , recommendationStrategy
                   , showCharityRatings
                   , suggestDonateAfterAdoption
                   )
import           AgentXM.Example.PawMatch.Pets (Pet (..))
import qualified AgentXM.Example.PawMatch.Pets as Pets
import           AgentXM.Example.TinyFlags
                   ( Context (..), anonymousContext, enabled, variant )
import           Data.Maybe (fromMaybe)
import           Data.Text (Text)
import qualified Data.Text as T
import qualified Data.Text.IO as TIO
import           Options.Applicative
import           System.Environment (lookupEnv)
import           System.Exit (ExitCode (..))
import           System.IO (Handle, hPutStrLn)
import           Text.Printf (hPrintf)

-- | All PawMatch commands parsed from @argv@.
data Command
  = Browse  (Maybe Text)
  | ShowPet Text
  | Match   MatchPrefs
  | Apply   Text
  | Fees
  | ReturnSupport
  | Donate  (Maybe Text) (Maybe Text) Bool
  deriving (Eq, Show)

data MatchPrefs = MatchPrefs
  { mpHasKids      :: !Bool
  , mpQuietHome    :: !Bool
  , mpActive       :: !Bool
  , mpFirstTime    :: !Bool
  , mpMultiplePets :: !Bool
  , mpSmallHome    :: !Bool
  } deriving (Eq, Show)

emptyPrefs :: MatchPrefs
emptyPrefs = MatchPrefs False False False False False False

-- | Run the CLI against @argv@, writing to the given output / error handles.
runCli :: [String] -> Handle -> Handle -> IO ExitCode
runCli argv outH errH =
  case parseCommand argv of
    Left help -> do
      hPutStrLn outH help
      pure ExitSuccess
    Right cmd -> dispatch cmd outH errH

-- | Parse @argv@. Returns 'Left' with help text for @-h@ / @--help@ /
-- empty input, or 'Right' for a runnable command.
parseCommand :: [String] -> Either String Command
parseCommand []           = Left usage
parseCommand ["-h"]       = Left usage
parseCommand ["--help"]   = Left usage
parseCommand argv =
  case execParserPure defaultPrefs commandInfo argv of
    Success cmd          -> Right cmd
    Failure failure      -> Left (fst (renderFailure failure "pawmatch"))
    CompletionInvoked _  -> Left usage

usage :: String
usage = unlines
  [ "pawmatch — community pet-adoption CLI."
  , ""
  , "Usage: pawmatch <command> [options]"
  , ""
  , "Commands:"
  , "  browse [--species SPECIES]   List adoptable pets"
  , "  show <pet>                   Show details for a pet"
  , "  match [match flags]          Match pets to your lifestyle"
  , "  apply <pet>                  Start an adoption application"
  , "  fees                         Show adoption fees"
  , "  return-support               No-judgment return information"
  , "  donate [--focus FOCUS]       Browse charities to support"
  , "  donate <slug> --open         Open a charity's donation URL"
  ]

commandInfo :: ParserInfo Command
commandInfo = info (commandParser <**> helper)
  ( fullDesc
 <> header "pawmatch — community pet-adoption CLI."
  )

commandParser :: Parser Command
commandParser = subparser
  ( command "browse"
      (info browseParser  (progDesc "List adoptable pets"))
 <> command "show"
      (info showParser    (progDesc "Show details for a pet"))
 <> command "match"
      (info matchParser   (progDesc "Match pets to your lifestyle"))
 <> command "apply"
      (info applyParser   (progDesc "Start an adoption application"))
 <> command "fees"
      (info feesParser    (progDesc "Show adoption fees"))
 <> command "return-support"
      (info returnSupportParser (progDesc "No-judgment return information"))
 <> command "donate"
      (info donateParser  (progDesc "Browse charities to support"))
  )

browseParser :: Parser Command
browseParser = Browse <$> optional
  ( T.pack <$> strOption
      (  long "species"
      <> metavar "SPECIES"
      <> help "Filter by species (dog|cat|rabbit|guinea-pig)"
      )
  )

showParser :: Parser Command
showParser = ShowPet . T.pack <$> argument str (metavar "PET")

matchParser :: Parser Command
matchParser =
  Match <$>
    ( MatchPrefs
        <$> switch (long "has-kids"       <> help "Family with children.")
        <*> switch (long "quiet-home"     <> help "Quiet, calm household.")
        <*> switch (long "active"         <> help "Active, outdoor lifestyle.")
        <*> switch (long "first-time"     <> help "First-time pet adopter.")
        <*> switch (long "multiple-pets"  <> help "Other pets at home.")
        <*> switch (long "small-home"     <> help "Small home or apartment.")
    )

applyParser :: Parser Command
applyParser = Apply . T.pack <$> argument str (metavar "PET")

feesParser :: Parser Command
feesParser = pure Fees

returnSupportParser :: Parser Command
returnSupportParser = pure ReturnSupport

donateParser :: Parser Command
donateParser =
  Donate
    <$> optional (T.pack <$> argument str (metavar "SLUG"))
    <*> optional
          ( T.pack <$> strOption
              (  long "focus"
              <> metavar "FOCUS"
              <> help "Charity focus (all|shelters|rescue|policy)"
              )
          )
    <*> switch (long "open" <> help "Open the charity's donation URL in a browser")

-- ────────────────────────────────────────────────────────────────────
-- Dispatch
-- ────────────────────────────────────────────────────────────────────

dispatch :: Command -> Handle -> Handle -> IO ExitCode
dispatch cmd outH errH = case cmd of
  Browse species          -> cmdBrowse species outH
  ShowPet slug            -> cmdShow slug outH errH
  Match prefs             -> cmdMatch prefs outH
  Apply slug              -> cmdApply slug outH errH
  Fees                    -> cmdFees outH
  ReturnSupport           -> cmdReturnSupport outH
  Donate slug focus open' -> cmdDonate slug focus open' outH errH

cmdBrowse :: Maybe Text -> Handle -> IO ExitCode
cmdBrowse species outH = do
  let matching = Pets.filterBySpecies species
  if null matching
    then do
      TIO.hPutStrLn outH
        ("No adoptable pets found for species '"
         <> fromMaybe "" species
         <> "'.")
      pure ExitSuccess
    else do
      ctx <- buildContext
      let reg = buildRegistry
      case enabled reg longStayHighlight ctx of
        Right True ->
          let longStay = filter Pets.isLongStay matching
          in case longStay of
               [] -> pure ()
               (featured : _) -> do
                 TIO.hPutStrLn outH
                   ("* Featured long-stay friend — please consider "
                    <> petName featured <> "!")
                 hPutStrLn outH ""
        _ -> pure ()
      let style = case variant reg petCardStyle ctx of
                    Right s -> s
                    Left _  -> "detailed"
      mapM_ (renderPet outH style) matching
      pure ExitSuccess

cmdShow :: Text -> Handle -> Handle -> IO ExitCode
cmdShow slug outH errH =
  case Pets.findBySlug slug of
    Nothing -> do
      TIO.hPutStrLn errH
        ("Unknown pet '" <> slug <> "'. Try 'pawmatch browse'.")
      pure (ExitFailure 1)
    Just pet -> do
      renderPet outH "detailed" pet
      TIO.hPutStrLn outH ("  Needs: " <> petNeeds pet)
      let suffix = if Pets.isLongStay pet then " (long-stay)" else ""
      TIO.hPutStrLn outH
        ("  Days in shelter: "
         <> T.pack (show (petDaysInShelter pet))
         <> suffix)
      pure ExitSuccess

cmdMatch :: MatchPrefs -> Handle -> IO ExitCode
cmdMatch prefs outH = do
  ctx <- buildContext
  let reg      = buildRegistry
      strategy = case variant reg recommendationStrategy ctx of
                   Right v -> v
                   Left _  -> "match-quiz"
      depth    = case variant reg matchQuizDepth ctx of
                   Right v -> v
                   Left _  -> "standard"
      factors  = factorsForDepth depth
      wants    = concatMap snd (filter (preferenceMatches prefs . fst) factors)
      ranked =
        case strategy of
          "popularity"    -> reverse (sortByTagCount popularityTags Pets.allPets)
          "longest-stay"  -> reverse (sortBy petDaysInShelter Pets.allPets)
          _               -> reverse (sortByTagCount wants Pets.allPets)
  TIO.hPutStrLn outH
    ("Strategy: " <> strategy <> " • Quiz depth: " <> depth
     <> " (" <> T.pack (show (length factors)) <> " factor(s) considered)")
  if anyPref prefs
    then pure ()
    else hPutStrLn outH "(no preference flags provided — try --has-kids --quiet-home --active --first-time)"
  hPutStrLn outH ""
  mapM_ (renderMatchedPet outH) (take 3 ranked)
  hPutStrLn outH ""
  hPutStrLn outH "Adoption is a conversation — book a meet-and-greet to see if it's a fit."
  pure ExitSuccess

cmdApply :: Text -> Handle -> Handle -> IO ExitCode
cmdApply slug outH errH =
  case Pets.findBySlug slug of
    Nothing -> do
      TIO.hPutStrLn errH
        ("Unknown pet '" <> slug <> "'. Try 'pawmatch browse'.")
      pure (ExitFailure 1)
    Just pet -> do
      ctx <- buildContext
      let reg = buildRegistry
      TIO.hPutStrLn outH ("Adoption application for " <> petName pet)
      hPutStrLn outH ""
      hPutStrLn outH "Next steps:"
      hPutStrLn outH "  1. Application reviewed by an adoption counselor (1-2 days)."
      hPutStrLn outH "  2. Meet-and-greet scheduled at the shelter."
      hPutStrLn outH "  3. 48-hour reflection period before finalizing."
      hPutStrLn outH "  4. Take-home day — fees cover spay/neuter, vaccines, and microchip."
      case enabled reg homeCheckFollowup ctx of
        Right True ->
          hPutStrLn outH
            "  5. Two-week follow-up check from a counselor to see how you're settling in."
        _ -> pure ()
      hPutStrLn outH ""
      hPutStrLn outH "Returns are always accepted, no questions asked."
      case enabled reg suggestDonateAfterAdoption ctx of
        Right True -> do
          hPutStrLn outH ""
          TIO.hPutStrLn outH
            ("If " <> petName pet <> " brings you joy, please consider donating to a shelter:")
          hPutStrLn outH "  pawmatch donate"
        _ -> pure ()
      pure ExitSuccess

cmdFees :: Handle -> IO ExitCode
cmdFees outH = do
  ctx <- buildContext
  let reg = buildRegistry
  hPutStrLn outH "Adoption fees"
  hPutStrLn outH ""
  case enabled reg feeBreakdownDetailed ctx of
    Right True -> do
      hPutStrLn outH "  Dog adoption — $150 total:"
      hPutStrLn outH "    $60   spay / neuter surgery"
      hPutStrLn outH "    $45   core vaccinations"
      hPutStrLn outH "    $25   microchip and registration"
      hPutStrLn outH "    $20   intake exam and deworming"
      hPutStrLn outH ""
      hPutStrLn outH "  Cat adoption — $90 total:"
      hPutStrLn outH "    $50   spay / neuter surgery"
      hPutStrLn outH "    $25   core vaccinations"
      hPutStrLn outH "    $15   microchip and registration"
      hPutStrLn outH ""
      hPutStrLn outH "  Small animal — $35 total (intake exam + microchip)."
    _ -> do
      hPutStrLn outH "  Dog adoption           $150"
      hPutStrLn outH "  Cat adoption            $90"
      hPutStrLn outH "  Small animal            $35"
      hPutStrLn outH ""
      hPutStrLn outH "  Fees cover spay/neuter, vaccines, and microchip."
  hPutStrLn outH ""
  hPutStrLn outH "No one is turned away for inability to pay — ask about our subsidy fund."
  pure ExitSuccess

cmdReturnSupport :: Handle -> IO ExitCode
cmdReturnSupport outH = do
  hPutStrLn outH "Return support"
  hPutStrLn outH ""
  hPutStrLn outH "If your adoption isn't working out, we're here to help."
  hPutStrLn outH "  • Free behavior consultation with our trainers."
  hPutStrLn outH "  • No-judgment returns at any time — your pet stays in our care."
  hPutStrLn outH "  • Connections to low-cost vet and food assistance programs."
  hPutStrLn outH ""
  hPutStrLn outH "Returning a pet is not a failure. Reach out as soon as you'd like support."
  pure ExitSuccess

cmdDonate :: Maybe Text -> Maybe Text -> Bool -> Handle -> Handle -> IO ExitCode
cmdDonate slug focus openFlag outH errH = do
  ctx <- buildContext
  let reg = buildRegistry
      defaultFocus = case variant reg donateFocusDefault ctx of
                       Right v -> v
                       Left _  -> "all"
      effectiveFocus = fromMaybe defaultFocus focus
      showRatings = case enabled reg showCharityRatings ctx of
                      Right True -> True
                      _          -> False
  case slug of
    Just s ->
      case Charities.findBySlug s of
        Nothing -> do
          TIO.hPutStrLn errH ("Unknown charity '" <> s <> "'.")
          pure (ExitFailure 1)
        Just c ->
          if openFlag
            then openUrlNoop outH (charityUrl c)
            else do
              renderCharity outH showRatings c
              pure ExitSuccess
    Nothing -> do
      let listing = Charities.filterByFocus (Just effectiveFocus)
      TIO.hPutStrLn outH
        ("Animal-welfare charities (focus: " <> effectiveFocus <> ")")
      hPutStrLn outH ""
      mapM_ (\c -> renderCharity outH showRatings c >> hPutStrLn outH "") listing
      TIO.hPutStrLn outH Charities.disclaimer
      if not showRatings
        then hPutStrLn outH "Ratings hidden — set show-charity-ratings to surface them inline."
        else pure ()
      pure ExitSuccess

-- ────────────────────────────────────────────────────────────────────
-- Helpers
-- ────────────────────────────────────────────────────────────────────

-- | The CLI uses the current login as the bucketing context so rollouts are
-- deterministic across runs. Test harnesses can override via PAWMATCH_USER.
buildContext :: IO Context
buildContext = do
  mUser <- lookupEnv "PAWMATCH_USER"
  let fallback = "anonymous"
  pure anonymousContext { ctxSessionId = Just (T.pack (fromMaybe fallback mUser)) }

renderPet :: Handle -> Text -> Pet -> IO ()
renderPet outH style pet = do
  let badge = if Pets.isLongStay pet then " *" else ""
  case style of
    "compact" ->
      hPrintf outH "  %-10s %-14s %-10s %dy%s\n"
        (T.unpack (petSlug pet))
        (T.unpack (petName pet))
        (T.unpack (petSpecies pet))
        (petAgeYears pet)
        (T.unpack badge)
    "playful" -> do
      let tagPhrase = T.intercalate " & " (petTags pet)
      TIO.hPutStrLn outH
        ("  paw " <> petName pet <> badge <> " — a "
         <> T.pack (show (petAgeYears pet))
         <> "-year-old "
         <> T.toLower (petBreed pet)
         <> " who is " <> tagPhrase <> ".")
    _ -> do
      TIO.hPutStrLn outH ("  " <> petName pet <> badge <> "  [" <> petSlug pet <> "]")
      TIO.hPutStrLn outH ("    " <> petBreed pet <> ", "
                            <> T.pack (show (petAgeYears pet))
                            <> " years old")
      TIO.hPutStrLn outH ("    Tags: " <> T.intercalate ", " (petTags pet))
      hPutStrLn outH ""

renderMatchedPet :: Handle -> Pet -> IO ()
renderMatchedPet outH pet =
  TIO.hPutStrLn outH
    ("  • " <> petName pet
     <> " (" <> petBreed pet <> ", "
     <> T.pack (show (petAgeYears pet)) <> "y) — "
     <> T.intercalate ", " (petTags pet))

renderCharity :: Handle -> Bool -> Charity -> IO ()
renderCharity outH showRatings c = do
  TIO.hPutStrLn outH ("  " <> charityName c <> "  [" <> charitySlug c <> "]")
  TIO.hPutStrLn outH ("    Focus: " <> charityFocus c)
  TIO.hPutStrLn outH ("    " <> charityDescription c)
  TIO.hPutStrLn outH ("    Donate: " <> charityUrl c)
  if showRatings
    then TIO.hPutStrLn outH ("    Rating: " <> charityRatingNote c)
    else pure ()

-- | We do not actually shell out to a browser from tests — the CLI prints
-- the URL instead. Real shipping code would call @open@/@xdg-open@/@start@.
openUrlNoop :: Handle -> Text -> IO ExitCode
openUrlNoop outH url = do
  TIO.hPutStrLn outH ("Would open: " <> url)
  pure ExitSuccess

-- ────────────────────────────────────────────────────────────────────
-- Match helpers
-- ────────────────────────────────────────────────────────────────────

popularityTags :: [Text]
popularityTags = ["social", "good-with-kids", "calm", "mellow", "gentle"]

-- Ordered (factor flag, [matching pet tags]) tuples. The 'matchQuizDepth'
-- variant controls how many factors are considered.
allFactors :: [(Text, [Text])]
allFactors =
  [ ("has-kids",       ["good-with-kids", "gentle"])
  , ("quiet-home",     ["mellow", "calm", "solo", "lap-cat"])
  , ("active",         ["high-energy", "playful"])
  , ("first-time",     ["gentle", "calm", "low-energy"])
  , ("multiple-pets",  ["social"])
  , ("small-home",     ["lap-cat", "solo", "low-energy"])
  ]

factorsForDepth :: Text -> [(Text, [Text])]
factorsForDepth depth =
  let take' n = Prelude.take n allFactors
  in case depth of
       "short"    -> take' 2
       "thorough" -> take' 6
       _          -> take' 4

preferenceMatches :: MatchPrefs -> Text -> Bool
preferenceMatches p = \case
  "has-kids"      -> mpHasKids p
  "quiet-home"    -> mpQuietHome p
  "active"        -> mpActive p
  "first-time"    -> mpFirstTime p
  "multiple-pets" -> mpMultiplePets p
  "small-home"    -> mpSmallHome p
  _               -> False

anyPref :: MatchPrefs -> Bool
anyPref p =
  mpHasKids p || mpQuietHome p || mpActive p
  || mpFirstTime p || mpMultiplePets p || mpSmallHome p

-- | Sort a list of pets by an Int projection ascending. Used with 'reverse'
-- for descending order (no extra dependency on Data.Ord.Down).
sortBy :: (Pet -> Int) -> [Pet] -> [Pet]
sortBy key = foldr insert []
  where
    insert x []       = [x]
    insert x (y : ys)
      | key x <= key y = x : y : ys
      | otherwise      = y : insert x ys

-- | Sort by how many of the given tags each pet has.
sortByTagCount :: [Text] -> [Pet] -> [Pet]
sortByTagCount tags = sortBy (tagCount tags)

tagCount :: [Text] -> Pet -> Int
tagCount tags pet = length (filter (`elem` tags) (petTags pet))
