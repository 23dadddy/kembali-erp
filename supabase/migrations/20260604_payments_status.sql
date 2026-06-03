-- Migration: add status column to payments table for customer payment notifications
-- Run this in Supabase SQL Editor

-- Add status column to payments (pending_verification → verified → reconciled)
ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'verified'
    CHECK (status IN ('pending_verification', 'verified', 'reconciled', 'rejected'));

-- Backfill existing rows as verified
UPDATE payments SET status = 'verified' WHERE status IS NULL;

-- Grant access
GRANT SELECT, INSERT, UPDATE ON payments TO anon, authenticated;
