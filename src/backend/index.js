import { localBackend } from './local.js';
import { createSupabaseBackend } from './supabase.js';

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;

/** Supabase when configured, otherwise the in-browser demo backend. */
export const backend = url && key ? createSupabaseBackend(url, key) : localBackend;
