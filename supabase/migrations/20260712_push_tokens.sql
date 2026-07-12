-- Expo push notification tokens for staff (reps + drivers)
ALTER TABLE staff ADD COLUMN IF NOT EXISTS push_token TEXT;
