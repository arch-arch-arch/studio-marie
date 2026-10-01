import { createClient } from '@supabase/supabase-js';
import { traiterVeille } from '../serveur/veille.js';
import { creerClient, cleConfiguree } from '../serveur/claude.js';
import { clientSupabaseServeur, clientSupabaseService, repondre } from '../serveur/http.js';

export const config = { maxDuration: 300 };

export default async function handler(req, res) {
  await repondre(res, async () => {
    const supabaseSession = clientSupabaseServeur(process.env, createClient);
    if (!supabaseSession) return { statut: 500, corps: { code: 'unavailable' } };
    const claude = cleConfiguree(process.env) ? creerClient({ timeout: 280_000, maxRetries: 0 }) : null;
    return traiterVeille({
      methode: req.method,
      autorisation: req.headers.authorization,
      env: process.env,
      supabaseSession,
      supabaseService: clientSupabaseService(process.env, createClient),
      claude,
      maintenant: new Date().toISOString(),
    });
  }, 'veille');
}
