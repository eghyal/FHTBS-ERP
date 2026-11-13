import { createClient } from '@supabase/supabase-js';

const DEFAULT_SUPABASE_URL = 'https://wxyfgfqaiqrfeofxemgu.supabase.co';
const DEFAULT_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_nFlOHMTWhFzBLKTwdcAVsg_Qk_o3FND';

const metaEnv = typeof import.meta !== 'undefined' && (import.meta as any).env ? (import.meta as any).env : {};

export const supabaseUrl: string =
  metaEnv.VITE_SUPABASE_URL ||
  DEFAULT_SUPABASE_URL;

export const supabaseKey: string =
  metaEnv.VITE_SUPABASE_PUBLISHABLE_KEY ||
  DEFAULT_SUPABASE_PUBLISHABLE_KEY;

export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
});

