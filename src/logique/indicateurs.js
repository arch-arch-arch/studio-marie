import { cleSemaineIso } from './dates.js';

export const RELEVES = ['48h', '7j'];
export const DELAIS_RELEVE = { '48h': 48 * 3600000, '7j': 7 * 24 * 3600000 };
export const CHAMPS_CONTENU = [
  { cle: 'vues', libelle: 'Vues', requis: true },
  { cle: 'nouveaux_abonnes', libelle: 'Nouveaux abonnés', requis: true },
  { cle: 'partages_envois', libelle: 'Partages et envois', requis: true },
  { cle: 'sauvegardes', libelle: 'Sauvegardes', requis: false },
  { cle: 'visites_profil', libelle: 'Visites du profil', requis: false },
  { cle: 'clics_porte', libelle: 'Clics sur la porte', requis: false },
];
export const CHAMPS_COMPTE = [
  { cle: 'abonnes', libelle: 'Abonnés', requis: true },
  { cle: 'vues_moyennes_stories', libelle: 'Vues moyennes des stories', requis: false },
  { cle: 'clics_porte', libelle: 'Clics sur la porte', requis: false },
];
export const CIBLES = ['taux_abonnes_par_vue', 'partages_par_post', 'croissance_nette_semaine', 'clics_porte_semaine'];
export const LIBELLES_CIBLES = {
  taux_abonnes_par_vue: 'Abonnés par vue (Reels)',
  partages_par_post: 'Partages et envois par post',
  croissance_nette_semaine: 'Croissance nette de la semaine',
  clics_porte_semaine: 'Clics sur la porte de la semaine',
};
const MAX = 1e9;
const ESPACES = /[\s  ]/g;

function valider(saisie, champs) {
  const erreurs = [];
  const valeurs = {};
  for (const c of champs) {
    const brut = saisie?.[c.cle];
    const vide = brut == null || (typeof brut === 'string' && brut.trim() === '');
    if (vide) {
      if (c.requis) erreurs.push(`${c.libelle} : valeur requise.`);
      valeurs[c.cle] = null;
      continue;
    }
    const n = typeof brut === 'number' ? brut : Number(String(brut).replace(ESPACES, ''));
    if (!Number.isInteger(n) || n < 0 || n > MAX) {
      erreurs.push(`${c.libelle} : nombre entier positif attendu.`);
      continue;
    }
    valeurs[c.cle] = n;
  }
  return erreurs.length ? { ok: false, erreurs } : { ok: true, erreurs: [], valeurs };
}

export const validerReleveContenu = saisie => valider(saisie, CHAMPS_CONTENU);
export const validerReleveCompte = saisie => valider(saisie, CHAMPS_COMPTE);

export const tauxAbonnesParVue = r => (r && r.vues > 0 && r.nouveaux_abonnes != null ? r.nouveaux_abonnes / r.vues : null);

export const idReleve = (ficheId, releve) => `${ficheId}_${releve}`;

export function etatReleves(fiche, releves, maintenant) {
  const resultat = {};
  const publication = new Date(fiche.date_heure).getTime();
  for (const r of RELEVES) {
    const du_le = new Date(publication + DELAIS_RELEVE[r]).toISOString();
    const saisi = releves.some(s => s.releve === r);
    resultat[r] = { du_le, etat: saisi ? 'saisi' : maintenant >= du_le ? 'a_saisir' : 'pas_encore' };
  }
  resultat.enRetard = fiche.statut === 'publie' && RELEVES.some(r => resultat[r].etat === 'a_saisir');
  return resultat;
}

export function documentReleveContenu(fiche, releve, valeurs, maintenant) {
  return {
    id: idReleve(fiche.id, releve), fiche: fiche.id, releve, ...valeurs, saisi_le: maintenant,
    date_publication: fiche.date_heure, format: fiche.format, pilier: fiche.pilier ?? '', accroche: fiche.accroche ?? '',
    score_total: fiche.score?.total ?? null,
  };
}

export function documentReleveCompte(debutSemaineIso, fuseau, valeurs, maintenant) {
  const semaine = cleSemaineIso(debutSemaineIso, fuseau);
  return { id: semaine, semaine, debut: debutSemaineIso, ...valeurs, saisi_le: maintenant };
}

export function formaterValeur(cle, valeur) {
  if (valeur == null || Number.isNaN(valeur)) return '—';
  if (cle === 'taux_abonnes_par_vue') return `${(valeur * 100).toLocaleString('fr-FR', { maximumFractionDigits: 2 })} %`;
  return Math.round(valeur).toLocaleString('fr-FR');
}
