import { describe, it, expect, vi } from 'vitest';
import { lireCapacites } from '../../src/socle/capacites.js';

const reponse = (corps, ok = true) => ({ ok, json: async () => corps });
const jeton = async () => 'jeton-test';

describe('lireCapacites', () => {
  it('lit les capacités avec le jeton', async () => {
    const requeter = vi.fn(async () => reponse({ evaluation: true, veille: false }));
    expect(await lireCapacites({ fetch: requeter, jeton, delaiMs: 50, essais: 2 })).toEqual({ evaluation: true, veille: false });
    expect(requeter).toHaveBeenCalledTimes(1);
    expect(requeter.mock.calls[0][0]).toBe('/api/capacites');
    expect(requeter.mock.calls[0][1].headers).toEqual({ Authorization: 'Bearer jeton-test' });
    expect(requeter.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
  });
  it('réussit au second essai après un échec réseau', async () => {
    const requeter = vi.fn().mockRejectedValueOnce(new Error('réseau')).mockResolvedValueOnce(reponse({ evaluation: true }));
    expect(await lireCapacites({ fetch: requeter, jeton, delaiMs: 50, essais: 2 })).toEqual({ evaluation: true });
    expect(requeter).toHaveBeenCalledTimes(2);
  });
  it('réussit au second essai après un délai dépassé', async () => {
    const requeter = vi.fn((_url, { signal }) => (requeter.mock.calls.length === 1
      ? new Promise((_ok, ko) => signal.addEventListener('abort', () => ko(new Error('abandon'))))
      : Promise.resolve(reponse({ veille: true }))));
    expect(await lireCapacites({ fetch: requeter, jeton, delaiMs: 20, essais: 2 })).toEqual({ veille: true });
    expect(requeter).toHaveBeenCalledTimes(2);
  });
  it('réessaie après une réponse en erreur, puis renonce avec {}', async () => {
    const requeter = vi.fn(async () => reponse({}, false));
    expect(await lireCapacites({ fetch: requeter, jeton, delaiMs: 50, essais: 2 })).toEqual({});
    expect(requeter).toHaveBeenCalledTimes(2);
  });
  it('renvoie {} après deux échecs', async () => {
    const requeter = vi.fn(async () => { throw new Error('réseau'); });
    expect(await lireCapacites({ fetch: requeter, jeton, delaiMs: 50, essais: 2 })).toEqual({});
    expect(requeter).toHaveBeenCalledTimes(2);
  });
  it('traite une réponse null comme aucune capacité', async () => {
    expect(await lireCapacites({ fetch: async () => reponse(null), jeton, delaiMs: 50, essais: 2 })).toEqual({});
  });
  it('renvoie {} si le jeton est illisible', async () => {
    const requeter = vi.fn();
    expect(await lireCapacites({ fetch: requeter, jeton: async () => { throw new Error('session'); }, delaiMs: 50, essais: 2 })).toEqual({});
    expect(requeter).not.toHaveBeenCalled();
  });
});
