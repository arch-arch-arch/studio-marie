import { describe, it, expect } from 'vitest';
import { creerFauxSupabase } from '../aides/fauxSupabase.js';
import { verifierSession } from '../../serveur/session.js';

describe('verifierSession', () => {
  it('accepte un jeton valide et refuse le reste', async () => {
    const supabase = creerFauxSupabase();
    expect(await verifierSession(supabase, 'Bearer jeton-test')).toEqual({ ok: true, utilisateur: { id: 'u1', email: 'a@exemple.test' } });
    for (const entete of [undefined, '', 'Bearer ', 'Bearer faux', 'jeton-test', 'Basic jeton-test']) {
      expect(await verifierSession(supabase, entete)).toEqual({ ok: false });
    }
  });
  it('ne renvoie que l’identifiant et l’adresse de l’utilisateur', async () => {
    const supabase = creerFauxSupabase({ utilisateur: { id: 'u1', email: 'a@exemple.test', aud: 'authenticated', app_metadata: { provider: 'email' }, user_metadata: {} } });
    expect(await verifierSession(supabase, 'Bearer jeton-test')).toEqual({ ok: true, utilisateur: { id: 'u1', email: 'a@exemple.test' } });
  });
});
