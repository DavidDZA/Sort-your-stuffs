import { createClient } from '@supabase/supabase-js';
import type { Database } from './database.types';

// Adresse et clé publique du projet Supabase, intégrées au build (secrets GitHub) ou lues dans .env.local.
// La clé « publishable » est faite pour être publique : l'accès aux données est protégé par les règles RLS.
const URL: string = (import.meta.env?.VITE_SUPABASE_URL ?? '').trim();
const KEY: string = (import.meta.env?.VITE_SUPABASE_PUBLISHABLE_KEY ?? '').trim();

/** Client Supabase, ou null si le site est compilé sans compte (usage 100 % local). */
export const supabase =
  URL && KEY
    ? createClient<Database>(URL, KEY, {
        // PKCE : le retour de Google et les liens des e-mails arrivent en « ?code=… »,
        // sans toucher à l'ancre de l'URL qui sert de routeur.
        auth: { flowType: 'pkce', detectSessionInUrl: true, persistSession: true, autoRefreshToken: true },
      })
    : null;

export const cloudEnabled = supabase !== null;
