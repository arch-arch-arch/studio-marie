const RAISONS = {
  not_granted: 'La veille n’est pas encore configurée.',
  rate_limited: 'Trop de demandes à Claude pour le moment : réessaie un peu plus tard.',
  session_expired: 'Ta session a expiré : reconnecte-toi, puis réessaie.',
  profil_absent: 'Importe d’abord le profil de marque.',
};
const ECHEC = 'La veille a échoué : réessaie dans quelques minutes. Rien n’a été modifié.';

export function creerVeilleApi({ fetch: requeter, jeton }) {
  return {
    async relancer() {
      try {
        const reponse = await requeter('/api/veille', { method: 'POST', headers: { Authorization: `Bearer ${await jeton()}` } });
        const corps = await reponse.json().catch(() => ({}));
        if (reponse.ok && corps.ok) return { ok: true, message: corps.resume };
        return { ok: false, raison: RAISONS[corps?.code] ?? ECHEC };
      } catch {
        return { ok: false, raison: ECHEC };
      }
    },
  };
}
