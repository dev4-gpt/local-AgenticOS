export interface PublicConfig {
  bookingUrl?: string;
  contactEmail?: string;
  contactUrl?: string;
  repositoryUrl?: string;
  // When both are set, the engagement form posts the signup straight to the
  // Supabase `signups` table (anon key, insert-only RLS). Set them in
  // public/config.js as window.VELOCE_CONFIG = { supabaseUrl, supabaseAnonKey }.
  supabaseUrl?: string;
  supabaseAnonKey?: string;
}
declare global { interface Window { VELOCE_CONFIG?: PublicConfig; } }
export const config = window.VELOCE_CONFIG ?? {};
