import { createClient } from '@supabase/supabase-js';
import { traiterCapacites } from '../serveur/capacites.js';
import { clientSupabaseServeur, refuserMethode, repondre } from '../serveur/http.js';

export default async function handler(req, res) {
  await repondre(res, async () => {
    const refus = refuserMethode(req.method, 'GET');
    if (refus) return refus;
    const supabase = clientSupabaseServeur(process.env, createClient);
    if (!supabase) return { statut: 500, corps: { code: 'unavailable' } };
    return traiterCapacites({ env: process.env, autorisation: req.headers.authorization, supabase });
  }, 'capacites');
}
