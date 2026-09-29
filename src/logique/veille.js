import { FORMATS } from './fiche.js';
import { depuisSaisieLocale, cleJour } from './dates.js';
import { creneauxDisponibles } from './creneaux.js';
import { validerReponse } from '../claude/evaluation.js';

export const ROLES_CAPTION = ['engagement', 'cta', 'deadpan'];
const texte = v => typeof v === 'string' && v.trim().length > 0;
const texteOuVide = v => typeof v === 'string';

export function fichesRemplacables(fiches, cle) {
  return fiches.filter(f => f.origine?.type === 'veille' && f.origine?.bulletin === cle
    && f.statut === 'brouillon' && f.modifiee_depuis_creation === false);
}

export function placerIdees(idees, fiches, regles, debutIso) {
  const libres = creneauxDisponibles(fiches, regles, debutIso);
  const secours = depuisSaisieLocale(cleJour(debutIso, regles.fuseau), regles.creneaux[0]?.debut ?? '12:00', regles.fuseau);
  return idees.map(idee => {
    const date_heure = libres.shift();
    return date_heure ? { idee, date_heure, horsCreneau: false } : { idee, date_heure: secours, horsCreneau: true };
  });
}

export function validerEntreeVeille(entree, regles) {
  if (!entree || typeof entree !== 'object' || Array.isArray(entree)) return { ok: false, erreurs: ['L’entrée de la veille doit être un objet JSON.'] };
  const erreurs = [];
  const indispo = entree.sources_indisponibles === true;
  const tendances = Array.isArray(entree.tendances) ? entree.tendances : null;
  if (!tendances) erreurs.push('tendances doit être une liste.');
  else {
    if (!indispo && (tendances.length < 3 || tendances.length > 5)) erreurs.push('tendances : 3 à 5 tendances attendues (ou sources_indisponibles à vrai).');
    if (indispo && tendances.length > 5) erreurs.push('tendances : 5 au maximum.');
    tendances.forEach((t, i) => {
      for (const c of ['titre', 'source', 'date', 'pourquoi', 'adaptation', 'duree_vie']) if (!texte(t?.[c])) erreurs.push(`tendances[${i}].${c} manquant.`);
    });
  }
  const ecartees = entree.ecartees ?? [];
  if (!Array.isArray(ecartees) || !ecartees.every(e => texte(e?.titre) && texte(e?.raison))) erreurs.push('ecartees : liste de { titre, raison }.');
  const alertes = entree.alertes ?? [];
  if (!Array.isArray(alertes) || !alertes.every(a => texte(a?.texte) && (a.proposition_profil == null || texte(a.proposition_profil)))) {
    erreurs.push('alertes : liste de { texte, proposition_profil? }.');
  }
  const cles = new Set(regles.piliers.map(p => p.cle));
  const idees = Array.isArray(entree.idees) ? entree.idees : [];
  if (idees.length < 3 || idees.length > 5) erreurs.push('idees : 3 à 5 idées attendues.');
  const normalisees = idees.map((idee, i) => {
    if (!FORMATS.includes(idee?.format)) erreurs.push(`idees[${i}].format inconnu : ${idee?.format}.`);
    if (!cles.has(idee?.pilier)) erreurs.push(`idees[${i}].pilier inconnu : ${idee?.pilier}.`);
    if (idee?.role_caption != null && !ROLES_CAPTION.includes(idee.role_caption)) erreurs.push(`idees[${i}].role_caption inconnu : ${idee.role_caption}.`);
    if (!texte(idee?.accroche)) erreurs.push(`idees[${i}].accroche manquante.`);
    if (!texteOuVide(idee?.caption ?? '')) erreurs.push(`idees[${i}].caption doit être du texte.`);
    if (!Array.isArray(idee?.hashtags ?? []) || !(idee?.hashtags ?? []).every(texte)) erreurs.push(`idees[${i}].hashtags : liste de textes.`);
    const j = validerReponse(idee?.jugement);
    if (!j.ok) erreurs.push(`idees[${i}].jugement : ${j.erreurs.join(' ')}`);
    return j.ok ? {
      format: idee.format, pilier: idee.pilier, role_caption: idee.role_caption ?? null, cta: idee.cta === true,
      format_valide: texteOuVide(idee.format_valide) ? idee.format_valide : '', accroche: idee.accroche?.trim(),
      caption: idee.caption ?? '', hashtags: idee.hashtags ?? [], tendance: texte(idee.tendance) ? idee.tendance : null, jugement: j.jugement,
    } : null;
  });
  if (erreurs.length) return { ok: false, erreurs };
  return {
    ok: true,
    erreurs: [],
    entree: {
      sources_indisponibles: indispo,
      tendances: tendances.map(t => ({ titre: t.titre, source: t.source, date: t.date, pourquoi: t.pourquoi, adaptation: t.adaptation, duree_vie: t.duree_vie, son_a_verifier: t.son_a_verifier === true })),
      ecartees: ecartees.map(e => ({ titre: e.titre, raison: e.raison })),
      alertes: alertes.map(a => ({ texte: a.texte, proposition_profil: a.proposition_profil ?? null })),
      idees: normalisees,
    },
  };
}
