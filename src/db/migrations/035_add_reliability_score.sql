-- Add dedicated reliability_score column to users_profile.
-- Kept separate from influencer_rating so the internal score
-- does not pollute the user-facing star rating.
ALTER TABLE users_profile
  ADD COLUMN reliability_score          DECIMAL(4,2)  DEFAULT NULL AFTER influencer_rating,
  ADD COLUMN reliability_score_updated_at DATETIME    DEFAULT NULL AFTER reliability_score;
