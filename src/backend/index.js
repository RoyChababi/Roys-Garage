import { localBackend } from './local.js';
import { createSupabaseBackend } from './supabase.js';

// A magic link lands with "#access_token=…" (or "#error_description=…"). Supabase strips that
// from the URL as soon as it reads it, so remember it here, before the client is created.
export const authLanding = { pending: /(access_token|error_description)=/.test(window.location.hash) };

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;

/** Supabase when configured, otherwise the in-browser demo backend. */
export const backend = url && key ? createSupabaseBackend(url, key) : localBackend;
