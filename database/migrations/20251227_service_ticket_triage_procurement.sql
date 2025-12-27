-- ============================================================
-- SERVICE TICKET TRIAGE & PROCUREMENT SYSTEM
-- Adds triage tracking, parts management, and procurement to service tickets
-- ============================================================

-- ============================================================
-- PART 1: Add triage fields to service_tickets
-- ============================================================

DO $$
BEGIN
  -- Triage tracking fields
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'service_tickets' AND column_name = 'triaged_by') THEN
    ALTER TABLE service_tickets ADD COLUMN triaged_by UUID;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'service_tickets' AND column_name = 'triaged_by_name') THEN
    ALTER TABLE service_tickets ADD COLUMN triaged_by_name TEXT;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'service_tickets' AND column_name = 'triaged_at') THEN
    ALTER TABLE service_tickets ADD COLUMN triaged_at TIMESTAMPTZ;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'service_tickets' AND column_name = 'triage_notes') THEN
    ALTER TABLE service_tickets ADD COLUMN triage_notes TEXT;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'service_tickets' AND column_name = 'estimated_hours') THEN
    ALTER TABLE service_tickets ADD COLUMN estimated_hours NUMERIC;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'service_tickets' AND column_name = 'parts_needed') THEN
    ALTER TABLE service_tickets ADD COLUMN parts_needed BOOLEAN DEFAULT FALSE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'service_tickets' AND column_name = 'proposal_needed') THEN
    ALTER TABLE service_tickets ADD COLUMN proposal_needed BOOLEAN DEFAULT FALSE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'service_tickets' AND column_name = 'proposal_url') THEN
    ALTER TABLE service_tickets ADD COLUMN proposal_url TEXT;
  END IF;
END $$;

-- Add check constraint for estimated_hours
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.check_constraints
    WHERE constraint_name = 'service_tickets_estimated_hours_check'
  ) THEN
    ALTER TABLE service_tickets ADD CONSTRAINT service_tickets_estimated_hours_check
      CHECK (estimated_hours IS NULL OR estimated_hours >= 0);
  END IF;
END $$;

-- Add comments for documentation
COMMENT ON COLUMN service_tickets.triaged_by IS 'UUID of user who performed triage';
COMMENT ON COLUMN service_tickets.triaged_by_name IS 'Name of user who performed triage';
COMMENT ON COLUMN service_tickets.triaged_at IS 'When triage was performed';
COMMENT ON COLUMN service_tickets.triage_notes IS 'Notes from triage assessment';
COMMENT ON COLUMN service_tickets.estimated_hours IS 'Estimated hours to complete service (in 0.5 increments)';
COMMENT ON COLUMN service_tickets.parts_needed IS 'Whether parts are required for this service';
COMMENT ON COLUMN service_tickets.proposal_needed IS 'Whether a proposal needs to be sent to customer';
COMMENT ON COLUMN service_tickets.proposal_url IS 'URL to customer proposal if generated';

-- ============================================================
-- PART 2: Create service_ticket_parts table
-- Parts/equipment needed for service tickets
-- ============================================================

CREATE TABLE IF NOT EXISTS public.service_ticket_parts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES public.service_tickets(id) ON DELETE CASCADE,
  global_part_id UUID REFERENCES public.global_parts(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  part_number TEXT,
  manufacturer TEXT,
  description TEXT,
  quantity_needed INTEGER NOT NULL DEFAULT 1 CHECK (quantity_needed > 0),
  quantity_ordered INTEGER NOT NULL DEFAULT 0 CHECK (quantity_ordered >= 0),
  quantity_received INTEGER NOT NULL DEFAULT 0 CHECK (quantity_received >= 0),
  quantity_delivered INTEGER NOT NULL DEFAULT 0 CHECK (quantity_delivered >= 0),
  unit_cost NUMERIC NOT NULL DEFAULT 0 CHECK (unit_cost >= 0),
  status TEXT NOT NULL DEFAULT 'needed' CHECK (status IN (
    'needed',      -- Part identified as needed
    'ordered',     -- Part has been ordered
    'received',    -- Part received at warehouse/office
    'delivered',   -- Part delivered to job site
    'installed',   -- Part installed
    'cancelled'    -- Part no longer needed
  )),
  notes TEXT,
  added_by UUID,
  added_by_name TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add indexes
CREATE INDEX IF NOT EXISTS idx_service_ticket_parts_ticket ON public.service_ticket_parts(ticket_id);
CREATE INDEX IF NOT EXISTS idx_service_ticket_parts_status ON public.service_ticket_parts(status);
CREATE INDEX IF NOT EXISTS idx_service_ticket_parts_global_part ON public.service_ticket_parts(global_part_id);

-- Add comments
COMMENT ON TABLE public.service_ticket_parts IS 'Parts and equipment required for service tickets';
COMMENT ON COLUMN public.service_ticket_parts.status IS 'Part status: needed → ordered → received → delivered → installed';

-- ============================================================
-- PART 3: Create service_ticket_purchase_orders table
-- Purchase orders specific to service tickets
-- ============================================================

CREATE TABLE IF NOT EXISTS public.service_ticket_purchase_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES public.service_tickets(id) ON DELETE CASCADE,
  supplier_id UUID NOT NULL REFERENCES public.suppliers(id) ON DELETE RESTRICT,
  po_number TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN (
    'draft',              -- Being created
    'submitted',          -- Sent to supplier
    'confirmed',          -- Supplier confirmed
    'partially_received', -- Some items received
    'received',           -- All items received
    'cancelled'           -- Order cancelled
  )),
  order_date DATE NOT NULL DEFAULT CURRENT_DATE,
  requested_delivery_date DATE,
  expected_delivery_date DATE,
  actual_delivery_date DATE,
  subtotal NUMERIC NOT NULL DEFAULT 0,
  tax_amount NUMERIC NOT NULL DEFAULT 0,
  shipping_cost NUMERIC NOT NULL DEFAULT 0,
  total_amount NUMERIC NOT NULL DEFAULT 0,
  ship_to_address TEXT,
  ship_to_contact TEXT,
  ship_to_phone TEXT,
  internal_notes TEXT,
  supplier_notes TEXT,
  created_by UUID,
  created_by_name TEXT,
  submitted_by UUID,
  submitted_by_name TEXT,
  submitted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add indexes
CREATE INDEX IF NOT EXISTS idx_service_ticket_pos_ticket ON public.service_ticket_purchase_orders(ticket_id);
CREATE INDEX IF NOT EXISTS idx_service_ticket_pos_supplier ON public.service_ticket_purchase_orders(supplier_id);
CREATE INDEX IF NOT EXISTS idx_service_ticket_pos_status ON public.service_ticket_purchase_orders(status);
CREATE INDEX IF NOT EXISTS idx_service_ticket_pos_po_number ON public.service_ticket_purchase_orders(po_number);

-- Add comments
COMMENT ON TABLE public.service_ticket_purchase_orders IS 'Purchase orders for service ticket parts';

-- ============================================================
-- PART 4: Create service_ticket_po_items table
-- Line items for service ticket purchase orders
-- ============================================================

CREATE TABLE IF NOT EXISTS public.service_ticket_po_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  po_id UUID NOT NULL REFERENCES public.service_ticket_purchase_orders(id) ON DELETE CASCADE,
  part_id UUID REFERENCES public.service_ticket_parts(id) ON DELETE SET NULL,
  line_number INTEGER NOT NULL,
  name TEXT NOT NULL,
  part_number TEXT,
  quantity_ordered INTEGER NOT NULL CHECK (quantity_ordered > 0),
  quantity_received INTEGER NOT NULL DEFAULT 0 CHECK (quantity_received >= 0),
  unit_cost NUMERIC NOT NULL DEFAULT 0 CHECK (unit_cost >= 0),
  line_total NUMERIC GENERATED ALWAYS AS (quantity_ordered * unit_cost) STORED,
  notes TEXT,
  received_by UUID,
  received_by_name TEXT,
  received_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT service_po_items_received_check CHECK (quantity_received <= quantity_ordered)
);

-- Add indexes
CREATE INDEX IF NOT EXISTS idx_service_ticket_po_items_po ON public.service_ticket_po_items(po_id);
CREATE INDEX IF NOT EXISTS idx_service_ticket_po_items_part ON public.service_ticket_po_items(part_id);

-- Add comments
COMMENT ON TABLE public.service_ticket_po_items IS 'Line items for service ticket purchase orders';

-- ============================================================
-- PART 5: Create PO number sequence for service tickets
-- ============================================================

CREATE TABLE IF NOT EXISTS public.service_po_sequence (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  year INTEGER NOT NULL,
  sequence INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT service_po_sequence_year_unique UNIQUE (year)
);

-- Function to generate service PO number
CREATE OR REPLACE FUNCTION generate_service_po_number(p_supplier_id UUID)
RETURNS TEXT AS $$
DECLARE
  v_year INTEGER;
  v_seq INTEGER;
  v_supplier_code TEXT;
  v_po_number TEXT;
BEGIN
  v_year := EXTRACT(YEAR FROM CURRENT_DATE);

  -- Get supplier short code
  SELECT short_code INTO v_supplier_code
  FROM suppliers
  WHERE id = p_supplier_id;

  IF v_supplier_code IS NULL THEN
    v_supplier_code := 'XXX';
  END IF;

  -- Get and increment sequence
  INSERT INTO service_po_sequence (year, sequence)
  VALUES (v_year, 1)
  ON CONFLICT (year)
  DO UPDATE SET sequence = service_po_sequence.sequence + 1, updated_at = NOW()
  RETURNING sequence INTO v_seq;

  -- Format: SPO-YYYY-NNNN-SUP (e.g., SPO-2025-0001-ABC)
  v_po_number := 'SPO-' || v_year || '-' || LPAD(v_seq::TEXT, 4, '0') || '-' || v_supplier_code;

  RETURN v_po_number;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- PART 6: Row Level Security
-- ============================================================

ALTER TABLE public.service_ticket_parts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_ticket_purchase_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_ticket_po_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_po_sequence ENABLE ROW LEVEL SECURITY;

-- Service ticket parts policies
DROP POLICY IF EXISTS service_ticket_parts_read_all ON public.service_ticket_parts;
CREATE POLICY service_ticket_parts_read_all ON public.service_ticket_parts
  FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS service_ticket_parts_write_auth ON public.service_ticket_parts;
CREATE POLICY service_ticket_parts_write_auth ON public.service_ticket_parts
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS service_ticket_parts_write_anon ON public.service_ticket_parts;
CREATE POLICY service_ticket_parts_write_anon ON public.service_ticket_parts
  FOR ALL TO anon USING (true) WITH CHECK (true);

-- Service ticket PO policies
DROP POLICY IF EXISTS service_ticket_pos_read_all ON public.service_ticket_purchase_orders;
CREATE POLICY service_ticket_pos_read_all ON public.service_ticket_purchase_orders
  FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS service_ticket_pos_write_auth ON public.service_ticket_purchase_orders;
CREATE POLICY service_ticket_pos_write_auth ON public.service_ticket_purchase_orders
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS service_ticket_pos_write_anon ON public.service_ticket_purchase_orders;
CREATE POLICY service_ticket_pos_write_anon ON public.service_ticket_purchase_orders
  FOR ALL TO anon USING (true) WITH CHECK (true);

-- Service ticket PO items policies
DROP POLICY IF EXISTS service_ticket_po_items_read_all ON public.service_ticket_po_items;
CREATE POLICY service_ticket_po_items_read_all ON public.service_ticket_po_items
  FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS service_ticket_po_items_write_auth ON public.service_ticket_po_items;
CREATE POLICY service_ticket_po_items_write_auth ON public.service_ticket_po_items
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS service_ticket_po_items_write_anon ON public.service_ticket_po_items;
CREATE POLICY service_ticket_po_items_write_anon ON public.service_ticket_po_items
  FOR ALL TO anon USING (true) WITH CHECK (true);

-- Service PO sequence policies
DROP POLICY IF EXISTS service_po_sequence_read_all ON public.service_po_sequence;
CREATE POLICY service_po_sequence_read_all ON public.service_po_sequence
  FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS service_po_sequence_write_all ON public.service_po_sequence;
CREATE POLICY service_po_sequence_write_all ON public.service_po_sequence
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- ============================================================
-- PART 7: Update timestamps triggers
-- ============================================================

CREATE OR REPLACE FUNCTION update_service_ticket_parts_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_service_ticket_parts_timestamp ON public.service_ticket_parts;
CREATE TRIGGER trigger_update_service_ticket_parts_timestamp
  BEFORE UPDATE ON public.service_ticket_parts
  FOR EACH ROW
  EXECUTE FUNCTION update_service_ticket_parts_timestamp();

CREATE OR REPLACE FUNCTION update_service_ticket_pos_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_service_ticket_pos_timestamp ON public.service_ticket_purchase_orders;
CREATE TRIGGER trigger_update_service_ticket_pos_timestamp
  BEFORE UPDATE ON public.service_ticket_purchase_orders
  FOR EACH ROW
  EXECUTE FUNCTION update_service_ticket_pos_timestamp();

DROP TRIGGER IF EXISTS trigger_update_service_ticket_po_items_timestamp ON public.service_ticket_po_items;
CREATE TRIGGER trigger_update_service_ticket_po_items_timestamp
  BEFORE UPDATE ON public.service_ticket_po_items
  FOR EACH ROW
  EXECUTE FUNCTION update_service_ticket_pos_timestamp();

-- ============================================================
-- DONE
-- ============================================================
SELECT 'Service ticket triage and procurement tables created successfully!' as status;
