-- Add brand color columns to company_settings
-- These colors are used for external-facing communications (emails, customer portals)
-- Similar to user avatar color selection, but for company branding

-- Primary brand color (main accent color - buttons, headers)
ALTER TABLE public.company_settings ADD COLUMN IF NOT EXISTS brand_color_primary TEXT DEFAULT '#8B5CF6';

-- Secondary brand color (action required banners, success states)
ALTER TABLE public.company_settings ADD COLUMN IF NOT EXISTS brand_color_secondary TEXT DEFAULT '#94AF32';

-- Tertiary brand color (links, accents)
ALTER TABLE public.company_settings ADD COLUMN IF NOT EXISTS brand_color_tertiary TEXT DEFAULT '#3B82F6';

-- Comments for documentation
COMMENT ON COLUMN public.company_settings.brand_color_primary IS 'Primary brand color for external communications (headers, accent borders). Hex format #RRGGBB';
COMMENT ON COLUMN public.company_settings.brand_color_secondary IS 'Secondary brand color for external communications (action banners, CTA buttons). Hex format #RRGGBB';
COMMENT ON COLUMN public.company_settings.brand_color_tertiary IS 'Tertiary brand color for external communications (links, subtle accents). Hex format #RRGGBB';

-- Success message
DO $$
BEGIN
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Brand color columns added to company_settings!';
  RAISE NOTICE '========================================';
  RAISE NOTICE 'New columns:';
  RAISE NOTICE '  - brand_color_primary (default: #8B5CF6 violet)';
  RAISE NOTICE '  - brand_color_secondary (default: #94AF32 olive green)';
  RAISE NOTICE '  - brand_color_tertiary (default: #3B82F6 blue)';
  RAISE NOTICE '========================================';
END $$;
