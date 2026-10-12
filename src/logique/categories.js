import { fichesDeLaSemaine } from './controle.js';

export const CATEGORIES = [
  { cle: 'attraction', nom: 'Attraction', couleur: '#d9622b' },
  { cle: 'autorite', nom: 'Autorité', couleur: '#4a5be0' },
  { cle: 'connexion', nom: 'Connexion', couleur: '#0b8574' },
  { cle: 'desir', nom: 'Désir', couleur: '#b3125a' },
  { cle: 'preuve', nom: 'Preuve', couleur: '#a07800' },
  { cle: 'conversion', nom: 'Conversion', couleur: '#7a2fb5' },
];

const CLES = new Set(CATEGORIES.map(c => c.cle));
const FIL = new Set(['reel', 'carrousel', 'post']);

export function normaliserCategorie(valeur) {
  if (typeof valeur !== 'string') return null;
  const cle = valeur.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/\s+/g, '');
  return CLES.has(cle) ? cle : null;
}

export function categoriesDuProfil(profil) {
  const liste = Array.isArray(profil?.categories_de_contenu?.categories) ? profil.categories_de_contenu.categories : [];
  return CATEGORIES.map(base => {
    const c = liste.find(x => x?.cle === base.cle) ?? {};
    const st = c.cible_stories;
    return {
      cle: base.cle,
      nom: base.nom,
      couleur: c.couleur ?? base.couleur,
      cible_fil: Number.isInteger(c.cible_fil) && c.cible_fil >= 0 ? c.cible_fil : null,
      cible_stories: st && Number.isInteger(st.min) && Number.isInteger(st.max) ? { min: st.min, max: st.max } : null,
    };
  });
}

export function propositionCategorie(fiche) {
  if (CLES.has(fiche.categorie)) return null;
  const analyse = fiche.categorie_proposee;
  if (analyse?.source === 'analyse' && CLES.has(analyse.cle)) {
    return { cle: analyse.cle, source: 'analyse', raison: 'proposée par l’analyse' };
  }
  if (fiche.porte || fiche.cta) return { cle: 'conversion', source: 'regle', raison: 'règle : mène vers l’offre' };
  if (fiche.ragebait) return { cle: 'attraction', source: 'regle', raison: 'règle : ragebait' };
  return null;
}

export function categorieAffichee(fiche) {
  if (CLES.has(fiche.categorie)) return { cle: fiche.categorie, etat: 'choisie' };
  const proposition = propositionCategorie(fiche);
  if (proposition) return { cle: proposition.cle, etat: 'proposee', source: proposition.source };
  return { cle: null, etat: 'non_rangee' };
}

const selonFil = (n, cible) => (n >= cible ? 'vert' : n === cible - 1 ? 'orange' : 'rouge');
const selonStories = (n, { min, max }) => (n >= min && n <= max ? 'vert' : n === min - 1 || n === max + 1 ? 'orange' : 'rouge');
const libelleStories = (n, { min, max }) => `${n} ${n > 1 ? 'stories' : 'story'}, objectif ${min === max ? min : `${min} à ${max}`}`;
const contenusFil = (n, cible) => `${n} sur ${cible} ${cible <= 1 ? 'contenu du fil' : 'contenus du fil'}`;

export function controlerCategories(fiches, profil, debutIso) {
  if (!profil?.categories_de_contenu) return [];
  const semaine = fichesDeLaSemaine(fiches, debutIso, profil.regles_studio.fuseau);
  const pastilles = [];

  for (const c of categoriesDuProfil(profil)) {
    const choisies = semaine.filter(f => f.categorie === c.cle);
    if (c.cible_fil !== null) {
      const n = choisies.filter(f => FIL.has(f.format)).length;
      pastilles.push({
        cle: `${c.cle}_fil`,
        libelle: c.nom,
        valeur: contenusFil(n, c.cible_fil),
        etat: selonFil(n, c.cible_fil),
      });
    }
    if (c.cible_stories !== null) {
      const n = choisies.filter(f => f.format === 'story').length;
      pastilles.push({
        cle: `${c.cle}_stories`,
        libelle: c.nom,
        valeur: libelleStories(n, c.cible_stories),
        etat: selonStories(n, c.cible_stories),
      });
    }
  }

  const nonRangees = semaine.filter(f => !CLES.has(f.categorie)).length;
  if (nonRangees > 0) {
    pastilles.push({ cle: 'non_rangees', libelle: 'Non rangées', valeur: String(nonRangees), etat: 'orange' });
  }
  return pastilles;
}
