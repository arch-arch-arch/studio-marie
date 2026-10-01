import { createClient } from '@supabase/supabase-js';
import { traiterCapacites } from '../serveur/evaluer.js';
import { configurationSupabase, repondre } from '../serveur/http.js';

export default async function handler(req, res) {
  await repondre(res, async () => {
    const config = configurationSupabase(process.env);
    if (!config) return { statut: 500, corps: { code: 'unavailable' } };
    const supabase = createClient(config.url, config.cle);
    return traiterCapacites({ env: process.env, autorisation: req.headers.authorization, supabase });
  });
}
