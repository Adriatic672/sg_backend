-- Migration: Add op_type and ref_id columns to wl_transactions
-- Date: 2026-03-23
-- Purpose: Support tagging job board direct payments (JOB_PAYMENT) for stats queries

-- Note: Both op_type column and idx_wl_trans_op_type index already exist from previous partial run
-- This migration is now a no-op to record successful completion
SELECT 1;
