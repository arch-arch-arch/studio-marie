import { CIBLES } from './indicateurs.js';
import { CATEGORIES } from './categories.js';

const HEURE = /^([01]\d|2[0-3]):[0-5]\d$/;
const COULEUR = /^#[0-9a-fA-F]{6}$/;
const entier = (v, min = 0) => Number.isInteger(v) && v >= min;
const objet = v => !!v && typeof v === 'object' && !Array.isArray(v);
const textes = v => Array.isArray(v) && v.every(t => typeof t === 'string');
const FORMATS_GRILLE = ['reel', 'carrousel', 'story', 'post'];

function erreursCategories(s, erreurs) {
  const p = 'categories_de_contenu';
  const cles = CATEGORIES.map(c => c.cle);
  if (!objet(s)) {
    erreurs.push(`${p} : objet attendu.`);
    return;
  }
  if (s.categories !== undefined) {
    if (!Array.isArray(s.categories)) {
      erreurs.push(`${p}.categories : liste attendue.`);
    } else {
      const vus = new Set();
      s.categories.forEach((c, i) => {
        const chemin = `${p}.categories[${i}]`;
        if (!cles.includes(c?.cle)) {
          erreurs.push(`${chemin}.cle : catégorie inconnue (attendu : ${cles.join(', ')}).`);
        } else if (vus.has(c.cle)) {
          erreurs.push(`${chemin}.cle : doublon de « ${c.cle} ».`);
        } else {
          vus.add(c.cle);
        }
        if (c?.couleur != null && !COULEUR.test(c.couleur)) erreurs.push(`${chemin}.couleur : doit être au format #rrggbb.`);
        if (c?.cible_fil != null && !entier(c.cible_fil)) erreurs.push(`${chemin}.cible_fil : entier positif ou nul attendu.`);
        const st = c?.cible_stories;
        if (st != null && (!entier(st.min) || !entier(st.max) || st.min > st.max)) {
          erreurs.push(`${chemin}.cible_stories : min et max entiers, avec min ≤ max.`);
        }
      });
    }
  }
  if (s.grilles !== undefined) {
    if (!objet(s.grilles)) {
      erreurs.push(`${p}.grilles : objet attendu.`);
      return;
    }
    if (s.grilles.par_format !== undefined && !objet(s.grilles.par_format)) {
      erreurs.push(`${p}.grilles.par_format : objet attendu.`);
    } else {
      for (const [k, v] of Object.entries(s.grilles.par_format ?? {})) {
        if (!FORMATS_GRILLE.includes(k)) erreurs.push(`${p}.grilles.par_format.${k} : format inconnu (reel, carrousel, story, post).`);
        else if (!textes(v)) erreurs.push(`${p}.grilles.par_format.${k} : liste de textes attendue.`);
      }
    }
    if (s.grilles.par_categorie !== undefined && !objet(s.grilles.par_categorie)) {
      erreurs.push(`${p}.grilles.par_categorie : objet attendu.`);
    } else {
      for (const [k, v] of Object.entries(s.grilles.par_categorie ?? {})) {
        if (!cles.includes(k)) erreurs.push(`${p}.grilles.par_categorie.${k} : catégorie inconnue.`);
        else if (!textes(v)) erreurs.push(`${p}.grilles.par_categorie.${k} : liste de textes attendue.`);
      }
    }
  }
}

export function fuseauValide(fuseau) {
  if (typeof fuseau !== 'string' || !fuseau) return false;
  if (fuseau.startsWith('+') || fuseau.startsWith('-')) return false;
  try {
    return new Intl.DateTimeFormat('en-US', { timeZone: fuseau }).resolvedOptions().timeZone === fuseau;
  } catch {
    return false;
  }
}

export function validerProfil(profil) {
  if (!profil || typeof profil !== 'object' || Array.isArray(profil)) {
    return { ok: false, erreurs: ['Le fichier doit contenir un objet JSON.'] };
  }
  const r = profil.regles_studio;
  if (!r || typeof r !== 'object') {
    return { ok: false, erreurs: ['Il manque le bloc « regles_studio » (voir exemples/profil-fictif.json).'] };
  }
  const erreurs = [];
  if (!fuseauValide(r.fuseau)) erreurs.push('regles_studio.fuseau : fuseau horaire inconnu (ex. « Europe/Paris »).');

  if (!Array.isArray(r.piliers) || r.piliers.length === 0) {
    erreurs.push('regles_studio.piliers : au moins un pilier est requis.');
  } else {
    r.piliers.forEach((p, i) => {
      if (!p || typeof p.cle !== 'string' || !p.cle) erreurs.push(`regles_studio.piliers[${i}].cle manquante.`);
      if (!p || typeof p.nom !== 'string' || !p.nom) erreurs.push(`regles_studio.piliers[${i}].nom manquant.`);
      if (!p || !COULEUR.test(p.couleur ?? '')) erreurs.push(`regles_studio.piliers[${i}].couleur doit être au format #rrggbb.`);
    });
  }

  const c = r.cadence ?? {};
  for (const k of ['reel', 'carrousel', 'story_par_jour']) {
    if (!entier(c[k])) erreurs.push(`regles_studio.cadence.${k} doit être un entier positif ou nul.`);
  }
  if (typeof r.cta_ratio_max !== 'number' || r.cta_ratio_max < 0 || r.cta_ratio_max > 1) {
    erreurs.push('regles_studio.cta_ratio_max doit être compris entre 0 et 1.');
  }
  const rc = r.roles_caption ?? {};
  for (const k of ['engagement', 'cta', 'deadpan']) {
    if (!entier(rc[k])) erreurs.push(`regles_studio.roles_caption.${k} doit être un entier positif ou nul.`);
  }
  if (!entier(r.ragebait_max)) erreurs.push('regles_studio.ragebait_max doit être un entier positif ou nul.');

  const sp = r.stories_porte ?? {};
  if (!entier(sp.min) || !entier(sp.max) || sp.min > sp.max) {
    erreurs.push('regles_studio.stories_porte : min et max entiers, avec min ≤ max.');
  }

  if (!Array.isArray(r.creneaux)) {
    erreurs.push('regles_studio.creneaux doit être une liste.');
  } else {
    r.creneaux.forEach((cr, i) => {
      if (!Array.isArray(cr?.jours) || cr.jours.length === 0 || !cr.jours.every(j => Number.isInteger(j) && j >= 1 && j <= 7)) {
        erreurs.push(`regles_studio.creneaux[${i}].jours : liste de jours de 1 (lundi) à 7 (dimanche).`);
      }
      if (!HEURE.test(cr?.debut ?? '') || !HEURE.test(cr?.fin ?? '') || cr.debut >= cr.fin) {
        erreurs.push(`regles_studio.creneaux[${i}] : debut et fin au format HH:MM, avec debut < fin.`);
      }
    });
  }

  if (!Array.isArray(r.mots_a_eviter) || !r.mots_a_eviter.every(m => typeof m === 'string')) {
    erreurs.push('regles_studio.mots_a_eviter doit être une liste de textes.');
  }
  const hs = r.hashtags ?? {};
  if (!entier(hs.min) || !entier(hs.max) || hs.min > hs.max) {
    erreurs.push('regles_studio.hashtags : min et max entiers, avec min ≤ max.');
  }
  if (!entier(r.accroche_mots_max, 1)) erreurs.push('regles_studio.accroche_mots_max doit être un entier supérieur à 0.');

  if (r.cibles !== undefined) {
    const ci = r.cibles;
    if (!ci || typeof ci !== 'object' || Array.isArray(ci)) {
      erreurs.push('regles_studio.cibles doit être un objet.');
    } else {
      for (const [k, v] of Object.entries(ci)) {
        if (!CIBLES.includes(k)) erreurs.push(`regles_studio.cibles.${k} : indicateur inconnu.`);
        else if (k === 'taux_abonnes_par_vue' && (typeof v !== 'number' || !(v >= 0 && v <= 1))) {
          erreurs.push('regles_studio.cibles.taux_abonnes_par_vue doit être compris entre 0 et 1 (0,003 pour 0,3 %).');
        } else if (k !== 'taux_abonnes_par_vue' && (typeof v !== 'number' || !Number.isFinite(v) || v < 0)) {
          erreurs.push(`regles_studio.cibles.${k} doit être un nombre positif ou nul.`);
        }
      }
    }
  }

  if (profil.categories_de_contenu !== undefined) erreursCategories(profil.categories_de_contenu, erreurs);

  return { ok: erreurs.length === 0, erreurs };
}
