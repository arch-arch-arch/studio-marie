import { verifierSession } from './session.js';
import { cleConfiguree } from './configuration.js';

// Sans SDK Anthropic : cette route ne fait que lire la configuration.
export async function traiterCapacites({ env, autorisation, supabase }) {
  if (!(await verifierSession(supabase, autorisation)).ok) return { statut: 401, corps: { code: 'session_expired' } };
  const actif = cleConfiguree(env);
  return { statut: 200, corps: { evaluation: actif, veille: actif } };
}
