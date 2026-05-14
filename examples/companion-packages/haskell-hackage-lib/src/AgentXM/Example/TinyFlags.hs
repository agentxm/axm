{-# LANGUAGE OverloadedStrings #-}
{-# LANGUAGE LambdaCase #-}

-- |
-- Module      : AgentXM.Example.TinyFlags
-- Description : Tiny feature-flag library used by AXM companion package examples.
-- License     : MIT
--
-- @TinyFlags@ is a minimal feature-flag library with deterministic rollout
-- bucketing.
--
-- Two flag kinds:
--
--   * 'BooleanFlag' — on\/off with optional percentage rollout (0..100).
--   * 'VariantFlag' — a named treatment with optional per-variant
--     percentage allocations.
--
-- The evaluation context is a 'Context' carrying an optional id field
-- (one of @userId@, @accountId@, or @sessionId@). Rollout bucketing uses
-- SHA-1 over @"\<flag-name\>:\<context-id\>"@ folded into the @0..99@ range,
-- so a given context-id receives a stable rollout decision.
module AgentXM.Example.TinyFlags
  ( -- * Flag definitions
    BooleanFlag
  , booleanFlag
  , booleanFlagDefault
  , booleanFlagRollout
  , VariantFlag
  , variantFlag
  , variantFlagVariants
  , variantFlagDefault
  , variantFlagRollout
  , Flag (..)
    -- * Registry
  , Registry
  , registry
  , registryNames
  , registryMember
  , enabled
  , variant
  , evaluate
  , Evaluation (..)
    -- * Context
  , Context (..)
  , anonymousContext
  , contextId
    -- * Bucketing
  , bucket
    -- * Errors
  , TinyFlagsError (..)
  ) where

import qualified Crypto.Hash.SHA1 as SHA1
import qualified Data.ByteString.Base16 as B16
import qualified Data.ByteString.Char8 as BSC
import           Data.List (nub)
import           Data.Map.Strict (Map)
import qualified Data.Map.Strict as Map
import           Data.Text (Text)
import qualified Data.Text as T
import qualified Data.Text.Encoding as TE
import           Numeric (readHex)

-- | Errors returned by the @TinyFlags@ smart constructors and evaluators.
data TinyFlagsError
  = -- | Boolean rollout was outside @0..100@.
    BooleanRolloutOutOfRange Int
  | -- | Variant rollout for a single allocation was outside @0..100@.
    VariantRolloutOutOfRange Text Int
  | -- | Variant list was empty.
    EmptyVariants
  | -- | Variants contained duplicates or empty strings.
    InvalidVariants [Text]
  | -- | Default referenced a variant not in the list.
    UnknownDefault Text
  | -- | Rollout map referenced a variant not in the list.
    UnknownVariantInRollout Text
  | -- | Variant rollout percentages summed above 100.
    VariantRolloutTotalExceeded Int
  | -- | Lookup against an unknown flag name.
    UnknownFlag Text
  | -- | Requested boolean evaluation on a variant flag (or vice versa).
    WrongFlagKind Text
  deriving (Eq, Show)

-- | A boolean flag with an explicit default and an optional rollout (0..100).
data BooleanFlag = BooleanFlag
  { booleanFlagDefault :: !Bool
  , booleanFlagRollout :: !(Maybe Int)
  } deriving (Eq, Show)

-- | Smart constructor for 'BooleanFlag'.
booleanFlag :: Bool -> Maybe Int -> Either TinyFlagsError BooleanFlag
booleanFlag def Nothing = Right (BooleanFlag def Nothing)
booleanFlag def (Just p)
  | p < 0 || p > 100 = Left (BooleanRolloutOutOfRange p)
  | otherwise        = Right (BooleanFlag def (Just p))

-- | A variant flag with an allow-list, a default, and an optional rollout map.
data VariantFlag = VariantFlag
  { variantFlagVariants :: ![Text]
  , variantFlagDefault  :: !Text
  , variantFlagRollout  :: !(Maybe [(Text, Int)])
  } deriving (Eq, Show)

-- | Smart constructor for 'VariantFlag'. The rollout list is order-significant —
-- allocations are walked in order to bucket a context into a variant.
variantFlag :: [Text] -> Text -> Maybe [(Text, Int)] -> Either TinyFlagsError VariantFlag
variantFlag vs def rollout
  | null vs = Left EmptyVariants
  | any T.null vs || length (nub vs) /= length vs =
      Left (InvalidVariants vs)
  | def `notElem` vs = Left (UnknownDefault def)
  | otherwise =
      case rollout of
        Nothing -> Right (VariantFlag vs def Nothing)
        Just allocs -> do
          mapM_ checkAllocation allocs
          let total = sum (map snd allocs)
          if total > 100
            then Left (VariantRolloutTotalExceeded total)
            else Right (VariantFlag vs def (Just allocs))
  where
    checkAllocation (name, percentage)
      | name `notElem` vs = Left (UnknownVariantInRollout name)
      | percentage < 0 || percentage > 100 =
          Left (VariantRolloutOutOfRange name percentage)
      | otherwise = Right ()

-- | A flag is either boolean-shaped or variant-shaped.
data Flag = FBool BooleanFlag | FVariant VariantFlag
  deriving (Eq, Show)

-- | A frozen set of flag definitions evaluated against a 'Context'.
newtype Registry = Registry { unRegistry :: Map Text Flag }
  deriving (Eq, Show)

-- | Construct a 'Registry' from a list of @(name, flag)@ pairs. Later
-- entries shadow earlier ones with the same name.
registry :: [(Text, Flag)] -> Registry
registry = Registry . Map.fromList

-- | All flag names registered in this 'Registry'.
registryNames :: Registry -> [Text]
registryNames = Map.keys . unRegistry

-- | Is @name@ registered?
registryMember :: Text -> Registry -> Bool
registryMember name = Map.member name . unRegistry

-- | The result of 'evaluate' — either a boolean or a variant.
data Evaluation = EBool Bool | EVariant Text
  deriving (Eq, Show)

-- | Evaluation context. All fields are optional. The first non-empty id
-- (in order: 'ctxUserId', 'ctxAccountId', 'ctxSessionId') seeds bucketing.
data Context = Context
  { ctxUserId    :: !(Maybe Text)
  , ctxAccountId :: !(Maybe Text)
  , ctxSessionId :: !(Maybe Text)
  } deriving (Eq, Show)

-- | Context with no identifying fields. Bucketing falls back to "anonymous".
anonymousContext :: Context
anonymousContext = Context Nothing Nothing Nothing

-- | Resolve the bucketing key for a context.
contextId :: Context -> Text
contextId ctx =
  firstNonEmpty
    [ ctxUserId ctx
    , ctxAccountId ctx
    , ctxSessionId ctx
    ]
  where
    firstNonEmpty [] = "anonymous"
    firstNonEmpty (Nothing : rest) = firstNonEmpty rest
    firstNonEmpty (Just t : rest)
      | T.null t  = firstNonEmpty rest
      | otherwise = t

-- | Deterministic bucket in @0..99@ for a @(flag-name, context-id)@ pair.
bucket :: Text -> Context -> Int
bucket flagName ctx =
  let key = TE.encodeUtf8 (flagName <> ":" <> contextId ctx)
      digest = SHA1.hash key
      hexed = BSC.unpack (B16.encode digest)
      first8 = take 8 hexed
  in case readHex first8 of
       ((n, _) : _) -> fromInteger (n `mod` 100)
       _            -> 0

-- | Evaluate a boolean flag against a context.
enabled :: Registry -> Text -> Context -> Either TinyFlagsError Bool
enabled reg name ctx = do
  flag <- lookupFlag reg name
  case flag of
    FBool (BooleanFlag def Nothing) -> Right def
    FBool (BooleanFlag _ (Just p))  -> Right (bucket name ctx < p)
    FVariant _                      -> Left (WrongFlagKind name)

-- | Evaluate a variant flag against a context.
variant :: Registry -> Text -> Context -> Either TinyFlagsError Text
variant reg name ctx = do
  flag <- lookupFlag reg name
  case flag of
    FBool _ -> Left (WrongFlagKind name)
    FVariant (VariantFlag _ def Nothing) -> Right def
    FVariant (VariantFlag _ def (Just allocs)) ->
      Right (pickVariant (bucket name ctx) def allocs)

-- | Walk allocations in order; first one whose cumulative upper bound
-- exceeds the bucket wins. Falls back to the declared default.
pickVariant :: Int -> Text -> [(Text, Int)] -> Text
pickVariant b def =
  go 0
  where
    go _ [] = def
    go acc ((name, pct) : rest) =
      let upper = acc + pct
      in if b < upper then name else go upper rest

-- | Polymorphic evaluation — returns whichever shape the flag is.
evaluate :: Registry -> Text -> Context -> Either TinyFlagsError Evaluation
evaluate reg name ctx = do
  flag <- lookupFlag reg name
  case flag of
    FBool _    -> EBool <$> enabled reg name ctx
    FVariant _ -> EVariant <$> variant reg name ctx

lookupFlag :: Registry -> Text -> Either TinyFlagsError Flag
lookupFlag reg name =
  maybe (Left (UnknownFlag name)) Right (Map.lookup name (unRegistry reg))
