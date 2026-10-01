import { verifierSession } from './session.js';
import { cleConfiguree, codeErreur, evaluer } from './claude.js';

const TYPES_IMAGE = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);
const PROMPT_MAX = 65536;
const octets = t => new TextEncoder().encode(t).length;
const reponse = (statut, corps) => ({ statut, corps });

export async function traiterCapacites({ env, autorisation, supabase }) {
  if (!(await verifierSession(supabase, autorisation)).ok) return reponse(401, { code: 'session_expired' });
  const actif = cleConfiguree(env);
  return reponse(200, { evaluation: actif, veille: actif });
}

export async function traiterEvaluation({ env, autorisation, corps, supabase, claude }) {
  if (!(await verifierSession(supabase, autorisation)).ok) return reponse(401, { code: 'session_expired' });
  if (!cleConfiguree(env)) return reponse(403, { code: 'not_granted' });
  const { prompt, image } = corps ?? {};
  const imageValide = image == null || (TYPES_IMAGE.has(image.media_type) && typeof image.data === 'string' && image.data.length > 0);
  if (typeof prompt !== 'string' || !prompt.trim() || !imageValide) return reponse(400, { code: 'invalid_request' });
  if (octets(prompt) > PROMPT_MAX) return reponse(413, { code: 'prompt_too_large' });
  try {
    return reponse(200, { reponse: await evaluer(claude, { prompt, image: image ?? null }) });
  } catch (e) {
    const code = codeErreur(e);
    return reponse(code === 'rate_limited' ? 429 : 502, { code });
  }
}
