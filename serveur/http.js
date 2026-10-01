import { createClient } from '@supabase/supabase-js';

// Aides des fonctions Vercel : les fichiers api/ restent de simples passe-plats.

export function configurationSupabase(env) {
  return env.SUPABASE_URL && env.SUPABASE_ANON_KEY ? { url: env.SUPABASE_URL, cle: env.SUPABASE_ANON_KEY } : null;
}

// Côté serveur, aucune session n'est conservée : chaque requête porte son propre jeton.
export function clientSupabaseServeur(env, creer = createClient) {
  const config = configurationSupabase(env);
  if (!config) return null;
  return creer(config.url, config.cle, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
}

export function refuserMethode(methode, attendue) {
  return methode === attendue ? null : { statut: 405, corps: { code: 'invalid_request' } };
}

// req.body peut arriver déjà décodé (objet) ou en chaîne.
export function lireCorps(body) {
  if (typeof body !== 'string') return { ok: true, corps: body };
  try {
    return { ok: true, corps: JSON.parse(body) };
  } catch {
    return { ok: false };
  }
}

// Journal minimal : la route, le statut et le nom de l'erreur. Jamais le message (il peut citer le prompt, l'image ou le jeton).
export function journaliser(route, e) {
  console.error(`[${route}]`, e?.status, e?.name);
}

export async function repondre(res, traiter, route) {
  let r;
  try {
    r = await traiter();
  } catch (e) {
    journaliser(route, e);
    r = { statut: 500, corps: { code: 'unavailable' } };
  }
  res.status(r.statut).json(r.corps);
}
