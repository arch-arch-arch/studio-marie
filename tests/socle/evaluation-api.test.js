import { describe, it, expect, vi } from 'vitest';
import { creerEvaluationApi } from '../../src/socle/evaluation-api.js';

const reponse = (statut, corps) => ({ ok: statut >= 200 && statut < 300, status: statut, json: async () => corps });

describe('creerEvaluationApi', () => {
  it('annonce ses limites', async () => {
    const limites = await creerEvaluationApi({ fetch: vi.fn(), jeton: async () => 'j' }).limits();
    expect(limites).toEqual({ maxPromptBytes: 65536, images: { maxCount: 1, maxInputBytes: 3000000, mediaTypes: ['image/png', 'image/jpeg', 'image/webp', 'image/gif'] } });
  });
  it('envoie le prompt, le jeton et l’image en base64', async () => {
    const fetchFaux = vi.fn(async () => reponse(200, { reponse: { notes: {} } }));
    const api = creerEvaluationApi({ fetch: fetchFaux, jeton: async () => 'jeton-test' });
    const r = await api.json('Évalue.', { images: new Blob(['ABC'], { type: 'image/png' }) });
    expect(r).toEqual({ notes: {} });
    const [url, options] = fetchFaux.mock.calls[0];
    expect(url).toBe('/api/evaluer');
    expect(options.method).toBe('POST');
    expect(options.headers.Authorization).toBe('Bearer jeton-test');
    expect(JSON.parse(options.body)).toEqual({ prompt: 'Évalue.', image: { media_type: 'image/png', data: 'QUJD' } });
  });
  it('accepte aussi un tableau d’un seul visuel', async () => {
    const fetchFaux = vi.fn(async () => reponse(200, { reponse: { notes: {} } }));
    const api = creerEvaluationApi({ fetch: fetchFaux, jeton: async () => 'jeton-test' });
    await api.json('Évalue.', { images: [new Blob(['ABC'], { type: 'image/png' })] });
    expect(JSON.parse(fetchFaux.mock.calls[0][1].body)).toEqual({ prompt: 'Évalue.', image: { media_type: 'image/png', data: 'QUJD' } });
  });
  it('transmet le code d’erreur du serveur', async () => {
    const api = creerEvaluationApi({ fetch: async () => reponse(403, { code: 'not_granted' }), jeton: async () => 'j' });
    await expect(api.json('x')).rejects.toMatchObject({ code: 'not_granted' });
    const sans = creerEvaluationApi({ fetch: async () => reponse(500, {}), jeton: async () => 'j' });
    await expect(sans.json('x')).rejects.toMatchObject({ code: 'unavailable' });
  });
  it('signale l’annulation et la session perdue', async () => {
    const annule = creerEvaluationApi({ fetch: async () => { throw Object.assign(new Error('x'), { name: 'AbortError' }); }, jeton: async () => 'j' });
    await expect(annule.json('x')).rejects.toMatchObject({ code: 'cancelled' });
    const sansJeton = creerEvaluationApi({ fetch: vi.fn(), jeton: async () => null });
    await expect(sansJeton.json('x')).rejects.toMatchObject({ code: 'session_expired' });
  });
});
