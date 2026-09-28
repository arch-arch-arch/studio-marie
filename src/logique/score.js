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
  const etatJuge = jugee?.etat in RANG ? jugee.etat : 'orange';
  const etat = RANG[calculee.etat] >= RANG[etatJuge] ? calculee.etat : etatJuge;
  const causesJugees = etatJuge === 'vert' ? [] : (jugee?.causes ?? []);
  return { etat, causes: [...new Set([...calculee.causes, ...causesJugees])] };
}

const borner = note => {
  const n = Number(note);
  return Number.isFinite(n) ? Math.min(10, Math.max(0, n)) : 0;
};

export function composerScore({ fiche, verification, jugement, versionProfil, maintenant }) {
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
  };
}
