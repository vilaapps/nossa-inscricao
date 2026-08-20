import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.PUBLIC_SUPABASE_URL || process.env.PUBLIC_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.PUBLIC_SUPABASE_ANON_KEY || process.env.PUBLIC_SUPABASE_ANON_KEY;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || import.meta.env.SUPABASE_SERVICE_ROLE_KEY;

export const isServiceRoleConfigured = Boolean(supabaseServiceRoleKey);

if (!supabaseUrl || !supabaseServiceRoleKey) {
}

/**
 * Client do Supabase Admin para chamadas server-side.
 * Usa a service_role key se disponível, ou fallback para anonKey se ausente.
 */
export const supabaseAdmin = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseServiceRoleKey || supabaseAnonKey || 'placeholder-key',
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  }
);

export const SUPABASE_BUCKET_NAME = import.meta.env.PUBLIC_SUPABASE_BUCKET_NAME || process.env.PUBLIC_SUPABASE_BUCKET_NAME || 'events';
