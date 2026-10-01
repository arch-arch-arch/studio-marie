import { describe, it, expect, vi } from 'vitest';
import Anthropic from '@anthropic-ai/sdk';
import { MODELE, cleConfiguree, extraireJson, codeErreur, evaluer } from '../../serveur/claude.js';

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
});
