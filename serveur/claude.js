import Anthropic from '@anthropic-ai/sdk';

export const MODELE = process.env.MODELE_CLAUDE || 'claude-opus-4-8';
export const cleConfiguree = env => typeof env.ANTHROPIC_API_KEY === 'string' && env.ANTHROPIC_API_KEY.trim().length > 0;
export const creerClient = () => new Anthropic();
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

export function codeErreur(e) {
  if (typeof e?.code === 'string' && !(e instanceof Anthropic.APIError)) return e.code;
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
  return extraireJson(texteDe(message));
}
