import { verifierSession } from './session.js';
import { cleConfiguree } from './configuration.js';
import { codeErreur, evaluer } from './claude.js';
import { lireCorps, journaliser } from './http.js';

export { traiterCapacites } from './capacites.js';

const TYPES_IMAGE = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);
const PROMPT_MAX = 65536;
const IMAGE_MAX_CARACTERES = 4_000_000;
const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;
// Le message de l'API n'est ni journalisé ni renvoyé : il sert seulement à savoir si le 400 concerne l'image.
const concerneLImage = e => [e?.error?.error?.message, e?.error?.message, e?.message].some(m => typeof m === 'string' && /image/i.test(m));
const octets = t => new TextEncoder().encode(t).length;
const reponse = (statut, corps) => ({ statut, corps });

// `corps` peut arriver en chaîne brute : il n'est lu qu'après la vérification de la session.
export async function traiterEvaluation({ env, autorisation, corps: brut, supabase, claude }) {
  if (!(await verifierSession(supabase, autorisation)).ok) return reponse(401, { code: 'session_expired' });
  if (!cleConfiguree(env)) return reponse(403, { code: 'not_granted' });
  const lu = lireCorps(brut);
  if (!lu.ok) return reponse(400, { code: 'invalid_request' });
  const { prompt, image } = lu.corps ?? {};
  const imageValide = image == null || (TYPES_IMAGE.has(image.media_type) && typeof image.data === 'string' && image.data.length > 0);
  if (typeof prompt !== 'string' || !prompt.trim() || !imageValide) return reponse(400, { code: 'invalid_request' });
  if (image != null && (image.data.length > IMAGE_MAX_CARACTERES || !BASE64.test(image.data))) return reponse(400, { code: 'image_rejected' });
  if (octets(prompt) > PROMPT_MAX) return reponse(413, { code: 'prompt_too_large' });
  try {
    return reponse(200, { reponse: await evaluer(claude, { prompt, image: image ?? null }) });
  } catch (e) {
    journaliser('evaluer', e);
    let code = codeErreur(e);
    if (code === 'invalid_request' && image != null && concerneLImage(e)) code = 'image_rejected';
    return reponse(code === 'rate_limited' ? 429 : 502, { code });
  }
}
