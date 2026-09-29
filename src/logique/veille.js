import { FORMATS, analyserHashtags, nouvelleFiche, appliquerEvaluation } from './fiche.js';
import { depuisSaisieLocale, cleJour, ajouterJours, debutSemaine, debutJour, cleSemaineIso } from './dates.js';
import { creneauxDisponibles } from './creneaux.js';
import { validerReponse } from '../claude/evaluation.js';
import { verifierRegles } from './regles-score.js';
import { composerScore } from './score.js';
import { controlerSemaine } from './controle.js';
import { retrospective } from './tableau-bord.js';

export const ROLES_CAPTION = ['engagement', 'cta', 'deadpan'];
const texte = v => typeof v === 'string' && v.trim().length > 0;
const texteOuVide = v => typeof v === 'string';

export function fichesRemplacables(fiches, cle) {
  return fiches.filter(f => f.origine?.type === 'veille' && f.origine?.bulletin === cle
    && f.statut === 'brouillon' && f.modifiee_depuis_creation === false && f.maj_le === f.cree_le);
}

export function placerIdees(idees, fiches, regles, debutIso, maintenantIso = null) {
  const fz = regles.fuseau;
  const libres = creneauxDisponibles(fiches, regles, debutIso, maintenantIso, { tousFormats: true });
  const heureSecours = regles.creneaux[0]?.fin ?? '15:00';
  const debutJourMaintenant = maintenantIso ? debutJour(maintenantIso, fz) : null;
  const departSecours = debutJourMaintenant && debutJourMaintenant > debutIso ? debutJourMaintenant : debutIso;
  const finSemaine = ajouterJours(debutIso, 6, fz);
  const prises = new Set(fiches.map(f => f.date_heure));
  let rang = 0;
  const placer = idee => {
    const date_heure = libres.shift();
    if (date_heure) return { idee, date_heure, horsCreneau: false };
    let jourSecours = ajouterJours(departSecours, rang, fz);
    if (jourSecours > finSemaine) jourSecours = finSemaine;
    rang += 1;
    let candidat = depuisSaisieLocale(cleJour(jourSecours, fz), heureSecours, fz);
    while (maintenantIso && candidat < maintenantIso && jourSecours < finSemaine) {
      jourSecours = ajouterJours(jourSecours, 1, fz);
      if (jourSecours > finSemaine) jourSecours = finSemaine;
      candidat = depuisSaisieLocale(cleJour(jourSecours, fz), heureSecours, fz);
    }
    for (let tentative = 0; tentative < 10 && prises.has(candidat); tentative += 1) {
      candidat = new Date(new Date(candidat).getTime() + 30 * 60000).toISOString();
    }
    prises.add(candidat);
    return { idee, date_heure: candidat, horsCreneau: true };
  };
  const feed = idees.filter(idee => idee.format !== 'story').map(placer);
  const story = idees.filter(idee => idee.format === 'story').map(placer);
  return [...feed, ...story];
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
      caption: idee.caption ?? '', hashtags: analyserHashtags((idee.hashtags ?? []).map(t => t.replace(/\s+/g, '')).join(' ')),
      tendance: texte(idee.tendance) ? idee.tendance : null, jugement: j.jugement,
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

const MAX_IDEES = 5;
const cleAccroche = a => (a ?? '').toLowerCase().replace(/\s+/g, ' ').trim();

export function construireVeille({ profil, fiches, entree, maintenant, idAleatoire, stats = [], relevesCompte = [] }) {
  const r = profil.regles_studio;
  const fz = r.fuseau;
  const verification = validerEntreeVeille(entree, r);
  if (!verification.ok) return { ok: false, erreurs: verification.erreurs };
  const debut = debutSemaine(ajouterJours(maintenant, 1, fz), fz);
  const cle = cleSemaineIso(debut, fz);
  const remplacables = fichesRemplacables(fiches, cle);
  const aRemplacer = new Set(remplacables.map(f => f.id));
  const gardees = fiches.filter(f => !aRemplacer.has(f.id));
  const ideesGardees = gardees.filter(f => f.origine?.type === 'veille' && f.origine?.bulletin === cle);
  const clesGardees = new Set(ideesGardees.map(f => cleAccroche(f.accroche)));
  const clesVues = new Set();
  const ideesRetenues = verification.entree.idees
    .filter(idee => {
      const cle2 = cleAccroche(idee.accroche);
      if (clesGardees.has(cle2) || clesVues.has(cle2)) return false;
      clesVues.add(cle2);
      return true;
    })
    .slice(0, Math.max(0, MAX_IDEES - ideesGardees.length));
  const places = placerIdees(ideesRetenues, gardees, r, debut, maintenant);

  const fichesCreees = places.map(({ idee, date_heure }) => {
    const base = {
      ...nouvelleFiche({ id: idAleatoire(), format: idee.format, date_heure, pilier: idee.pilier, maintenant, origine: { type: 'veille', bulletin: cle } }),
      statut: 'brouillon', role_caption: idee.role_caption, cta: idee.cta, format_valide: idee.format_valide,
      accroche: idee.accroche, caption: idee.caption, hashtags: idee.hashtags,
    };
    const score = composerScore({ fiche: base, verification: verifierRegles(base, r), jugement: idee.jugement, versionProfil: profil.version, maintenant });
    return appliquerEvaluation(base, {
      score,
      variantes: idee.jugement.captions,
      suggestions: { accroches: idee.jugement.accroches, hashtags: idee.jugement.hashtags },
      recommandations: idee.jugement.recommandations,
    }, maintenant);
  });

  const e = verification.entree;
  const bulletin = {
    semaine: cle,
    genere_le: maintenant,
    statut: e.sources_indisponibles ? 'partiel' : 'complet',
    sources_indisponibles: e.sources_indisponibles,
    retrospective: retrospective({ stats, relevesCompte, fiches, cibles: r.cibles, fuseau: fz, debutSemaineVisee: debut, maintenant }),
    tendances: e.tendances,
    ecartees: e.ecartees,
    alertes: e.alertes,
    idees: [...ideesGardees.map(f => f.id), ...fichesCreees.map(f => f.id)],
    hors_creneau: places.map((p, i) => (p.horsCreneau ? fichesCreees[i].id : null)).filter(Boolean),
    controle: controlerSemaine([...gardees, ...fichesCreees], r, debut),
  };

  const ecritures = [
    ...remplacables.map(f => ({ op: 'delete', collection: 'fiches', doc_id: f.id })),
    ...fichesCreees.map(({ id, ...data }) => ({ op: 'set', collection: 'fiches', doc_id: id, data })),
    { op: 'set', collection: 'bulletins', doc_id: cle, data: bulletin },
  ];
  return { ok: true, cle, debut, bulletin, fichesCreees, ecritures };
}
