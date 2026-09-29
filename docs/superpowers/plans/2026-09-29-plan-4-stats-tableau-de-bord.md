# Plan 4 : relevés de statistiques et tableau de bord : plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** La créatrice saisit dans le studio les relevés de chaque contenu publié (à 48 h et à 7 jours) et le relevé hebdomadaire du compte. Un onglet « Tableau de bord » suit la métrique boussole (nouveaux abonnés par vue, partages et envois) avec six graphiques. La veille du dimanche remplace son rappel par une vraie rétrospective.

**Architecture:**
- Tous les calculs sont en logique pure et testés :
  - `src/logique/indicateurs.js` : saisie, validation, taux, échéances des relevés, formats d'affichage ;
  - `src/logique/tableau-bord.js` : séries des graphiques, classement, écarts avec les cibles, rétrospective.
- Chaque relevé de contenu est un document autonome de `stats_contenu`, qui recopie le format, la date de publication, l'accroche et le score de la fiche. Le tableau de bord et la veille lisent donc une seule collection.
- Les graphiques sont des SVG écrits à la main (`src/interface/graphiques.js`). Aucune bibliothèque n'est ajoutée.
- La veille lit `stats_contenu` et `releves_compte`. Le script `construire` reçoit deux dossiers de plus et calcule la rétrospective avec la même logique.

**Tech Stack:** Node 24, JavaScript (modules ES), Vitest, happy-dom, esbuild ; routine Claude Code cloud (RemoteTrigger) avec `ArtifactData`.

**Spec:** `docs/superpowers/specs/2026-09-27-studio-contenu-design.md` : §1 (critères de réussite), §3.7 (calibration), §4 (`stats_contenu`, `releves_compte`), §5.2, §5.5 point 1, §5.6, §7 points 3 et 5, §8. Les plans 1 à 3 sont fusionnés dans `main`. Ce plan part de `main`, sur la branche `plan-4-stats`.

## Global Constraints

- **Dépôt privé et anonymisé.** Aucune donnée réelle de la créatrice dans git : pas de nom, de pseudo, d'e-mail, de plateformes, de **statistiques**, de contenus, de visuels, ni l'URL des studios ou de la routine. Les exemples et les tests n'utilisent que des valeurs fictives.
- **Langue.** Toute l'interface et tout le bulletin sont en français, en tutoyant. Pas d'emoji comme marqueurs.
- **Métrique boussole.** Nouveaux abonnés rapportés aux vues (taux d'abonnés par vue), puis partages et envois. Le taux est **calculé, jamais saisi**. La croissance nette est calculée.
- **Deux relevés par fiche publiée :** `48h` et `7j`, identifiants `<idFiche>_48h` et `<idFiche>_7j` dans `stats_contenu`. Un relevé du compte par semaine ISO dans `releves_compte/<YYYY-Www>`.
- **Pas de dépendance nouvelle.** Graphiques en SVG faits main, couleurs par variables CSS (thème clair et sombre).
- **Saisie manuelle** (phase 1). L'import automatique des statistiques est hors périmètre.
- **Commits.** Chaque commit se termine par une ligne `Co-Authored-By:` qui nomme le modèle auteur.

## Écarts assumés par rapport à la spec

- **Cibles lisibles par la machine.** La spec parle des « indicateurs cibles du profil ». Aujourd'hui, ils n'existent qu'en texte libre. On ajoute un bloc **facultatif** `regles_studio.cibles` : `taux_abonnes_par_vue` (fraction de 0 à 1), `partages_par_post`, `croissance_nette_semaine` et `clics_porte_semaine`. Sans ce bloc, le tableau de bord et la rétrospective fonctionnent, sans ligne de cible ni écarts.
- **Période du tableau de bord :** les 12 dernières semaines de publications et tous les relevés du compte.
- **Relevé du compte :** la spec dit « le dimanche ». Le studio permet de saisir le relevé de la semaine en cours ou de la semaine précédente, pour rattraper un oubli le lundi.
- **Relevé de référence d'un contenu :** le relevé à 7 jours s'il existe, sinon celui à 48 h.
- **Clics sur la porte :** ce champ n'est demandé que pour une story. Il reste facultatif.

## Review Focus

1. **Saisie invalide** : texte, nombre négatif, décimal, « 12 345 » avec espaces, champ requis vide. Les espaces sont acceptés. Le reste donne un message clair, et **rien n'est écrit**. *(Tasks 1 et 4)*
2. **Vues à 0** : pas de division par zéro. Le contenu n'a pas de taux et sort du classement, de la courbe et du nuage de points. *(Tasks 1 et 2)*
3. **Semaine précédente sans relevé du compte** : la croissance nette de la semaine est `null`, et non un écart avec un relevé de trois semaines plus tôt. *(Task 2)*
4. **Relevé corrigé ou saisi deux fois** : le document est remplacé (même identifiant). Aucun doublon, ni en base ni dans les calculs. *(Tasks 2, 3 et 4)*
5. **Profil sans `cibles`** (c'est le cas du profil réel aujourd'hui) : le tableau de bord, le bulletin et la veille fonctionnent, sans ligne de cible ni écarts. *(Tasks 2, 5 et 6)*

---

## Structure des fichiers

```
src/logique/indicateurs.js     saisie, validation, taux, échéances, formats (Task 1)
src/logique/profil.js          + validation du bloc facultatif regles_studio.cibles (Task 1)
exemples/profil-fictif.json    + regles_studio.cibles fictives (Task 1)
src/logique/tableau-bord.js    séries, classement, écarts, rétrospective (Task 2)
src/donnees/depot.js           + relevés de contenu et du compte (Task 3)
src/interface/controleur.js    + actions de saisie, allerAFiche, maintenant (Task 4)
src/interface/panneau-fiche.js + section Statistiques (Task 4)
src/interface/graphiques.js    SVG : barres, courbe, nuage (Task 5)
src/interface/vue-tableau.js   onglet Tableau de bord (Task 5)
src/interface/rendu.js, app.js onglet et abonnements (Task 5)
src/interface/styles.css       styles des relevés et des graphiques (Tasks 4 et 5)
src/logique/veille.js          rétrospective réelle (Task 6)
scripts/veille.mjs             + --stats, --releves (Task 6)
src/claude/veille.md           lecture des relevés (Task 6)
src/interface/vue-bulletin.js  affichage de la rétrospective (Task 6)
exemples/stats-fictives.json   relevés fictifs pour le studio de test (Task 7)
```

---

### Task 1 : indicateurs de base (saisie, taux, échéances, cibles du profil)

**Files:**
- Create: `src/logique/indicateurs.js`
- Modify: `src/logique/profil.js` (validation de `cibles`), `exemples/profil-fictif.json`
- Test: `tests/logique/indicateurs.test.js`, `tests/logique/profil.test.js`

**Interfaces:**
- Consumes: `cleSemaineIso(iso, fuseau)` de `src/logique/dates.js`.
- Produces (utilisées par les tâches 2 à 6) :
  - `RELEVES = ['48h', '7j']`, `DELAIS_RELEVE = { '48h': ms, '7j': ms }` ;
  - `CHAMPS_CONTENU`, `CHAMPS_COMPTE` : listes de `{ cle, libelle, requis }` ;
  - `CIBLES` (liste des clés), `LIBELLES_CIBLES` ;
  - `validerReleveContenu(saisie)`, `validerReleveCompte(saisie)` → `{ ok: true, erreurs: [], valeurs }` ou `{ ok: false, erreurs: string[] }` ;
  - `tauxAbonnesParVue(releve)` → nombre ou `null` ;
  - `idReleve(ficheId, releve)` → `"<id>_48h"` ;
  - `etatReleves(fiche, relevesDeLaFiche, maintenantIso)` → `{ '48h': { du_le, etat }, '7j': { du_le, etat }, enRetard }`, avec `etat` parmi `'saisi' | 'a_saisir' | 'pas_encore'` ;
  - `documentReleveContenu(fiche, releve, valeurs, maintenantIso)` → document avec `id` ;
  - `documentReleveCompte(debutSemaineIso, fuseau, valeurs, maintenantIso)` → document avec `id` = `semaine` ;
  - `formaterValeur(cle, valeur)` → texte français.

- [ ] **Step 1: Write the failing tests** : `tests/logique/indicateurs.test.js`

```js
import { describe, it, expect } from 'vitest';
import {
  RELEVES, validerReleveContenu, validerReleveCompte, tauxAbonnesParVue, idReleve, etatReleves,
  documentReleveContenu, documentReleveCompte, formaterValeur,
} from '../../src/logique/indicateurs.js';

const publiee = { id: 'f1', statut: 'publie', date_heure: '2026-09-20T10:00:00.000Z', format: 'reel', pilier: 'socio', accroche: 'Accroche', score: { total: 72 } };

describe('validerReleveContenu', () => {
  it('accepte des entiers, des textes avec espaces et des champs facultatifs vides', () => {
    const r = validerReleveContenu({ vues: '12 345', nouveaux_abonnes: 40, partages_envois: '7', sauvegardes: '', visites_profil: null });
    expect(r).toEqual({ ok: true, erreurs: [], valeurs: { vues: 12345, nouveaux_abonnes: 40, partages_envois: 7, sauvegardes: null, visites_profil: null, clics_porte: null } });
  });
  it('accepte l’espace insécable et l’espace fine', () => {
    expect(validerReleveContenu({ vues: '1 000', nouveaux_abonnes: '2 000', partages_envois: 0 }).valeurs.vues).toBe(1000);
  });
  it('refuse un champ requis vide, un négatif, un décimal et du texte', () => {
    const r = validerReleveContenu({ vues: '', nouveaux_abonnes: -1, partages_envois: '2,5', sauvegardes: 'beaucoup' });
    expect(r.ok).toBe(false);
    expect(r.erreurs).toEqual([
      'Vues : valeur requise.',
      'Nouveaux abonnés : nombre entier positif attendu.',
      'Partages et envois : nombre entier positif attendu.',
      'Sauvegardes : nombre entier positif attendu.',
    ]);
  });
});

describe('validerReleveCompte', () => {
  it('exige le nombre d’abonnés', () => {
    expect(validerReleveCompte({ abonnes: '' }).erreurs).toEqual(['Abonnés : valeur requise.']);
    expect(validerReleveCompte({ abonnes: '15000', vues_moyennes_stories: '900' }).valeurs)
      .toEqual({ abonnes: 15000, vues_moyennes_stories: 900, clics_porte: null });
  });
});

describe('tauxAbonnesParVue', () => {
  it('divise les nouveaux abonnés par les vues', () => {
    expect(tauxAbonnesParVue({ vues: 1000, nouveaux_abonnes: 3 })).toBeCloseTo(0.003);
  });
  it('renvoie null sans vues ou sans relevé', () => {
    expect(tauxAbonnesParVue({ vues: 0, nouveaux_abonnes: 3 })).toBeNull();
    expect(tauxAbonnesParVue(null)).toBeNull();
    expect(tauxAbonnesParVue(undefined)).toBeNull();
  });
});

describe('etatReleves', () => {
  it('signale les relevés dus et non saisis', () => {
    const e = etatReleves(publiee, [], '2026-09-23T10:00:00.000Z');
    expect(e['48h']).toEqual({ du_le: '2026-09-22T10:00:00.000Z', etat: 'a_saisir' });
    expect(e['7j']).toEqual({ du_le: '2026-09-27T10:00:00.000Z', etat: 'pas_encore' });
    expect(e.enRetard).toBe(true);
  });
  it('un relevé saisi n’est plus en retard', () => {
    const e = etatReleves(publiee, [{ releve: '48h' }], '2026-09-23T10:00:00.000Z');
    expect(e['48h'].etat).toBe('saisi');
    expect(e.enRetard).toBe(false);
  });
  it('une fiche non publiée n’est jamais en retard', () => {
    expect(etatReleves({ ...publiee, statut: 'programme' }, [], '2026-10-30T10:00:00.000Z').enRetard).toBe(false);
  });
  it('l’échéance est atteinte pile à 48 h', () => {
    expect(etatReleves(publiee, [], '2026-09-22T10:00:00.000Z')['48h'].etat).toBe('a_saisir');
  });
});

describe('documents', () => {
  it('le relevé de contenu recopie ce qu’il faut de la fiche', () => {
    const v = validerReleveContenu({ vues: 1000, nouveaux_abonnes: 3, partages_envois: 12 }).valeurs;
    expect(documentReleveContenu(publiee, '7j', v, '2026-09-27T12:00:00.000Z')).toEqual({
      id: 'f1_7j', fiche: 'f1', releve: '7j', ...v, saisi_le: '2026-09-27T12:00:00.000Z',
      date_publication: '2026-09-20T10:00:00.000Z', format: 'reel', pilier: 'socio', accroche: 'Accroche', score_total: 72,
    });
    expect(idReleve('f1', '48h')).toBe('f1_48h');
    expect(RELEVES).toEqual(['48h', '7j']);
  });
  it('score_total vaut null pour une fiche non évaluée', () => {
    const v = validerReleveContenu({ vues: 1, nouveaux_abonnes: 0, partages_envois: 0 }).valeurs;
    expect(documentReleveContenu({ ...publiee, score: null }, '48h', v, 'x').score_total).toBeNull();
  });
  it('le relevé du compte porte la clé de semaine ISO', () => {
    const doc = documentReleveCompte('2026-09-27T22:00:00.000Z', 'Europe/Paris', { abonnes: 100, vues_moyennes_stories: null, clics_porte: null }, 'x');
    expect(doc).toEqual({ id: '2026-W40', semaine: '2026-W40', debut: '2026-09-27T22:00:00.000Z', abonnes: 100, vues_moyennes_stories: null, clics_porte: null, saisi_le: 'x' });
  });
});

describe('formaterValeur', () => {
  it('affiche un taux en pourcentage et le reste en entier', () => {
    expect(formaterValeur('taux_abonnes_par_vue', 0.0042)).toBe('0,42 %');
    expect(formaterValeur('partages_par_post', 12.4)).toBe('12');
    expect(formaterValeur('croissance_nette_semaine', null)).toBe('—');
  });
});
```

- [ ] **Step 2: Add the failing profile tests** at the end of the `describe` in `tests/logique/profil.test.js`, with `fictif` already imported there:

```js
  it('accepte des cibles valides et leur absence', () => {
    const sans = structuredClone(fictif);
    delete sans.regles_studio.cibles;
    expect(validerProfil(sans).ok).toBe(true);
    expect(validerProfil(fictif).ok).toBe(true);
  });

  it('refuse des cibles mal formées', () => {
    const p = structuredClone(fictif);
    p.regles_studio.cibles = { taux_abonnes_par_vue: 3, partages_par_post: -1, inconnue: 2, clics_porte_semaine: '30' };
    expect(validerProfil(p).erreurs).toEqual([
      'regles_studio.cibles.taux_abonnes_par_vue doit être compris entre 0 et 1 (0,003 pour 0,3 %).',
      'regles_studio.cibles.partages_par_post doit être un nombre positif ou nul.',
      'regles_studio.cibles.inconnue : indicateur inconnu.',
      'regles_studio.cibles.clics_porte_semaine doit être un nombre positif ou nul.',
    ]);
    p.regles_studio.cibles = [];
    expect(validerProfil(p).erreurs).toEqual(['regles_studio.cibles doit être un objet.']);
  });
```

- [ ] **Step 3: Run the tests to see them fail**

Run: `npx vitest run tests/logique/indicateurs.test.js tests/logique/profil.test.js`
Expected: FAIL. Le module `indicateurs.js` n'existe pas, et les messages sur les cibles sont absents.

- [ ] **Step 4: Implement** `src/logique/indicateurs.js`

```js
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
const ESPACES = /[\s  ]/g;

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
```

- [ ] **Step 5: Implement the profile validation.** In `src/logique/profil.js`, add `import { CIBLES } from './indicateurs.js';` at the top. Add this block just before `return { ok: erreurs.length === 0, erreurs };` :

```js
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
```

In `exemples/profil-fictif.json`, add after `"accroche_mots_max": 15` (with a comma after `15`):

```json
    "cibles": { "taux_abonnes_par_vue": 0.003, "partages_par_post": 20, "croissance_nette_semaine": 100, "clics_porte_semaine": 30 }
```

- [ ] **Step 6: Run the tests**

Run: `npx vitest run tests/logique/indicateurs.test.js tests/logique/profil.test.js`, puis `npm test`.
Expected: PASS. Les autres tests restent verts. Si un test compare le profil fictif en entier et casse à cause de `cibles`, adapte ce test : pas la donnée.

- [ ] **Step 7: Commit**

```bash
git add src/logique/indicateurs.js src/logique/profil.js exemples/profil-fictif.json tests/logique/indicateurs.test.js tests/logique/profil.test.js
git commit -m "Indicateurs : saisie des relevés, taux d'abonnés par vue, échéances et cibles du profil

Co-Authored-By: <modèle auteur>"
```

---

### Task 2 : séries du tableau de bord, classement, écarts et rétrospective

**Files:**
- Create: `src/logique/tableau-bord.js`
- Test: `tests/logique/tableau-bord.test.js`

**Interfaces:**
- Consumes (Task 1) : `RELEVES`, `CIBLES`, `LIBELLES_CIBLES`, `tauxAbonnesParVue`, `etatReleves`, `formaterValeur` ; `ajouterJours`, `cleSemaineIso` de `dates.js`.
- Produces :
  - `RAPPEL_RETROSPECTIVE` (texte) ;
  - `relevesParFiche(stats)` → un relevé de référence par fiche (le 7 jours s'il existe, sinon le 48 h), trié par `date_publication` croissante ;
  - `croissancesNettes(relevesCompte, fuseau)` → `[{ semaine, debut, abonnes, croissance, clics_porte }]`, trié par `debut` ;
  - `classerContenus(stats, n = 3)` → `{ meilleurs, pires }`. Chaque ligne est le relevé, plus `taux` ;
  - `ecartsCibles({ stats, relevesCompte, cibles, fuseau })` → `[{ indicateur, libelle, valeur, cible, atteinte }]` ;
  - `seriesTableau({ stats, relevesCompte, fuseau })` → `{ reels, partages, croissance, porte, scoreReel, classement }` ;
  - `retrospective({ stats, relevesCompte, fiches, cibles, fuseau, debutSemaineVisee, maintenant })` → `{ type: 'rappel', texte, manquants }` ou `{ type: 'bilan', texte, meilleur, pire, ecarts, manquants }`.

- [ ] **Step 1: Write the failing tests** : `tests/logique/tableau-bord.test.js`

```js
import { describe, it, expect } from 'vitest';
import {
  RAPPEL_RETROSPECTIVE, relevesParFiche, croissancesNettes, classerContenus, ecartsCibles, seriesTableau, retrospective,
} from '../../src/logique/tableau-bord.js';

const FZ = 'Europe/Paris';
const stat = (fiche, releve, extra = {}) => ({
  id: `${fiche}_${releve}`, fiche, releve, vues: 1000, nouveaux_abonnes: 3, partages_envois: 10, sauvegardes: null, visites_profil: null, clics_porte: null,
  date_publication: '2026-09-15T10:00:00.000Z', format: 'reel', pilier: 'socio', accroche: `Accroche ${fiche}`, score_total: 70, ...extra,
});
const compte = (semaine, debut, abonnes, extra = {}) => ({ id: semaine, semaine, debut, abonnes, vues_moyennes_stories: null, clics_porte: null, ...extra });
// Lundis 00:00 à Paris (heure d'été) : W37 = 2026-09-06T22:00Z, W38 = 09-13, W39 = 09-20, W40 = 09-27
const W37 = '2026-09-06T22:00:00.000Z'; const W38 = '2026-09-13T22:00:00.000Z';
const W39 = '2026-09-20T22:00:00.000Z'; const W40 = '2026-09-27T22:00:00.000Z';

describe('relevesParFiche', () => {
  it('garde le relevé à 7 jours s’il existe, sinon celui à 48 h, et trie par date', () => {
    const r = relevesParFiche([
      stat('b', '48h', { date_publication: '2026-09-18T10:00:00.000Z' }),
      stat('a', '7j', { vues: 2000 }), stat('a', '48h', { vues: 500 }),
    ]);
    expect(r.map(s => s.id)).toEqual(['a_7j', 'b_48h']);
  });
});

describe('croissancesNettes', () => {
  it('compare avec la semaine précédente seulement', () => {
    const c = croissancesNettes([compte('2026-W40', W40, 1200), compte('2026-W37', W37, 1000), compte('2026-W38', W38, 1050)], FZ);
    expect(c.map(x => [x.semaine, x.croissance])).toEqual([['2026-W37', null], ['2026-W38', 50], ['2026-W40', null]]);
  });
});

describe('classerContenus', () => {
  it('classe par taux puis par partages, sans les vues à 0, sans doublon entre meilleurs et pires', () => {
    const stats = [
      stat('a', '7j', { nouveaux_abonnes: 9 }), stat('b', '7j', { nouveaux_abonnes: 3, partages_envois: 50 }),
      stat('c', '7j', { nouveaux_abonnes: 3, partages_envois: 5 }), stat('z', '7j', { vues: 0 }),
    ];
    const { meilleurs, pires } = classerContenus(stats, 2);
    expect(meilleurs.map(s => s.fiche)).toEqual(['a', 'b']);
    expect(pires.map(s => s.fiche)).toEqual(['c']);
    expect(meilleurs[0].taux).toBeCloseTo(0.009);
  });
});

describe('ecartsCibles', () => {
  it('mesure chaque cible disponible', () => {
    const e = ecartsCibles({
      stats: [stat('a', '7j', { nouveaux_abonnes: 4 }), stat('p', '7j', { format: 'carrousel', partages_envois: 30 }), stat('s', '7j', { format: 'story', partages_envois: 0 })],
      relevesCompte: [compte('2026-W38', W38, 1000), compte('2026-W39', W39, 1080, { clics_porte: 12 })],
      cibles: { taux_abonnes_par_vue: 0.003, partages_par_post: 25, croissance_nette_semaine: 100, clics_porte_semaine: 10 },
      fuseau: FZ,
    });
    expect(e.map(x => [x.indicateur, x.atteinte])).toEqual([
      ['taux_abonnes_par_vue', true], ['partages_par_post', false], ['croissance_nette_semaine', false], ['clics_porte_semaine', true],
    ]);
    expect(e.find(x => x.indicateur === 'partages_par_post').valeur).toBe(20);
  });
  it('sans cibles, aucun écart', () => {
    expect(ecartsCibles({ stats: [stat('a', '7j')], relevesCompte: [], cibles: undefined, fuseau: FZ })).toEqual([]);
  });
});

describe('seriesTableau', () => {
  it('prépare les six vues', () => {
    const s = seriesTableau({
      stats: [stat('a', '7j'), stat('p', '48h', { format: 'post', score_total: null }), stat('s', '7j', { format: 'story' })],
      relevesCompte: [compte('2026-W38', W38, 1000, { clics_porte: 4 }), compte('2026-W39', W39, 1100, { clics_porte: 9 })],
      fuseau: FZ,
    });
    expect(s.reels.map(p => p.fiche)).toEqual(['a']);
    expect(s.partages.map(p => p.fiche)).toEqual(['a', 'p']);
    expect(s.croissance).toEqual([{ semaine: '2026-W39', valeur: 100 }]);
    expect(s.porte).toEqual([{ semaine: '2026-W38', valeur: 4 }, { semaine: '2026-W39', valeur: 9 }]);
    expect(s.scoreReel.map(p => p.fiche)).toEqual(['a', 's']);
    expect(s.classement.meilleurs.length).toBeGreaterThan(0);
  });
});

describe('retrospective', () => {
  const fiche = (id, date_heure, statut = 'publie') => ({ id, statut, date_heure, accroche: `Accroche ${id}` });
  it('sans aucun relevé sur les 2 semaines : rappel, avec les relevés manquants', () => {
    const r = retrospective({
      stats: [], relevesCompte: [], fiches: [fiche('f1', '2026-09-22T10:00:00.000Z')], cibles: undefined,
      fuseau: FZ, debutSemaineVisee: W40, maintenant: '2026-09-27T18:00:00.000Z',
    });
    expect(r.type).toBe('rappel');
    expect(r.texte).toBe(RAPPEL_RETROSPECTIVE);
    expect(r.manquants).toEqual([{ fiche: 'f1', releve: '48h', accroche: 'Accroche f1' }]);
  });
  it('avec des relevés : meilleur, pire, écarts et manquants, sur les 2 semaines avant la semaine visée', () => {
    const r = retrospective({
      stats: [
        stat('a', '48h', { date_publication: '2026-09-15T10:00:00.000Z', nouveaux_abonnes: 5 }),
        stat('a', '7j', { date_publication: '2026-09-15T10:00:00.000Z', nouveaux_abonnes: 9 }),
        stat('b', '48h', { date_publication: '2026-09-22T10:00:00.000Z', nouveaux_abonnes: 1 }),
        stat('vieux', '7j', { date_publication: '2026-09-01T10:00:00.000Z', nouveaux_abonnes: 50 }),
      ],
      relevesCompte: [compte('2026-W38', W38, 1000), compte('2026-W39', W39, 1150)],
      fiches: [fiche('a', '2026-09-15T10:00:00.000Z'), fiche('b', '2026-09-22T10:00:00.000Z')],
      cibles: { croissance_nette_semaine: 100 }, fuseau: FZ, debutSemaineVisee: W40, maintenant: '2026-09-27T18:00:00.000Z',
    });
    expect(r.type).toBe('bilan');
    expect(r.meilleur.fiche).toBe('a');
    expect(r.pire.fiche).toBe('b');
    expect(r.ecarts).toEqual([{ indicateur: 'croissance_nette_semaine', libelle: 'Croissance nette de la semaine', valeur: 150, cible: 100, atteinte: true }]);
    expect(r.manquants).toEqual([]);
    expect(r.texte).toBe('2 contenus relevés sur les 2 dernières semaines.');
  });
  it('le texte signale les relevés manquants', () => {
    const r = retrospective({
      stats: [stat('a', '48h', { date_publication: '2026-09-15T10:00:00.000Z' })], relevesCompte: [],
      fiches: [fiche('a', '2026-09-15T10:00:00.000Z')], cibles: undefined, fuseau: FZ, debutSemaineVisee: W40, maintenant: '2026-09-27T18:00:00.000Z',
    });
    expect(r.texte).toBe('1 contenu relevé sur les 2 dernières semaines. 1 relevé manquant.');
  });
});
```

- [ ] **Step 2: Run to see it fail**

Run: `npx vitest run tests/logique/tableau-bord.test.js`
Expected: FAIL (module absent).

- [ ] **Step 3: Implement** `src/logique/tableau-bord.js`

```js
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
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run tests/logique/tableau-bord.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/logique/tableau-bord.js tests/logique/tableau-bord.test.js
git commit -m "Tableau de bord : séries, classement, écarts avec les cibles et rétrospective

Co-Authored-By: <modèle auteur>"
```

---

### Task 3 : dépôt des relevés

**Files:**
- Modify: `src/donnees/depot.js`
- Test: `tests/donnees/depot.test.js`

**Interfaces:**
- Consumes : `RELEVES`, `idReleve` (Task 1).
- Produces (méthodes de `creerDepot(db)`) :
  - `lireRelevesFiche(ficheId)` → `Promise<relevé[]>` (0 à 2 documents `{ id, ...data }`) ;
  - `enregistrerReleveContenu(doc)`, qui écrit `stats_contenu/<doc.id>` sans le champ `id` ;
  - `ecouterStats(depuisIso, rappel, erreur)`, qui écoute `stats_contenu` où `date_publication >= depuisIso` ;
  - `enregistrerReleveCompte(doc)`, qui écrit `releves_compte/<doc.id>` sans `id` ;
  - `ecouterRelevesCompte(rappel, erreur)`.

- [ ] **Step 1: Write the failing tests.** Add them to `tests/donnees/depot.test.js`, which already imports `creerFausseBase` and `creerDepot` :

```js
describe('relevés', () => {
  it('écrit, relit et remplace un relevé de contenu sans doublon', async () => {
    const db = creerFausseBase();
    const depot = creerDepot(db);
    await depot.enregistrerReleveContenu({ id: 'f1_48h', fiche: 'f1', releve: '48h', vues: 10, date_publication: '2026-09-20T10:00:00.000Z' });
    await depot.enregistrerReleveContenu({ id: 'f1_48h', fiche: 'f1', releve: '48h', vues: 12, date_publication: '2026-09-20T10:00:00.000Z' });
    const lus = await depot.lireRelevesFiche('f1');
    expect(lus).toEqual([{ id: 'f1_48h', fiche: 'f1', releve: '48h', vues: 12, date_publication: '2026-09-20T10:00:00.000Z' }]);
    expect(await depot.lireRelevesFiche('autre')).toEqual([]);
  });

  it('écoute les relevés publiés depuis une date', async () => {
    const db = creerFausseBase();
    const depot = creerDepot(db);
    const recus = [];
    depot.ecouterStats('2026-09-01T00:00:00.000Z', l => recus.push(l.map(s => s.id)), () => {});
    await depot.enregistrerReleveContenu({ id: 'vieux_7j', fiche: 'vieux', releve: '7j', date_publication: '2026-08-01T00:00:00.000Z' });
    await depot.enregistrerReleveContenu({ id: 'f1_7j', fiche: 'f1', releve: '7j', date_publication: '2026-09-20T00:00:00.000Z' });
    expect(recus.at(-1)).toEqual(['f1_7j']);
  });

  it('écrit et écoute les relevés du compte', async () => {
    const db = creerFausseBase();
    const depot = creerDepot(db);
    const recus = [];
    depot.ecouterRelevesCompte(l => recus.push(l), () => {});
    await depot.enregistrerReleveCompte({ id: '2026-W40', semaine: '2026-W40', debut: '2026-09-27T22:00:00.000Z', abonnes: 100 });
    expect(recus.at(-1)).toEqual([{ id: '2026-W40', semaine: '2026-W40', debut: '2026-09-27T22:00:00.000Z', abonnes: 100 }]);
  });
});
```

- [ ] **Step 2: Run to see it fail**

Run: `npx vitest run tests/donnees/depot.test.js`
Expected: FAIL (`depot.enregistrerReleveContenu is not a function`).

- [ ] **Step 3: Implement.** In `src/donnees/depot.js`, add `import { RELEVES, idReleve } from '../logique/indicateurs.js';`, then these methods to the returned object, after `ecouterConfigVeille` :

```js
    async lireRelevesFiche(ficheId) {
      const lus = await Promise.all(RELEVES.map(r => db.doc(`stats_contenu/${idReleve(ficheId, r)}`).get()));
      return lus.filter(s => s.exists).map(s => ({ id: s.id, ...s.data() }));
    },

    async enregistrerReleveContenu(doc) {
      const { id, ...corps } = doc;
      await db.doc(`stats_contenu/${id}`).set(corps);
    },

    ecouterStats(depuisIso, rappel, erreur) {
      return db.collection('stats_contenu').where('date_publication', '>=', depuisIso)
        .onSnapshot(snap => rappel(snap.docs.map(d => ({ id: d.id, ...d.data() }))), erreur);
    },

    async enregistrerReleveCompte(doc) {
      const { id, ...corps } = doc;
      await db.doc(`releves_compte/${id}`).set(corps);
    },

    ecouterRelevesCompte(rappel, erreur) {
      return db.collection('releves_compte').onSnapshot(snap => rappel(snap.docs.map(d => ({ id: d.id, ...d.data() }))), erreur);
    },
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run tests/donnees/depot.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/donnees/depot.js tests/donnees/depot.test.js
git commit -m "Dépôt : relevés de contenu et relevés du compte

Co-Authored-By: <modèle auteur>"
```

---

### Task 4 : saisie des relevés dans la fiche

**Files:**
- Modify: `src/interface/controleur.js`, `src/interface/panneau-fiche.js`, `src/interface/styles.css`
- Test: `tests/interface/controleur.test.js`, `tests/interface/panneau-fiche.test.js`

**Interfaces:**
- Consumes : Task 1 (`RELEVES`, `CHAMPS_CONTENU`, `validerReleveContenu`, `validerReleveCompte`, `documentReleveContenu`, `documentReleveCompte`, `etatReleves`, `tauxAbonnesParVue`, `formaterValeur`) ; Task 3 (méthodes du dépôt).
- Produces (actions du contrôleur, utilisées par les tâches 5 et 6) :
  - `maintenant()` → ISO ;
  - `lireRelevesFiche(id)` → `{ ok: true, releves }` ou `{ ok: false, raison }` ;
  - `enregistrerReleveContenu(id, releve, saisie)` → `{ ok: true, erreurs: [], releve: doc }` ou `{ ok: false, erreurs }` ;
  - `enregistrerReleveCompte(debutSemaineIso, saisie)` → `{ ok: true, erreurs: [], releve: doc }` ou `{ ok: false, erreurs }` ;
  - `allerAFiche(id, dateHeure)`, qui passe en vue Semaine sur la date de la fiche et ouvre la fiche.

- [ ] **Step 1: Write the failing controller tests.** Add them to `tests/interface/controleur.test.js`, which already has `monter()`, `T` and the imports. Add at the top `import { nouvelleFiche } from '../../src/logique/fiche.js';` if it isn't there already.

```js
describe('relevés de statistiques', () => {
  const avecFiche = statut => {
    const m = monter();
    const f = { ...nouvelleFiche({ id: 'f1', format: 'reel', date_heure: '2026-09-20T10:00:00.000Z', pilier: 'socio', maintenant: T }), statut, accroche: 'Accroche' };
    m.etat.modifier({ fiches: [f] });
    return { ...m, depot: creerDepot(m.db) };
  };
  const saisie = { vues: '100', nouveaux_abonnes: '1', partages_envois: '2' };

  it('refuse la saisie tant que la fiche n’est pas publiée', async () => {
    const { actions, depot } = avecFiche('programme');
    expect(await actions.enregistrerReleveContenu('f1', '48h', saisie))
      .toEqual({ ok: false, erreurs: ['Passe la fiche en « Publié » avant de saisir ses statistiques.'] });
    expect(await depot.lireRelevesFiche('f1')).toEqual([]);
  });

  it('enregistre le relevé d’une fiche publiée', async () => {
    const { actions, depot } = avecFiche('publie');
    const ok = await actions.enregistrerReleveContenu('f1', '48h', saisie);
    expect(ok.ok).toBe(true);
    expect(ok.releve).toMatchObject({ id: 'f1_48h', vues: 100, accroche: 'Accroche', date_publication: '2026-09-20T10:00:00.000Z' });
    expect((await depot.lireRelevesFiche('f1'))[0].vues).toBe(100);
    expect((await actions.lireRelevesFiche('f1')).releves).toHaveLength(1);
  });

  it('n’écrit rien si la saisie est invalide', async () => {
    const { actions, depot } = avecFiche('publie');
    const r = await actions.enregistrerReleveContenu('f1', '7j', { ...saisie, vues: 'abc' });
    expect(r).toEqual({ ok: false, erreurs: ['Vues : nombre entier positif attendu.'] });
    expect(await depot.lireRelevesFiche('f1')).toEqual([]);
  });

  it('refuse un relevé inconnu', async () => {
    const { actions } = avecFiche('publie');
    expect((await actions.enregistrerReleveContenu('f1', '30j', saisie)).erreurs).toEqual(['Relevé inconnu.']);
  });

  it('enregistre le relevé du compte de la semaine', async () => {
    const { actions } = monter();
    const r = await actions.enregistrerReleveCompte('2026-09-27T22:00:00.000Z', { abonnes: '1 500' });
    expect(r.ok).toBe(true);
    expect(r.releve).toMatchObject({ id: '2026-W40', abonnes: 1500, saisi_le: T });
  });

  it('allerAFiche passe en vue Semaine et ouvre la fiche', async () => {
    const { actions, etat } = avecFiche('publie');
    etat.modifier({ vue: 'mois' });
    await actions.allerAFiche('f1', '2026-09-20T10:00:00.000Z');
    expect(etat.lire()).toMatchObject({ vue: 'semaine', ancre: '2026-09-20T10:00:00.000Z', ficheOuverte: 'f1' });
  });

  it('expose l’horloge', () => {
    expect(monter().actions.maintenant()).toBe(T);
  });
});
```

- [ ] **Step 2: Write the failing panel tests.** Add them to `tests/interface/panneau-fiche.test.js` :

```js
describe('section Statistiques', () => {
  const actionsStats = (releves = []) => ({
    ...actionsFactices(),
    maintenant: () => '2026-09-23T10:00:00.000Z',
    lireRelevesFiche: vi.fn(async () => ({ ok: true, releves })),
    enregistrerReleveContenu: vi.fn(async (id, releve, saisie) => ({ ok: true, erreurs: [], releve: { id: `${id}_${releve}`, fiche: id, releve, vues: Number(saisie.vues), nouveaux_abonnes: Number(saisie.nouveaux_abonnes), partages_envois: Number(saisie.partages_envois) } })),
  });
  const publiee = () => fiche({ statut: 'publie', date_heure: '2026-09-20T10:00:00.000Z' });

  it('n’apparaît pas avant la publication', () => {
    const p = panneauFiche(fiche(), fictif, actionsStats(), { assets: true });
    expect(p.querySelector('.stats-fiche')).toBeNull();
  });

  it('signale le relevé à 48 h en retard', async () => {
    const p = panneauFiche(publiee(), fictif, actionsStats(), { assets: true });
    await vi.waitFor(() => expect(p.querySelector('.etiquette-retard')?.textContent).toBe('Stats à saisir'));
    expect(p.querySelector('.stats-fiche').textContent).toContain('Relevé à 48 h');
    expect(p.querySelector('.stats-fiche').textContent).toContain('Relevé à 7 jours');
    expect(p.querySelector('input[name="48h-clics_porte"]')).toBeNull();
  });

  it('enregistre un relevé et affiche le taux', async () => {
    const actions = actionsStats();
    const p = panneauFiche(publiee(), fictif, actions, { assets: true });
    await vi.waitFor(() => expect(p.querySelector('input[name="48h-vues"]')).not.toBeNull());
    saisir(p.querySelector('input[name="48h-vues"]'), '1000');
    saisir(p.querySelector('input[name="48h-nouveaux_abonnes"]'), '4');
    saisir(p.querySelector('input[name="48h-partages_envois"]'), '9');
    p.querySelector('form.releve').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await vi.waitFor(() => expect(p.querySelector('.stats-fiche').textContent).toContain('0,4 % d’abonnés par vue'));
    expect(actions.enregistrerReleveContenu).toHaveBeenCalledWith('f1', '48h', expect.objectContaining({ vues: '1000', nouveaux_abonnes: '4', partages_envois: '9' }));
    expect(p.querySelector('.etiquette-retard')).toBeNull();
  });

  it('affiche les erreurs de saisie', async () => {
    const actions = actionsStats();
    actions.enregistrerReleveContenu = vi.fn(async () => ({ ok: false, erreurs: ['Vues : valeur requise.'] }));
    const p = panneauFiche(publiee(), fictif, actions, { assets: true });
    await vi.waitFor(() => expect(p.querySelector('form.releve')).not.toBeNull());
    p.querySelector('form.releve').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await vi.waitFor(() => expect(p.querySelector('form.releve').textContent).toContain('Vues : valeur requise.'));
  });

  it('propose les clics sur la porte pour une story', async () => {
    const p = panneauFiche({ ...publiee(), format: 'story' }, fictif, actionsStats(), { assets: true });
    await vi.waitFor(() => expect(p.querySelector('input[name="48h-clics_porte"]')).not.toBeNull());
  });
});
```

- [ ] **Step 3: Run to see them fail**

Run: `npx vitest run tests/interface/controleur.test.js tests/interface/panneau-fiche.test.js`
Expected: FAIL.

- [ ] **Step 4: Implement the controller.** In `src/interface/controleur.js`, add this import :

```js
import { RELEVES, validerReleveContenu, validerReleveCompte, documentReleveContenu, documentReleveCompte } from '../logique/indicateurs.js';
```

Then add these entries to the returned actions object, for example after `effacerErreur` :

```js
    maintenant: () => horloge(),

    async lireRelevesFiche(id) {
      try {
        return { ok: true, releves: await depot.lireRelevesFiche(id) };
      } catch {
        return { ok: false, raison: 'Les relevés ne peuvent pas être lus pour le moment : réessaie dans un instant.' };
      }
    },

    async enregistrerReleveContenu(id, releve, saisie) {
      const f = trouver(id);
      if (!f) return { ok: false, erreurs: ['Fiche introuvable.'] };
      if (f.statut !== 'publie') return { ok: false, erreurs: ['Passe la fiche en « Publié » avant de saisir ses statistiques.'] };
      if (!RELEVES.includes(releve)) return { ok: false, erreurs: ['Relevé inconnu.'] };
      const v = validerReleveContenu(saisie);
      if (!v.ok) return v;
      const doc = documentReleveContenu(f, releve, v.valeurs, horloge());
      try {
        await depot.enregistrerReleveContenu(doc);
      } catch {
        return { ok: false, erreurs: ['L’enregistrement a échoué : réessaie dans un instant.'] };
      }
      return { ok: true, erreurs: [], releve: doc };
    },

    async enregistrerReleveCompte(debutSemaineIso, saisie) {
      const v = validerReleveCompte(saisie);
      if (!v.ok) return v;
      const doc = documentReleveCompte(debutSemaineIso, fuseau(), v.valeurs, horloge());
      try {
        await depot.enregistrerReleveCompte(doc);
      } catch {
        return { ok: false, erreurs: ['L’enregistrement a échoué : réessaie dans un instant.'] };
      }
      return { ok: true, erreurs: [], releve: doc };
    },

    async allerAFiche(id, dateHeure) {
      await changerAncre('semaine', dateHeure);
      etat.modifier({ ficheOuverte: id, erreur: null });
    },
```

- [ ] **Step 5: Implement the panel section.** In `src/interface/panneau-fiche.js` :

1. Add these imports :

```js
import { RELEVES, CHAMPS_CONTENU, etatReleves, tauxAbonnesParVue, formaterValeur } from '../logique/indicateurs.js';
```

2. Add this constant next to the others :

```js
const LIBELLES_RELEVE = { '48h': 'Relevé à 48 h', '7j': 'Relevé à 7 jours' };
```

3. Add this function inside `panneauFiche`, before `construire` :

```js
  const sectionStats = () => {
    if (brouillon.statut !== 'publie' || typeof actions.lireRelevesFiche !== 'function') return null;
    const zone = h('section', { class: 'stats-fiche' }, h('h3', {}, 'Statistiques'), h('p', { class: 'aide' }, 'Chargement des relevés…'));
    const dateLocale = iso => new Date(iso).toLocaleString('fr-FR', { timeZone: fz, dateStyle: 'medium', timeStyle: 'short' });
    const champsVisibles = CHAMPS_CONTENU.filter(c => c.cle !== 'clics_porte' || brouillon.format === 'story');

    function formulaire(r, existant, e, releves) {
      const entrees = champsVisibles.map(c => h('input', {
        type: 'number', min: '0', step: '1', inputmode: 'numeric', name: `${r}-${c.cle}`, value: existant?.[c.cle] ?? '',
      }));
      const retour = h('p', { class: 'aide', role: 'status' });
      const taux = tauxAbonnesParVue(existant);
      const etatTexte = e.etat === 'saisi'
        ? `Saisi${taux != null ? ` : ${formaterValeur('taux_abonnes_par_vue', taux)} d’abonnés par vue` : ''}.`
        : e.etat === 'a_saisir' ? 'À saisir.' : `À saisir à partir du ${dateLocale(e.du_le)}.`;
      return h('form', {
        class: 'releve',
        onsubmit: async ev => {
          ev.preventDefault();
          const saisie = Object.fromEntries(champsVisibles.map((c, i) => [c.cle, entrees[i].value]));
          retour.textContent = 'Enregistrement…';
          const res = await actions.enregistrerReleveContenu(id, r, saisie);
          if (!res.ok) { retour.textContent = res.erreurs.join(' '); return; }
          dessiner([...releves.filter(s => s.releve !== r), res.releve]);
        },
      },
      h('h4', {}, LIBELLES_RELEVE[r]),
      h('p', { class: `aide releve-${e.etat}` }, etatTexte),
      h('div', { class: 'grille-champs' }, champsVisibles.map((c, i) => champ(c.libelle, entrees[i]))),
      h('button', { type: 'submit', class: 'bouton-secondaire' }, existant ? 'Mettre à jour' : 'Enregistrer'),
      retour);
    }

    function dessiner(releves) {
      const etats = etatReleves(brouillon, releves, actions.maintenant());
      zone.replaceChildren(
        h('h3', {}, 'Statistiques'),
        etats.enRetard ? h('span', { class: 'etiquette etiquette-retard' }, 'Stats à saisir') : null,
        RELEVES.map(r => formulaire(r, releves.find(s => s.releve === r), etats[r], releves)));
    }

    actions.lireRelevesFiche(id).then(res => {
      if (!res.ok) { zone.replaceChildren(h('h3', {}, 'Statistiques'), h('p', { class: 'aide' }, res.raison)); return; }
      dessiner(res.releves);
    });
    return zone;
  };
```

4. In `construire()`, insert `sectionStats()` right after `elementScore` in the `racine.replaceChildren(...)` list.

- [ ] **Step 6: Add the styles** at the end of `src/interface/styles.css` :

```css
.stats-fiche { display: grid; gap: 12px; }
.releve { display: grid; gap: 8px; padding: 12px; border: 1px solid var(--trait); border-radius: var(--rayon); background: var(--surface-2); }
.releve h4 { margin: 0; }
.releve-a_saisir { color: var(--orange); font-weight: 600; }
.etiquette-retard { background: var(--orange); color: var(--surface); }
```

- [ ] **Step 7: Run the tests**

Run: `npx vitest run tests/interface/controleur.test.js tests/interface/panneau-fiche.test.js`, puis `npm test`.
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/interface/controleur.js src/interface/panneau-fiche.js src/interface/styles.css tests/interface/controleur.test.js tests/interface/panneau-fiche.test.js
git commit -m "Fiche : saisie des relevés à 48 h et à 7 jours, pastille « Stats à saisir »

Co-Authored-By: <modèle auteur>"
```

---

### Task 5 : graphiques et onglet Tableau de bord

**Files:**
- Create: `src/interface/graphiques.js`, `src/interface/vue-tableau.js`
- Modify: `src/interface/rendu.js`, `src/interface/app.js`, `src/interface/styles.css`
- Test: `tests/interface/graphiques.test.js`, `tests/interface/vue-tableau.test.js`, `tests/interface/app.test.js`

**Interfaces:**
- Consumes :
  - Task 1 : `CHAMPS_COMPTE`, `etatReleves`, `formaterValeur`, `LIBELLES_CIBLES` ;
  - Task 2 : `seriesTableau`, `croissancesNettes` ;
  - Task 3 : `ecouterStats`, `ecouterRelevesCompte`, `ecouterFiches` ;
  - Task 4 : `enregistrerReleveCompte`, `allerAFiche` ;
  - `debutSemaine`, `ajouterJours`, `cleSemaineIso` de `dates.js`.
- Produces :
  - `svgBarres({ valeurs, cible, format })`, `svgCourbe({ points, cible, format })`, `svgNuage({ points, formatY })` → texte SVG, avec des libellés échappés ;
  - `figure(titre, svg, messageVide)` → élément `<figure>` ;
  - `vueTableau(etat, actions)` ;
  - état de l'application : `stats` (liste ou `undefined`), `relevesCompte` (liste ou `undefined`) et `fichesRecentes` (liste).

- [ ] **Step 1: Write the failing chart tests** : `tests/interface/graphiques.test.js`

```js
// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import { svgBarres, svgCourbe, svgNuage, figure } from '../../src/interface/graphiques.js';

const monter = svg => { const d = document.createElement('div'); d.innerHTML = svg; return d; };

describe('graphiques', () => {
  it('dessine une barre par valeur, la ligne de cible et échappe les libellés', () => {
    const d = monter(svgBarres({ valeurs: [{ etiquette: 'W38', valeur: 5, titre: '<script>x</script>' }, { etiquette: 'W39', valeur: -3, titre: 'b' }], cible: 4, format: String }));
    expect(d.querySelectorAll('rect.barre').length).toBe(2);
    expect(d.querySelector('line.cible')).not.toBeNull();
    expect(d.innerHTML).not.toContain('<script>');
    expect(d.querySelector('title').textContent).toBe('<script>x</script> : 5');
  });
  it('sans cible, pas de ligne de cible', () => {
    expect(monter(svgBarres({ valeurs: [{ etiquette: 'a', valeur: 1, titre: 'a' }], cible: null, format: String })).querySelector('line.cible')).toBeNull();
  });
  it('trace une courbe et un nuage', () => {
    const c = monter(svgCourbe({ points: [{ etiquette: '1', valeur: 0.002, titre: 'a' }, { etiquette: '2', valeur: 0.004, titre: 'b' }], cible: 0.003, format: String }));
    expect(c.querySelector('polyline')).not.toBeNull();
    expect(c.querySelectorAll('circle').length).toBe(2);
    const n = monter(svgNuage({ points: [{ x: 70, y: 0.003, titre: 'a' }], formatY: String }));
    expect(n.querySelectorAll('circle').length).toBe(1);
  });
  it('une figure vide affiche son message', () => {
    const f = figure('Titre', '', 'Pas encore de relevé.');
    expect(f.querySelector('figcaption').textContent).toBe('Titre');
    expect(f.textContent).toContain('Pas encore de relevé.');
  });
});
```

- [ ] **Step 2: Write the failing view tests** : `tests/interface/vue-tableau.test.js`

```js
// @vitest-environment happy-dom
import { describe, it, expect, vi } from 'vitest';
import fictif from '../../exemples/profil-fictif.json';
import { vueTableau } from '../../src/interface/vue-tableau.js';

const MAINTENANT = '2026-09-29T08:00:00.000Z';
const stat = (fiche, extra = {}) => ({ id: `${fiche}_7j`, fiche, releve: '7j', vues: 1000, nouveaux_abonnes: 3, partages_envois: 10, date_publication: '2026-09-15T10:00:00.000Z', format: 'reel', pilier: 'socio', accroche: `Accroche ${fiche}`, score_total: 70, ...extra });
const actions = () => ({ enregistrerReleveCompte: vi.fn(async () => ({ ok: true, erreurs: [], releve: {} })), allerAFiche: vi.fn() });
const etat = extra => ({ profil: fictif, stats: [stat('a'), stat('b', { nouveaux_abonnes: 1 })], relevesCompte: [], fichesRecentes: [], maintenant: MAINTENANT, ...extra });

describe('vueTableau', () => {
  it('attend les données', () => {
    expect(vueTableau(etat({ stats: undefined }), actions()).textContent).toContain('Chargement du tableau de bord…');
  });
  it('affiche les six graphiques et le classement', () => {
    const v = vueTableau(etat(), actions());
    expect([...v.querySelectorAll('figcaption')].map(f => f.textContent)).toEqual([
      'Taux d’abonnés par vue des Reels', 'Partages et envois par post', 'Croissance nette hebdomadaire',
      'Clics sur la porte', 'Meilleurs et pires contenus', 'Score prévu / performance réelle',
    ]);
    expect(v.textContent).toContain('Accroche a');
  });
  it('fonctionne sans cibles dans le profil', () => {
    const sans = structuredClone(fictif);
    delete sans.regles_studio.cibles;
    const v = vueTableau(etat({ profil: sans }), actions());
    expect(v.querySelector('line.cible')).toBeNull();
  });
  it('liste les relevés à saisir et ouvre la fiche', () => {
    const f = { id: 'p1', statut: 'publie', date_heure: '2026-09-25T10:00:00.000Z', format: 'reel', accroche: 'Publiée' };
    const a = actions();
    const v = vueTableau(etat({ fichesRecentes: [f] }), a);
    expect(v.querySelector('.a-saisir').textContent).toContain('Publiée');
    [...v.querySelectorAll('.a-saisir button')].find(b => b.textContent === 'Ouvrir').click();
    expect(a.allerAFiche).toHaveBeenCalledWith('p1', '2026-09-25T10:00:00.000Z');
  });
  it('enregistre le relevé du compte de la semaine choisie', async () => {
    const a = actions();
    const v = vueTableau(etat(), a);
    const form = v.querySelector('form.releve-compte');
    form.querySelector('input[name="abonnes"]').value = '1500';
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await vi.waitFor(() => expect(a.enregistrerReleveCompte).toHaveBeenCalled());
    // Semaine en cours au 2026-09-29 (Paris) : lundi 2026-09-28 00:00 locale = 2026-09-27T22:00Z
    expect(a.enregistrerReleveCompte.mock.calls[0][0]).toBe('2026-09-27T22:00:00.000Z');
    expect(a.enregistrerReleveCompte.mock.calls[0][1]).toMatchObject({ abonnes: '1500' });
  });
});
```

- [ ] **Step 3: Run to see them fail**

Run: `npx vitest run tests/interface/graphiques.test.js tests/interface/vue-tableau.test.js`
Expected: FAIL (modules absents).

- [ ] **Step 4: Implement** `src/interface/graphiques.js`

```js
import { h } from './h.js';

const L = 360; const H = 180; const M = { haut: 12, droite: 12, bas: 28, gauche: 44 };
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ouvrir = libelle => `<svg viewBox="0 0 ${L} ${H}" class="graphique-svg" role="img" aria-label="${esc(libelle)}">`;

function echelle(valeurs, cible) {
  const toutes = [...valeurs, ...(cible != null ? [cible] : []), 0];
  const min = Math.min(...toutes);
  const max = Math.max(...toutes);
  const etendue = max - min || 1;
  const hautUtile = H - M.haut - M.bas;
  return v => M.haut + (max - v) / etendue * hautUtile;
}

function axeEtCible(y, cible, format) {
  let s = `<line class="axe" x1="${M.gauche}" x2="${L - M.droite}" y1="${y(0)}" y2="${y(0)}"/>`;
  if (cible != null) {
    s += `<line class="cible" x1="${M.gauche}" x2="${L - M.droite}" y1="${y(cible)}" y2="${y(cible)}"/>`;
    s += `<text class="cible-texte" x="${L - M.droite}" y="${y(cible) - 4}" text-anchor="end">Cible ${esc(format(cible))}</text>`;
  }
  return s;
}

export function svgBarres({ valeurs, cible = null, format = String }) {
  if (!valeurs.length) return '';
  const y = echelle(valeurs.map(v => v.valeur), cible);
  const pas = (L - M.gauche - M.droite) / valeurs.length;
  const largeur = Math.max(2, pas * 0.7);
  let s = ouvrir('Graphique en barres');
  valeurs.forEach((v, i) => {
    const x = M.gauche + i * pas + (pas - largeur) / 2;
    const haut = Math.min(y(v.valeur), y(0));
    const hauteur = Math.max(1, Math.abs(y(0) - y(v.valeur)));
    s += `<rect class="barre${v.valeur < 0 ? ' barre-negative' : ''}" x="${x}" y="${haut}" width="${largeur}" height="${hauteur}"><title>${esc(v.titre)} : ${esc(format(v.valeur))}</title></rect>`;
    if (valeurs.length <= 12) s += `<text class="etiquette-axe" x="${x + largeur / 2}" y="${H - 8}" text-anchor="middle">${esc(v.etiquette)}</text>`;
  });
  return `${s}${axeEtCible(y, cible, format)}</svg>`;
}

export function svgCourbe({ points, cible = null, format = String }) {
  if (!points.length) return '';
  const y = echelle(points.map(p => p.valeur), cible);
  const pas = points.length > 1 ? (L - M.gauche - M.droite) / (points.length - 1) : 0;
  const xs = points.map((_, i) => M.gauche + i * pas);
  let s = ouvrir('Courbe');
  s += `<polyline class="courbe" fill="none" points="${points.map((p, i) => `${xs[i]},${y(p.valeur)}`).join(' ')}"/>`;
  points.forEach((p, i) => { s += `<circle class="point" cx="${xs[i]}" cy="${y(p.valeur)}" r="3"><title>${esc(p.titre)} : ${esc(format(p.valeur))}</title></circle>`; });
  return `${s}${axeEtCible(y, cible, format)}</svg>`;
}

export function svgNuage({ points, formatY = String }) {
  if (!points.length) return '';
  const y = echelle(points.map(p => p.y), null);
  const x = v => M.gauche + (Math.max(0, Math.min(100, v)) / 100) * (L - M.gauche - M.droite);
  let s = ouvrir('Nuage de points');
  s += `<line class="axe" x1="${M.gauche}" x2="${L - M.droite}" y1="${y(0)}" y2="${y(0)}"/>`;
  s += `<text class="etiquette-axe" x="${M.gauche}" y="${H - 8}">Score 0</text><text class="etiquette-axe" x="${L - M.droite}" y="${H - 8}" text-anchor="end">100</text>`;
  points.forEach(p => { s += `<circle class="point" cx="${x(p.x)}" cy="${y(p.y)}" r="4"><title>${esc(p.titre)} : score ${esc(p.x)}, ${esc(formatY(p.y))}</title></circle>`; });
  return `${s}</svg>`;
}

export function figure(titre, svg, messageVide) {
  const corps = h('div', { class: 'graphique-corps' });
  if (svg) corps.innerHTML = svg;
  else corps.append(h('p', { class: 'aide' }, messageVide));
  return h('figure', { class: 'graphique' }, h('figcaption', {}, titre), corps);
}
```

- [ ] **Step 5: Implement** `src/interface/vue-tableau.js`

```js
import { h } from './h.js';
import { svgBarres, svgCourbe, svgNuage, figure } from './graphiques.js';
import { seriesTableau, croissancesNettes } from '../logique/tableau-bord.js';
import { CHAMPS_COMPTE, etatReleves, formaterValeur } from '../logique/indicateurs.js';
import { debutSemaine, ajouterJours, cleSemaineIso, libelleJour } from '../logique/dates.js';
import { LIBELLES_FORMAT } from '../logique/fiche.js';

const VIDE = 'Pas encore de relevé.';
const pct = v => formaterValeur('taux_abonnes_par_vue', v);
const entier = v => formaterValeur('partages_par_post', v);

function aSaisir(fichesRecentes, stats, maintenant, fz, actions) {
  const lignes = fichesRecentes.filter(f => f.statut === 'publie').flatMap(f => {
    const e = etatReleves(f, stats.filter(s => s.fiche === f.id), maintenant);
    return e.enRetard ? [{ f, releves: ['48h', '7j'].filter(r => e[r].etat === 'a_saisir') }] : [];
  });
  return h('section', { class: 'a-saisir' }, h('h3', {}, 'Relevés à saisir'),
    lignes.length
      ? h('ul', {}, lignes.map(({ f, releves }) => h('li', {},
        h('span', {}, `${LIBELLES_FORMAT[f.format]} · ${libelleJour(f.date_heure, fz)} · ${f.accroche || 'Sans accroche'} · ${releves.map(r => (r === '48h' ? '48 h' : '7 jours')).join(' et ')}`),
        h('button', { type: 'button', class: 'bouton-lien', onclick: () => actions.allerAFiche(f.id, f.date_heure) }, 'Ouvrir'))))
      : h('p', { class: 'aide' }, 'Tous les relevés dus sont saisis.'));
}

function releveCompte(relevesCompte, maintenant, fz, actions) {
  const cette = debutSemaine(maintenant, fz);
  const semaines = [[cette, `Cette semaine (${cleSemaineIso(cette, fz)})`], [ajouterJours(cette, -7, fz), `Semaine dernière (${cleSemaineIso(ajouterJours(cette, -7, fz), fz)})`]];
  const choix = h('select', { name: 'semaine' }, semaines.map(([v, t]) => h('option', { value: v }, t)));
  const entrees = CHAMPS_COMPTE.map(c => h('input', { type: 'number', min: '0', step: '1', inputmode: 'numeric', name: c.cle }));
  const retour = h('p', { class: 'aide', role: 'status' });
  const remplir = () => {
    const existant = relevesCompte.find(r => r.semaine === cleSemaineIso(choix.value, fz));
    CHAMPS_COMPTE.forEach((c, i) => { entrees[i].value = existant?.[c.cle] ?? ''; });
  };
  choix.addEventListener('change', remplir);
  remplir();
  const derniere = croissancesNettes(relevesCompte, fz).at(-1);
  return h('form', {
    class: 'releve-compte',
    onsubmit: async ev => {
      ev.preventDefault();
      retour.textContent = 'Enregistrement…';
      const saisie = Object.fromEntries(CHAMPS_COMPTE.map((c, i) => [c.cle, entrees[i].value]));
      const r = await actions.enregistrerReleveCompte(choix.value, saisie);
      retour.textContent = r.ok ? 'Relevé du compte enregistré.' : r.erreurs.join(' ');
    },
  },
  h('h3', {}, 'Relevé du compte'),
  derniere ? h('p', { class: 'aide' }, `Dernier relevé : ${derniere.semaine}, ${entier(derniere.abonnes)} abonnés${derniere.croissance != null ? `, croissance nette ${derniere.croissance >= 0 ? '+' : ''}${entier(derniere.croissance)}` : ''}.`) : null,
  h('label', { class: 'champ' }, h('span', { class: 'champ-libelle' }, 'Semaine'), choix),
  h('div', { class: 'grille-champs' }, CHAMPS_COMPTE.map((c, i) => h('label', { class: 'champ' }, h('span', { class: 'champ-libelle' }, c.libelle), entrees[i]))),
  h('button', { type: 'submit', class: 'bouton-secondaire' }, 'Enregistrer le relevé'),
  retour);
}

function classement({ meilleurs, pires }) {
  if (!meilleurs.length) return figure('Meilleurs et pires contenus', '', VIDE);
  const ligne = s => h('li', {}, `${s.accroche || 'Sans accroche'} : ${pct(s.taux)} d’abonnés par vue, ${entier(s.partages_envois)} partages et envois`);
  const f = figure('Meilleurs et pires contenus', '', '');
  f.querySelector('.graphique-corps').replaceChildren(
    h('h4', {}, 'Meilleurs'), h('ol', {}, meilleurs.map(ligne)),
    pires.length ? [h('h4', {}, 'Pires'), h('ol', {}, pires.map(ligne))] : null);
  return f;
}

export function vueTableau({ profil, stats, relevesCompte, fichesRecentes = [], maintenant }, actions) {
  const r = profil.regles_studio;
  const fz = r.fuseau;
  if (stats === undefined || relevesCompte === undefined) return h('div', { class: 'tableau' }, h('p', { class: 'aide' }, 'Chargement du tableau de bord…'));
  const c = r.cibles ?? {};
  const s = seriesTableau({ stats, relevesCompte, fuseau: fz });
  const jour = iso => new Date(iso).toLocaleDateString('fr-FR', { timeZone: fz, day: 'numeric', month: 'short' });
  return h('div', { class: 'tableau' },
    h('div', { class: 'tableau-saisie' }, aSaisir(fichesRecentes, stats, maintenant, fz, actions), releveCompte(relevesCompte, maintenant, fz, actions)),
    h('div', { class: 'graphiques' },
      figure('Taux d’abonnés par vue des Reels', svgCourbe({ points: s.reels.map(p => ({ etiquette: jour(p.date), valeur: p.valeur, titre: p.libelle })), cible: c.taux_abonnes_par_vue ?? null, format: pct }), VIDE),
      figure('Partages et envois par post', svgBarres({ valeurs: s.partages.slice(-12).map(p => ({ etiquette: jour(p.date), valeur: p.valeur, titre: p.libelle })), cible: c.partages_par_post ?? null, format: entier }), VIDE),
      figure('Croissance nette hebdomadaire', svgBarres({ valeurs: s.croissance.map(p => ({ etiquette: p.semaine.slice(5), valeur: p.valeur, titre: p.semaine })), cible: c.croissance_nette_semaine ?? null, format: entier }), 'Il faut deux relevés du compte consécutifs.'),
      figure('Clics sur la porte', svgBarres({ valeurs: s.porte.map(p => ({ etiquette: p.semaine.slice(5), valeur: p.valeur, titre: p.semaine })), cible: c.clics_porte_semaine ?? null, format: entier }), VIDE),
      classement(s.classement),
      figure('Score prévu / performance réelle', svgNuage({ points: s.scoreReel.map(p => ({ x: p.score, y: p.valeur, titre: p.libelle })), formatY: pct }), 'Aucun contenu évalué et relevé.')));
}
```

- [ ] **Step 6: Wire the tab.** In `src/interface/rendu.js` :
  - add `import { vueTableau } from './vue-tableau.js';` ;
  - in `barre`, insert the tab `onglet('tableau', 'Tableau de bord')` right after the Bulletin tab ;
  - hide the period navigation on the dashboard : replace `if (aProfil && e.vue !== 'profil')` with `if (aProfil && e.vue !== 'profil' && e.vue !== 'tableau')` ;
  - in `contenuVue`, add `if (e.vue === 'tableau') return vueTableau(e, actions);` before the `bulletin` line ;
  - in `reconstructionRequise`, non-profile branch, add `|| memo.stats !== e.stats || memo.relevesCompte !== e.relevesCompte || memo.fichesRecentes !== e.fichesRecentes` ;
  - add `stats: e.stats, relevesCompte: e.relevesCompte, fichesRecentes: e.fichesRecentes` to the `memo` object.

- [ ] **Step 7: Wire the subscriptions.** In `src/interface/app.js` :
  - in the initial state, add `stats: undefined, relevesCompte: undefined, fichesRecentes: []` ;
  - after `let derniereVersionVerifiee = null;`, add `let statsDemarrees = false;` ;
  - in the subscriber, inside `if (e.profil) {`, add at the top :

```js
      if (!statsDemarrees) {
        statsDemarrees = true;
        const maintenant = Date.parse(horloge());
        const jours = n => new Date(maintenant - n * 86400000).toISOString();
        depot.ecouterStats(jours(84), stats => etat.modifier({ stats }), err => etat.modifier({ erreur: messageErreurBase(err), stats: [] }));
        depot.ecouterRelevesCompte(relevesCompte => etat.modifier({ relevesCompte }), err => etat.modifier({ erreur: messageErreurBase(err), relevesCompte: [] }));
        depot.ecouterFiches(jours(14), new Date(maintenant + 86400000).toISOString(), fichesRecentes => etat.modifier({ fichesRecentes }), err => etat.modifier({ erreur: messageErreurBase(err) }));
      }
```

- [ ] **Step 8: Add an app test** to `tests/interface/app.test.js`, in the style of the neighbouring tests (fake base, profile imported, `horloge` fixed at `2026-09-28T08:00:00.000Z`) :

```js
  it('affiche le tableau de bord avec les relevés de la base', async () => {
    const db = creerFausseBase();
    await db.doc('profil/courant').set({ ...fictif, version: 1 });
    await db.doc('stats_contenu/a_7j').set({ fiche: 'a', releve: '7j', vues: 1000, nouveaux_abonnes: 5, partages_envois: 12, date_publication: '2026-09-15T10:00:00.000Z', format: 'reel', pilier: 'socio', accroche: 'Accroche fictive', score_total: 70 });
    const racine = document.createElement('div');
    const app = await demarrer(racine, { use: async nom => (nom === 'db' ? db : null) }, { horloge });
    await app.actions.changerVue('tableau');
    await vi.waitFor(() => expect(racine.textContent).toContain('Accroche fictive'));
    expect(racine.textContent).toContain('Relevé du compte');
  });
```

- [ ] **Step 9: Add the styles** at the end of `src/interface/styles.css` :

```css
.tableau { display: grid; gap: 20px; }
.tableau-saisie { display: grid; gap: 16px; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); }
.a-saisir ul { display: grid; gap: 6px; padding: 0; list-style: none; }
.releve-compte { display: grid; gap: 8px; padding: 12px; border: 1px solid var(--trait); border-radius: var(--rayon); background: var(--surface); }
.graphiques { display: grid; gap: 16px; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); }
.graphique { margin: 0; padding: 12px; border: 1px solid var(--trait); border-radius: var(--rayon); background: var(--surface); }
.graphique figcaption { font-weight: 600; margin-bottom: 8px; }
.graphique-svg { width: 100%; height: auto; display: block; }
.graphique-svg .barre { fill: var(--accent); }
.graphique-svg .barre-negative { fill: var(--rouge); }
.graphique-svg .courbe { stroke: var(--accent); stroke-width: 2; }
.graphique-svg .point { fill: var(--accent); }
.graphique-svg .axe { stroke: var(--trait); }
.graphique-svg .cible { stroke: var(--texte-2); stroke-dasharray: 4 3; }
.graphique-svg text { fill: var(--texte-2); font-size: 10px; font-family: var(--police); }
```

- [ ] **Step 10: Run the tests**

Run: `npx vitest run tests/interface`, puis `npm test` et `npm run build`.
Expected: PASS. Le build sort `dist/studio.html` sans erreur.

- [ ] **Step 11: Commit**

```bash
git add src/interface/graphiques.js src/interface/vue-tableau.js src/interface/rendu.js src/interface/app.js src/interface/styles.css tests/interface/graphiques.test.js tests/interface/vue-tableau.test.js tests/interface/app.test.js
git commit -m "Tableau de bord : six graphiques, relevés à saisir et relevé du compte

Co-Authored-By: <modèle auteur>"
```

---

### Task 6 : rétrospective de la veille

**Files:**
- Modify: `src/logique/veille.js`, `scripts/veille.mjs`, `src/claude/veille.md`, `src/interface/vue-bulletin.js`, `src/interface/styles.css`
- Test: `tests/logique/veille.test.js`, `tests/scripts/veille.test.js`, `tests/claude/veille-consignes.test.js`, `tests/interface/vue-bulletin.test.js`

**Interfaces:**
- Consumes : `retrospective`, `RAPPEL_RETROSPECTIVE` (Task 2) ; `formaterValeur` (Task 1).
- Produces :
  - `construireVeille({ profil, fiches, entree, maintenant, idAleatoire, stats = [], relevesCompte = [] })`. `bulletin.retrospective` est le résultat de `retrospective(...)` ;
  - `veille.mjs construire` accepte `--stats <dossier>` et `--releves <dossier>`, tous deux facultatifs : un dossier absent vaut une liste vide.

- [ ] **Step 1: Write the failing logic tests.** Add them to `tests/logique/veille.test.js`, in the `construireVeille` describe block, reusing the file's `entree()` and `fiche()` :

```js
  it('rétrospective : bilan à partir des relevés des 2 semaines précédentes', () => {
    const stats = [{ id: 'x_7j', fiche: 'x', releve: '7j', vues: 1000, nouveaux_abonnes: 4, partages_envois: 12, date_publication: '2026-09-22T10:00:00.000Z', format: 'reel', accroche: 'Accroche x', score_total: 70 }];
    const r = construireVeille({ profil: { ...fictif, version: 1 }, fiches: [], entree: entree(), maintenant: '2026-09-27T18:00:00.000Z', idAleatoire: () => `id${n++}`, stats, relevesCompte: [] });
    expect(r.bulletin.retrospective.type).toBe('bilan');
    expect(r.bulletin.retrospective.meilleur.fiche).toBe('x');
  });
  it('rétrospective : rappel sans relevés, comme avant', () => {
    const r = construireVeille({ profil: { ...fictif, version: 1 }, fiches: [], entree: entree(), maintenant: '2026-09-27T18:00:00.000Z', idAleatoire: () => `id${n++}` });
    expect(r.bulletin.retrospective.type).toBe('rappel');
  });
```

- [ ] **Step 2: Write the failing script test.** Add it to `tests/scripts/veille.test.js`, in the `construire` describe block, reusing `deps` and an existing set of files for a successful `construire`. Copy that set from the nearest passing `construire` test :

```js
  it('lit les relevés passés en --stats et --releves', () => {
    const fichiers = {
      'p.json': fictif, 'e.json': entree,
      'st/x_7j.json': { fiche: 'x', releve: '7j', vues: 1000, nouveaux_abonnes: 4, partages_envois: 12, date_publication: '2026-09-22T10:00:00.000Z', format: 'reel', accroche: 'Accroche x', score_total: 70 },
    };
    const d = deps(fichiers, '2026-09-27T18:00:00.000Z');
    const r = executer(['construire', '--profil', 'p.json', '--fiches', 'fi', '--entree', 'e.json', '--sortie', 's.json', '--stats', 'st', '--releves', 'rc'], d);
    expect(r.code).toBe(0);
    const bulletin = d.ecrits['s.json'].ecritures.find(e => e.collection === 'bulletins').data;
    expect(bulletin.retrospective.type).toBe('bilan');
    expect(bulletin.retrospective.meilleur.fiche).toBe('x');
  });
```

- [ ] **Step 3: Write the failing tests for the instructions and the bulletin view.** In `tests/claude/veille-consignes.test.js`, add `'stats_contenu'`, `'releves_compte'`, `'--stats'` and `'--releves'` to the `attendu` list. In `tests/interface/vue-bulletin.test.js`, reuse the file's `bulletin()` and `etat()` factories and add :

```js
  it('affiche une rétrospective avec bilan', () => {
    const b = bulletin();
    b.retrospective = {
      type: 'bilan', texte: '2 contenus relevés sur les 2 dernières semaines.',
      meilleur: { fiche: 'a', accroche: 'Le meilleur', format: 'reel', taux: 0.009, partages_envois: 30 },
      pire: { fiche: 'b', accroche: 'Le pire', format: 'reel', taux: 0.001, partages_envois: 2 },
      ecarts: [{ indicateur: 'croissance_nette_semaine', libelle: 'Croissance nette de la semaine', valeur: 80, cible: 100, atteinte: false }],
      manquants: [{ fiche: 'c', releve: '48h', accroche: 'Oubliée' }],
    };
    const el = vueBulletin(etat({ bulletin: b }), actions());
    expect(el.textContent).toContain('Meilleur contenu : « Le meilleur » (0,9 % d’abonnés par vue, 30 partages et envois).');
    expect(el.textContent).toContain('Croissance nette de la semaine : 80 pour une cible de 100 (en dessous).');
    expect(el.textContent).toContain('Relevés manquants : Oubliée (48 h).');
  });
```

- [ ] **Step 4: Run to see them fail**

Run: `npx vitest run tests/logique/veille.test.js tests/scripts/veille.test.js tests/claude/veille-consignes.test.js tests/interface/vue-bulletin.test.js`
Expected: FAIL.

- [ ] **Step 5: Implement the logic.** In `src/logique/veille.js` :
  - add `import { retrospective } from './tableau-bord.js';` ;
  - delete the local constant `RAPPEL_RETROSPECTIVE` ;
  - change the signature to `export function construireVeille({ profil, fiches, entree, maintenant, idAleatoire, stats = [], relevesCompte = [] })` ;
  - replace `retrospective: { type: 'rappel', texte: RAPPEL_RETROSPECTIVE },` with :

```js
    retrospective: retrospective({ stats, relevesCompte, fiches, cibles: r.cibles, fuseau: fz, debutSemaineVisee: debut, maintenant }),
```

- [ ] **Step 6: Implement the script.** In `scripts/veille.mjs` :
  - in `USAGE`, add ` --stats <dossier> --releves <dossier>` inside the square brackets of the optional options ;
  - before the call to `construireVeille`, add :

```js
    const lireDossier = dossier => (dossier ? listerJson(dossier).map(({ nom, contenu }) => ({ id: contenu?.id ?? nom.replace(/\.json$/, ''), ...document(contenu) })) : []);
    const stats = lireDossier(o.stats);
    const relevesCompte = lireDossier(o.releves);
```

  - pass `stats, relevesCompte` to `construireVeille({ ... })`.

  `listerJson` already returns `[]` for a missing folder in the real run. In tests, the `deps` mock returns `[]` for an unknown folder.

- [ ] **Step 7: Update the instructions** `src/claude/veille.md` :
  - At the end of step 2, add :

```markdown
- Lis aussi les relevés de statistiques :
  - `ArtifactData` `query` sur `STUDIO`, avec `collection: "stats_contenu"` et `query: { where: [["date_publication", ">=", lecture_debut], ["date_publication", "<", debut]] }`, avec `out_dir` = `veille-tmp/`. Les fichiers arrivent dans `veille-tmp/stats_contenu/` ;
  - `ArtifactData` `list` sur `STUDIO`, avec `collection: "releves_compte"`, avec `out_dir` = `veille-tmp/`. Les fichiers arrivent dans `veille-tmp/releves_compte/`.
  - Ces lectures ne sont pas écrites ensuite : elles n'entrent pas dans `versions.json`. Si une collection est vide, continue.
```

  - At the end of step 4, add :

```markdown
Appuie-toi sur les performances passées : les relevés de `veille-tmp/stats_contenu/` montrent ce qui a le mieux marché (taux d'abonnés par vue, puis partages et envois). Reprends les mécaniques des meilleurs contenus et évite celles des pires.
```

  - In step 5, in the `construire` command, add ` --stats veille-tmp/stats_contenu --releves veille-tmp/releves_compte` after `--versions veille-tmp/versions.json`.

- [ ] **Step 8: Implement the bulletin view.** In `src/interface/vue-bulletin.js`, add `import { formaterValeur } from '../logique/indicateurs.js';`, add the function below, then replace the line `h('section', {}, h('h3', {}, 'Rétrospective'), h('p', {}, bulletin.retrospective?.texte ?? '')),` with `sectionRetrospective(bulletin.retrospective),` :

```js
const pct = v => formaterValeur('taux_abonnes_par_vue', v);
const contenu = (libelle, c) => (c
  ? h('p', {}, `${libelle} : « ${c.accroche || 'Sans accroche'} » (${pct(c.taux)} d’abonnés par vue, ${formaterValeur('partages_par_post', c.partages_envois)} partages et envois).`)
  : null);

function sectionRetrospective(retro) {
  const manquants = retro?.manquants ?? [];
  return h('section', {}, h('h3', {}, 'Rétrospective'),
    h('p', {}, retro?.texte ?? ''),
    retro?.type === 'bilan' ? [
      contenu('Meilleur contenu', retro.meilleur),
      contenu('Pire contenu', retro.pire),
      retro.ecarts?.length ? h('ul', { class: 'ecarts' }, retro.ecarts.map(e => h('li', { class: e.atteinte ? 'ecart-atteint' : 'ecart-sous' },
        `${e.libelle} : ${formaterValeur(e.indicateur, e.valeur)} pour une cible de ${formaterValeur(e.indicateur, e.cible)} (${e.atteinte ? 'atteinte' : 'en dessous'}).`))) : null,
    ] : null,
    manquants.length ? h('p', { class: 'aide' }, `Relevés manquants : ${manquants.map(m => `${m.accroche || 'Sans accroche'} (${m.releve === '48h' ? '48 h' : '7 jours'})`).join(', ')}.`) : null);
}
```

Add at the end of `src/interface/styles.css` :

```css
.ecart-atteint { color: var(--vert); }
.ecart-sous { color: var(--orange); }
```

- [ ] **Step 9: Run the tests**

Run: `npx vitest run tests/logique/veille.test.js tests/scripts/veille.test.js tests/claude/veille-consignes.test.js tests/interface/vue-bulletin.test.js`, puis `npm test` et `npm run build`.
Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add src/logique/veille.js scripts/veille.mjs src/claude/veille.md src/interface/vue-bulletin.js src/interface/styles.css tests/logique/veille.test.js tests/scripts/veille.test.js tests/claude/veille-consignes.test.js tests/interface/vue-bulletin.test.js
git commit -m "Veille : rétrospective à partir des relevés de statistiques

Co-Authored-By: <modèle auteur>"
```

---

### Task 7 : mise en ligne et vérification

Cette tâche est faite par le contrôleur, pas par un sous-agent. Elle touche aux studios publiés et à la base.

**Files:**
- Create: `exemples/stats-fictives.json` (relevés **fictifs** pour le studio de test)
- Modify: `README.md`, `docs/superpowers/HANDOFF-brainstorming.md`

- [ ] **Step 1: Fictional statistics.** Write `exemples/stats-fictives.json`, in the form `{ "stats_contenu": [ ... ], "releves_compte": [ ... ] }`. Content :
  - 6 relevés de contenu fictifs : 4 Reels, 1 carrousel, 1 story, publiés entre 3 et 20 jours avant la date du jour, dont 2 fiches avec les deux relevés, avec des accroches fictives et des scores de 50 à 85 ;
  - 4 relevés du compte, sur 4 semaines ISO consécutives qui finissent par la semaine dernière, avec des abonnés croissants.

  Chaque entrée porte son `id`, comme les documents produits par `documentReleveContenu` et `documentReleveCompte`.

- [ ] **Step 2: Build.** Run `npm test` and `npm run build`. Expected : tout est vert, `dist/studio.html` est construit.

- [ ] **Step 3: Republish both studios** with `dist/studio.html`. Use the `Artifact` tool with the `url` of each studio (in `.studio.local.json`), without passing `capabilities`, so the current ones are kept.

- [ ] **Step 4: Test studio : profile and statistics.**
  - Import the fictional profile with the cibles, as the studio's import does : archive `profil/courant` into `profil_archives/v<n>`, then `set` of `profil/courant` with `version` + 1 and `importe_le`, pinned with `if_version`.
  - Then write the fictional relevés in a single `ArtifactData` `batch` : `stats_contenu/<id>` and `releves_compte/<id>`, without the `id` field in `data`.

- [ ] **Step 5: Real studio : targets.** The real profile has no machine-readable targets. **Propose values to Jean**, drawn from the target indicators written in the real profile. **Write them only after an explicit yes.** Nothing about them goes in git.

- [ ] **Step 6: Run the watch once on the test studio,** through the one-shot routine and `run`. Check with `get_run_log` that the bulletin carries a `bilan` retrospective.

- [ ] **Step 7: Manual checklist for Jean** (spec §8, point 5), on the published page :
  1. créer une fiche, l'évaluer, la déplacer, la passer en « Publié » ;
  2. saisir son relevé à 48 h et vérifier le taux affiché ;
  3. saisir le relevé du compte ;
  4. vérifier les six graphiques du tableau de bord, en thème clair et sombre, et sur téléphone ;
  5. ouvrir le bulletin et lire la rétrospective ;
  6. relancer la veille.

- [ ] **Step 8: Documentation.** In `README.md`, check `Plan 4`. Update the handoff file with the exact state, the decisions, the tests and the next step. Commit, push `plan-4-stats`, then open the PR or merge as Jean decides.
