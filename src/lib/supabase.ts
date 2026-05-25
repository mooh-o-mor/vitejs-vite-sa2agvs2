import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://otjiwxvszomwpqmwusqd.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_P2rqYUz4DyEuwEiFGs3nBQ_s1DK3JXh";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Admin client — bypasses RLS for internal vessel_dpr reads (internal tool only)
const _svcKey = import.meta.env.VITE_SUPABASE_SERVICE_KEY as string | undefined;
export const supabaseAdmin = _svcKey
  ? createClient(SUPABASE_URL, _svcKey)
  : supabase; // fallback to anon if key not configured
