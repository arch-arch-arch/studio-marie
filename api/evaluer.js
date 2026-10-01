import { createClient } from '@supabase/supabase-js';
import { traiterEvaluation } from '../serveur/evaluer.js';
import { creerClient, cleConfiguree } from '../serveur/claude.js';
import { configurationSupabase, lireCorps, repondre } from '../serveur/http.js';

export const config = { maxDuration: 120 };

export default async function handler(req, res) {
  if (req.method !== 'POST') { res.status(405).json({ code: 'invalid_request' }); return; }
  await repondre(res, async () => {
    const configuration = configurationSupabase(process.env);
    if (!configuration) return { statut: 500, corps: { code: 'unavailable' } };
    const lu = lireCorps(req.body);
    if (!lu.ok) return { statut: 400, corps: { code: 'invalid_request' } };
    const supabase = createClient(configuration.url, configuration.cle);
    const claude = cleConfiguree(process.env) ? creerClient() : null;
    return traiterEvaluation({ env: process.env, autorisation: req.headers.authorization, corps: lu.corps, supabase, claude });
  });
}
