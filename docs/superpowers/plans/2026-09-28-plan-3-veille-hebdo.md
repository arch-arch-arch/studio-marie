# Plan 3 : veille hebdomadaire : plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Chaque dimanche à 20 h (fuseau du profil), une routine Claude Code cloud prépare la semaine suivante. Elle cherche les tendances sur le web, les filtre selon la marque, rédige un bulletin et dépose 3 à 5 idées en « Brouillon », déjà évaluées et placées sur les créneaux libres. Le studio affiche ce bulletin dans un onglet « Bulletin », avec un lien pour relancer la veille.

**Architecture:**
- La routine s'occupe de tout ce qui demande Claude : recherche web, filtre de marque, rédaction, jugement de chaque idée.
- Tout le calcul est fait par un **script Node du dépôt** (`scripts/veille.mjs`), qui s'appuie sur la logique pure (`src/logique/veille.js`) : semaine visée, fiches remplaçables, placement sur les créneaux, règles calculées, score, bulletin, liste des écritures.
- La routine applique ces écritures avec `ArtifactData`, en un seul lot.
- Le studio lit `bulletins/<semaine ISO>` et `config/veille`, qui contient l'URL de la routine.

**Tech Stack:** Node 24, JavaScript (modules ES), Vitest, happy-dom, esbuild ; routine Claude Code cloud (RemoteTrigger) avec `ArtifactData`, `WebSearch` et `WebFetch`.

**Spec:** `docs/superpowers/specs/2026-09-27-studio-contenu-design.md` (§5 et §6.1). Les plans 1 et 2 sont livrés. Le plan 2 est sur la branche `plan-2-evaluation`, sa PR n'est pas encore fusionnée : ce plan part de cette branche.

## Global Constraints

- **Dépôt privé et anonymisé.** Aucune donnée réelle de la créatrice dans git : pas de nom, de pseudo, d'e-mail, de plateformes, de statistiques, de contenus, de visuels, ni l'URL des studios ou de la routine. Les URL vivent dans la configuration de la routine et dans `config/veille`, dans la base du studio.
- **Langue.** Toute l'interface et tout le bulletin sont en français, en tutoyant. Pas d'emoji comme marqueurs.
- **Clé du bulletin.** Un bulletin par semaine ISO de la semaine **suivant** l'exécution (`YYYY-Www`, calculée dans le fuseau du profil). Une relance remplace ce bulletin, ainsi que **seulement** ses propres idées restées en `brouillon` avec `modifiee_depuis_creation === false`.
- **Idées.** 3 à 5 idées, déposées en `brouillon`, avec `origine: { type: 'veille', bulletin: <clé> }`. Chacune est évaluée : score calculé par `verifierRegles` et `composerScore` (plan 2), à partir du jugement rédigé par la routine au format de `validerReponse`.
- **Tendances.** La routine ne fait jamais de scraping d'Instagram. Un son tendance est marqué `son_a_verifier: true`. La veille ne modifie **jamais** le profil : elle peut seulement proposer une mise à jour, dans une alerte.
- **Recherche web en panne.** Le bulletin est publié quand même, marqué partiel (`sources_indisponibles: true`, statut `partiel`). Les idées viennent alors de la banque d'accroches et des performances passées du profil.
- **Horaire.** La routine est déclenchée le lundi à 00 h et à 01 h UTC. Le script ne la laisse tourner que si l'heure locale est le dimanche à 20 h, ce qui couvre l'heure d'été et l'heure d'hiver. Un déclenchement manuel (« Run now ») tourne toujours.
- **Commits.** Chaque commit se termine par une ligne `Co-Authored-By:` qui nomme le modèle auteur.

## Écarts assumés par rapport à la spec

- **Rétrospective.** Les relevés de statistiques arrivent au plan 4. D'ici là, la rétrospective est remplacée par le rappel prévu par la spec (§5.6, « Statistiques non saisies »).
- **Relancer la veille.** C'est un lien vers la page de la routine, stocké dans `config/veille` (`url_routine`). Sans configuration, le studio affiche « La veille n'est pas encore configurée. ».
- **Placement des idées.** Les idées sont placées sur les créneaux libres du profil, dans l'ordre. Quand il n'y en a plus, elles vont au premier jour de la semaine, à l'heure du premier créneau, et elles sont signalées « hors créneau » dans le bulletin.

## Review Focus

1. **Relance la même semaine.** Pas de doublon d'idées. Une idée que la créatrice a modifiée, validée ou déplacée n'est jamais supprimée ni remplacée. *(Task 2)*
2. **Recherche web en panne.** Le bulletin est partiel mais produit, et les idées sont déposées. Une entrée sans tendances n'est acceptée que si `sources_indisponibles` vaut vrai. *(Tasks 1 et 2)*
3. **Changement d'heure (novembre, mars).** La veille tourne exactement une fois, le dimanche à 20 h locale. Un déclenchement manuel est toujours accepté. *(Task 3)*
4. **Entrée de la routine invalide** (pilier inconnu, jugement incomplet, 6 idées). Rien n'est écrit, les erreurs sont listées et le script sort en erreur. *(Tasks 1 à 3)*
5. **Plus de créneaux libres, ou créneaux déjà pris par des fiches gardées.** Aucune idée n'est posée sur un créneau occupé. Le surplus est signalé « hors créneau ». *(Task 1)*

---

## Structure des fichiers

```
src/logique/dates.js          + cleSemaineIso (Task 1)
src/logique/creneaux.js       + creneauxDisponibles ; creneauxLibres s'appuie dessus (Task 1)
src/logique/veille.js         fichesRemplacables, placerIdees, validerEntreeVeille (Task 1), construireVeille (Task 2)
scripts/veille.mjs            commandes plage, doit-tourner, construire (Task 3)
src/claude/veille.md          consignes de la routine (Task 4)
src/donnees/depot.js          + ecouterBulletin, ecouterConfigVeille (Task 5)
src/interface/vue-bulletin.js onglet Bulletin (Task 5)
src/interface/vue-semaine.js  + bandeau « Pas de bulletin cette semaine » (Task 5)
src/interface/app.js, rendu.js  branchement du bulletin et de l'onglet (Task 5)
exemples/entree-veille-fictive.json  entrée fictive de routine (Task 2)
```

---

### Task 1 : briques de la veille (semaine ISO, créneaux disponibles, fiches remplaçables, placement, validation de l'entrée)

**Files:**
- Modify : `src/logique/dates.js`, `src/logique/creneaux.js`, `tests/logique/dates.test.js`, `tests/logique/creneaux.test.js`
- Create : `src/logique/veille.js`, `tests/logique/veille.test.js`

**Interfaces:**
- Consumes : `partiesLocales`, `depuisSaisieLocale`, `ajouterJours`, `cleJour`, `heureLocale` (dates) ; `fichesDeLaSemaine` (controle) ; `validerReponse` (`src/claude/evaluation.js`) ; `FORMATS` (fiche).
- Produces :
  - `cleSemaineIso(iso, fuseau): 'YYYY-Www'` ;
  - `creneauxDisponibles(fiches, regles, debutIso): string[]` : débuts de créneaux libres, triés, sans plafond ;
  - `fichesRemplacables(fiches, cle): Fiche[]` ;
  - `placerIdees(idees, fiches, regles, debutIso): { idee, date_heure, horsCreneau }[]` ;
  - `validerEntreeVeille(entree, regles): { ok, erreurs, entree? }` ;
  - `ROLES_CAPTION`.
- Forme normalisée de l'entrée :

```
{ sources_indisponibles: boolean,
  tendances: [{ titre, source, date, pourquoi, adaptation, duree_vie, son_a_verifier: boolean }],
  ecartees: [{ titre, raison }],
  alertes: [{ texte, proposition_profil: string|null }],
  idees: [{ format, pilier, role_caption: 'engagement'|'cta'|'deadpan'|null, cta: boolean,
            format_valide: string, accroche, caption, hashtags: string[], tendance: string|null,
            jugement: <jugement normalisé par validerReponse> }] }
```

- [ ] **Step 1 : écrire les tests**

Dans `tests/logique/dates.test.js`, ajouter `cleSemaineIso` à l'import, puis :

```js
describe('cleSemaineIso', () => {
  it('donne la semaine ISO locale, y compris en fin d’année', () => {
    expect(cleSemaineIso('2026-09-28T10:00:00.000Z', 'Europe/Paris')).toBe('2026-W40');
    expect(cleSemaineIso('2026-10-04T21:30:00.000Z', 'Europe/Paris')).toBe('2026-W40');
    expect(cleSemaineIso('2026-10-04T22:30:00.000Z', 'Europe/Paris')).toBe('2026-W41');
    expect(cleSemaineIso('2027-01-01T12:00:00.000Z', 'Europe/Paris')).toBe('2026-W53');
    expect(cleSemaineIso('2027-01-04T12:00:00.000Z', 'Europe/Paris')).toBe('2027-W01');
  });
});
```

Dans `tests/logique/creneaux.test.js`, ajouter `creneauxDisponibles` à l'import, puis :

```js
describe('creneauxDisponibles', () => {
  it('liste tous les créneaux libres, sans plafond de cadence', () => {
    const pleins = ['2026-09-30', '2026-10-02', '2026-10-03', '2026-10-04'].map(j => fiche('reel', j, '18:00'));
    expect(creneauxLibres(pleins, R, LUNDI).map(c => c.format)).toEqual(['carrousel', 'carrousel']);
    expect(creneauxDisponibles([...pleins, fiche('carrousel', '2026-09-29', '13:00')], R, LUNDI))
      .toEqual(['2026-09-28T10:00:00.000Z', '2026-10-01T10:00:00.000Z']);
  });
});
```

`tests/logique/veille.test.js` :

```js
import { describe, it, expect } from 'vitest';
import fictif from '../../exemples/profil-fictif.json';
import { nouvelleFiche } from '../../src/logique/fiche.js';
import { depuisSaisieLocale } from '../../src/logique/dates.js';
import { fichesRemplacables, placerIdees, validerEntreeVeille } from '../../src/logique/veille.js';

const R = fictif.regles_studio;
const LUNDI = '2026-09-27T22:00:00.000Z';
let n = 0;
const fiche = (format, jour, heure, extra = {}) => ({
  ...nouvelleFiche({ id: `v${n++}`, format, date_heure: depuisSaisieLocale(jour, heure, R.fuseau), maintenant: LUNDI }),
  ...extra,
});
const jugement = () => ({
  notes: { accroche: 7, voix: 7, mecanique: 7 }, phrases: { accroche: 'a', voix: 'v', mecanique: 'm' },
  conformite: { etat: 'vert', causes: [] }, captions: [{ role: 'engagement', texte: 'x' }, { role: 'deadpan', texte: 'y' }],
  accroches: ['a1', 'a2'], hashtags: ['nuit'], recommandations: ['1', '2', '3'],
});
const idee = (extra = {}) => ({
  format: 'reel', pilier: 'nuit', role_caption: 'engagement', cta: false, format_valide: '', accroche: 'Une accroche.',
  caption: 'Une caption.', hashtags: ['nuit', 'club', 'paris'], tendance: null, jugement: jugement(), ...extra,
});
const tendance = t => ({ titre: t, source: 'https://exemple.test', date: '2026-09-25', pourquoi: 'p', adaptation: 'a', duree_vie: '2 semaines' });
const entree = (extra = {}) => ({
  sources_indisponibles: false, tendances: [tendance('T1'), tendance('T2'), tendance('T3')], ecartees: [], alertes: [],
  idees: [idee(), idee({ pilier: 'socio' }), idee({ format: 'carrousel', pilier: 'humour_sec' })], ...extra,
});

describe('fichesRemplacables', () => {
  it('ne garde que les idées de ce bulletin, en brouillon et jamais modifiées', () => {
    const cle = '2026-W40';
    const a = fiche('reel', '2026-09-28', '12:00', { statut: 'brouillon', origine: { type: 'veille', bulletin: cle } });
    const b = { ...a, id: 'b', modifiee_depuis_creation: true };
    const c = { ...a, id: 'c', statut: 'valide' };
    const d = { ...a, id: 'd', origine: { type: 'veille', bulletin: '2026-W39' } };
    const e = { ...a, id: 'e', origine: { type: 'manuelle' } };
    expect(fichesRemplacables([a, b, c, d, e], cle).map(f => f.id)).toEqual([a.id]);
  });
});

describe('placerIdees', () => {
  it('place sur les créneaux libres dans l’ordre, jamais sur un créneau pris', () => {
    const prise = fiche('reel', '2026-09-29', '12:30');
    const r = placerIdees([idee(), idee(), idee()], [prise], R, LUNDI);
    expect(r.map(p => p.date_heure)).toEqual(['2026-09-28T10:00:00.000Z', '2026-10-01T10:00:00.000Z', '2026-09-28T10:00:00.000Z']);
    expect(r.map(p => p.horsCreneau)).toEqual([false, false, true]);
  });
});

describe('validerEntreeVeille', () => {
  it('accepte une entrée complète et la normalise', () => {
    const r = validerEntreeVeille(entree(), R);
    expect(r.ok).toBe(true);
    expect(r.entree.tendances[0].son_a_verifier).toBe(false);
    expect(r.entree.alertes).toEqual([]);
    expect(r.entree.idees[0].jugement.captions).toHaveLength(2);
  });
  it('accepte zéro tendance seulement si les sources sont indisponibles', () => {
    expect(validerEntreeVeille(entree({ tendances: [] }), R).erreurs).toContain('tendances : 3 à 5 tendances attendues (ou sources_indisponibles à vrai).');
    expect(validerEntreeVeille(entree({ tendances: [], sources_indisponibles: true }), R).ok).toBe(true);
  });
  it('refuse le nombre d’idées hors de 3 à 5, un pilier inconnu, un jugement incomplet', () => {
    expect(validerEntreeVeille(entree({ idees: [idee(), idee()] }), R).erreurs).toContain('idees : 3 à 5 idées attendues.');
    const r = validerEntreeVeille(entree({ idees: [idee({ pilier: 'inconnu' }), idee({ jugement: { notes: {} } }), idee({ format: 'tiktok' })] }), R);
    expect(r.ok).toBe(false);
    expect(r.erreurs).toContain('idees[0].pilier inconnu : inconnu.');
    expect(r.erreurs.some(e => e.startsWith('idees[1].jugement :'))).toBe(true);
    expect(r.erreurs).toContain('idees[2].format inconnu : tiktok.');
  });
  it('refuse ce qui n’est pas un objet', () => {
    expect(validerEntreeVeille([], R)).toEqual({ ok: false, erreurs: ['L’entrée de la veille doit être un objet JSON.'] });
  });
});
```

- [ ] **Step 2 : lancer les tests pour vérifier qu'ils échouent**

Run : `npx vitest run tests/logique/dates.test.js tests/logique/creneaux.test.js tests/logique/veille.test.js`
Expected : FAIL (fonctions et module absents).

- [ ] **Step 3 : implémenter**

Dans `src/logique/dates.js`, ajouter :

```js
export function cleSemaineIso(iso, fuseau) {
  const p = partiesLocales(iso, fuseau);
  const jeudi = Date.UTC(p.annee, p.mois - 1, p.jour) + (4 - p.jourSemaine) * 86400000;
  const annee = new Date(jeudi).getUTCFullYear();
  const semaine = 1 + Math.floor((jeudi - Date.UTC(annee, 0, 1)) / (7 * 86400000));
  return `${annee}-W${String(semaine).padStart(2, '0')}`;
}
```

Dans `src/logique/creneaux.js`, extraire la boucle dans une fonction exportée, puis la réutiliser :

```js
export function creneauxDisponibles(fiches, regles, debutIso, maintenantIso = null) {
  const fz = regles.fuseau;
  const feed = fichesDeLaSemaine(fiches, debutIso, fz).filter(f => FEED.has(f.format));
  const libres = [];
  for (let i = 0; i < 7; i++) {
    const cle = cleJour(ajouterJours(debutIso, i, fz), fz);
    for (const cr of regles.creneaux) {
      if (!cr.jours.includes(i + 1)) continue;
      const occupe = feed.some(f => {
        if (cleJour(f.date_heure, fz) !== cle) return false;
        const h = heureLocale(f.date_heure, fz);
        return h >= cr.debut && h < cr.fin;
      });
      if (occupe) continue;
      const debutCreneau = depuisSaisieLocale(cle, cr.debut, fz);
      if (maintenantIso && debutCreneau < maintenantIso) continue;
      libres.push(debutCreneau);
    }
  }
  return libres.sort();
}

export function creneauxLibres(fiches, regles, debutIso, maintenantIso = null) {
  const feed = fichesDeLaSemaine(fiches, debutIso, regles.fuseau).filter(f => FEED.has(f.format));
  const manque = format => Math.max(0, regles.cadence[format] - feed.filter(f => f.format === format).length);
  const aPlacer = [...Array(manque('reel')).fill('reel'), ...Array(manque('carrousel')).fill('carrousel')];
  if (aPlacer.length === 0) return [];
  return creneauxDisponibles(fiches, regles, debutIso, maintenantIso)
    .slice(0, aPlacer.length)
    .map((date_heure, i) => ({ date_heure, format: aPlacer[i] }));
}
```

`src/logique/veille.js` :

```js
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
```

- [ ] **Step 4 : lancer les tests**

Run : `npx vitest run tests/logique/dates.test.js tests/logique/creneaux.test.js tests/logique/veille.test.js`
Expected : PASS. Puis `npm test` : PASS.

- [ ] **Step 5 : commit**

```bash
git add src/logique tests/logique
git commit -m "Veille : semaine ISO, créneaux disponibles, fiches remplaçables, placement, validation de l'entrée"
```

---

### Task 2 : construire la veille (bulletin, idées évaluées, écritures)

**Files:**
- Modify : `src/logique/veille.js`, `tests/logique/veille.test.js`
- Create : `exemples/entree-veille-fictive.json`

**Interfaces:**
- Consumes :
  - Task 1 ;
  - `nouvelleFiche`, `appliquerEvaluation` (fiche) ;
  - `verifierRegles` (regles-score) ;
  - `composerScore` (score) ;
  - `controlerSemaine` (controle) ;
  - `ajouterJours`, `debutSemaine`, `cleSemaineIso` (dates).
- Produces : `construireVeille({ profil, fiches, entree, maintenant, idAleatoire })` renvoie soit `{ ok: false, erreurs }`, soit `{ ok: true, cle, debut, bulletin, fichesCreees, ecritures }`.
  - Les `ecritures` sont une liste d'entrées au format `ArtifactData` batch, dans cet ordre :
    1. d'abord les `{ op: 'delete', collection: 'fiches', doc_id }` ;
    2. puis les `{ op: 'set', collection: 'fiches', doc_id, data }`, où `data` est la fiche sans `id` ;
    3. enfin `{ op: 'set', collection: 'bulletins', doc_id: cle, data: bulletin }`.
  - Forme du bulletin :

```
{ semaine, genere_le, statut: 'complet'|'partiel', sources_indisponibles,
  retrospective: { type: 'rappel', texte },
  tendances, ecartees, alertes,
  idees: string[] (identifiants), hors_creneau: string[],
  controle: Pastille[] (controlerSemaine sur la semaine visée après ajout) }
```

- [ ] **Step 1 : créer l'entrée fictive**

`exemples/entree-veille-fictive.json` : une entrée conforme à `validerEntreeVeille`, avec le profil fictif (piliers `socio`, `nuit`, `humour_sec`, `pont_offre`). Elle contient 3 tendances inventées, 1 écartée, 1 alerte avec `proposition_profil`, et 3 idées dont le jugement est complet. Le contenu est libre, fictif et en français. Tu peux reprendre les helpers `tendance()` et `idee()` du test de la Task 1, avec des textes réalistes.

- [ ] **Step 2 : écrire les tests**

Ajouter à `tests/logique/veille.test.js` (et importer `construireVeille`, ainsi que `entreeFictive` depuis `../../exemples/entree-veille-fictive.json`) :

```js
describe('construireVeille', () => {
  const MAINTENANT = '2026-10-04T18:00:00.000Z';
  const profil = { ...fictif, version: 2 };
  let k = 0;
  const id = () => `idee-${++k}`;

  it('vise la semaine suivante, dépose des idées évaluées en brouillon et un bulletin', () => {
    const r = construireVeille({ profil, fiches: [], entree: entreeFictive, maintenant: MAINTENANT, idAleatoire: id });
    expect(r.ok).toBe(true);
    expect(r.cle).toBe('2026-W41');
    expect(r.debut).toBe('2026-10-04T22:00:00.000Z');
    expect(r.fichesCreees).toHaveLength(entreeFictive.idees.length);
    for (const f of r.fichesCreees) {
      expect(f).toMatchObject({ statut: 'brouillon', modifiee_depuis_creation: false, origine: { type: 'veille', bulletin: '2026-W41' } });
      expect(f.score.version_profil).toBe(2);
      expect(f.score.total).toBeGreaterThan(0);
      expect(f.variantes).toHaveLength(2);
    }
    expect(r.bulletin).toMatchObject({ semaine: '2026-W41', genere_le: MAINTENANT, statut: 'complet', sources_indisponibles: false });
    expect(r.bulletin.retrospective.type).toBe('rappel');
    expect(r.bulletin.idees).toEqual(r.fichesCreees.map(f => f.id));
    expect(r.bulletin.controle.map(p => p.cle)).toEqual(['reels', 'carrousels', 'stories', 'cta', 'roles', 'ragebait', 'porte', 'piliers']);
    expect(r.ecritures.at(-1)).toMatchObject({ op: 'set', collection: 'bulletins', doc_id: '2026-W41' });
    expect(r.ecritures.filter(e => e.op === 'set' && e.collection === 'fiches').every(e => !('id' in e.data))).toBe(true);
  });

  it('relance : remplace ses propres idées intactes, garde celles modifiées ou validées', () => {
    const premiere = construireVeille({ profil, fiches: [], entree: entreeFictive, maintenant: MAINTENANT, idAleatoire: id });
    const [a, b, c] = premiere.fichesCreees;
    const modifiee = { ...b, modifiee_depuis_creation: true, accroche: 'Réécrite' };
    const validee = { ...c, statut: 'valide' };
    const seconde = construireVeille({ profil, fiches: [a, modifiee, validee], entree: entreeFictive, maintenant: MAINTENANT, idAleatoire: id });
    const suppressions = seconde.ecritures.filter(e => e.op === 'delete').map(e => e.doc_id);
    expect(suppressions).toEqual([a.id]);
    const placees = seconde.fichesCreees.map(f => f.date_heure);
    expect(placees).not.toContain(modifiee.date_heure);
    expect(placees).not.toContain(validee.date_heure);
  });

  it('sources indisponibles : bulletin partiel, idées quand même', () => {
    const r = construireVeille({ profil, fiches: [], entree: { ...entreeFictive, sources_indisponibles: true, tendances: [] }, maintenant: MAINTENANT, idAleatoire: id });
    expect(r.ok).toBe(true);
    expect(r.bulletin).toMatchObject({ statut: 'partiel', sources_indisponibles: true, tendances: [] });
    expect(r.fichesCreees.length).toBeGreaterThanOrEqual(3);
  });

  it('entrée invalide : aucune écriture', () => {
    const r = construireVeille({ profil, fiches: [], entree: { ...entreeFictive, idees: [] }, maintenant: MAINTENANT, idAleatoire: id });
    expect(r).toEqual({ ok: false, erreurs: ['idees : 3 à 5 idées attendues.'] });
  });

  it('signale les idées placées hors créneau', () => {
    const occupees = ['2026-10-05', '2026-10-06', '2026-10-08'].map(j => fiche('reel', j, '12:00'));
    const r = construireVeille({ profil, fiches: occupees, entree: entreeFictive, maintenant: MAINTENANT, idAleatoire: id });
    expect(r.bulletin.hors_creneau).toEqual(r.fichesCreees.map(f => f.id));
  });
});
```

- [ ] **Step 3 : lancer les tests pour vérifier qu'ils échouent**

Run : `npx vitest run tests/logique/veille.test.js`
Expected : FAIL (`construireVeille` absent).

- [ ] **Step 4 : implémenter**

Ajouter à `src/logique/veille.js` (les imports viennent compléter ceux de la Task 1) :

```js
import { nouvelleFiche, appliquerEvaluation } from './fiche.js';
import { verifierRegles } from './regles-score.js';
import { composerScore } from './score.js';
import { controlerSemaine } from './controle.js';
import { ajouterJours, debutSemaine, cleSemaineIso } from './dates.js';

const RAPPEL_RETROSPECTIVE = 'Aucun relevé de statistiques pour la semaine écoulée : saisis-les pour obtenir la rétrospective.';

export function construireVeille({ profil, fiches, entree, maintenant, idAleatoire }) {
  const r = profil.regles_studio;
  const fz = r.fuseau;
  const verification = validerEntreeVeille(entree, r);
  if (!verification.ok) return { ok: false, erreurs: verification.erreurs };
  const debut = debutSemaine(ajouterJours(maintenant, 7, fz), fz);
  const cle = cleSemaineIso(debut, fz);
  const remplacables = fichesRemplacables(fiches, cle);
  const aRemplacer = new Set(remplacables.map(f => f.id));
  const gardees = fiches.filter(f => !aRemplacer.has(f.id));
  const places = placerIdees(verification.entree.idees, gardees, r, debut);

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
    retrospective: { type: 'rappel', texte: RAPPEL_RETROSPECTIVE },
    tendances: e.tendances,
    ecartees: e.ecartees,
    alertes: e.alertes,
    idees: fichesCreees.map(f => f.id),
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
```

Si la fiche d'une idée a un statut `valide` après `appliquerEvaluation`, le verrou du plan 2 peut la remettre en brouillon. C'est sans effet ici, puisque les idées naissent en brouillon.

- [ ] **Step 5 : lancer les tests**

Run : `npx vitest run tests/logique/veille.test.js`
Expected : PASS. Puis `npm test` : PASS.

- [ ] **Step 6 : commit**

```bash
git add src/logique/veille.js tests/logique/veille.test.js exemples/entree-veille-fictive.json
git commit -m "Veille : bulletin, idées évaluées et écritures, relance sans doublon"
```

---

### Task 3 : script de la veille (`scripts/veille.mjs`)

**Files:**
- Create : `scripts/veille.mjs`, `tests/scripts/veille.test.js`

**Interfaces:**
- Consumes : `construireVeille`, `cleSemaineIso` ; `debutSemaine`, `ajouterJours`, `partiesLocales` ; `nouvelId` (fiche).
- Produces : `executer(argv, { lireJson, listerJson, ecrireJson, maintenant })` → `{ code: 0|1, sortie: string }`, qui est testable. Quand on lance le fichier directement, il lit `process.argv`, utilise le système de fichiers et fait `process.exit(code)`.

Commandes :

| Commande | Arguments | Sortie |
|---|---|---|
| `plage` | `--profil <fichier> [--maintenant <iso>]` | JSON `{ "semaine", "debut", "fin" }` de la semaine suivante |
| `doit-tourner` | `--profil <fichier> [--maintenant <iso>]` | `oui` ou `non` |
| `construire` | `--profil <fichier> --fiches <dossier> --entree <fichier> --sortie <fichier> [--maintenant <iso>]` | écrit `{ ecritures, resume }` dans `--sortie` ; en cas d'échec, code 1 et erreurs, une par ligne |

- Le fichier profil et chaque fichier du dossier `--fiches` sont ceux produits par `ArtifactData` avec `out_dir`. Chacun est soit `{ id, data, version }`, soit le document brut. Le script lit `brut.data ?? brut`, et prend l'`id` dans `brut.id` ou dans le nom du fichier sans `.json`.
- Règle de `doit-tourner` : `non` si et seulement si le moment est un lundi entre 00:00 et 01:59 UTC (heure des deux déclenchements programmés) **et** que l'heure locale du profil n'est pas le dimanche à 20 h. Sinon `oui`.

- [ ] **Step 1 : écrire les tests**

`tests/scripts/veille.test.js` :

```js
import { describe, it, expect } from 'vitest';
import fictif from '../../exemples/profil-fictif.json';
import entree from '../../exemples/entree-veille-fictive.json';
import { executer } from '../../scripts/veille.mjs';

const NEW_YORK = { ...fictif, version: 1, regles_studio: { ...fictif.regles_studio, fuseau: 'America/New_York' } };
function deps(fichiers = {}, maintenant = '2026-10-05T00:00:00.000Z') {
  const ecrits = {};
  return {
    ecrits,
    lireJson: p => { if (!(p in fichiers)) throw new Error(`absent : ${p}`); return fichiers[p]; },
    listerJson: dossier => Object.entries(fichiers).filter(([p]) => p.startsWith(`${dossier}/`)).map(([p, contenu]) => ({ nom: p.slice(dossier.length + 1), contenu })),
    ecrireJson: (p, v) => { ecrits[p] = v; },
    maintenant: () => maintenant,
  };
}

describe('doit-tourner', () => {
  const run = m => executer(['doit-tourner', '--profil', 'p.json', '--maintenant', m], deps({ 'p.json': { id: 'courant', data: NEW_YORK, version: 3 } })).sortie;
  it('une seule exécution le dimanche 20 h locale, été comme hiver', () => {
    expect(run('2026-10-05T00:00:00.000Z')).toBe('oui');
    expect(run('2026-10-05T01:00:00.000Z')).toBe('non');
    expect(run('2026-11-09T00:00:00.000Z')).toBe('non');
    expect(run('2026-11-09T01:00:00.000Z')).toBe('oui');
  });
  it('un déclenchement manuel tourne toujours', () => {
    expect(run('2026-10-07T15:12:00.000Z')).toBe('oui');
  });
});

describe('plage', () => {
  it('donne la semaine suivante', () => {
    const r = executer(['plage', '--profil', 'p.json', '--maintenant', '2026-10-05T00:00:00.000Z'], deps({ 'p.json': NEW_YORK }));
    expect(r.code).toBe(0);
    expect(JSON.parse(r.sortie)).toEqual({ semaine: '2026-W41', debut: '2026-10-05T04:00:00.000Z', fin: '2026-10-12T04:00:00.000Z' });
  });
});

describe('construire', () => {
  it('écrit les écritures et un résumé', () => {
    const d = deps({ 'p.json': { id: 'courant', data: NEW_YORK }, 'e.json': entree, 'f/x.json': { id: 'x', data: { format: 'reel', date_heure: '2026-10-06T16:00:00.000Z', statut: 'valide', origine: { type: 'manuelle' } } } });
    const r = executer(['construire', '--profil', 'p.json', '--fiches', 'f', '--entree', 'e.json', '--sortie', 's.json'], d);
    expect(r.code).toBe(0);
    expect(d.ecrits['s.json'].ecritures.at(-1)).toMatchObject({ collection: 'bulletins', doc_id: '2026-W41' });
    expect(d.ecrits['s.json'].resume).toMatch(/^Bulletin 2026-W41 : \d idée\(s\), 0 remplacée\(s\)/);
  });
  it('échoue sans rien écrire si l’entrée est invalide', () => {
    const d = deps({ 'p.json': NEW_YORK, 'e.json': { ...entree, idees: [] } });
    const r = executer(['construire', '--profil', 'p.json', '--fiches', 'f', '--entree', 'e.json', '--sortie', 's.json'], d);
    expect(r.code).toBe(1);
    expect(r.sortie).toContain('idees : 3 à 5 idées attendues.');
    expect(d.ecrits).toEqual({});
  });
  it('refuse une commande inconnue', () => {
    expect(executer(['n-importe'], deps()).code).toBe(1);
  });
});
```

- [ ] **Step 2 : lancer les tests pour vérifier qu'ils échouent**

Run : `npx vitest run tests/scripts/veille.test.js`
Expected : FAIL (module absent).

- [ ] **Step 3 : implémenter**

`scripts/veille.mjs` :

```js
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { construireVeille } from '../src/logique/veille.js';
import { ajouterJours, debutSemaine, cleSemaineIso, partiesLocales } from '../src/logique/dates.js';
import { nouvelId } from '../src/logique/fiche.js';

const USAGE = 'Usage : veille.mjs plage|doit-tourner|construire --profil <fichier> [--fiches <dossier> --entree <fichier> --sortie <fichier>] [--maintenant <iso>]';

function options(argv) {
  const o = {};
  for (let i = 1; i < argv.length; i += 2) o[argv[i].replace(/^--/, '')] = argv[i + 1];
  return o;
}
const document = brut => brut?.data ?? brut;

export function executer(argv, { lireJson, listerJson, ecrireJson, maintenant }) {
  const commande = argv[0];
  const o = options(argv);
  const quand = o.maintenant ?? maintenant();
  try {
    if (!['plage', 'doit-tourner', 'construire'].includes(commande)) return { code: 1, sortie: USAGE };
    const profil = document(lireJson(o.profil));
    const fz = profil.regles_studio.fuseau;
    if (commande === 'plage') {
      const debut = debutSemaine(ajouterJours(quand, 7, fz), fz);
      return { code: 0, sortie: JSON.stringify({ semaine: cleSemaineIso(debut, fz), debut, fin: ajouterJours(debut, 7, fz) }) };
    }
    if (commande === 'doit-tourner') {
      const d = new Date(quand);
      const programme = d.getUTCDay() === 1 && d.getUTCHours() <= 1;
      const local = partiesLocales(quand, fz);
      const bonMoment = local.jourSemaine === 7 && local.heure === 20;
      return { code: 0, sortie: programme && !bonMoment ? 'non' : 'oui' };
    }
    const fiches = listerJson(o.fiches).map(({ nom, contenu }) => ({ id: contenu?.id ?? nom.replace(/\.json$/, ''), ...document(contenu) }));
    const r = construireVeille({ profil, fiches, entree: lireJson(o.entree), maintenant: quand, idAleatoire: nouvelId });
    if (!r.ok) return { code: 1, sortie: r.erreurs.join('\n') };
    const remplacees = r.ecritures.filter(e => e.op === 'delete').length;
    const resume = `Bulletin ${r.cle} : ${r.fichesCreees.length} idée(s), ${remplacees} remplacée(s), statut ${r.bulletin.statut}.`;
    ecrireJson(o.sortie, { ecritures: r.ecritures, resume });
    return { code: 0, sortie: resume };
  } catch (e) {
    return { code: 1, sortie: `Erreur : ${e.message}` };
  }
}

const lanceDirectement = process.argv[1] && path.resolve(process.argv[1]).toLowerCase() === fileURLToPath(import.meta.url).toLowerCase();
if (lanceDirectement) {
  const r = executer(process.argv.slice(2), {
    lireJson: p => JSON.parse(readFileSync(p, 'utf8')),
    listerJson: dossier => {
      try {
        return readdirSync(dossier).filter(n => n.endsWith('.json')).map(nom => ({ nom, contenu: JSON.parse(readFileSync(path.join(dossier, nom), 'utf8')) }));
      } catch {
        return [];
      }
    },
    ecrireJson: (p, v) => writeFileSync(p, JSON.stringify(v, null, 2)),
    maintenant: () => new Date().toISOString(),
  });
  console.log(r.sortie);
  process.exit(r.code);
}
```

Un dossier `--fiches` absent vaut une liste vide : aucune fiche la semaine suivante.

- [ ] **Step 4 : lancer les tests**

Run : `npx vitest run tests/scripts/veille.test.js`
Expected : PASS. Puis `npm test` : PASS.

- [ ] **Step 5 : commit**

```bash
git add scripts/veille.mjs tests/scripts/veille.test.js
git commit -m "Veille : script plage, doit-tourner et construire"
```

---

### Task 4 : consignes de la routine (`src/claude/veille.md`)

**Files:**
- Create : `src/claude/veille.md`, `tests/claude/veille-consignes.test.js`

**Interfaces:**
- Consumes : les commandes de la Task 3, le format d'entrée de la Task 1 et le format de jugement du plan 2 (`validerReponse`).
- Produces : les consignes que la routine lit à chaque exécution. La routine reçoit seulement l'URL du studio (voir Task 6).

- [ ] **Step 1 : écrire le test**

`tests/claude/veille-consignes.test.js` :

```js
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const texte = readFileSync(new URL('../../src/claude/veille.md', import.meta.url), 'utf8');

describe('consignes de la veille', () => {
  it('décrit chaque étape et chaque commande du script', () => {
    for (const attendu of [
      'node scripts/veille.mjs doit-tourner', 'node scripts/veille.mjs plage', 'node scripts/veille.mjs construire',
      'ArtifactData', 'WebSearch', 'sources_indisponibles', 'son_a_verifier', 'proposition_profil',
      '"jugement"', 'batch', 'profil/courant', 'bulletins',
    ]) expect(texte).toContain(attendu);
  });
  it('rappelle les interdits', () => {
    expect(texte).toContain('Ne modifie jamais le profil');
    expect(texte).toContain('Pas de scraping d’Instagram');
    expect(texte).toContain('Aucun commit');
  });
});
```

- [ ] **Step 2 : lancer le test pour vérifier qu'il échoue**

Run : `npx vitest run tests/claude/veille-consignes.test.js`
Expected : FAIL (fichier absent).

- [ ] **Step 3 : écrire les consignes**

`src/claude/veille.md` :

````markdown
# Veille hebdomadaire du studio

Tu prépares la semaine suivante d'un compte Instagram. L'URL du studio (un Artifact claude.ai) t'est donnée dans ta mission : on l'appelle ci-dessous `STUDIO`. Travaille dans le dépôt cloné, dans le dossier de travail `veille-tmp/`, que tu crées.

Interdits :
- Ne modifie jamais le profil.
- Pas de scraping d’Instagram.
- Aucun commit, aucun push, aucune modification du dépôt.
- Aucune écriture en base en dehors du lot final.

## 1. Lire le profil
- Charge l'outil `ArtifactData` (ToolSearch `select:ArtifactData`).
- `ArtifactData` `get` sur `profil/courant` de `STUDIO`, avec `out_dir` = `veille-tmp/`. Le fichier obtenu est `veille-tmp/profil/courant.json`.
- Lance `node scripts/veille.mjs doit-tourner --profil veille-tmp/profil/courant.json`. Si la sortie est `non`, arrête-toi là : c'est le deuxième déclenchement de la nuit. Réponds « Veille déjà faite ou hors horaire. »

## 2. Lire la semaine suivante
- Lance `node scripts/veille.mjs plage --profil veille-tmp/profil/courant.json`. Tu obtiens `{ semaine, debut, fin }`.
- `ArtifactData` `query` sur la collection `fiches` avec `where` : `["date_heure", ">=", debut]` et `["date_heure", "<", fin]`, avec `out_dir` = `veille-tmp/`. Les fichiers arrivent dans `veille-tmp/fiches/`.

## 3. Chercher les tendances
- Avec `WebSearch` (et `WebFetch` pour lire une page), cherche sur les 14 derniers jours :
  - les annonces d'Instagram aux créateurs (algorithme, règlement, formats) ;
  - les rapports publics de tendances (sons, formats de Reels, memes) ;
  - les tendances de la niche décrite dans le profil.
- Passe chaque tendance au filtre de la marque (test de la voix, esthétique, conformité SFW, mots à éviter). Elle est soit adaptée, avec la façon de l'adapter, soit écartée, avec la raison. Garde-en 3 à 5.
- Un son tendance porte `son_a_verifier: true` : on ne peut pas le confirmer hors de l'application.
- Si la recherche web échoue ou ne donne rien d'exploitable, mets `sources_indisponibles: true`, laisse `tendances` vide et continue : les idées viendront de la banque d'accroches et des performances passées du profil.
- Un changement de règle Instagram devient une alerte. Si le profil devrait évoluer, décris-le dans `proposition_profil`, mais ne l'applique pas.

## 4. Rédiger 3 à 5 idées
Pour chaque idée : format, pilier (une clé de `regles_studio.piliers`), rôle de caption, appel à l'action ou non, accroche, caption et hashtags, dans la voix du profil.

Respecte le contrôle de semaine du profil (cadence, part d'appels à l'action, rotation des rôles, ragebait) en tenant compte des fiches déjà présentes.

Évalue ensuite chaque idée comme une éditrice exigeante, au format `"jugement"` :

```json
{"notes":{"accroche":7,"voix":8,"mecanique":6},"phrases":{"accroche":"…","voix":"…","mecanique":"…"},"conformite":{"etat":"vert","causes":[]},"captions":[{"role":"engagement","texte":"…"},{"role":"deadpan","texte":"…"}],"accroches":["…","…"],"hashtags":["mot"],"recommandations":["…","…","…"]}
```

Règles du jugement :
- une phrase par critère ;
- exactement 2 captions, de rôles différents ;
- 2 ou 3 accroches ;
- des hashtags sans `#` ;
- 3 recommandations ;
- tout en français.

## 5. Écrire l'entrée et construire
Écris `veille-tmp/entree.json` :

```json
{ "sources_indisponibles": false,
  "tendances": [{ "titre": "…", "source": "URL ou nom", "date": "AAAA-MM-JJ", "pourquoi": "…", "adaptation": "…", "duree_vie": "…", "son_a_verifier": false }],
  "ecartees": [{ "titre": "…", "raison": "…" }],
  "alertes": [{ "texte": "…", "proposition_profil": null }],
  "idees": [{ "format": "reel", "pilier": "…", "role_caption": "engagement", "cta": false, "format_valide": "", "accroche": "…", "caption": "…", "hashtags": ["…"], "tendance": "titre de la tendance ou null", "jugement": { … } }] }
```

Lance ensuite `node scripts/veille.mjs construire --profil veille-tmp/profil/courant.json --fiches veille-tmp/fiches --entree veille-tmp/entree.json --sortie veille-tmp/ecritures.json`.

Si la commande échoue, elle affiche les erreurs. Corrige `entree.json` et relance, deux fois au plus. Si elle échoue encore, arrête-toi sans rien écrire et rends compte des erreurs.

## 6. Appliquer en un seul lot
Lis `veille-tmp/ecritures.json`, puis appelle une seule fois `ArtifactData` `batch` sur `STUDIO`, avec la liste `ecritures` telle quelle en paramètre `writes`. Relis ensuite `bulletins/<semaine>` pour vérifier.

## 7. Compte rendu
Termine par une ligne : le `resume` du script, puis « Sources : complètes » ou « Sources : indisponibles ».
````

- [ ] **Step 4 : lancer le test**

Run : `npx vitest run tests/claude/veille-consignes.test.js`
Expected : PASS. Puis `npm test` : PASS.

- [ ] **Step 5 : commit**

```bash
git add src/claude/veille.md tests/claude/veille-consignes.test.js
git commit -m "Veille : consignes de la routine"
```

---

### Task 5 : onglet Bulletin et bandeau dans le studio

**Files:**
- Create : `src/interface/vue-bulletin.js`, `tests/interface/vue-bulletin.test.js`
- Modify : `src/donnees/depot.js`, `tests/donnees/depot.test.js`, `src/interface/app.js`, `src/interface/rendu.js`, `src/interface/vue-semaine.js`, `tests/interface/vue-semaine.test.js`, `tests/interface/app.test.js`, `src/interface/styles.css`

**Interfaces:**
- Consumes : `cleSemaineIso`, `debutSemaine`, `heureLocale`, `libelleJour` (dates) ; `LIBELLES_FORMAT` (fiche) ; `bandeau` (carte) ; les actions `ouvrirFiche` et `changerVue`.
- Produces :
  - dans le dépôt : `ecouterBulletin(cle, rappel, erreur)` (rappel avec le bulletin ou `null`) et `ecouterConfigVeille(rappel, erreur)` (rappel avec `{ url_routine }` ou `null`) ;
  - dans l'état : `bulletin` (`undefined` en chargement, `null` si absent, sinon l'objet) et `configVeille` (`null` ou objet) ;
  - la vue : `vueBulletin(etat, actions)` ;
  - l'onglet « Bulletin » (`vue: 'bulletin'`), qui utilise la plage d'une semaine (comportement par défaut de `plageDeVue`) ;
  - dans `vueSemaine` : si `etat.bulletin === null`, un bandeau `p.sans-bulletin`, « Pas de bulletin pour cette semaine. », suivi d'un bouton « Voir l’onglet Bulletin ».

- [ ] **Step 1 : écrire les tests**

Ajouter à `tests/donnees/depot.test.js` :

```js
describe('bulletin et configuration de la veille', () => {
  it('écoute un bulletin par semaine et la configuration', async () => {
    const db = creerFausseBase();
    const depot = creerDepot(db);
    const bulletins = [];
    depot.ecouterBulletin('2026-W41', b => bulletins.push(b));
    expect(bulletins[0]).toBeNull();
    await db.doc('bulletins/2026-W41').set({ semaine: '2026-W41', statut: 'complet' });
    expect(bulletins.at(-1)).toEqual({ semaine: '2026-W41', statut: 'complet' });
    const configs = [];
    depot.ecouterConfigVeille(c => configs.push(c));
    expect(configs[0]).toBeNull();
    await db.doc('config/veille').set({ url_routine: 'https://exemple.test/routine' });
    expect(configs.at(-1)).toEqual({ url_routine: 'https://exemple.test/routine' });
  });
});
```

`tests/interface/vue-bulletin.test.js` :

```js
// @vitest-environment happy-dom
import { describe, it, expect, vi } from 'vitest';
import fictif from '../../exemples/profil-fictif.json';
import { nouvelleFiche } from '../../src/logique/fiche.js';
import { vueBulletin } from '../../src/interface/vue-bulletin.js';

const ANCRE = '2026-10-06T10:00:00.000Z';
const idee = { ...nouvelleFiche({ id: 'i1', format: 'reel', date_heure: '2026-10-05T10:00:00.000Z', pilier: 'nuit', maintenant: 'x' }), accroche: 'Idée de la veille' };
const bulletin = extra => ({
  semaine: '2026-W41', genere_le: '2026-10-04T18:00:00.000Z', statut: 'complet', sources_indisponibles: false,
  retrospective: { type: 'rappel', texte: 'Aucun relevé de statistiques pour la semaine écoulée : saisis-les pour obtenir la rétrospective.' },
  tendances: [{ titre: 'Tendance A', source: 'https://exemple.test/a', date: '2026-10-01', pourquoi: 'Colle à la voix.', adaptation: 'En fausse annonce.', duree_vie: '2 semaines', son_a_verifier: true }],
  ecartees: [{ titre: 'Tendance B', raison: 'Trop cozy.' }],
  alertes: [{ texte: 'Nouveau format.', proposition_profil: 'Ajouter les Reels longs.' }],
  idees: ['i1', 'disparue'], hors_creneau: [], controle: [],
  ...extra,
});
const etat = extra => ({ profil: fictif, fiches: [idee], ancre: ANCRE, bulletin: bulletin(), configVeille: { url_routine: 'https://exemple.test/routine' }, ...extra });
const actions = () => ({ ouvrirFiche: vi.fn(), changerVue: vi.fn() });

describe('vueBulletin', () => {
  it('affiche le rappel, les tendances, les écartées, les alertes et les idées', () => {
    const a = actions();
    const el = vueBulletin(etat(), a);
    const t = el.textContent;
    for (const attendu of ['Semaine 2026-W41', 'Aucun relevé de statistiques', 'Tendance A', 'Son à vérifier dans l’app', 'Tendance B', 'Trop cozy.', 'Nouveau format.', 'Proposition de mise à jour du profil : Ajouter les Reels longs.', 'Idée de la veille', 'Idée supprimée ou hors de cette semaine.']) {
      expect(t).toContain(attendu);
    }
    const lien = el.querySelector('a[href="https://exemple.test/a"]');
    expect(lien.target).toBe('_blank');
    [...el.querySelectorAll('button')].find(b => b.textContent === 'Ouvrir').click();
    expect(a.ouvrirFiche).toHaveBeenCalledWith('i1');
  });
  it('signale un bulletin partiel', () => {
    const el = vueBulletin(etat({ bulletin: bulletin({ statut: 'partiel', sources_indisponibles: true, tendances: [] }) }), actions());
    expect(el.textContent).toContain('Sources indisponibles : bulletin partiel.');
  });
  it('sans bulletin : message et lien de relance, ou veille non configurée', () => {
    const avec = vueBulletin(etat({ bulletin: null }), actions());
    expect(avec.textContent).toContain('Pas de bulletin pour cette semaine.');
    expect(avec.querySelector('a[href="https://exemple.test/routine"]').textContent).toBe('Relancer la veille');
    const sans = vueBulletin(etat({ bulletin: null, configVeille: null }), actions());
    expect(sans.textContent).toContain('La veille n’est pas encore configurée.');
  });
  it('pendant le chargement', () => {
    expect(vueBulletin(etat({ bulletin: undefined }), actions()).textContent).toContain('Chargement du bulletin…');
  });
});
```

Ajouter à `tests/interface/vue-semaine.test.js` :

```js
  it('signale l’absence de bulletin et mène à l’onglet Bulletin', () => {
    const actions = { ...actionsFactices(), changerVue: vi.fn() };
    const el = vueSemaine({ profil: fictif, fiches: [], ancre: ANCRE, bulletin: null }, actions);
    expect(el.querySelector('.sans-bulletin').textContent).toContain('Pas de bulletin pour cette semaine.');
    [...el.querySelectorAll('button')].find(b => b.textContent === 'Voir l’onglet Bulletin').click();
    expect(actions.changerVue).toHaveBeenCalledWith('bulletin');
    expect(vueSemaine({ profil: fictif, fiches: [], ancre: ANCRE, bulletin: undefined }, actionsFactices()).querySelector('.sans-bulletin')).toBeNull();
  });
```

Ajouter à `tests/interface/app.test.js` :

```js
  it('affiche le bulletin de la semaine dans l’onglet Bulletin', async () => {
    const db = creerFausseBase();
    const racine = document.createElement('div');
    const app = await demarrer(racine, { use: async nom => (nom === 'db' ? db : null) }, { horloge });
    await app.actions.importerProfil(JSON.stringify(fictif));
    await db.doc('bulletins/2026-W40').set({ semaine: '2026-W40', genere_le: horloge(), statut: 'complet', sources_indisponibles: false, retrospective: { type: 'rappel', texte: 'Rappel.' }, tendances: [], ecartees: [], alertes: [], idees: [], hors_creneau: [], controle: [] });
    await app.actions.changerVue('bulletin');
    expect(racine.textContent).toContain('Semaine 2026-W40');
  });
```

(`horloge` renvoie `2026-09-28T08:00:00.000Z` dans ce fichier, soit la semaine `2026-W40`.)

- [ ] **Step 2 : lancer les tests pour vérifier qu'ils échouent**

Run : `npx vitest run tests/donnees/depot.test.js tests/interface/vue-bulletin.test.js tests/interface/vue-semaine.test.js tests/interface/app.test.js`
Expected : FAIL.

- [ ] **Step 3 : implémenter le dépôt**

Ajouter à l'objet renvoyé par `creerDepot` :

```js
    ecouterBulletin(cle, rappel, erreur) {
      return db.doc(`bulletins/${cle}`).onSnapshot(s => rappel(s.exists ? s.data() : null), erreur);
    },

    ecouterConfigVeille(rappel, erreur) {
      return db.doc('config/veille').onSnapshot(s => rappel(s.exists ? s.data() : null), erreur);
    },
```

- [ ] **Step 4 : implémenter la vue Bulletin**

`src/interface/vue-bulletin.js` :

```js
import { h } from './h.js';
import { LIBELLES_FORMAT } from '../logique/fiche.js';
import { heureLocale, libelleJour } from '../logique/dates.js';
import { bandeau } from './carte.js';

const lienRelance = config => (config?.url_routine
  ? h('a', { href: config.url_routine, target: '_blank', rel: 'noopener', class: 'bouton-secondaire' }, 'Relancer la veille')
  : h('p', { class: 'aide' }, 'La veille n’est pas encore configurée.'));

const source = s => (/^https?:\/\//.test(s) ? h('a', { href: s, target: '_blank', rel: 'noopener' }, s) : s);

export function vueBulletin({ profil, fiches, bulletin, configVeille }, actions) {
  const fz = profil.regles_studio.fuseau;
  if (bulletin === undefined) return h('div', { class: 'bulletin' }, h('p', { class: 'aide' }, 'Chargement du bulletin…'));
  if (bulletin === null) {
    return h('div', { class: 'bulletin' }, h('p', { class: 'sans-bulletin' }, 'Pas de bulletin pour cette semaine.'), lienRelance(configVeille));
  }
  const parId = new Map(fiches.map(f => [f.id, f]));
  const genere = new Date(bulletin.genere_le).toLocaleString('fr-FR', { timeZone: fz });
  return h('div', { class: 'bulletin' },
    h('header', { class: 'bulletin-tete' },
      h('h2', {}, `Semaine ${bulletin.semaine}`),
      h('p', { class: 'aide' }, `Préparé le ${genere}.`),
      lienRelance(configVeille)),
    bulletin.sources_indisponibles ? h('p', { class: 'bulletin-partiel', role: 'status' }, 'Sources indisponibles : bulletin partiel.') : null,
    h('section', {}, h('h3', {}, 'Rétrospective'), h('p', {}, bulletin.retrospective?.texte ?? '')),
    h('section', {}, h('h3', {}, 'Tendances'),
      bulletin.tendances.length
        ? h('ul', { class: 'tendances' }, bulletin.tendances.map(t => h('li', { class: 'tendance' },
          h('strong', {}, t.titre), t.son_a_verifier ? h('span', { class: 'etiquette' }, 'Son à vérifier dans l’app') : null,
          h('p', {}, `Pourquoi : ${t.pourquoi}`), h('p', {}, `Adaptation : ${t.adaptation}`),
          h('p', { class: 'aide' }, 'Source : ', source(t.source), ` · ${t.date} · durée de vie : ${t.duree_vie}`))))
        : h('p', { class: 'aide' }, 'Aucune tendance retenue cette semaine.')),
    bulletin.ecartees?.length
      ? h('details', {}, h('summary', {}, `Tendances écartées (${bulletin.ecartees.length})`),
        h('ul', {}, bulletin.ecartees.map(e => h('li', {}, `${e.titre} : ${e.raison}`))))
      : null,
    bulletin.alertes?.length
      ? h('section', {}, h('h3', {}, 'Alertes'), h('ul', {}, bulletin.alertes.map(a => h('li', {}, a.texte,
        a.proposition_profil ? h('p', { class: 'aide' }, `Proposition de mise à jour du profil : ${a.proposition_profil}`) : null))))
      : null,
    h('section', {}, h('h3', {}, 'Idées déposées'),
      h('ul', { class: 'idees' }, bulletin.idees.map(id => {
        const f = parId.get(id);
        if (!f) return h('li', { class: 'aide' }, 'Idée supprimée ou hors de cette semaine.');
        return h('li', { class: 'idee' },
          h('span', {}, `${LIBELLES_FORMAT[f.format]} · ${libelleJour(f.date_heure, fz)} ${heureLocale(f.date_heure, fz)}`),
          h('span', { class: 'idee-accroche' }, f.accroche || 'Sans accroche'),
          (bulletin.hors_creneau ?? []).includes(id) ? h('span', { class: 'etiquette' }, 'Hors créneau') : null,
          h('button', { type: 'button', class: 'bouton-lien', onclick: () => actions.ouvrirFiche(id) }, 'Ouvrir'));
      }))),
    bulletin.controle?.length ? h('section', {}, h('h3', {}, 'Contrôle de la semaine au moment du bulletin'), bandeau(bulletin.controle)) : null);
}
```

- [ ] **Step 5 : brancher l'onglet, le bandeau et l'application**

1. **Dans `src/interface/vue-semaine.js`** : lire `bulletin` dans les paramètres. Si `bulletin === null`, placer en tête du conteneur `h('p', { class: 'sans-bulletin' }, 'Pas de bulletin pour cette semaine. ', h('button', { type: 'button', class: 'bouton-lien', onclick: () => actions.changerVue('bulletin') }, 'Voir l’onglet Bulletin'))`.
2. **Dans `src/interface/rendu.js`** :
   - importer `vueBulletin` ;
   - ajouter l'onglet `onglet('bulletin', 'Bulletin')` après « Jour » ;
   - dans `contenuVue`, ajouter le cas `if (e.vue === 'bulletin') return vueBulletin(e, actions);` ;
   - hors vue Profil, la reconstruction dépend aussi de `bulletin` et de `configVeille` : les ajouter à la condition et à `memo`.
3. **Dans `src/interface/app.js`** :
   - ajouter `bulletin: undefined, configVeille: null` à l'état initial ;
   - brancher `depot.ecouterConfigVeille(configVeille => etat.modifier({ configVeille }), …)` ;
   - dans l'abonné, quand `e.profil` existe, calculer `cle = cleSemaineIso(debutSemaine(e.ancre, fz), fz)`. Si `cle` change, arrêter l'écoute précédente, faire `etat.modifier({ bulletin: undefined })`, puis `arreterBulletin = depot.ecouterBulletin(cle, bulletin => etat.modifier({ bulletin }), err => etat.modifier({ erreur: messageErreurBase(err) }))`.
4. **Dans `src/interface/styles.css`**, ajouter :

```css
/* Bulletin */
.bulletin { display: grid; gap: 16px; max-width: 760px; }
.bulletin-tete { display: flex; flex-wrap: wrap; align-items: baseline; gap: 8px 16px; }
.bulletin-tete h2 { margin: 0; font-size: 18px; }
.bulletin h3 { margin: 0 0 6px; font-size: 15px; }
.bulletin-partiel, .sans-bulletin { margin: 0 0 8px; padding: 6px 10px; border-left: 4px solid var(--orange); background: var(--surface-2); border-radius: 6px; }
.tendances, .idees { list-style: none; margin: 0; padding: 0; display: grid; gap: 10px; }
.tendance { padding: 8px 10px; background: var(--surface); border: 1px solid var(--trait); border-radius: var(--rayon); }
.tendance p { margin: 4px 0 0; }
.etiquette { display: inline-block; margin-left: 8px; padding: 0 6px; border-radius: 4px; font-size: 12px; background: var(--surface-2); color: var(--texte-2); }
.idee { display: grid; grid-template-columns: auto minmax(0, 1fr) auto auto; gap: 8px; align-items: baseline; }
.idee-accroche { overflow-wrap: anywhere; }
@media (max-width: 600px) { .idee { grid-template-columns: minmax(0, 1fr); } }
```

- [ ] **Step 6 : lancer les tests**

Run : `npx vitest run tests/donnees/depot.test.js tests/interface/vue-bulletin.test.js tests/interface/vue-semaine.test.js tests/interface/app.test.js`
Expected : PASS. Puis `npm test` et `npm run build` : PASS.

- [ ] **Step 7 : commit**

```bash
git add src tests
git commit -m "Studio : onglet Bulletin et bandeau sans bulletin"
```

---

### Task 6 : mise en ligne, routine et vérification

Le contrôleur réalise cette tâche lui-même, avec les outils `Artifact`, `ArtifactData` et `RemoteTrigger`. Ce n'est pas une tâche pour un sous-agent.

**Files :**
- Modify (non versionné) : `.studio.local.json`
- Modify : `README.md` (Statut), `docs/superpowers/HANDOFF-brainstorming.md` (Reste à faire)

- [ ] **Step 1 : construire et publier**

Run : `npm test && npm run build`.

Republier `dist/studio.html` à l'URL du studio de test, sans passer `capabilities` : la déclaration existante est conservée. Copier ensuite la page dans le dossier du studio réel du scratchpad et la republier à l'URL du studio réel. Les deux URL sont dans `.studio.local.json`.

- [ ] **Step 2 : vérifier la veille de bout en bout sur le studio de test**

1. Pousser la branche sur GitHub : la routine clone le dépôt.
2. Créer une routine **ponctuelle** (`run_once_at` dans environ 3 minutes). Paramètres :
   - dépôt : `https://github.com/arch-arch-arch/studio-marie` ;
   - modèle : `claude-sonnet-5` ;
   - `allowed_tools` : `Bash`, `Read`, `Write`, `Glob`, `Grep`, `ToolSearch`, `ArtifactData`, `WebSearch`, `WebFetch` ;
   - prompt : « Passe sur la branche `plan-3-veille`. Lis `src/claude/veille.md` et applique-le exactement. STUDIO = <URL du studio de test>. Pour ce test manuel, l'étape `doit-tourner` répondra `oui`. »
3. Une fois la routine passée, lire son compte rendu avec `list_runs` puis `get_run_log`. Vérifier que `WebSearch` a fonctionné (point à confirmer de la spec §6.1).
4. Avec `ArtifactData`, lire `bulletins/<semaine>` et les fiches de la semaine suivante sur le studio de test : 3 à 5 idées en `brouillon`, avec un score.
5. Relancer la même routine ponctuelle, avec un nouveau `run_once_at`. Vérifier ensuite qu'il n'y a **pas de doublon** : le nombre de fiches `origine.bulletin === <semaine>` reste identique.

Si l'une de ces vérifications échoue : corriger en TDD (test qui reproduit le problème, correction, `npm test`), pousser, puis refaire le point.

- [ ] **Step 3 : routine programmée pour le studio réel**

Créer la routine hebdomadaire :
- nom : « Veille hebdo du studio » ;
- `cron_expression` : `0 0,1 * * 1` (lundi 00 h et 01 h UTC, le script ne garde que le dimanche 20 h locale) ;
- mêmes dépôt, modèle et outils qu'à l'étape 2 ;
- prompt : « Lis `src/claude/veille.md` et applique-le exactement. STUDIO = <URL du studio réel>. » Ajouter en tête « Passe sur la branche `plan-3-veille`. » tant que ce plan n'est pas fusionné dans `main`, puis retirer cette ligne après la fusion.

Écrire ensuite dans le studio réel `config/veille` = `{ "url_routine": "https://claude.ai/code/routines/<id>" }` avec `ArtifactData` `set`. Faire de même dans le studio de test, avec l'URL de la routine ponctuelle.

- [ ] **Step 4 : checklist à dérouler par Jean**

1. Dans le studio de test, onglet Bulletin de la semaine suivante : les tendances, les écartées, les alertes et les idées s'affichent, et « Ouvrir » ouvre chaque idée avec son score.
2. Dans le studio réel, pour une semaine sans bulletin : le bandeau « Pas de bulletin pour cette semaine. » s'affiche, et « Relancer la veille » ouvre la routine sur claude.ai.
3. Après le premier dimanche, ouvrir le bulletin réel et relire les idées.

- [ ] **Step 5 : statut du projet**

Dans `README.md`, cocher « Plan 3 : veille hebdo ». Dans `docs/superpowers/HANDOFF-brainstorming.md`, retirer le plan 3 de « Reste à faire ».

- [ ] **Step 6 : commit**

```bash
git add README.md docs/superpowers/HANDOFF-brainstorming.md
git commit -m "Plan 3 livré : veille hebdomadaire"
```
