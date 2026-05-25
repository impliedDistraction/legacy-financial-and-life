-- Fix SECURITY DEFINER advisory on join_variant_metrics view.
-- Setting security_invoker = true ensures the view respects RLS policies
-- of the calling user rather than bypassing them as the view owner (postgres).
ALTER VIEW public.join_variant_metrics SET (security_invoker = true);
