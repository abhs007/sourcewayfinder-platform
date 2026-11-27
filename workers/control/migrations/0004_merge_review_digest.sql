-- Merge approval must bind the exact authorized test result, not code alone.
ALTER TABLE proposals ADD COLUMN merge_digest TEXT;
