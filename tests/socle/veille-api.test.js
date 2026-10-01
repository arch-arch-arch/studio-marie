import { describe, it, expect, vi } from 'vitest';
import { creerVeilleApi } from '../../src/socle/veille-api.js';

const reponse = (statut, corps) => ({ ok: statut >= 200 && statut < 300, status: statut, json: async () => corps });

describe('creerVeilleApi', () => {
  it('relance la veille avec le jeton', async () => {
    const fetchFaux = vi.fn(async () => reponse(200, { ok: true, lance: true, resume: 'Bulletin 2026-W41 : 4 idée(s), 0 remplacée(s), statut complet.' }));
    const r = await creerVeilleApi({ fetch: fetchFaux, jeton: async () => 'jeton-test' }).relancer();
    expect(r).toEqual({ ok: true, message: 'Bulletin 2026-W41 : 4 idée(s), 0 remplacée(s), statut complet.' });
    expect(fetchFaux.mock.calls[0]).toEqual(['/api/veille', { method: 'POST', headers: { Authorization: 'Bearer jeton-test' }, signal: expect.any(AbortSignal) }]);
  });
  it('explique les échecs', async () => {
    const api = code => creerVeilleApi({ fetch: async () => reponse(502, { code }), jeton: async () => 'j' });
    expect(await api('not_granted').relancer()).toEqual({ ok: false, raison: 'La veille n’est pas encore configurée.' });
    expect(await api('rate_limited').relancer()).toEqual({ ok: false, raison: 'Trop de demandes à Claude pour le moment : réessaie un peu plus tard.' });
    expect(await api('conflict').relancer()).toEqual({ ok: false, raison: 'Une autre veille vient de se terminer : recharge le bulletin.' });
    expect(await api('autre').relancer()).toEqual({ ok: false, raison: 'La veille a échoué : réessaie dans quelques minutes. Rien n’a été modifié.' });
    const coupe = creerVeilleApi({ fetch: async () => { throw new Error('x'); }, jeton: async () => 'j' });
    expect((await coupe.relancer()).ok).toBe(false);
  });

  it('abandonne la requête au bout de 310 secondes', async () => {
    vi.useFakeTimers();
    try {
      const fetchLent = vi.fn((_url, { signal }) => new Promise((_ok, ko) => signal.addEventListener('abort', () => ko(Object.assign(new Error('abort'), { name: 'AbortError' })))));
      const attente = creerVeilleApi({ fetch: fetchLent, jeton: async () => 'j' }).relancer();
      await vi.advanceTimersByTimeAsync(309_000);
      expect(fetchLent.mock.calls[0][1].signal.aborted).toBe(false);
      await vi.advanceTimersByTimeAsync(1_500);
      expect(await attente).toEqual({ ok: false, raison: 'La veille a échoué : réessaie dans quelques minutes. Rien n’a été modifié.' });
      expect(fetchLent.mock.calls[0][1].signal.aborted).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });
});
