# Plan 5 : parcours d'une fiche : plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Chaque fiche affiche sa prochaine action : terminer, évaluer, confirmer la programmation, confirmer la publication ou saisir les statistiques. « Programmé » et « Publié » deviennent des confirmations datées, et les relevés partent de la date réelle de publication.

**Architecture:**
- La logique des confirmations et la date de publication vont dans `src/logique/fiche.js`.
- La prochaine action est calculée par une fonction pure, `src/logique/parcours.js`.
- Le contrôleur expose `confirmerProgrammation` et `confirmerPublication`.
- Côté interface :
  - le panneau affiche un bandeau d'action et deux formulaires de confirmation ;
  - la carte affiche une ligne d'action ;
  - la vue Semaine liste « À faire cette semaine ».

**Tech Stack:** JavaScript (modules ES), DOM vanilla via `h()`, Vitest + happy-dom, esbuild.

**Spec:** `docs/superpowers/specs/2026-09-29-plan-5-parcours-design.md`, qui complète `docs/superpowers/specs/2026-09-27-studio-contenu-design.md`. Les plans 1 à 4 sont fusionnés dans `main`. Ce plan part de `main`, sur la branche `plan-5-parcours`.

## Global Constraints

- **Dépôt privé et anonymisé.** Aucune donnée réelle de la créatrice dans git. Tests et exemples fictifs.
- **Langue.** Interface en français, au tutoiement, sans emoji. Apostrophe typographique `’` dans les textes de l'interface.
- **Champs ajoutés :** `programme_pour` et `publie_le` (ISO UTC, `null` par défaut). Aucune migration.
- **Date de départ des relevés :** `publie_le ?? date_heure` (`datePublication`).
- **Confirmations :**
  - programmation refusée si la date est passée ;
  - publication refusée si la date dépasse maintenant + 5 minutes ;
  - la case à cocher est obligatoire ;
  - les règles de validation actuelles s'appliquent.
- **Pas de dépendance nouvelle.** `Element.replaceChildren` natif n'aplatit pas les tableaux et affiche `null` en texte. On ne lui passe que des nœuds, dépliés et filtrés. `h()` aplatit et ignore `null`/`false`.
- **Commits.** Chaque commit se termine par une ligne `Co-Authored-By:` qui nomme le modèle auteur.

## Écarts assumés et précisions

- `changerStatut` du contrôleur refuse désormais `programme` et `publie` : ces statuts ne s'obtiennent que par confirmation. La logique pure `changerStatut` de `fiche.js` les accepte toujours, car les tests et les données en ont besoin.
- `confirmerProgrammation` refuse une fiche déjà publiée : « Cette fiche est déjà publiée. »
- Libellés des boutons du bandeau, distincts des boutons existants pour éviter toute ambiguïté :

  | Action | Libellé du bouton |
  |---|---|
  | évaluer / réévaluer | « Lancer l’évaluation » |
  | programmer / reconfirmer / publier | « Confirmer… » |
  | stats | « Aller aux statistiques » |
  | valider | « Passer en Validé » |

- La vue Semaine se reconstruit désormais quand `stats` change, car les cartes des fiches publiées en dépendent. Le test du plan 4 « ne reconstruit pas la vue Semaine quand seules les statistiques changent » devient « … quand seuls les relevés du compte changent ».

## Review Focus

1. **Fiches programmées avant ce plan** (sans `programme_pour`) : leur action est « Reconfirmer la programmation », sans erreur. *(Task 2)*
2. **Date vide ou invalide dans un formulaire de confirmation** : message clair, et rien n'est écrit. *(Tasks 1, 3 et 4)*
3. **Fiche programmée puis déplacée** (glisser-déposer) : elle reste « Programmé », garde `programme_pour` et affiche « Reconfirmer ». *(Tasks 2 et 3)*
4. **Une fiche validée ou programmée repasse en Brouillon** (modification, réévaluation rouge, profil réimporté) : ses confirmations sont effacées. *(Tasks 1 et 3)*
5. **Fiches publiées avant ce plan** (sans `publie_le`) : les relevés partent de `date_heure`. *(Tasks 1 et 2)*

---

## Structure des fichiers

```
src/logique/fiche.js           + datePublication, confirmations, effacements, champs protégés (Task 1)
src/logique/indicateurs.js     relevés depuis datePublication (Task 1)
src/logique/tableau-bord.js    rétrospective depuis datePublication (Task 1)
src/logique/parcours.js        prochaineAction, ACTIONS_SANS_SUITE (Task 2)
src/interface/controleur.js    confirmerProgrammation, confirmerPublication, changerStatut (Task 3)
src/interface/panneau-fiche.js bandeau d'action, formulaires de confirmation (Task 4)
src/interface/carte.js         ligne d'action (Task 5)
src/interface/vue-semaine.js   « À faire cette semaine » (Task 5)
src/interface/rendu.js         relevés passés au panneau, reconstruction de la semaine sur stats (Tasks 4 et 5)
src/interface/styles.css       styles (Tasks 4 et 5)
```

---

### Task 1 : confirmations et date de publication (logique)

**Files:**
- Modify: `src/logique/fiche.js`, `src/logique/indicateurs.js`, `src/logique/tableau-bord.js`
- Test: `tests/logique/fiche.test.js`, `tests/logique/indicateurs.test.js`, `tests/logique/tableau-bord.test.js`

**Interfaces:**
- Produces :
  - `datePublication(fiche)` → ISO ;
  - `effacementsPour(cible)` → objet des champs à remettre à `null` ;
  - `confirmerProgrammation(fiche, { date, coche }, maintenant)` → `{ ok: true, fiche }` ou `{ ok: false, raison }` ;
  - `confirmerPublication(fiche, { date, coche }, maintenant)` → même forme ;
  - `nouvelleFiche` ajoute `programme_pour: null, publie_le: null`.

- [ ] **Step 1: Write the failing tests.** In `tests/logique/fiche.test.js`, add `datePublication, effacementsPour, confirmerProgrammation, confirmerPublication` to the import from `fiche.js`, then add:

```js
describe('confirmations', () => {
  const M = '2026-09-28T08:00:00.000Z';
  const validee = () => changerStatut(prete(), 'valide', T0);

  it('nouvelleFiche prévoit les deux champs', () => {
    expect(base()).toMatchObject({ programme_pour: null, publie_le: null });
  });

  it('confirme la programmation et aligne la date', () => {
    const r = confirmerProgrammation(validee(), { date: '2026-10-01T10:00:00.000Z', coche: true }, M);
    expect(r.ok).toBe(true);
    expect(r.fiche).toMatchObject({ statut: 'programme', programme_pour: '2026-10-01T10:00:00.000Z', date_heure: '2026-10-01T10:00:00.000Z', publie_le: null, maj_le: M });
  });

  it('normalise la date confirmée en ISO UTC', () => {
    const r = confirmerProgrammation(validee(), { date: '2026-10-01T12:00:00+02:00', coche: true }, M);
    expect(r.fiche.programme_pour).toBe('2026-10-01T10:00:00.000Z');
  });

  it('refuse sans case cochée, sans date valide, ou dans le passé', () => {
    expect(confirmerProgrammation(validee(), { date: '2026-10-01T10:00:00.000Z', coche: false }, M)).toEqual({ ok: false, raison: 'Coche la case pour confirmer.' });
    expect(confirmerProgrammation(validee(), { date: '', coche: true }, M)).toEqual({ ok: false, raison: 'Indique une date et une heure valides.' });
    expect(confirmerProgrammation(validee(), { date: '2026-09-28T07:59:00.000Z', coche: true }, M))
      .toEqual({ ok: false, raison: 'Choisis une date à venir : Meta Business Suite ne programme pas dans le passé.' });
  });

  it('applique les règles de validation', () => {
    expect(confirmerProgrammation(base(), { date: '2026-10-01T10:00:00.000Z', coche: true }, M))
      .toEqual({ ok: false, raison: 'Ajoute un visuel avant de valider.' });
  });

  it('refuse de programmer une fiche déjà publiée', () => {
    const publiee = confirmerPublication(validee(), { date: '2026-09-28T07:00:00.000Z', coche: true }, M).fiche;
    expect(confirmerProgrammation(publiee, { date: '2026-10-01T10:00:00.000Z', coche: true }, M)).toEqual({ ok: false, raison: 'Cette fiche est déjà publiée.' });
  });

  it('confirme la publication, y compris directement depuis Validé', () => {
    const r = confirmerPublication(validee(), { date: '2026-09-28T07:00:00.000Z', coche: true }, M);
    expect(r.fiche).toMatchObject({ statut: 'publie', publie_le: '2026-09-28T07:00:00.000Z', date_heure: '2026-09-28T07:00:00.000Z', programme_pour: null });
  });

  it('garde la programmation confirmée au moment de la publication', () => {
    const prog = confirmerProgrammation(validee(), { date: '2026-09-28T09:00:00.000Z', coche: true }, M).fiche;
    const pub = confirmerPublication(prog, { date: '2026-09-28T09:00:00.000Z', coche: true }, '2026-09-28T09:30:00.000Z').fiche;
    expect(pub).toMatchObject({ statut: 'publie', programme_pour: '2026-09-28T09:00:00.000Z', publie_le: '2026-09-28T09:00:00.000Z' });
  });

  it('tolère 5 minutes d’avance pour la publication, pas plus', () => {
    expect(confirmerPublication(validee(), { date: '2026-09-28T08:05:00.000Z', coche: true }, M).ok).toBe(true);
    expect(confirmerPublication(validee(), { date: '2026-09-28T08:06:00.000Z', coche: true }, M))
      .toEqual({ ok: false, raison: 'La date de publication ne peut pas être dans le futur.' });
    expect(confirmerPublication(validee(), { date: '2026-09-28T07:00:00.000Z', coche: false }, M)).toEqual({ ok: false, raison: 'Coche la case pour confirmer.' });
  });

  it('efface les confirmations en revenant en arrière', () => {
    const prog = confirmerProgrammation(validee(), { date: '2026-10-01T10:00:00.000Z', coche: true }, M).fiche;
    expect(changerStatut(prog, 'valide', M)).toMatchObject({ statut: 'valide', programme_pour: null, publie_le: null });
    const pub = confirmerPublication(prog, { date: '2026-09-28T07:00:00.000Z', coche: true }, M).fiche;
    expect(changerStatut(pub, 'programme', M)).toMatchObject({ statut: 'programme', publie_le: null, programme_pour: '2026-10-01T10:00:00.000Z' });
    expect(effacementsPour('brouillon')).toEqual({ programme_pour: null, publie_le: null });
    expect(effacementsPour('publie')).toEqual({});
  });

  it('efface les confirmations quand une modification fait repasser en Brouillon', () => {
    const prog = confirmerProgrammation(validee(), { date: '2026-10-01T10:00:00.000Z', coche: true }, M).fiche;
    expect(modifierFiche(prog, { caption: 'autre' }, M)).toMatchObject({ statut: 'brouillon', programme_pour: null });
  });

  it('déplacer une fiche programmée garde son statut et sa programmation', () => {
    const prog = confirmerProgrammation(validee(), { date: '2026-10-01T10:00:00.000Z', coche: true }, M).fiche;
    const g = deplacerFiche(prog, '2026-10-02T10:00:00.000Z', 'Europe/Paris', M);
    expect(g).toMatchObject({ statut: 'programme', programme_pour: '2026-10-01T10:00:00.000Z', date_heure: '2026-10-02T10:00:00.000Z' });
  });

  it('protège les deux champs de confirmation', () => {
    expect(() => modifierFiche(base(), { programme_pour: 'x' }, M)).toThrow('Champ protégé : programme_pour');
    expect(() => modifierFiche(base(), { publie_le: 'x' }, M)).toThrow('Champ protégé : publie_le');
  });

  it('datePublication préfère la date réelle', () => {
    expect(datePublication({ date_heure: 'a', publie_le: 'b' })).toBe('b');
    expect(datePublication({ date_heure: 'a', publie_le: null })).toBe('a');
    expect(datePublication({ date_heure: 'a' })).toBe('a');
  });
});
```

In `tests/logique/indicateurs.test.js`, `describe('etatReleves')` :

```js
  it('part de la date réelle de publication quand elle existe', () => {
    const e = etatReleves({ ...publiee, publie_le: '2026-09-21T10:00:00.000Z' }, [], '2026-09-22T12:00:00.000Z');
    expect(e['48h']).toEqual({ du_le: '2026-09-23T10:00:00.000Z', etat: 'pas_encore' });
  });
```

In `tests/logique/indicateurs.test.js`, `describe('documents')` :

```js
  it('date_publication reprend la date réelle de publication', () => {
    const v = validerReleveContenu({ vues: 1, nouveaux_abonnes: 0, partages_envois: 0 }).valeurs;
    expect(documentReleveContenu({ ...publiee, publie_le: '2026-09-21T09:00:00.000Z' }, '48h', v, 'x').date_publication).toBe('2026-09-21T09:00:00.000Z');
  });
```

In `tests/logique/tableau-bord.test.js`, `describe('retrospective')` :

```js
  it('la fenêtre et les manquants partent de la date réelle de publication', () => {
    const r = retrospective({
      stats: [], relevesCompte: [], fiches: [{ id: 'p', statut: 'publie', date_heure: '2026-09-30T10:00:00.000Z', publie_le: '2026-09-22T10:00:00.000Z', accroche: 'Réelle' }],
      cibles: undefined, fuseau: FZ, debutSemaineVisee: W40, maintenant: '2026-09-27T18:00:00.000Z',
    });
    expect(r.manquants).toEqual([{ fiche: 'p', releve: '48h', accroche: 'Réelle' }]);
  });
```

- [ ] **Step 2: Run to see them fail**

Run: `npx vitest run tests/logique/fiche.test.js tests/logique/indicateurs.test.js tests/logique/tableau-bord.test.js`
Expected: FAIL (fonctions absentes, date de publication ignorée).

- [ ] **Step 3: Implement in `src/logique/fiche.js`.**
  - In `nouvelleFiche`, add `programme_pour: null, publie_le: null,` after `date_heure, statut: 'idee',`.
  - Replace `const CHAMPS_PROTEGES = ['statut', 'id', 'cree_le', 'score'];` with:

```js
const CHAMPS_PROTEGES = ['statut', 'id', 'cree_le', 'score', 'programme_pour', 'publie_le'];
const SANS_CONFIRMATION = { programme_pour: null, publie_le: null };
const TOLERANCE_PUBLICATION_MS = 5 * 60000;

export const datePublication = f => f.publie_le ?? f.date_heure;

export function effacementsPour(cible) {
  if (cible === 'publie') return {};
  if (cible === 'programme') return { publie_le: null };
  return { ...SANS_CONFIRMATION };
}

const dateConfirmee = date => {
  const t = Date.parse(date ?? '');
  return Number.isNaN(t) ? null : new Date(t).toISOString();
};
```

  - In `modifierFiche`, replace `resultat.statut = 'brouillon';` with `Object.assign(resultat, { statut: 'brouillon' }, SANS_CONFIRMATION);`.
  - In `appliquerEvaluation`, replace `resultat.statut = 'brouillon';` with `Object.assign(resultat, { statut: 'brouillon' }, SANS_CONFIRMATION);`.
  - Replace the body of `changerStatut` with:

```js
  const v = peutPasserA(fiche, cible);
  if (!v.ok) throw new Error(v.raison);
  return { ...fiche, statut: cible, ...effacementsPour(cible), maj_le: maintenant };
```

  - Add after `changerStatut`:

```js
export function confirmerProgrammation(fiche, { date, coche }, maintenant) {
  if (!coche) return { ok: false, raison: 'Coche la case pour confirmer.' };
  const d = dateConfirmee(date);
  if (!d) return { ok: false, raison: 'Indique une date et une heure valides.' };
  if (fiche.statut === 'publie') return { ok: false, raison: 'Cette fiche est déjà publiée.' };
  if (d < maintenant) return { ok: false, raison: 'Choisis une date à venir : Meta Business Suite ne programme pas dans le passé.' };
  const v = peutPasserA(fiche, 'programme');
  if (!v.ok) return v;
  return { ok: true, fiche: { ...fiche, statut: 'programme', programme_pour: d, date_heure: d, publie_le: null, maj_le: maintenant } };
}

export function confirmerPublication(fiche, { date, coche }, maintenant) {
  if (!coche) return { ok: false, raison: 'Coche la case pour confirmer.' };
  const d = dateConfirmee(date);
  if (!d) return { ok: false, raison: 'Indique une date et une heure valides.' };
  if (Date.parse(d) > Date.parse(maintenant) + TOLERANCE_PUBLICATION_MS) return { ok: false, raison: 'La date de publication ne peut pas être dans le futur.' };
  const v = peutPasserA(fiche, 'publie');
  if (!v.ok) return v;
  return { ok: true, fiche: { ...fiche, statut: 'publie', publie_le: d, date_heure: d, programme_pour: fiche.programme_pour ?? null, maj_le: maintenant } };
}
```

- [ ] **Step 4: Use `datePublication`.**
  - `src/logique/indicateurs.js` : add `import { datePublication } from './fiche.js';`.
    - In `etatReleves`, replace `new Date(fiche.date_heure).getTime()` with `new Date(datePublication(fiche)).getTime()`.
    - In `documentReleveContenu`, replace `date_publication: fiche.date_heure` with `date_publication: datePublication(fiche)`.
  - `src/logique/tableau-bord.js` : add `import { datePublication } from './fiche.js';`, then replace `dansPeriode(f.date_heure)` with `dansPeriode(datePublication(f))`.

- [ ] **Step 5: Run the tests**

Run: `npx vitest run tests/logique`, puis `npm test`.
Expected: PASS. Si un test existant compare une fiche entière et casse à cause des deux champs `null` ajoutés, adapte le test, pas la donnée.

- [ ] **Step 6: Commit**

```bash
git add src/logique/fiche.js src/logique/indicateurs.js src/logique/tableau-bord.js tests/logique/fiche.test.js tests/logique/indicateurs.test.js tests/logique/tableau-bord.test.js
git commit -m "Fiche : confirmations datées de programmation et de publication, relevés depuis la date réelle

Co-Authored-By: <modèle auteur>"
```

---

### Task 2 : prochaine action (logique)

**Files:**
- Create: `src/logique/parcours.js`
- Test: `tests/logique/parcours.test.js`

**Interfaces:**
- Consumes :
  - de Task 1 : `datePublication` (via `etatReleves`) ;
  - de `fiche.js` : `aReevaluer` ;
  - de `indicateurs.js` : `RELEVES`, `etatReleves` ;
  - de `dates.js` : `libelleJour`, `heureLocale`.
- Produces :
  - `prochaineAction(fiche, releves, maintenant, fuseau)` → `{ cle, libelle, detail, retard }` ;
  - `ACTIONS_SANS_SUITE` : `Set(['attendre', 'termine'])`.

- [ ] **Step 1: Write the failing tests** : `tests/logique/parcours.test.js`

```js
import { describe, it, expect } from 'vitest';
import { nouvelleFiche, empreinte } from '../../src/logique/fiche.js';
import { libelleJour, heureLocale } from '../../src/logique/dates.js';
import { prochaineAction, ACTIONS_SANS_SUITE } from '../../src/logique/parcours.js';

const FZ = 'Europe/Paris';
const M = '2026-09-29T10:00:00.000Z';
const D = '2026-10-01T10:00:00.000Z';
const base = extra => ({ ...nouvelleFiche({ id: 'f1', format: 'reel', date_heure: D, pilier: 'socio', maintenant: '2026-09-27T20:00:00.000Z' }), ...extra });
const evaluee = (extra = {}, conformite = { etat: 'vert', causes: [] }) => {
  const f = base({ visuel: 'a1', visuel_type: 'image', caption: 'Une caption.', ...extra });
  return { ...f, score: { total: 70, criteres: [], conformite, empreinte: empreinte(f) } };
};
const quand = iso => `${libelleJour(iso, FZ)} à ${heureLocale(iso, FZ)}`;
const action = (f, releves = [], m = M) => prochaineAction(f, releves, m, FZ);

describe('prochaineAction : préparation', () => {
  it('liste ce qui manque pour terminer', () => {
    expect(action(base())).toEqual({ cle: 'terminer', libelle: 'Terminer : ajoute un visuel et une caption', detail: '', retard: false });
    expect(action(base({ visuel: 'a1' })).libelle).toBe('Terminer : ajoute une caption');
    expect(action(base({ caption: 'x' })).libelle).toBe('Terminer : ajoute un visuel');
    expect(action(base({ format: 'story' })).libelle).toBe('Terminer : ajoute un visuel');
  });
  it('demande l’évaluation, puis la réévaluation', () => {
    expect(action(base({ visuel: 'a1', caption: 'x' })).cle).toBe('evaluer');
    expect(action({ ...evaluee(), caption: 'autre' })).toMatchObject({ cle: 'reevaluer', libelle: 'Réévaluer' });
  });
  it('demande de corriger une conformité rouge, avec les causes', () => {
    expect(action(evaluee({}, { etat: 'rouge', causes: ['mot « mindset »', 'lien'] })))
      .toEqual({ cle: 'corriger', libelle: 'Corriger la conformité', detail: 'mot « mindset » ; lien', retard: false });
  });
  it('propose de valider une fiche prête', () => {
    expect(action(evaluee())).toMatchObject({ cle: 'valider', libelle: 'Valider la fiche' });
    expect(action(evaluee({ statut: 'brouillon' })).cle).toBe('valider');
  });
  it('signale le retard quand la date prévue est passée', () => {
    expect(action(base({ date_heure: '2026-09-28T10:00:00.000Z' })).retard).toBe(true);
  });
});

describe('prochaineAction : programmation et publication', () => {
  it('une fiche validée attend sa programmation', () => {
    expect(action(evaluee({ statut: 'valide' }))).toEqual({ cle: 'programmer', libelle: 'Confirmer la programmation', detail: '', retard: false });
    expect(action(evaluee({ statut: 'valide', date_heure: '2026-09-28T10:00:00.000Z' })).retard).toBe(true);
  });
  it('une programmation sans date confirmée ou décalée demande une reconfirmation', () => {
    expect(action(evaluee({ statut: 'programme' })).cle).toBe('reconfirmer');
    expect(action(evaluee({ statut: 'programme', programme_pour: '2026-09-30T10:00:00.000Z' })))
      .toEqual({ cle: 'reconfirmer', libelle: 'Reconfirmer la programmation', detail: 'La date a changé depuis la confirmation.', retard: false });
  });
  it('une programmation à venir n’appelle aucune action', () => {
    const a = action(evaluee({ statut: 'programme', programme_pour: D }));
    expect(a).toEqual({ cle: 'attendre', libelle: `Programmé pour le ${quand(D)}`, detail: '', retard: false });
    expect(ACTIONS_SANS_SUITE.has(a.cle)).toBe(true);
  });
  it('après l’heure prévue, il faut confirmer la publication ; en retard après 24 h', () => {
    const f = evaluee({ statut: 'programme', programme_pour: D, date_heure: D });
    expect(action(f, [], '2026-10-01T12:00:00.000Z')).toEqual({ cle: 'publier', libelle: 'Confirmer la publication', detail: '', retard: false });
    expect(action(f, [], '2026-10-02T10:00:01.000Z').retard).toBe(true);
  });
});

describe('prochaineAction : statistiques', () => {
  const pub = (publie_le, extra = {}) => evaluee({ statut: 'publie', publie_le, date_heure: publie_le, ...extra });
  it('demande les relevés dus, en retard', () => {
    expect(action(pub('2026-09-27T10:00:00.000Z'))).toEqual({ cle: 'stats', libelle: 'Saisir les stats à 48 h', detail: '', retard: true });
    expect(action(pub('2026-09-20T10:00:00.000Z')).libelle).toBe('Saisir les stats à 48 h et à 7 jours');
    expect(action(pub('2026-09-20T10:00:00.000Z'), [{ releve: '48h' }]).libelle).toBe('Saisir les stats à 7 jours');
  });
  it('annonce le prochain relevé quand rien n’est dû', () => {
    expect(action(pub('2026-09-29T09:00:00.000Z'))).toEqual({ cle: 'attendre', libelle: `Prochain relevé le ${quand('2026-10-01T09:00:00.000Z')}`, detail: '', retard: false });
    expect(action(pub('2026-09-27T10:00:00.000Z'), [{ releve: '48h' }]).libelle).toBe(`Prochain relevé le ${quand('2026-10-04T10:00:00.000Z')}`);
  });
  it('termine quand les deux relevés sont saisis', () => {
    expect(action(pub('2026-09-20T10:00:00.000Z'), [{ releve: '48h' }, { releve: '7j' }])).toEqual({ cle: 'termine', libelle: 'Terminé', detail: '', retard: false });
  });
  it('une fiche publiée avant le plan 5 (sans publie_le) part de date_heure', () => {
    expect(action(evaluee({ statut: 'publie', date_heure: '2026-09-27T10:00:00.000Z' })).libelle).toBe('Saisir les stats à 48 h');
  });
});
```

- [ ] **Step 2: Run to see it fail**

Run: `npx vitest run tests/logique/parcours.test.js`
Expected: FAIL (module absent).

- [ ] **Step 3: Implement** `src/logique/parcours.js`

```js
import { aReevaluer } from './fiche.js';
import { RELEVES, etatReleves } from './indicateurs.js';
import { libelleJour, heureLocale } from './dates.js';

export const ACTIONS_SANS_SUITE = new Set(['attendre', 'termine']);
const RETARD_PUBLICATION_MS = 24 * 3600000;
const LIBELLES_RELEVE = { '48h': '48 h', '7j': '7 jours' };

const action = (cle, libelle, detail = '', retard = false) => ({ cle, libelle, detail, retard });
const quand = (iso, fuseau) => `${libelleJour(iso, fuseau)} à ${heureLocale(iso, fuseau)}`;

export function prochaineAction(fiche, releves, maintenant, fuseau) {
  const passee = fiche.date_heure <= maintenant;
  if (fiche.statut === 'idee' || fiche.statut === 'brouillon') {
    const manque = [!fiche.visuel && 'un visuel', fiche.format !== 'story' && !fiche.caption?.trim() && 'une caption'].filter(Boolean);
    if (manque.length) return action('terminer', `Terminer : ajoute ${manque.join(' et ')}`, '', passee);
    if (!fiche.score) return action('evaluer', 'Évaluer', '', passee);
    if (aReevaluer(fiche)) return action('reevaluer', 'Réévaluer', '', passee);
    if (fiche.score.conformite?.etat === 'rouge') return action('corriger', 'Corriger la conformité', (fiche.score.conformite.causes ?? []).join(' ; '), passee);
    return action('valider', 'Valider la fiche', '', passee);
  }
  if (fiche.statut === 'valide') return action('programmer', 'Confirmer la programmation', '', passee);
  if (fiche.statut === 'programme') {
    if (!fiche.programme_pour || fiche.programme_pour !== fiche.date_heure) {
      return action('reconfirmer', 'Reconfirmer la programmation', 'La date a changé depuis la confirmation.', passee);
    }
    if (passee) return action('publier', 'Confirmer la publication', '', Date.parse(maintenant) - Date.parse(fiche.date_heure) > RETARD_PUBLICATION_MS);
    return action('attendre', `Programmé pour le ${quand(fiche.date_heure, fuseau)}`);
  }
  const e = etatReleves(fiche, releves, maintenant);
  const dus = RELEVES.filter(r => e[r].etat === 'a_saisir');
  if (dus.length) return action('stats', `Saisir les stats à ${dus.map(r => LIBELLES_RELEVE[r]).join(' et à ')}`, '', true);
  const suivant = RELEVES.find(r => e[r].etat === 'pas_encore');
  if (suivant) return action('attendre', `Prochain relevé le ${quand(e[suivant].du_le, fuseau)}`);
  return action('termine', 'Terminé');
}
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run tests/logique/parcours.test.js`, puis `npm test`.
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/logique/parcours.js tests/logique/parcours.test.js
git commit -m "Parcours : prochaine action de chaque fiche

Co-Authored-By: <modèle auteur>"
```

---

### Task 3 : confirmations dans le contrôleur

**Files:**
- Modify: `src/interface/controleur.js`
- Test: `tests/interface/controleur.test.js`, `tests/interface/evaluation.test.js`

**Interfaces:**
- Consumes (Task 1) : `confirmerProgrammation`, `confirmerPublication` et `effacementsPour` de `fiche.js`.
- Produces (actions) :
  - `confirmerProgrammation(id, dateIso, coche)` → `{ ok: true, fiche }` ou `{ ok: false, raison }` ;
  - `confirmerPublication(id, dateIso, coche)` → même forme ;
  - `changerStatut(id, 'programme' | 'publie')` → `{ ok: false, raison }`.

- [ ] **Step 1: Write the failing tests.** In `tests/interface/controleur.test.js`, reuse `monter()` and `T` (`2026-09-28T08:00:00.000Z`). Add `empreinte` to the import from `fiche.js` if it is missing (`nouvelleFiche` is already imported).

```js
describe('confirmations', () => {
  const prete = (extra = {}) => {
    const f = { ...nouvelleFiche({ id: 'f1', format: 'reel', date_heure: '2026-10-01T10:00:00.000Z', pilier: 'socio', maintenant: T }), visuel: 'a1', visuel_type: 'image', caption: 'Une caption.', statut: 'valide', ...extra };
    return { ...f, score: { total: 70, criteres: [], conformite: { etat: 'vert', causes: [] }, empreinte: empreinte(f) } };
  };
  const monte = extra => { const m = monter(); m.etat.modifier({ fiches: [prete(extra)] }); return { ...m, depot: creerDepot(m.db) }; };

  it('confirme la programmation, met à jour l’état et écrit en base', async () => {
    const { actions, etat, depot } = monte();
    const r = await actions.confirmerProgrammation('f1', '2026-10-02T09:00:00.000Z', true);
    expect(r.ok).toBe(true);
    expect(etat.lire().fiches[0]).toMatchObject({ statut: 'programme', programme_pour: '2026-10-02T09:00:00.000Z', date_heure: '2026-10-02T09:00:00.000Z' });
    expect(await depot.lireFiche('f1')).toMatchObject({ statut: 'programme', programme_pour: '2026-10-02T09:00:00.000Z' });
  });

  it('n’écrit rien quand la confirmation est refusée', async () => {
    const { actions, etat, db } = monte();
    expect(await actions.confirmerProgrammation('f1', '2026-10-02T09:00:00.000Z', false)).toEqual({ ok: false, raison: 'Coche la case pour confirmer.' });
    expect(await actions.confirmerProgrammation('f1', '2026-09-27T09:00:00.000Z', true)).toMatchObject({ ok: false });
    expect(await actions.confirmerPublication('f1', 'pas une date', true)).toEqual({ ok: false, raison: 'Indique une date et une heure valides.' });
    expect(etat.lire().fiches[0].statut).toBe('valide');
    expect(db.ecritures).toEqual([]);
  });

  it('confirme la publication directement depuis Validé', async () => {
    const { actions, etat } = monte();
    const r = await actions.confirmerPublication('f1', '2026-09-28T07:30:00.000Z', true);
    expect(r.ok).toBe(true);
    expect(etat.lire().fiches[0]).toMatchObject({ statut: 'publie', publie_le: '2026-09-28T07:30:00.000Z', programme_pour: null });
  });

  it('refuse une conformité devenue rouge avec le profil actuel', async () => {
    const { actions } = monte({ caption: 'Un mindset.' });
    const r = await actions.confirmerProgrammation('f1', '2026-10-02T09:00:00.000Z', true);
    expect(r.ok).toBe(false);
    expect(r.raison).toMatch(/^Conformité au rouge : /);
  });

  it('changerStatut n’accepte plus Programmé ni Publié', async () => {
    const { actions } = monte();
    expect(await actions.changerStatut('f1', 'programme')).toEqual({ ok: false, raison: 'Utilise « Confirmer la programmation » dans la fiche.' });
    expect(await actions.changerStatut('f1', 'publie')).toEqual({ ok: false, raison: 'Utilise « Confirmer la publication » dans la fiche.' });
  });

  it('revenir en Validé efface la programmation', async () => {
    const { actions, etat } = monte();
    await actions.confirmerProgrammation('f1', '2026-10-02T09:00:00.000Z', true);
    expect(await actions.changerStatut('f1', 'valide')).toEqual({ ok: true });
    expect(etat.lire().fiches[0]).toMatchObject({ statut: 'valide', programme_pour: null });
  });

  it('déplacer une fiche programmée garde sa programmation', async () => {
    const { actions, etat } = monte();
    await actions.confirmerProgrammation('f1', '2026-10-01T10:00:00.000Z', true);
    await actions.deplacerFiche('f1', '2026-10-02T10:00:00.000Z');
    expect(etat.lire().fiches[0]).toMatchObject({ statut: 'programme', programme_pour: '2026-10-01T10:00:00.000Z', date_heure: '2026-10-02T10:00:00.000Z' });
  });

  it('une fiche programmée bloquée par le profil repasse en Brouillon sans confirmation', async () => {
    const { actions, etat } = monte();
    await actions.confirmerProgrammation('f1', '2026-10-02T09:00:00.000Z', true);
    const profil = etat.lire().profil;
    etat.modifier({ profil: { ...profil, regles_studio: { ...profil.regles_studio, mots_a_eviter: [...profil.regles_studio.mots_a_eviter, 'caption'] } } });
    await actions.reverifierFiches();
    expect(etat.lire().fiches[0]).toMatchObject({ statut: 'brouillon', programme_pour: null });
  });
});
```

In `tests/interface/evaluation.test.js`, test « repasse en brouillon les fiches validées ou programmées… », replace:

```js
    expect(await actions.changerStatut('f1', 'programme')).toEqual({ ok: true });
```

with:

```js
    expect((await actions.confirmerProgrammation('f1', '2026-10-01T10:00:00.000Z', true)).ok).toBe(true);
```

- [ ] **Step 2: Run to see them fail**

Run: `npx vitest run tests/interface/controleur.test.js tests/interface/evaluation.test.js`
Expected: FAIL.

- [ ] **Step 3: Implement.** In `src/interface/controleur.js` :
  - Add to the import from `../logique/fiche.js` : `confirmerProgrammation as confirmerProg, confirmerPublication as confirmerPub, effacementsPour`.
  - In `verrouillerSiRouge`, replace `{ ...g, statut: 'brouillon' }` with `{ ...g, statut: 'brouillon', ...effacementsPour('brouillon') }`.
  - At the start of `changerStatut(id, cible)`, right after `const f = trouver(id); if (!f) …`, add:

```js
      if (cible === 'programme') return { ok: false, raison: 'Utilise « Confirmer la programmation » dans la fiche.' };
      if (cible === 'publie') return { ok: false, raison: 'Utilise « Confirmer la publication » dans la fiche.' };
```

  - Add a function in the body of `creerControleur`, before the `return {` :

```js
  async function confirmer(id, dateIso, coche, appliquer) {
    const f = trouver(id);
    if (!f) return { ok: false, raison: 'Fiche introuvable.' };
    const r = appliquer(f, { date: dateIso, coche }, horloge());
    if (!r.ok) return r;
    const { conformite } = verifierRegles(r.fiche, etat.lire().profil.regles_studio);
    if (conformite.etat === 'rouge') return { ok: false, raison: `Conformité au rouge : ${conformite.causes.join(' ; ')}.` };
    remplacer(r.fiche);
    etat.modifier({ erreur: null });
    await ecrireMaintenant(r.fiche);
    return { ok: true, fiche: r.fiche };
  }
```

  - Add to the returned actions object:

```js
    confirmerProgrammation: (id, dateIso, coche) => confirmer(id, dateIso, coche, confirmerProg),
    confirmerPublication: (id, dateIso, coche) => confirmer(id, dateIso, coche, confirmerPub),
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run tests/interface`, puis `npm test`.
Expected: PASS. Si un autre test existant appelait `actions.changerStatut(…, 'programme' | 'publie')`, remplace l'appel par la confirmation correspondante avec une date valide (à venir pour la programmation, passée pour la publication), et signale-le dans ton rapport.

- [ ] **Step 5: Commit**

```bash
git add src/interface/controleur.js tests/interface/controleur.test.js tests/interface/evaluation.test.js
git commit -m "Contrôleur : confirmer la programmation et la publication

Co-Authored-By: <modèle auteur>"
```

---

### Task 4 : bandeau d'action et formulaires de confirmation dans la fiche

**Files:**
- Modify: `src/interface/panneau-fiche.js`, `src/interface/rendu.js`, `src/interface/styles.css`
- Test: `tests/interface/panneau-fiche.test.js`

**Interfaces:**
- Consumes :
  - Task 1 : `effacementsPour` ;
  - Task 2 : `prochaineAction`, `ACTIONS_SANS_SUITE` ;
  - Task 3 : les actions `confirmerProgrammation`, `confirmerPublication` et `maintenant()` (déjà existante).
- Produces : `panneauFiche(fiche, profil, actions, capacites, releves = [])`. `releves` contient les relevés `stats_contenu` connus de cette fiche.

- [ ] **Step 1: Write the failing tests.** Add them to `tests/interface/panneau-fiche.test.js` (which already has `fiche`, `actionsFactices`, `saisir`, `bouton`, `fictif`, `empreinte`) :

```js
describe('parcours dans la fiche', () => {
  const M = '2026-09-28T08:00:00.000Z';
  const prete = (extra = {}) => {
    const f = fiche({ visuel: 'a1', visuel_type: 'image', caption: 'Une caption.', date_heure: '2026-10-01T10:00:00.000Z', ...extra });
    return { ...f, score: { total: 70, criteres: [], conformite: { etat: 'vert', causes: [] }, empreinte: empreinte(f) } };
  };
  const actionsParcours = () => ({
    ...actionsFactices(),
    maintenant: () => M,
    changerStatut: vi.fn(async () => ({ ok: true })),
    confirmerProgrammation: vi.fn(async (id, date) => ({ ok: true, fiche: { statut: 'programme', programme_pour: date, date_heure: date, publie_le: null } })),
    confirmerPublication: vi.fn(async (id, date) => ({ ok: true, fiche: { statut: 'publie', publie_le: date, date_heure: date } })),
  });

  it('affiche la prochaine action en tête de fiche', () => {
    const p = panneauFiche(fiche(), fictif, actionsParcours(), { assets: true });
    expect(p.querySelector('.prochaine-action').textContent).toContain('Terminer : ajoute un visuel et une caption');
    expect(p.textContent).not.toContain('null');
  });

  it('le bouton « Passer en Validé » applique le statut', async () => {
    const actions = actionsParcours();
    const p = panneauFiche(prete(), fictif, actions, { assets: true });
    bouton(p, 'Passer en Validé').click();
    await vi.waitFor(() => expect(actions.changerStatut).toHaveBeenCalledWith('f1', 'valide'));
    await vi.waitFor(() => expect(p.querySelector('.prochaine-action').textContent).toContain('Confirmer la programmation'));
  });

  it('« Programmé » ouvre le formulaire, préremplit la date et exige la case', async () => {
    const actions = actionsParcours();
    actions.confirmerProgrammation = vi.fn(async () => ({ ok: false, raison: 'Coche la case pour confirmer.' }));
    const p = panneauFiche(prete({ statut: 'valide' }), fictif, actions, { assets: true });
    bouton(p, 'Programmé').click();
    const form = p.querySelector('form.confirmation-programme');
    expect(form.querySelector('input[name="confirmation-date"]').value).toBe('2026-10-01');
    expect(form.querySelector('input[name="confirmation-heure"]').value).toBe('12:00');
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await vi.waitFor(() => expect(form.textContent).toContain('Coche la case pour confirmer.'));
    expect(actions.confirmerProgrammation).toHaveBeenCalledWith('f1', '2026-10-01T10:00:00.000Z', false);
    expect(actions.changerStatut).not.toHaveBeenCalled();
  });

  it('une programmation confirmée met à jour le statut et le bandeau', async () => {
    const actions = actionsParcours();
    const p = panneauFiche(prete({ statut: 'valide' }), fictif, actions, { assets: true });
    bouton(p, 'Confirmer…').click();
    const form = p.querySelector('form.confirmation-programme');
    form.querySelector('input[name="confirmation-coche"]').checked = true;
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await vi.waitFor(() => expect(p.querySelector('.panneau-message').textContent).toBe('Programmation confirmée.'));
    expect(p.querySelector('form.confirmation-programme')).toBeNull();
    expect(p.querySelector('.statut-bouton.actif').textContent).toBe('Programmé');
    expect(p.querySelector('.prochaine-action').textContent).toContain('Programmé pour le');
  });

  it('« Publié » préremplit maintenant, arrondi à la minute, quand la date prévue est à venir', () => {
    const actions = actionsParcours();
    actions.maintenant = () => '2026-09-28T08:00:42.000Z';
    const p = panneauFiche(prete({ statut: 'valide' }), fictif, actions, { assets: true });
    bouton(p, 'Publié').click();
    const form = p.querySelector('form.confirmation-publie');
    expect(form.querySelector('input[name="confirmation-date"]').value).toBe('2026-09-28');
    expect(form.querySelector('input[name="confirmation-heure"]').value).toBe('10:00');
    expect(form.textContent).toContain('Le contenu est en ligne');
  });

  it('une date vide dans le formulaire n’appelle pas le contrôleur', async () => {
    const actions = actionsParcours();
    const p = panneauFiche(prete({ statut: 'valide' }), fictif, actions, { assets: true });
    bouton(p, 'Programmé').click();
    const form = p.querySelector('form.confirmation-programme');
    form.querySelector('input[name="confirmation-date"]').value = '';
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await vi.waitFor(() => expect(form.textContent).toContain('Indique la date et l’heure.'));
    expect(actions.confirmerProgrammation).not.toHaveBeenCalled();
  });

  it('pour une fiche publiée, l’action suit les relevés connus', () => {
    const f = prete({ statut: 'publie', publie_le: '2026-09-25T10:00:00.000Z', date_heure: '2026-09-25T10:00:00.000Z' });
    const p1 = panneauFiche(f, fictif, actionsParcours(), { assets: true });
    expect(p1.querySelector('.prochaine-action').textContent).toContain('Saisir les stats à 48 h');
    const p2 = panneauFiche(f, fictif, actionsParcours(), { assets: true }, [{ releve: '48h' }]);
    expect(p2.querySelector('.prochaine-action').textContent).toContain('Prochain relevé le');
  });
});
```

- [ ] **Step 2: Run to see them fail**

Run: `npx vitest run tests/interface/panneau-fiche.test.js`
Expected: FAIL.

- [ ] **Step 3: Implement in `src/interface/panneau-fiche.js`.**

1. Imports. Add `effacementsPour` to the import from `../logique/fiche.js`, then:

```js
import { prochaineAction, ACTIONS_SANS_SUITE } from '../logique/parcours.js';
```

2. Change the signature to `export function panneauFiche(fiche, profil, actions, capacites, releves = [])`. Right after `let brouillon = { ...fiche };`, add:

```js
  let relevesConnus = releves;
  let elementAction = null;
  const zoneConfirmation = h('div', { class: 'zone-confirmation' });
  const maintenant = () => actions.maintenant?.() ?? new Date().toISOString();
  const arrondiMinute = iso => new Date(Math.floor(Date.parse(iso) / 60000) * 60000).toISOString();
```

3. Add these functions before `const sectionStatut`:

```js
  const LIBELLES_BOUTON_ACTION = {
    evaluer: 'Lancer l’évaluation', reevaluer: 'Lancer l’évaluation', programmer: 'Confirmer…', reconfirmer: 'Confirmer…',
    publier: 'Confirmer…', stats: 'Aller aux statistiques', valider: 'Passer en Validé',
  };

  const sectionAction = () => {
    const a = prochaineAction(brouillon, relevesConnus, maintenant(), fz);
    const surClic = {
      evaluer: evaluationDisponible ? () => evaluer() : null,
      reevaluer: evaluationDisponible ? () => evaluer() : null,
      programmer: () => ouvrirConfirmation('programme'),
      reconfirmer: () => ouvrirConfirmation('programme'),
      publier: () => ouvrirConfirmation('publie'),
      stats: () => racine.querySelector('.stats-fiche')?.scrollIntoView?.({ behavior: 'smooth', block: 'start' }),
      valider: () => passerA('valide'),
    }[a.cle] ?? null;
    const classes = ['prochaine-action', a.retard ? 'action-retard' : '', ACTIONS_SANS_SUITE.has(a.cle) ? 'action-calme' : ''].filter(Boolean).join(' ');
    return h('div', { class: classes, 'data-action': a.cle },
      h('strong', { class: 'prochaine-action-libelle' }, a.libelle),
      a.detail ? h('span', { class: 'aide' }, a.detail) : null,
      surClic ? h('button', { type: 'button', class: 'bouton-principal', onclick: surClic }, LIBELLES_BOUTON_ACTION[a.cle]) : null);
  };

  const majAction = () => {
    if (!elementAction) return;
    const nouveau = sectionAction();
    elementAction.replaceWith(nouveau);
    elementAction = nouveau;
  };

  async function passerA(s) {
    const v = await actions.changerStatut(id, s);
    if (!v.ok) { afficher(v.raison); return; }
    brouillon = { ...brouillon, statut: s, ...effacementsPour(s) };
    construire();
    afficher('');
  }

  function ouvrirConfirmation(type) {
    const publication = type === 'publie';
    const m = maintenant();
    const defaut = publication ? (brouillon.date_heure <= m ? brouillon.date_heure : arrondiMinute(m)) : brouillon.date_heure;
    const date = h('input', { type: 'date', name: 'confirmation-date', value: cleJour(defaut, fz) });
    const heure = h('input', { type: 'time', name: 'confirmation-heure', value: heureLocale(defaut, fz) });
    const coche = h('input', { type: 'checkbox', name: 'confirmation-coche' });
    const retour = h('p', { class: 'aide', role: 'status' });
    const titre = publication ? 'Confirmer la publication' : 'Confirmer la programmation';
    const form = h('form', {
      class: `confirmation confirmation-${type}`,
      onsubmit: async ev => {
        ev.preventDefault();
        if (!date.value || !heure.value) { retour.textContent = 'Indique la date et l’heure.'; return; }
        const iso = depuisSaisieLocale(date.value, heure.value, fz);
        const res = publication
          ? await actions.confirmerPublication(id, iso, coche.checked)
          : await actions.confirmerProgrammation(id, iso, coche.checked);
        if (!res.ok) { retour.textContent = res.raison; return; }
        brouillon = { ...brouillon, ...res.fiche };
        zoneConfirmation.replaceChildren();
        construire();
        afficher(publication ? 'Publication confirmée.' : 'Programmation confirmée.');
      },
    },
    h('h3', {}, titre),
    h('div', { class: 'grille-champs' },
      champ(publication ? 'Date de publication' : 'Date programmée', date),
      champ(`Heure (${fz})`, heure)),
    h('label', { class: 'case' }, coche, publication ? 'Le contenu est en ligne' : 'J’ai programmé ce contenu dans Meta Business Suite'),
    h('div', { class: 'evaluation-actions' },
      h('button', { type: 'submit', class: 'bouton-principal' }, titre),
      h('button', { type: 'button', class: 'bouton-secondaire', onclick: () => zoneConfirmation.replaceChildren() }, 'Annuler')),
    retour);
    zoneConfirmation.replaceChildren(form);
  }
```

4. In `sectionStatut`, replace the `onclick` of each status button with:

```js
      onclick: () => (s === 'programme' || s === 'publie' ? ouvrirConfirmation(s) : passerA(s)),
```

5. Refresh the banner:
   - at the end of `changer(changements)`, add `majAction();` ;
   - in `evaluer()`, after each `remplacerScore();` that follows a result (success or failure), add `majAction();` ;
   - in `sectionStats`, at the start of `dessiner(releves)`, add `relevesConnus = releves; majAction();`.

6. In `construire()`, create the banner and place it at the top. Replace the start of the function with:

```js
  function construire() {
    elementAction = sectionAction();
    elementStatut = sectionStatut();
    elementScore = sectionScore();
```

   Then insert `elementAction` right after the `header` in the list passed to `racine.replaceChildren(...)`, and `zoneConfirmation` right after `elementStatut`. The list stays unfolded and filtered with `.filter(Boolean)`.

7. In `src/interface/rendu.js`, pass the known relevés to the panel. Replace:

```js
panneauFiche(ouverte, e.profil, actions, capacites)
```

with:

```js
panneauFiche(ouverte, e.profil, actions, capacites, (e.stats ?? []).filter(s => s.fiche === ouverte.id))
```

- [ ] **Step 4: Add the styles** at the end of `src/interface/styles.css`:

```css
.prochaine-action { display: grid; gap: 6px; padding: 10px 12px; border-radius: var(--rayon); background: var(--surface-2); border-left: 4px solid var(--accent); }
.prochaine-action.action-retard { border-left-color: var(--orange); }
.prochaine-action.action-calme { border-left-color: var(--trait); color: var(--texte-2); }
.confirmation { display: grid; gap: 8px; padding: 12px; border: 1px solid var(--trait); border-radius: var(--rayon); background: var(--surface); }
.confirmation h3 { margin: 0; }
```

- [ ] **Step 5: Run the tests**

Run: `npx vitest run tests/interface/panneau-fiche.test.js`, puis `npm test`.
Expected: PASS. Le bandeau ajoute des boutons aux libellés distincts (« Lancer l’évaluation », « Confirmer… », « Passer en Validé »). Si un test existant casse parce qu'il cherche un bouton dans tout le panneau, restreins son sélecteur à la section concernée (`.score`, `.statuts`), sans changer ce qu'il vérifie. Signale-le dans ton rapport.

- [ ] **Step 6: Commit**

```bash
git add src/interface/panneau-fiche.js src/interface/rendu.js src/interface/styles.css tests/interface/panneau-fiche.test.js
git commit -m "Fiche : bandeau de prochaine action et confirmations datées

Co-Authored-By: <modèle auteur>"
```

---

### Task 5 : ligne d'action sur les cartes et « À faire cette semaine »

**Files:**
- Modify: `src/interface/carte.js`, `src/interface/vue-semaine.js`, `src/interface/rendu.js`, `src/interface/styles.css`
- Test: `tests/interface/vue-semaine.test.js`, `tests/interface/app.test.js`

**Interfaces:**
- Consumes (Task 2) : `prochaineAction`, `ACTIONS_SANS_SUITE`.
- Produces : `carte(f, regles, actions, action = null)`. `vueSemaine` lit `stats` et `maintenant` dans l'état.

- [ ] **Step 1: Write the failing tests.** Add them to `tests/interface/vue-semaine.test.js` (with `reel`, `ANCRE`, `actionsFactices` and `fictif`). `ANCRE` is Wednesday 2026-09-30 : the week runs from 09-28 to 10-04.

```js
describe('parcours dans la semaine', () => {
  const M = '2026-09-30T08:00:00.000Z';
  it('affiche la prochaine action sur chaque carte, en retard si besoin', () => {
    const el = vueSemaine({ profil: fictif, fiches: [reel('a', '2026-09-29T10:00:00.000Z'), reel('b', '2026-10-02T10:00:00.000Z')], ancre: ANCRE, maintenant: M, stats: [] }, actionsFactices());
    const a = el.querySelector('.carte[data-id="a"] .carte-action');
    expect(a.textContent).toBe('Terminer : ajoute un visuel et une caption');
    expect(a.classList.contains('action-retard')).toBe(true);
    expect(el.querySelector('.carte[data-id="b"] .carte-action').classList.contains('action-retard')).toBe(false);
  });

  it('liste « À faire cette semaine », retards d’abord, et ouvre la fiche', () => {
    const actions = actionsFactices();
    const el = vueSemaine({ profil: fictif, fiches: [reel('b', '2026-10-02T10:00:00.000Z', { accroche: 'Plus tard' }), reel('a', '2026-09-29T10:00:00.000Z', { accroche: 'En retard' })], ancre: ANCRE, maintenant: M, stats: [] }, actions);
    const lignes = [...el.querySelectorAll('.a-faire li')];
    expect(lignes.map(l => l.textContent.includes('En retard'))).toEqual([true, false]);
    expect(lignes[0].classList.contains('action-retard')).toBe(true);
    [...lignes[0].querySelectorAll('button')].find(b => b.textContent === 'Ouvrir').click();
    expect(actions.ouvrirFiche).toHaveBeenCalledWith('a');
  });

  it('n’inclut pas les fiches sans action et affiche un message si rien n’est à faire', () => {
    const f = reel('p', '2026-09-29T10:00:00.000Z', { statut: 'publie', publie_le: '2026-09-29T10:00:00.000Z' });
    const el = vueSemaine({ profil: fictif, fiches: [f], ancre: ANCRE, maintenant: M, stats: [] }, actionsFactices());
    expect(el.querySelector('.a-faire').textContent).toContain('Rien à faire cette semaine.');
    expect(el.querySelector('.carte[data-id="p"] .carte-action').classList.contains('action-calme')).toBe(true);
  });

  it('les relevés de l’état comptent pour les fiches publiées', () => {
    const f = reel('p', '2026-09-28T06:00:00.000Z', { statut: 'publie', publie_le: '2026-09-28T06:00:00.000Z' });
    const sans = vueSemaine({ profil: fictif, fiches: [f], ancre: ANCRE, maintenant: '2026-10-01T08:00:00.000Z', stats: [] }, actionsFactices());
    expect(sans.querySelector('.carte-action').textContent).toBe('Saisir les stats à 48 h');
    const avec = vueSemaine({ profil: fictif, fiches: [f], ancre: ANCRE, maintenant: '2026-10-01T08:00:00.000Z', stats: [{ fiche: 'p', releve: '48h' }] }, actionsFactices());
    expect(avec.querySelector('.carte-action').textContent).toContain('Prochain relevé le');
    expect(avec.textContent).not.toContain('null');
  });
});
```

In `tests/interface/app.test.js`, rename the test « ne reconstruit pas la vue Semaine quand seules les statistiques changent » to « ne reconstruit pas la vue Semaine quand seuls les relevés du compte changent ». In it, replace `app.etat.modifier({ stats: [...] })` with:

```js
app.etat.modifier({ relevesCompte: [{ id: '2026-W40', semaine: '2026-W40', debut: '2026-09-27T22:00:00.000Z', abonnes: 10 }] });
```

Then add next to it:

```js
  it('reconstruit la vue Semaine quand les relevés de contenu changent', async () => {
    const db = creerFausseBase();
    const racine = document.createElement('div');
    const app = await demarrer(racine, { use: async nom => (nom === 'db' ? db : null) }, { horloge });
    await app.actions.importerProfil(JSON.stringify(fictif));
    await vi.waitFor(() => expect(app.etat.lire().vue).toBe('semaine'));
    const avant = racine.querySelector('.vue > *');
    app.etat.modifier({ stats: [{ id: 'x_48h', fiche: 'x', releve: '48h', vues: 1, nouveaux_abonnes: 0, partages_envois: 0, date_publication: T }] });
    expect(racine.querySelector('.vue > *')).not.toBe(avant);
  });
```

- [ ] **Step 2: Run to see them fail**

Run: `npx vitest run tests/interface/vue-semaine.test.js tests/interface/app.test.js`
Expected: FAIL.

- [ ] **Step 3: Implement the card.** In `src/interface/carte.js`, add `import { ACTIONS_SANS_SUITE } from '../logique/parcours.js';`. Change the signature to `export function carte(f, regles, actions, action = null)`. Right after `h('p', { class: 'carte-accroche' }, …)`, add:

```js
  action ? h('p', {
    class: ['carte-action', action.retard ? 'action-retard' : '', ACTIONS_SANS_SUITE.has(action.cle) ? 'action-calme' : ''].filter(Boolean).join(' '),
  }, action.libelle) : null,
```

- [ ] **Step 4: Implement the week view.** In `src/interface/vue-semaine.js` :
  - add `import { prochaineAction, ACTIONS_SANS_SUITE } from '../logique/parcours.js';` ;
  - add `heureLocale` to the import from `dates.js` if it is missing ;
  - change the destructuring to `{ profil, fiches, ancre, maintenant, bulletin, stats }` ;
  - in `vueSemaine`, after `const semaine = …`, add:

```js
  const maintenantIso = maintenant ?? new Date().toISOString();
  const actionsParId = new Map(semaine.map(f => [f.id, prochaineAction(f, (stats ?? []).filter(s => s.fiche === f.id), maintenantIso, r.fuseau)]));
```

  - insert `aFaire(semaine, actionsParId, r.fuseau, actions),` between `bandeau(...)` and `h('div', { class: 'colonnes' }, …)` ;
  - pass `actionsParId` to `colonne`, which calls `carte(f, r, actions, actionsParId.get(f.id))`. Update `colonne`'s signature and its call accordingly ;
  - add this function to the file:

```js
function aFaire(semaine, actionsParId, fz, actions) {
  const lignes = semaine
    .map(f => ({ f, a: actionsParId.get(f.id) }))
    .filter(({ a }) => !ACTIONS_SANS_SUITE.has(a.cle))
    .sort((x, y) => (Number(y.a.retard) - Number(x.a.retard)) || x.f.date_heure.localeCompare(y.f.date_heure));
  return h('section', { class: 'a-faire' }, h('h3', {}, 'À faire cette semaine'),
    lignes.length
      ? h('ul', {}, lignes.map(({ f, a }) => h('li', { class: a.retard ? 'action-retard' : null },
        h('span', {}, `${LIBELLES_FORMAT[f.format]} · ${libelleJour(f.date_heure, fz)} ${heureLocale(f.date_heure, fz)} · ${f.accroche || 'Sans accroche'}`),
        h('strong', {}, a.libelle),
        h('button', { type: 'button', class: 'bouton-lien', onclick: () => actions.ouvrirFiche(f.id) }, 'Ouvrir'))))
      : h('p', { class: 'aide' }, 'Rien à faire cette semaine.'));
}
```

- [ ] **Step 5: Implement the render.** In `src/interface/rendu.js`, in the `else` branch that computes `reconstructionRequise` for the calendar and bulletin views, add at the end of the condition:

```js
 || (e.vue === 'semaine' && memo.stats !== e.stats)
```

Check that `stats` is kept in `memo`. It already is, since plan 4.

- [ ] **Step 6: Add the styles** at the end of `src/interface/styles.css`:

```css
.carte-action { margin: 0; font-size: 12px; font-weight: 600; color: var(--accent); }
.carte-action.action-retard { color: var(--orange); }
.carte-action.action-calme { font-weight: 400; color: var(--texte-2); }
.a-faire { margin: 0 0 12px; padding: 10px 12px; border: 1px solid var(--trait); border-radius: var(--rayon); background: var(--surface); }
.a-faire h3 { margin: 0 0 6px; font-size: 14px; }
.a-faire ul { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; }
.a-faire li { display: flex; flex-wrap: wrap; gap: 8px; align-items: baseline; }
.a-faire li.action-retard strong { color: var(--orange); }
```

- [ ] **Step 7: Run the tests**

Run: `npx vitest run tests/interface`, puis `npm test` et `npm run build`.
Expected: PASS. Le build sort `dist/studio.html`.

- [ ] **Step 8: Commit**

```bash
git add src/interface/carte.js src/interface/vue-semaine.js src/interface/rendu.js src/interface/styles.css tests/interface/vue-semaine.test.js tests/interface/app.test.js
git commit -m "Semaine : prochaine action sur les cartes et liste « À faire cette semaine »

Co-Authored-By: <modèle auteur>"
```

---

### Task 6 : mise en ligne et vérification

Cette tâche est faite par le contrôleur.

- [ ] **Step 1:** `npm test` et `npm run build` passent.
- [ ] **Step 2:** Republier `dist/studio.html` sur les deux studios, avec l'outil `Artifact` et l'`url` de chaque studio lue dans `.studio.local.json`, sans passer `capabilities`.
- [ ] **Step 3: Checklist manuelle pour Jean,** sur le studio de test :
  1. une idée de la veille affiche « Terminer : ajoute un visuel » sur sa carte et dans « À faire cette semaine » ;
  2. ajouter un visuel, évaluer, puis « Passer en Validé » ;
  3. « Confirmer… » : la date est préremplie, la case est obligatoire, une date passée est refusée ;
  4. déplacer la fiche programmée : elle affiche « Reconfirmer la programmation » ;
  5. confirmer la publication : les relevés partent de cette date ;
  6. saisir le relevé à 48 h : la carte passe à « Prochain relevé le … ».
- [ ] **Step 4:** Cocher le plan 5 dans le README, mettre à jour le fichier de passation, puis commit et push.
