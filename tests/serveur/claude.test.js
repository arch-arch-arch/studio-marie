import { describe, it, expect, vi } from 'vitest';
import Anthropic from '@anthropic-ai/sdk';
import { MODELE, modele, cleConfiguree, extraireJson, codeErreur, evaluer, creerClient } from '../../serveur/claude.js';
import { cleConfiguree as cleDeConfiguration } from '../../serveur/configuration.js';

const message = (texte, stop_reason = 'end_turn') => ({ stop_reason, content: [{ type: 'text', text: texte }] });

describe('claude', () => {
  it('lit la clé et le modèle', () => {
    expect(cleConfiguree({ ANTHROPIC_API_KEY: 'x' })).toBe(true);
    expect(cleConfiguree({})).toBe(false);
    expect(cleConfiguree({ ANTHROPIC_API_KEY: '  ' })).toBe(false);
    expect(typeof MODELE).toBe('string');
  });
  it('extrait le JSON d’un texte, même entouré', () => {
    expect(extraireJson('Voici :\n```json\n{"a":1}\n```')).toEqual({ a: 1 });
    expect(() => extraireJson('rien')).toThrow();
    try { extraireJson('{mal'); } catch (e) { expect(e.code).toBe('invalid_json'); }
  });
  it('envoie le prompt et l’image, et renvoie le JSON', async () => {
    const client = { messages: { create: vi.fn(async () => message('{"notes":{"accroche":7}}')) } };
    const r = await evaluer(client, { prompt: 'Évalue.', image: { media_type: 'image/png', data: 'QUJD' } });
    expect(r).toEqual({ notes: { accroche: 7 } });
    const appel = client.messages.create.mock.calls[0][0];
    expect(appel.model).toBe(MODELE);
    expect(appel.messages[0].content).toEqual([
      { type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'QUJD' } },
      { type: 'text', text: 'Évalue.' },
    ]);
    for (const interdit of ['thinking', 'temperature', 'top_p', 'top_k']) expect(appel).not.toHaveProperty(interdit);
  });
  it('signale un refus et une réponse illisible', async () => {
    await expect(evaluer({ messages: { create: async () => ({ stop_reason: 'refusal', content: [] }) } }, { prompt: 'x' })).rejects.toMatchObject({ code: 'refused' });
    await expect(evaluer({ messages: { create: async () => message('pas du json') } }, { prompt: 'x' })).rejects.toMatchObject({ code: 'invalid_json' });
  });
  it('traduit les erreurs de l’API', () => {
    const api = statut => new Anthropic.APIError(statut, { type: 'error' }, 'erreur', new Headers());
    expect(codeErreur(api(429))).toBe('rate_limited');
    expect(codeErreur(api(401))).toBe('not_granted');
    expect(codeErreur(api(403))).toBe('not_granted');
    expect(codeErreur(api(413))).toBe('prompt_too_large');
    expect(codeErreur(api(400))).toBe('invalid_request');
    expect(codeErreur(api(529))).toBe('unavailable');
    expect(codeErreur({ code: 'refused' })).toBe('refused');
    expect(codeErreur(new Error('x'))).toBe('unavailable');
  });
  it('garde le modèle par défaut, même avec une valeur vide', () => {
    expect(modele({})).toBe('claude-opus-4-8');
    expect(modele({ MODELE_CLAUDE: '   ' })).toBe('claude-opus-4-8');
    expect(modele({ MODELE_CLAUDE: ' autre-modele ' })).toBe('autre-modele');
  });
  it('refuse un JSON invalide malgré ses accolades', () => {
    expect(() => extraireJson('{mal}')).toThrow();
    let code = null;
    try { extraireJson('{mal}'); } catch (e) { code = e.code; }
    expect(code).toBe('invalid_json');
  });
  it('ne laisse ressortir que les codes internes connus', () => {
    expect(codeErreur({ code: 'ECONNRESET' })).toBe('unavailable');
    for (const code of ['refused', 'invalid_json', 'empty_completion']) expect(codeErreur({ code })).toBe(code);
  });
  it('signale une réponse tronquée, hors contexte ou sans texte', async () => {
    const vide = c => evaluer({ messages: { create: async () => c } }, { prompt: 'x' });
    await expect(vide({ stop_reason: 'max_tokens', content: [{ type: 'text', text: '{"a":1}' }] })).rejects.toMatchObject({ code: 'empty_completion' });
    await expect(vide({ stop_reason: 'model_context_window_exceeded', content: [{ type: 'text', text: '{"a":1}' }] })).rejects.toMatchObject({ code: 'empty_completion' });
    await expect(vide({ stop_reason: 'end_turn', content: [] })).rejects.toMatchObject({ code: 'empty_completion' });
    await expect(vide({ stop_reason: 'end_turn', content: [{ type: 'text', text: '  ' }] })).rejects.toMatchObject({ code: 'empty_completion' });
  });
  it('borne le client sous la limite de la fonction Vercel', () => {
    vi.stubEnv('ANTHROPIC_API_KEY', 'cle-factice');
    const client = creerClient();
    const veille = creerClient({ timeout: 280_000, maxRetries: 0 });
    vi.unstubAllEnvs();
    expect(client.timeout).toBe(100000);
    expect(client.maxRetries).toBe(0);
    expect(veille.timeout).toBe(280000);
    expect(veille.maxRetries).toBe(0);
  });
  it('partage cleConfiguree avec le module de configuration', () => {
    expect(cleConfiguree).toBe(cleDeConfiguration);
  });
});
