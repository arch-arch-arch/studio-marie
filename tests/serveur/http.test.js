import { describe, it, expect, vi } from 'vitest';
import { lireCorps, configurationSupabase, repondre } from '../../serveur/http.js';

describe('lireCorps', () => {
  it('laisse passer un objet, décode une chaîne JSON et refuse le reste', () => {
    expect(lireCorps({ prompt: 'x' })).toEqual({ ok: true, corps: { prompt: 'x' } });
    expect(lireCorps('{"prompt":"x"}')).toEqual({ ok: true, corps: { prompt: 'x' } });
    expect(lireCorps(undefined)).toEqual({ ok: true, corps: undefined });
    expect(lireCorps('{mal')).toEqual({ ok: false });
  });
});

describe('configurationSupabase', () => {
  it('exige l’adresse et la clé publique', () => {
    expect(configurationSupabase({})).toBeNull();
    expect(configurationSupabase({ SUPABASE_URL: 'https://projet.test' })).toBeNull();
    expect(configurationSupabase({ SUPABASE_URL: 'https://projet.test', SUPABASE_ANON_KEY: 'cle' })).toEqual({ url: 'https://projet.test', cle: 'cle' });
  });
});

describe('repondre', () => {
  const res = () => { const r = { status: vi.fn(() => r), json: vi.fn(() => r) }; return r; };
  it('écrit le statut et le corps', async () => {
    const r = res();
    await repondre(r, async () => ({ statut: 200, corps: { a: 1 } }));
    expect(r.status).toHaveBeenCalledWith(200);
    expect(r.json).toHaveBeenCalledWith({ a: 1 });
  });
  it('répond unavailable sans rien journaliser quand le traitement lève', async () => {
    const r = res();
    const journal = vi.spyOn(console, 'error').mockImplementation(() => {});
    await repondre(r, async () => { throw new Error('secret-jeton-prompt'); });
    expect(r.status).toHaveBeenCalledWith(500);
    expect(r.json).toHaveBeenCalledWith({ code: 'unavailable' });
    expect(journal).not.toHaveBeenCalled();
    journal.mockRestore();
  });
});
