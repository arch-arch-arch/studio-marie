const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const nettoyer = saisie => String(saisie ?? '').trim().toLowerCase();
const limiteDeDebit = e => e?.status === 429 || e?.code === 'over_request_rate_limit' || e?.code === 'over_email_send_rate_limit';
// Forme réelle (auth-js) : AuthApiError { status numérique, code en chaîne, message }.
// Une adresse inconnue avec shouldCreateUser: false donne otp_disabled (ou signup_disabled), HTTP 422.
const adresseRefusee = e => e?.code === 'otp_disabled' || e?.code === 'signup_disabled' || e?.status === 422 || /signups? not allowed/i.test(e?.message ?? '');
// Identifiants refusés : code invalid_credentials, ou message hérité (invalid_grant, Invalid login credentials). Un autre 400 (email_not_confirmed) n'en fait pas partie.
const identifiantsRefuses = e => e?.code === 'invalid_credentials' || /invalid_grant|invalid login credentials/i.test(e?.message ?? '');

export function creerConnexion(client, { origine }) {
  const session = async () => (await client.auth.getSession()).data.session ?? null;
  return {
    session,
    jeton: async () => (await session())?.access_token ?? null,
    async demanderLien(saisie) {
      const email = nettoyer(saisie);
      if (!EMAIL.test(email)) return { ok: false, raison: 'Saisis une adresse e-mail valide.' };
      const { error } = await client.auth.signInWithOtp({ email, options: { shouldCreateUser: false, emailRedirectTo: origine } });
      if (!error) return { ok: true };
      if (limiteDeDebit(error)) return { ok: false, raison: 'Trop de demandes : réessaie dans une minute.' };
      if (adresseRefusee(error)) return { ok: false, raison: 'Cette adresse n’a pas accès au studio.' };
      return { ok: false, raison: 'Le lien n’a pas pu être envoyé : réessaie dans un instant.' };
    },
    async connecterParMotDePasse(saisie, motDePasse) {
      const email = nettoyer(saisie);
      if (!EMAIL.test(email)) return { ok: false, raison: 'Saisis une adresse e-mail valide.' };
      if (!motDePasse) return { ok: false, raison: 'Saisis ton mot de passe.' };
      const { error } = await client.auth.signInWithPassword({ email, password: motDePasse });
      if (!error) return { ok: true };
      if (limiteDeDebit(error)) return { ok: false, raison: 'Trop de tentatives : réessaie dans une minute.' };
      if (identifiantsRefuses(error)) return { ok: false, raison: 'Adresse ou mot de passe incorrect.' };
      return { ok: false, raison: 'La connexion a échoué : réessaie dans un instant.' };
    },
    deconnecter: async () => { await client.auth.signOut(); },
    surChangement(fn) {
      const { data } = client.auth.onAuthStateChange((evenement, s) => { if (evenement !== 'INITIAL_SESSION') fn(s ?? null); });
      return () => data.subscription.unsubscribe();
    },
  };
}

// Recharge la page (une fois par changement) quand l'état connecté ou déconnecté change réellement.
// Un rafraîchissement de jeton (session non nulle vers non nulle) ne change rien.
export async function suivreSession(connexion, recharger) {
  let connecte = null;
  connexion.surChangement(session => {
    const maintenant = !!session;
    if (connecte !== null && connecte !== maintenant) recharger();
    connecte = maintenant;
  });
  connecte = !!(await connexion.session());
  return connecte;
}

// Supabase renvoie l'erreur dans le fragment (ou la requête) d'un lien invalide ou expiré.
export function lienInvalide(emplacement) {
  if (!emplacement) return false;
  return [emplacement.hash, emplacement.search].some(brut => {
    const params = new URLSearchParams(String(brut ?? '').replace(/^[#?]/, ''));
    return params.has('error') || params.has('error_code');
  });
}
