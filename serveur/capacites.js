import { verifierSession } from './session.js';
import { cleConfiguree, cleServiceConfiguree } from './configuration.js';

// Sans SDK Anthropic : cette route ne fait que lire la configuration. Aucune valeur de clé ne sort d'ici, seulement des booléens.
export async function traiterCapacites({ env, autorisation, supabase }) {
  if (!(await verifierSession(supabase, autorisation)).ok) return { statut: 401, corps: { code: 'session_expired' } };
  const evaluation = cleConfiguree(env);
  return { statut: 200, corps: { evaluation, veille: evaluation && cleServiceConfiguree(env) } };
}
