import { describe, it, expect, vi } from 'vitest';
import { creerFauxSupabase } from '../aides/fauxSupabase.js';
import { creerConnexion } from '../../src/socle/connexion.js';

const ORIGINE = { origine: 'https://studio.test' };

describe('creerConnexion', () => {
  it('lit la session et le jeton', async () => {
    const c = creerConnexion(creerFauxSupabase(), ORIGINE);
    expect((await c.session()).user.email).toBe('a@exemple.test');
    expect(await c.jeton()).toBe('jeton-test');
    const sans = creerConnexion(creerFauxSupabase({ utilisateur: null }), ORIGINE);
    expect(await sans.session()).toBeNull();
    expect(await sans.jeton()).toBeNull();
  });
  it('envoie un lien magique sans créer de compte', async () => {
    const client = creerFauxSupabase({ utilisateur: null, invites: ['a@exemple.test'] });
    const espion = vi.spyOn(client.auth, 'signInWithOtp');
    const c = creerConnexion(client, ORIGINE);
    expect(await c.demanderLien('  A@Exemple.test ')).toEqual({ ok: true });
    expect(espion).toHaveBeenCalledWith({ email: 'a@exemple.test', options: { shouldCreateUser: false, emailRedirectTo: 'https://studio.test' } });
  });
  it('refuse une adresse non invitée ou mal formée', async () => {
    const c = creerConnexion(creerFauxSupabase({ utilisateur: null, invites: ['a@exemple.test'] }), ORIGINE);
    expect(await c.demanderLien('autre@exemple.test')).toEqual({ ok: false, raison: 'Cette adresse n’a pas accès au studio.' });
    expect(await c.demanderLien('pas-une-adresse')).toEqual({ ok: false, raison: 'Saisis une adresse e-mail valide.' });
  });
  it('distingue la limite de débit et les autres échecs du lien', async () => {
    const client = creerFauxSupabase({ utilisateur: null });
    const c = creerConnexion(client, ORIGINE);
    client._panne({ message: 'Email rate limit exceeded', status: 429, code: 'over_email_send_rate_limit' });
    expect(await c.demanderLien('a@exemple.test')).toEqual({ ok: false, raison: 'Trop de demandes : réessaie dans une minute.' });
    client._panne({ message: 'Error sending magic link email', status: 500, code: 'unexpected_failure' });
    expect(await c.demanderLien('a@exemple.test')).toEqual({ ok: false, raison: 'Le lien n’a pas pu être envoyé : réessaie dans un instant.' });
    client._panne({ message: 'Email address not authorized', status: 400, code: 'email_address_not_authorized' });
    expect(await c.demanderLien('a@exemple.test')).toEqual({ ok: false, raison: 'Le lien n’a pas pu être envoyé : réessaie dans un instant.' });
  });
  it('prévient des changements de session et déconnecte', async () => {
    const client = creerFauxSupabase();
    const c = creerConnexion(client, ORIGINE);
    const vus = [];
    c.surChangement(s => vus.push(s ? 'connecte' : 'deconnecte'));
    await c.deconnecter();
    expect(vus).toEqual(['deconnecte']);
    expect(await c.session()).toBeNull();
  });
});

describe('creerConnexion : mot de passe', () => {
  const motsDePasse = { 'a@exemple.test': 'motdepasse-test' };
  const sansSession = () => creerFauxSupabase({ utilisateur: null, motsDePasse });

  it('ouvre la session et prévient les abonnés', async () => {
    const client = sansSession();
    const espion = vi.spyOn(client.auth, 'signInWithPassword');
    const c = creerConnexion(client, ORIGINE);
    const vus = [];
    c.surChangement(s => vus.push(s?.user?.email ?? null));
    expect(await c.connecterParMotDePasse('  A@Exemple.test ', 'motdepasse-test')).toEqual({ ok: true });
    expect(espion).toHaveBeenCalledWith({ email: 'a@exemple.test', password: 'motdepasse-test' });
    expect(vus).toEqual(['a@exemple.test']);
    expect((await c.session()).user.email).toBe('a@exemple.test');
    expect(await c.jeton()).toBe('jeton-test');
  });
  it('refuse un mauvais mot de passe sans ouvrir de session', async () => {
    const c = creerConnexion(sansSession(), ORIGINE);
    expect(await c.connecterParMotDePasse('a@exemple.test', 'mauvais-test')).toEqual({ ok: false, raison: 'Adresse ou mot de passe incorrect.' });
    expect(await c.connecterParMotDePasse('inconnu@exemple.test', 'motdepasse-test')).toEqual({ ok: false, raison: 'Adresse ou mot de passe incorrect.' });
    expect(await c.session()).toBeNull();
  });
  it('refuse un mot de passe vide ou une adresse mal formée sans appeler Supabase', async () => {
    const client = sansSession();
    const espion = vi.spyOn(client.auth, 'signInWithPassword');
    const c = creerConnexion(client, ORIGINE);
    expect(await c.connecterParMotDePasse('a@exemple.test', '')).toEqual({ ok: false, raison: 'Saisis ton mot de passe.' });
    expect(await c.connecterParMotDePasse('a@exemple.test', undefined)).toEqual({ ok: false, raison: 'Saisis ton mot de passe.' });
    expect(await c.connecterParMotDePasse('pas-une-adresse', 'motdepasse-test')).toEqual({ ok: false, raison: 'Saisis une adresse e-mail valide.' });
    expect(espion).not.toHaveBeenCalled();
  });
  it('signale la limite de débit et les autres échecs', async () => {
    const client = sansSession();
    const c = creerConnexion(client, ORIGINE);
    client._panne({ message: 'Request rate limit reached', status: 429, code: 'over_request_rate_limit' });
    expect(await c.connecterParMotDePasse('a@exemple.test', 'motdepasse-test')).toEqual({ ok: false, raison: 'Trop de tentatives : réessaie dans une minute.' });
    client._panne({ message: 'Database error', status: 500, code: 'unexpected_failure' });
    expect(await c.connecterParMotDePasse('a@exemple.test', 'motdepasse-test')).toEqual({ ok: false, raison: 'La connexion a échoué : réessaie dans un instant.' });
  });
});
