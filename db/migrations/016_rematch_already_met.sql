-- Migration 016: add 'already_met' to rematch_reason enum
--
-- Covers the case where both members of a couple (or friends) sign up
-- and are matched together despite knowing each other.

alter type postpartumpost.rematch_reason add value if not exists 'already_met';
