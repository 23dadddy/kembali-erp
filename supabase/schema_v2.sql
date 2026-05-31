-- Kembali Water ERP — Schema v2
-- Run this in Supabase SQL Editor after schema.sql

-- ── Add signature + damaged fields to deliveries ──────────────────────────────
ALTER TABLE deliveries
  ADD COLUMN IF NOT EXISTS damaged_350ml INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS damaged_750ml INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS signature_data TEXT,            -- base64 PNG
  ADD COLUMN IF NOT EXISTS signature_confirmed_by TEXT,    -- customer contact name
  ADD COLUMN IF NOT EXISTS confirmed_at TIMESTAMPTZ;

-- ── Customer bottle account (running balance view) ────────────────────────────
-- Tracks cumulative delivered vs returned per customer per bottle size
CREATE OR REPLACE VIEW customer_bottle_balance AS
SELECT
  c.id AS customer_id,
  c.name AS customer_name,
  c.type AS customer_type,
  c.city,

  -- 350ml
  COALESCE(SUM(d.delivered_350ml), 0)                            AS total_delivered_350ml,
  COALESCE(SUM(d.collected_350ml), 0)                           AS total_returned_350ml,
  COALESCE(SUM(d.damaged_350ml), 0)                             AS total_damaged_350ml,
  COALESCE(SUM(d.delivered_350ml), 0)
    - COALESCE(SUM(d.collected_350ml), 0)                       AS outstanding_350ml,

  -- 750ml
  COALESCE(SUM(d.delivered_750ml), 0)                           AS total_delivered_750ml,
  COALESCE(SUM(d.collected_750ml), 0)                           AS total_returned_750ml,
  COALESCE(SUM(d.damaged_750ml), 0)                             AS total_damaged_750ml,
  COALESCE(SUM(d.delivered_750ml), 0)
    - COALESCE(SUM(d.collected_750ml), 0)                       AS outstanding_750ml,

  -- 8% threshold amounts
  ROUND(COALESCE(SUM(d.delivered_350ml), 0) * 0.08)             AS threshold_350ml,
  ROUND(COALESCE(SUM(d.delivered_750ml), 0) * 0.08)             AS threshold_750ml,

  -- Chargeable lost bottles (outstanding minus 8% threshold, floored at 0)
  GREATEST(0,
    COALESCE(SUM(d.delivered_350ml), 0)
    - COALESCE(SUM(d.collected_350ml), 0)
    - ROUND(COALESCE(SUM(d.delivered_350ml), 0) * 0.08)
  )                                                              AS chargeable_lost_350ml,
  GREATEST(0,
    COALESCE(SUM(d.delivered_750ml), 0)
    - COALESCE(SUM(d.collected_750ml), 0)
    - ROUND(COALESCE(SUM(d.delivered_750ml), 0) * 0.08)
  )                                                              AS chargeable_lost_750ml

FROM customers c
LEFT JOIN deliveries d
  ON d.customer_id = c.id
  AND d.status = 'completed'
GROUP BY c.id, c.name, c.type, c.city;

-- ── Monthly delivery summary view (for invoice generation) ────────────────────
CREATE OR REPLACE VIEW monthly_delivery_summary AS
SELECT
  customer_id,
  DATE_TRUNC('month', delivery_date::TIMESTAMPTZ) AS month,
  SUM(delivered_350ml) AS delivered_350ml,
  SUM(delivered_750ml) AS delivered_750ml,
  SUM(collected_350ml) AS collected_350ml,
  SUM(collected_750ml) AS collected_750ml,
  SUM(damaged_350ml)   AS damaged_350ml,
  SUM(damaged_750ml)   AS damaged_750ml,
  COUNT(*) AS delivery_count
FROM deliveries
WHERE status = 'completed'
GROUP BY customer_id, DATE_TRUNC('month', delivery_date::TIMESTAMPTZ);

-- ── Standing orders (what each customer receives per delivery visit) ───────────
-- Update orders to add a "par level" concept
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS par_350ml INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS par_750ml INTEGER DEFAULT 0;

-- ── Grant anon access to new views ───────────────────────────────────────────
GRANT SELECT ON customer_bottle_balance TO anon;
GRANT SELECT ON monthly_delivery_summary TO anon;
