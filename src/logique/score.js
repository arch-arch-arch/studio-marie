import { empreinte } from './fiche.js';

export const CRITERES = [
  { cle: 'accroche', nom: 'Accroche et diffusion' },
  { cle: 'voix', nom: 'Voix et esthétique' },
  { cle: 'mecanique', nom: 'Mécanique de la caption' },
];

export const POIDS = {
  reel: { accroche: 40, voix: 30, mecanique: 30 },
  carrousel: { accroche: 30, voix: 35, mecanique: 35 },
  story: { accroche: 20, voix: 30, mecanique: 50 },
  post: { accroche: 30, voix: 35, mecanique: 35 },
};

export const PLAFOND_ROUGE = 40;
const PENALITE_ALERTE = 0.2;
const RANG = { vert: 0, orange: 1, rouge: 2 };

export function fusionnerConformite(calculee, jugee) {
  const etatCalcule = calculee?.etat in RANG ? calculee.etat : 'rouge';
  const etatJuge = jugee?.etat in RANG ? jugee.etat : 'orange';
  const etat = RANG[etatCalcule] >= RANG[etatJuge] ? etatCalcule : etatJuge;
  const causesJugees = etatJuge === 'vert' ? [] : (jugee?.causes ?? []);
  return { etat, causes: [...new Set([...calculee.causes, ...causesJugees])] };
}

const borner = note => {
  const n = Number(note);
  return Number.isFinite(n) ? Math.min(10, Math.max(0, n)) : 0;
};

export function composerScore({ fiche, verification, jugement, versionProfil, maintenant, examen = null }) {
  const poids = POIDS[fiche.format] ?? POIDS.carrousel;
  const criteres = CRITERES.map(({ cle, nom }) => {
    const max = poids[cle];
    const alertes = verification.alertes.filter(a => a.critere === cle).length;
    const points = Math.max(0, Math.round((borner(jugement.notes?.[cle]) / 10) * max - alertes * PENALITE_ALERTE * max));
    return { cle, nom, points, max, phrase: jugement.phrases?.[cle] ?? '' };
  });
  const conformite = fusionnerConformite(verification.conformite, jugement.conformite);
  const brut = criteres.reduce((t, c) => t + c.points, 0);
  return {
    total: conformite.etat === 'rouge' ? Math.min(brut, PLAFOND_ROUGE) : brut,
    criteres,
    conformite,
    alertes: verification.alertes.map(a => a.texte),
    version_profil: versionProfil,
    evalue_le: maintenant,
    empreinte: empreinte(fiche),
    ...(examen ? { examen } : {}),
  };
}

export function construireExamen({ visuel, raison_visuel = null, version_profil = null, sections_profil = [], contenus_semaine = 0, verification }) {
  return {
    visuel, raison_visuel: visuel === 'non_joint' ? raison_visuel : null, version_profil, sections_profil, contenus_semaine,
    alertes_calculees: verification.alertes.length, blocages_calcules: verification.conformite.causes.length,
  };
}

const LIBELLES_VISUEL = {
  video: 'Visuel non examiné : vidéo (seules les images sont envoyées).',
  type: 'Visuel non examiné : format refusé.',
  taille: 'Visuel non examiné : fichier trop lourd.',
  indisponible: 'Visuel non examiné : envoi d’images indisponible.',
};
const s = n => (n > 1 ? 's' : '');

export function lignesExamen(examen) {
  if (!examen) return ['Détail non disponible pour cette évaluation (antérieure).'];
  const visuel = examen.visuel === 'joint' ? 'Visuel examiné.' : examen.visuel === 'aucun' ? 'Pas de visuel.' : LIBELLES_VISUEL[examen.raison_visuel] ?? LIBELLES_VISUEL.indisponible;
  const sections = examen.sections_profil?.length ? ` : sections ${examen.sections_profil.join(', ')}` : '';
  const n = examen.contenus_semaine ?? 0;
  const semaine = n === 0 ? 'Aucun autre contenu de la semaine comparé.' : `${n} autre${s(n)} contenu${s(n)} de la semaine comparé${s(n)}.`;
  const a = examen.alertes_calculees ?? 0;
  const b = examen.blocages_calcules ?? 0;
  return [visuel, `Profil version ${examen.version_profil ?? '?'}${sections}.`, semaine, `${a} alerte${s(a)} et ${b} blocage${s(b)} calculés par le studio.`];
}
