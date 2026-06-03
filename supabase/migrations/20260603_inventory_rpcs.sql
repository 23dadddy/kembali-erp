-- ============================================================
-- Critical: inventory RPC functions used by delivery completion
-- Without these, bottle inventory won't update when deliveries finish.
-- Run in Supabase Dashboard → SQL Editor
-- ============================================================

-- increment_inventory: safely add to a bottle_inventory row
CREATE OR REPLACE FUNCTION increment_inventory(
  p_size text,
  p_status text,
  p_qty int
) RETURNS void AS $$
BEGIN
  UPDATE bottle_inventory
  SET quantity = GREATEST(0, quantity + p_qty),
      updated_at = now()
  WHERE bottle_size = p_size AND status = p_status;

  -- If no row exists, insert it
  IF NOT FOUND THEN
    INSERT INTO bottle_inventory (bottle_size, status, quantity)
    VALUES (p_size, p_status, GREATEST(0, p_qty))
    ON CONFLICT (bottle_size, status) DO UPDATE
    SET quantity = GREATEST(0, bottle_inventory.quantity + p_qty),
        updated_at = now();
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- decrement_inventory: safely subtract from a bottle_inventory row (floor at 0)
CREATE OR REPLACE FUNCTION decrement_inventory(
  p_size text,
  p_status text,
  p_qty int
) RETURNS void AS $$
BEGIN
  UPDATE bottle_inventory
  SET quantity = GREATEST(0, quantity - p_qty),
      updated_at = now()
  WHERE bottle_size = p_size AND status = p_status;

  IF NOT FOUND THEN
    INSERT INTO bottle_inventory (bottle_size, status, quantity)
    VALUES (p_size, p_status, 0)
    ON CONFLICT (bottle_size, status) DO NOTHING;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Ensure bottle_inventory has a unique constraint on (bottle_size, status)
-- so the ON CONFLICT clause above works
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'bottle_inventory_size_status_key'
  ) THEN
    ALTER TABLE bottle_inventory ADD CONSTRAINT bottle_inventory_size_status_key UNIQUE (bottle_size, status);
  END IF;
END $$;

-- Seed initial rows if table is empty (6 statuses × 2 sizes = 12 rows)
INSERT INTO bottle_inventory (bottle_size, status, quantity)
SELECT s.size, s.status, 0
FROM (VALUES
  ('350ml', 'filled'), ('350ml', 'at_customer'), ('350ml', 'dirty'),
  ('350ml', 'cleaning'), ('350ml', 'clean_empty'), ('350ml', 'damaged'),
  ('750ml', 'filled'), ('750ml', 'at_customer'), ('750ml', 'dirty'),
  ('750ml', 'cleaning'), ('750ml', 'clean_empty'), ('750ml', 'damaged')
) AS s(size, status)
ON CONFLICT (bottle_size, status) DO NOTHING;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION increment_inventory(text, text, int) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION decrement_inventory(text, text, int) TO anon, authenticated;
