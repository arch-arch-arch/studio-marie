import { RELEVES, CIBLES, LIBELLES_CIBLES, tauxAbonnesParVue, etatReleves } from './indicateurs.js';
import { ajouterJours, cleSemaineIso } from './dates.js';

export const RAPPEL_RETROSPECTIVE = 'Aucun relevé de statistiques pour la semaine écoulée : saisis-les pour obtenir la rétrospective.';
const moyenne = xs => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const parDate = (a, b) => (a.date_publication < b.date_publication ? -1 : a.date_publication > b.date_publication ? 1 : 0);

export function relevesParFiche(stats) {
  const m = new Map();
  for (const s of stats) {
    const actuel = m.get(s.fiche);
    if (!actuel || (actuel.releve === '48h' && s.releve === '7j')) m.set(s.fiche, s);
  }
  return [...m.values()].sort(parDate);
}

export function croissancesNettes(releves, fuseau) {
  const tries = [...releves].sort((a, b) => (a.debut < b.debut ? -1 : a.debut > b.debut ? 1 : 0));
  const parSemaine = new Map(tries.map(r => [r.semaine, r]));
  return tries.map(r => {
    const precedente = parSemaine.get(cleSemaineIso(ajouterJours(r.debut, -7, fuseau), fuseau));
    const croissance = precedente && precedente.abonnes != null && r.abonnes != null ? r.abonnes - precedente.abonnes : null;
    return { semaine: r.semaine, debut: r.debut, abonnes: r.abonnes, croissance, clics_porte: r.clics_porte ?? null };
  });
}

const comparer = (a, b) => (b.taux - a.taux) || (b.partages_envois - a.partages_envois);

export function classerContenus(stats, n = 3) {
  const lignes = relevesParFiche(stats).map(s => ({ ...s, taux: tauxAbonnesParVue(s) })).filter(s => s.taux != null);
  const tries = [...lignes].sort(comparer);
  const meilleurs = tries.slice(0, n);
  const pris = new Set(meilleurs.map(s => s.fiche));
  const pires = [...tries].reverse().filter(s => !pris.has(s.fiche)).slice(0, n);
  return { meilleurs, pires };
}

export function ecartsCibles({ stats, relevesCompte, cibles, fuseau }) {
  if (!cibles || typeof cibles !== 'object') return [];
  const ref = relevesParFiche(stats);
  const derniere = croissancesNettes(relevesCompte, fuseau).at(-1);
  const mesures = {
    taux_abonnes_par_vue: moyenne(ref.filter(s => s.format === 'reel').map(tauxAbonnesParVue).filter(v => v != null)),
    partages_par_post: moyenne(ref.filter(s => s.format !== 'story').map(s => s.partages_envois).filter(v => v != null)),
    croissance_nette_semaine: derniere?.croissance ?? null,
    clics_porte_semaine: derniere?.clics_porte ?? null,
  };
  return CIBLES.filter(k => typeof cibles[k] === 'number' && mesures[k] != null)
    .map(k => ({ indicateur: k, libelle: LIBELLES_CIBLES[k], valeur: mesures[k], cible: cibles[k], atteinte: mesures[k] >= cibles[k] }));
}

export function seriesTableau({ stats, relevesCompte, fuseau }) {
  const ref = relevesParFiche(stats);
  const point = s => ({ date: s.date_publication, fiche: s.fiche, libelle: s.accroche ?? '', format: s.format });
  const semaines = croissancesNettes(relevesCompte, fuseau);
  return {
    reels: ref.filter(s => s.format === 'reel' && tauxAbonnesParVue(s) != null).map(s => ({ ...point(s), valeur: tauxAbonnesParVue(s) })),
    partages: ref.filter(s => s.format !== 'story').map(s => ({ ...point(s), valeur: s.partages_envois })),
    croissance: semaines.filter(w => w.croissance != null).map(w => ({ semaine: w.semaine, valeur: w.croissance })),
    porte: semaines.filter(w => w.clics_porte != null).map(w => ({ semaine: w.semaine, valeur: w.clics_porte })),
    scoreReel: ref.filter(s => s.score_total != null && tauxAbonnesParVue(s) != null)
      .map(s => ({ ...point(s), score: s.score_total, valeur: tauxAbonnesParVue(s) })),
    classement: classerContenus(stats),
  };
}

const resume = s => (s ? { fiche: s.fiche, accroche: s.accroche ?? '', format: s.format, taux: s.taux, partages_envois: s.partages_envois } : null);
const pluriel = (n, un, plusieurs) => `${n} ${n > 1 ? plusieurs : un}`;

export function retrospective({ stats, relevesCompte, fiches, cibles, fuseau, debutSemaineVisee, maintenant }) {
  const depuis = ajouterJours(debutSemaineVisee, -14, fuseau);
  const dansPeriode = iso => iso >= depuis && iso < debutSemaineVisee;
  const periode = stats.filter(s => dansPeriode(s.date_publication));
  const manquants = fiches
    .filter(f => f.statut === 'publie' && dansPeriode(f.date_heure))
    .flatMap(f => {
      const e = etatReleves(f, stats.filter(s => s.fiche === f.id), maintenant);
      return RELEVES.filter(r => e[r].etat === 'a_saisir').map(r => ({ fiche: f.id, releve: r, accroche: f.accroche ?? '' }));
    });
  const comptes = relevesCompte.filter(r => r.debut < debutSemaineVisee);
  if (periode.length === 0 && !comptes.some(r => dansPeriode(r.debut))) return { type: 'rappel', texte: RAPPEL_RETROSPECTIVE, manquants };
  const { meilleurs, pires } = classerContenus(periode, 1);
  const nbContenus = relevesParFiche(periode).length;
  const morceaux = [`${pluriel(nbContenus, 'contenu relevé', 'contenus relevés')} sur les 2 dernières semaines.`];
  if (manquants.length) morceaux.push(`${pluriel(manquants.length, 'relevé manquant', 'relevés manquants')}.`);
  return {
    type: 'bilan',
    texte: morceaux.join(' '),
    meilleur: resume(meilleurs[0]),
    pire: resume(pires[0]),
    ecarts: ecartsCibles({ stats: periode, relevesCompte: comptes, cibles, fuseau }),
    manquants,
  };
}
