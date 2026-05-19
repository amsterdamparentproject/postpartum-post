-- Change language column from a single enum value to a text array, so members
-- can indicate all languages they're comfortable matching in.
--
-- Existing rows: a non-null value is wrapped in a single-element array.
-- NULL rows remain NULL (no preference).
ALTER TABLE postpartumpost.members
  ALTER COLUMN language TYPE text[]
  USING CASE
    WHEN language IS NULL THEN NULL
    ELSE ARRAY[language::text]
  END;

-- The enum is no longer referenced by any column; drop it.
DROP TYPE IF EXISTS postpartumpost.language;
