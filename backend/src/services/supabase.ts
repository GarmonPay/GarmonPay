/**
 * Supabase client (service role for server operations).
 * Requires: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */
import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  console.warn('Supabase env SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required');
}

export const supabase = url && key ? createClient(url, key) : null;
