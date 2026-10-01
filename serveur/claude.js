import Anthropic from '@anthropic-ai/sdk';
import { cleConfiguree, modele } from './configuration.js';

export { cleConfiguree, modele };
export const MODELE = modele(process.env);
// La fonction Vercel s'arrête à 120 s : le client abandonne avant (le défaut du SDK est de 10 minutes et 2 relances).
export const creerClient = () => new Anthropic({ timeout: 100_000, maxRetries: 1 });
export const texteDe = message => (message.content ?? []).filter(b => b.type === 'text').map(b => b.text).join('');
const erreur = code => Object.assign(new Error(code), { code });

export function extraireJson(texte) {
  const debut = texte.indexOf('{');
  const fin = texte.lastIndexOf('}');
  if (debut < 0 || fin <= debut) throw erreur('invalid_json');
  try {
    return JSON.parse(texte.slice(debut, fin + 1));
  } catch {
    throw erreur('invalid_json');
  }
}

const CODES_INTERNES = new Set(['refused', 'invalid_json', 'empty_completion']);

export function codeErreur(e) {
  if (!(e instanceof Anthropic.APIError) && CODES_INTERNES.has(e?.code)) return e.code;
  if (e instanceof Anthropic.APIError) {
    if (e.status === 429) return 'rate_limited';
    if (e.status === 401 || e.status === 403) return 'not_granted';
    if (e.status === 413) return 'prompt_too_large';
    if (e.status === 400) return 'invalid_request';
  }
  return 'unavailable';
}

export async function evaluer(client, { prompt, image }) {
  const content = [
    ...(image ? [{ type: 'image', source: { type: 'base64', media_type: image.media_type, data: image.data } }] : []),
    { type: 'text', text: prompt },
  ];
  const message = await client.messages.create({ model: MODELE, max_tokens: 8000, messages: [{ role: 'user', content }] });
  if (message.stop_reason === 'refusal') throw erreur('refused');
  const texte = texteDe(message);
  if (message.stop_reason === 'max_tokens' || message.stop_reason === 'model_context_window_exceeded' || !texte.trim()) throw erreur('empty_completion');
  return extraireJson(texte);
}
