import { describe, it, expect, vi } from 'vitest';
import { lireCorps, configurationSupabase, clientSupabaseServeur, clientSupabaseService, refuserMethode, repondre, journaliser } from '../../serveur/http.js';

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

describe('clientSupabaseServeur', () => {
  it('crée un client sans session persistante ni rafraîchissement', () => {
    const creer = vi.fn(() => 'client');
    expect(clientSupabaseServeur({ SUPABASE_URL: 'https://projet.test', SUPABASE_ANON_KEY: 'cle' }, creer)).toBe('client');
    expect(creer).toHaveBeenCalledWith('https://projet.test', 'cle', { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
  });
  it('renvoie null sans configuration', () => {
    const creer = vi.fn();
    expect(clientSupabaseServeur({}, creer)).toBeNull();
    expect(creer).not.toHaveBeenCalled();
  });
});

describe('clientSupabaseService', () => {
  const env = { SUPABASE_URL: 'https://projet.test', SUPABASE_ANON_KEY: 'cle', SUPABASE_SERVICE_ROLE_KEY: 'cle-service' };
  it('crée un client avec la clé de service, sans session persistante ni rafraîchissement', () => {
    const creer = vi.fn(() => 'client');
    expect(clientSupabaseService(env, creer)).toBe('client');
    expect(creer).toHaveBeenCalledWith('https://projet.test', 'cle-service', { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
  });
  it('renvoie null sans clé de service, vide, ou sans configuration Supabase', () => {
    const creer = vi.fn();
    expect(clientSupabaseService({ ...env, SUPABASE_SERVICE_ROLE_KEY: undefined }, creer)).toBeNull();
    expect(clientSupabaseService({ ...env, SUPABASE_SERVICE_ROLE_KEY: '  ' }, creer)).toBeNull();
    expect(clientSupabaseService({ SUPABASE_SERVICE_ROLE_KEY: 'cle-service' }, creer)).toBeNull();
    expect(creer).not.toHaveBeenCalled();
  });
});

describe('refuserMethode', () => {
  it('répond 405 pour une autre méthode que celle attendue', () => {
    expect(refuserMethode('POST', 'GET')).toEqual({ statut: 405, corps: { code: 'invalid_request' } });
    expect(refuserMethode('GET', 'GET')).toBeNull();
  });
});

describe('journaliser', () => {
  it('ajoute le type d’erreur de l’API quand il existe, jamais le message', () => {
    const espion = vi.spyOn(console, 'error').mockImplementation(() => {});
    journaliser('evaluer', Object.assign(new Error('SECRET-MESSAGE'), { status: 400, name: 'BadRequestError', error: { type: 'error', error: { type: 'invalid_request_error', message: 'SECRET-MESSAGE' } } }));
    journaliser('evaluer', Object.assign(new Error('SECRET-MESSAGE'), { status: 400, name: 'BadRequestError', type: 'invalid_request_error' }));
    journaliser('evaluer', Object.assign(new Error('x'), { status: 500, name: 'Boom', type: 'SECRET-TYPE LIBRE' }));
    journaliser('evaluer', { status: 500, name: 'Boom' });
    expect(espion.mock.calls).toEqual([
      ['[evaluer]', 400, 'BadRequestError', 'invalid_request_error'],
      ['[evaluer]', 400, 'BadRequestError', 'invalid_request_error'],
      ['[evaluer]', 500, 'Boom'],
      ['[evaluer]', 500, 'Boom'],
    ]);
    expect(JSON.stringify(espion.mock.calls)).not.toContain('SECRET');
    espion.mockRestore();
  });
});

describe('repondre', () => {
  const res = () => { const r = { status: vi.fn(() => r), json: vi.fn(() => r) }; return r; };
  it('écrit le statut et le corps', async () => {
    const r = res();
    await repondre(r, async () => ({ statut: 200, corps: { a: 1 } }), 'test');
    expect(r.status).toHaveBeenCalledWith(200);
    expect(r.json).toHaveBeenCalledWith({ a: 1 });
  });
  it('répond unavailable et journalise seulement la route, le statut et le nom de l’erreur', async () => {
    const r = res();
    const espions = ['error', 'log', 'warn'].map(n => vi.spyOn(console, n).mockImplementation(() => {}));
    await repondre(r, async () => { throw Object.assign(new Error('SECRET-PROMPT SECRET-IMAGE SECRET-JETON'), { status: 502, name: 'Boom' }); }, 'evaluer');
    expect(r.status).toHaveBeenCalledWith(500);
    expect(r.json).toHaveBeenCalledWith({ code: 'unavailable' });
    expect(espions[0]).toHaveBeenCalledTimes(1);
    expect(espions[0].mock.calls[0]).toEqual(['[evaluer]', 502, 'Boom']);
    expect(JSON.stringify(espions.flatMap(e => e.mock.calls))).not.toContain('SECRET');
    espions.forEach(e => e.mockRestore());
  });
});
