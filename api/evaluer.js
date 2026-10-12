import { createClient } from '@supabase/supabase-js';
import { traiterEvaluation } from '../serveur/evaluer.js';
import { creerClient, cleConfiguree } from '../serveur/claude.js';
import { clientSupabaseServeur, refuserMethode, repondre } from '../serveur/http.js';

export const config = { maxDuration: 120 };

export default async function handler(req, res) {
  await repondre(res, async () => {
    const refus = refuserMethode(req.method, 'POST');
    if (refus) return refus;
    const supabase = clientSupabaseServeur(process.env, createClient);
    if (!supabase) return { statut: 500, corps: { code: 'unavailable' } };
    const claude = cleConfiguree(process.env) ? creerClient() : null;
    return traiterEvaluation({ env: process.env, autorisation: req.headers.authorization, corps: req.body, supabase, claude });
  }, 'evaluer');
}
