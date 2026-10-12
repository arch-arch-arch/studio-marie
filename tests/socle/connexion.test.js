import { describe, it, expect, vi } from 'vitest';
import { creerFauxSupabase } from '../aides/fauxSupabase.js';
import { creerConnexion, suivreSession, lienInvalide, retirerErreurDeLAdresse } from '../../src/socle/connexion.js';

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
    client._panne({ message: 'Error sending magic link email', status: 503 });
    expect(await c.demanderLien('a@exemple.test')).toEqual({ ok: false, raison: 'Le lien n’a pas pu être envoyé : réessaie dans un instant.' });
    client._panne({ message: 'Failed to fetch' });
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
    client._panne({ message: 'Database error', status: 500 });
    expect(await c.connecterParMotDePasse('a@exemple.test', 'motdepasse-test')).toEqual({ ok: false, raison: 'La connexion a échoué : réessaie dans un instant.' });
    client._panne({ message: 'Failed to fetch' });
    expect(await c.connecterParMotDePasse('a@exemple.test', 'motdepasse-test')).toEqual({ ok: false, raison: 'La connexion a échoué : réessaie dans un instant.' });
  });
  it('ne prend pas tout 400 pour un mauvais mot de passe', async () => {
    const client = sansSession();
    const c = creerConnexion(client, ORIGINE);
    client._panne({ message: 'Email not confirmed', status: 400, code: 'email_not_confirmed' });
    expect(await c.connecterParMotDePasse('a@exemple.test', 'motdepasse-test')).toEqual({ ok: false, raison: 'La connexion a échoué : réessaie dans un instant.' });
    for (const message of ['Invalid login credentials', 'invalid_grant']) {
      client._panne({ message, status: 400 });
      expect(await c.connecterParMotDePasse('a@exemple.test', 'motdepasse-test')).toEqual({ ok: false, raison: 'Adresse ou mot de passe incorrect.' });
    }
  });
  it('le faux client renvoie la forme réelle d’une panne réseau', async () => {
    const client = sansSession();
    client._panne({ message: 'Failed to fetch' });
    const { error } = await client.auth.signInWithPassword({ email: 'a@exemple.test', password: 'motdepasse-test' });
    expect(error).toMatchObject({ name: 'AuthRetryableFetchError', status: 0, __isAuthError: true });
    expect(error.code).toBeUndefined();
  });
});

describe('suivreSession', () => {
  const vider = () => new Promise(r => setTimeout(r, 0));
  const monter = async utilisateur => {
    const client = creerFauxSupabase({ utilisateur, motsDePasse: { 'a@exemple.test': 'motdepasse-test' } });
    const connexion = creerConnexion(client, ORIGINE);
    const recharger = vi.fn();
    await suivreSession(connexion, recharger);
    await vider();
    return { client, connexion, recharger };
  };

  it('ne recharge pas à l’abonnement', async () => {
    expect((await monter(null)).recharger).not.toHaveBeenCalled();
    expect((await monter({ id: 'u1', email: 'a@exemple.test' })).recharger).not.toHaveBeenCalled();
  });
  it('ne recharge pas sur un rafraîchissement de jeton', async () => {
    const { client, recharger } = await monter({ id: 'u1', email: 'a@exemple.test' });
    client._session({ access_token: 'nouveau-jeton', user: { id: 'u1', email: 'a@exemple.test' } });
    await vider();
    expect(recharger).not.toHaveBeenCalled();
  });
  it('recharge une seule fois à la déconnexion', async () => {
    const { connexion, recharger } = await monter({ id: 'u1', email: 'a@exemple.test' });
    await connexion.deconnecter();
    await vider();
    expect(recharger).toHaveBeenCalledTimes(1);
  });
  it('ne laisse pas la lecture initiale écraser un changement arrivé avant elle', async () => {
    const client = creerFauxSupabase({ utilisateur: null, motsDePasse: { 'a@exemple.test': 'motdepasse-test' } });
    const connexion = creerConnexion(client, ORIGINE);
    let rendreLaSession;
    connexion.session = () => new Promise(r => { rendreLaSession = r; });
    const recharger = vi.fn();
    const suivi = suivreSession(connexion, recharger);
    await vider();
    // Changement réel (déconnecté vers connecté) reçu avant la fin de la lecture initiale.
    client._session({ access_token: 'jeton-test', user: { id: 'u1', email: 'a@exemple.test' } });
    await vider();
    rendreLaSession(null); // la lecture initiale, périmée, voit encore « déconnecté »
    expect(await suivi).toBe(true);
    client._session(null);
    await vider();
    expect(recharger).toHaveBeenCalledTimes(1);
  });
  it('recharge une seule fois à la connexion par mot de passe', async () => {
    const { connexion, recharger } = await monter(null);
    expect(await connexion.connecterParMotDePasse('a@exemple.test', 'motdepasse-test')).toEqual({ ok: true });
    await vider();
    expect(recharger).toHaveBeenCalledTimes(1);
  });
});

describe('lienInvalide', () => {
  it('détecte l’erreur d’authentification dans le fragment ou la requête', () => {
    expect(lienInvalide({ search: '', hash: '#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid' })).toBe(true);
    expect(lienInvalide({ search: '?error_code=otp_expired', hash: '' })).toBe(true);
    expect(lienInvalide({ search: '?error=access_denied', hash: '' })).toBe(true);
  });
  it('ignore une adresse sans erreur', () => {
    expect(lienInvalide({ search: '', hash: '' })).toBe(false);
    expect(lienInvalide({ search: '?vue=semaine', hash: '#access_token=abc&type=magiclink' })).toBe(false);
    expect(lienInvalide(null)).toBe(false);
  });
});

describe('retirerErreurDeLAdresse', () => {
  it('retire l’erreur du fragment et de la requête sans toucher au reste', () => {
    const historique = { replaceState: vi.fn() };
    retirerErreurDeLAdresse({ pathname: '/', search: '?vue=semaine&error=access_denied', hash: '#error_code=otp_expired&error_description=x' }, historique);
    expect(historique.replaceState).toHaveBeenCalledWith(null, '', '/?vue=semaine');
  });
  it('ne touche à rien quand l’adresse est sans erreur', () => {
    const historique = { replaceState: vi.fn() };
    retirerErreurDeLAdresse({ pathname: '/', search: '?vue=semaine', hash: '' }, historique);
    expect(historique.replaceState).not.toHaveBeenCalled();
  });
});
