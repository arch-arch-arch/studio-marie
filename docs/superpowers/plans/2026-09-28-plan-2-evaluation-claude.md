# Plan 2 : évaluation par Claude et studio réel : plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Chaque fiche peut être évaluée par Claude : score sur 100 en trois critères pondérés selon le format, verrou de conformité appuyé sur des règles calculées, 2 captions, 2 ou 3 accroches, hashtags et 3 recommandations. Un jeu de référence vérifie que le score classe les contenus gagnants au-dessus des perdants. Le studio réel est publié avec le profil réel de la créatrice.

**Architecture:**
- Les règles calculées (`src/logique/regles-score.js`) et la composition du score (`src/logique/score.js`) sont du JavaScript pur, testé avec Vitest.
- La consigne envoyée à Claude, le schéma de réponse et la traduction des erreurs sont dans `src/claude/evaluation.js`.
- Le contrôleur appelle la capacité `sample` de l'Artifact (`sample.json`), avec le compte Claude de la personne qui clique, valide la réponse, compose le score, puis l'écrit via l'enregistreur du plan 1.
- Le panneau de fiche ajoute les boutons « Évaluer » et « Arrêter », le détail du score et des boutons « Utiliser » pour les suggestions.
- La vue Profil ajoute le jeu de référence : import, vérification du classement et bilan.

**Tech Stack:** Node 24, JavaScript (modules ES), Vitest, happy-dom, esbuild. Capacités d'Artifact : `db`, `assets`, `sample` (contrat 0.2.61).

**Spec:** `docs/superpowers/specs/2026-09-27-studio-contenu-design.md` (§3, §6.2, §8). Le plan 1 (`docs/superpowers/plans/2026-09-28-plan-1-fondations-calendrier.md`) est livré sur `main`.

## Global Constraints

- Dépôt privé et anonymisé : **aucune donnée réelle de la créatrice** dans git. Cela vaut pour le nom, le pseudo, l'e-mail, les plateformes, les statistiques, les contenus, les visuels et l'URL des studios. Le profil réel et le jeu de référence réel ne vivent que dans la base du studio réel. Les exemples et les fixtures sont fictifs.
- Toute l'interface est en français. On tutoie la personne qui utilise le studio. Pas d'emoji comme marqueurs.
- Pondération des trois critères (Accroche et diffusion / Voix et esthétique / Mécanique de la caption) :
  - Reel : 40 / 30 / 30 ;
  - Carrousel : 30 / 35 / 35 ;
  - Story : 20 / 30 / 50 ;
  - Post : grille du carrousel, avec une recommandation de passer en carrousel.
- Conformité au rouge : score **plafonné à 40**, validation impossible, cause exacte affichée. Claude ne peut pas lever un blocage posé par les règles calculées.
- L'évaluation n'est lancée **que par un clic** (bouton « Évaluer »), jamais au chargement ni à chaque modification. Le code ne relance jamais un appel à Claude de lui-même : pas de boucle de nouvelles tentatives.
- Une réponse de Claude invalide, incomplète ou refusée ne modifie **jamais** la fiche ni la base.
- Les valeurs cibles restent lues dans `profil.regles_studio`. Les poids, le plafond et les motifs des règles calculées sont des constantes de la spec, dans `src/logique/`.
- Chaque commit se termine par une ligne `Co-Authored-By:` qui nomme le modèle qui l'a écrit.

## Écarts assumés par rapport à la spec

Ils sont reportés dans la spec à la Task 2.

- **Nouveaux champs de fiche** :
  - `suggestions: { accroches: string[], hashtags: string[] }` ;
  - `variantes` contient les 2 captions proposées, sous la forme `{ role, texte }`.
- **Nouvelles collections** :
  - `reference` : le jeu de référence, un document par contenu ;
  - `reference_resultats/dernier` : le dernier bilan de vérification.
- **Règles calculées** : une alerte non bloquante retire 20 % des points maximum du critère concerné. Les alertes sont :
  - accroche trop longue ou absente ;
  - nombre de hashtags hors de la plage ;
  - hors créneau.

  La photo seule (post) donne une alerte sans pénalité.
- **Conformité finale** : c'est la plus sévère des deux entre la conformité calculée et celle jugée par Claude. Les causes des deux sont cumulées.
- **Bulletin de la semaine** : il n'est pas encore envoyé à Claude (il arrive au plan 3). La consigne ne le mentionne pas.
- **Visuel** : il est joint à l'évaluation seulement s'il s'agit d'une image et que la vue le permet (`sample.limits().images`). Sinon, Claude évalue sans le voir, et la consigne le lui dit.

## Review Focus

1. **Réponse de Claude malformée, incomplète, refusée ou `invalid_json`** : message clair, fiche et base inchangées. *(Task 4)*
2. **Règle calculée au rouge (mot à éviter, lien, géotag précis) alors que Claude répond « vert »** : conformité rouge, total plafonné à 40, validation refusée avec la cause. *(Tasks 2 et 4)*
3. **Fiche modifiée pendant l'évaluation** : le score reste attaché à la version évaluée, la fiche est « à réévaluer » et ne peut pas être validée. *(Task 4)*
4. **Profil réel volumineux** (plusieurs dizaines de Ko) : la consigne reste sous la limite de 64 Kio de `sample`. *(Task 3)*
5. **Évaluation indisponible** (`sample` absent, `not_granted`, `rate_limited`) **ou arrêtée par l'utilisatrice** : bouton masqué ou message, aucun nouvel appel automatique. *(Tasks 4 et 5)*

---

## Structure des fichiers

```
src/logique/regles-score.js   verifierRegles, dansUnCreneau, compterMots (Task 1)
src/logique/score.js          POIDS, CRITERES, composerScore, fusionnerConformite (Task 2)
src/logique/fiche.js          + appliquerEvaluation (Task 2)
src/claude/evaluation.js      extraireProfil, construirePrompt, validerReponse, messageErreurSample (Task 3)
src/interface/controleur.js   + evaluerFiche, evaluerContenu interne (Task 4) ; + importerReference, verifierReference, arreterReference (Task 6)
src/interface/app.js          + capacité sample, état reference (Tasks 4 et 6)
src/interface/panneau-fiche.js  + Évaluer/Arrêter, détail du score, suggestions (Task 5)
src/logique/reference.js      validerReference, ficheDeReference, verifierClassement (Task 6)
src/donnees/depot.js          + reference, reference_resultats (Task 6)
src/interface/vue-profil.js   + section Jeu de référence (Task 6)
src/interface/rendu.js        + capacites transmises à la vue Profil, mémo étendu (Task 6)
exemples/reference-fictive.json  jeu de référence fictif (Task 6)
```

---

### Task 1 : règles calculées

**Files:**
- Create : `src/logique/regles-score.js`, `tests/logique/regles-score.test.js`

**Interfaces:**
- Consumes : `partiesLocales`, `heureLocale` (`src/logique/dates.js`) ; forme `regles_studio` (plan 1).
- Produces :
  - `verifierRegles(fiche, regles)` → `{ conformite: { etat: 'vert'|'rouge', causes: string[] }, alertes: { critere: 'accroche'|'voix'|'mecanique'|null, texte: string }[], mesures: { motsAccroche: number, nbHashtags: number } }` ;
  - `dansUnCreneau(iso, regles): boolean` ;
  - `compterMots(texte): number`.

- [ ] **Step 1 : écrire les tests**

`tests/logique/regles-score.test.js` :

```js
import { describe, it, expect } from 'vitest';
import fictif from '../../exemples/profil-fictif.json';
import { nouvelleFiche } from '../../src/logique/fiche.js';
import { verifierRegles, dansUnCreneau, compterMots } from '../../src/logique/regles-score.js';

const R = fictif.regles_studio;
const LUNDI_MIDI = '2026-09-28T10:00:00.000Z';
const fiche = (extra = {}) => ({
  ...nouvelleFiche({ id: 'f1', format: 'reel', date_heure: LUNDI_MIDI, pilier: 'socio', maintenant: 'x' }),
  accroche: 'Tu relis ce message pour la troisième fois.',
  caption: 'Une ligne. Dis-moi en commentaire.',
  hashtags: ['nuit', 'socio', 'humour', 'paris'],
  ...extra,
});

describe('compterMots et dansUnCreneau', () => {
  it('compte les mots et repère les créneaux (fin exclue)', () => {
    expect(compterMots('  un deux   trois ')).toBe(3);
    expect(compterMots('')).toBe(0);
    expect(dansUnCreneau(LUNDI_MIDI, R)).toBe(true);
    expect(dansUnCreneau('2026-09-28T13:00:00.000Z', R)).toBe(false);
    expect(dansUnCreneau('2026-09-30T10:00:00.000Z', R)).toBe(false);
  });
});

describe('verifierRegles', () => {
  it('contenu propre : vert, sans alerte', () => {
    expect(verifierRegles(fiche(), R)).toEqual({
      conformite: { etat: 'vert', causes: [] }, alertes: [], mesures: { motsAccroche: 8, nbHashtags: 4 },
    });
  });

  it('bloque un mot à éviter, sans tenir compte de la casse, jusque dans les hashtags', () => {
    expect(verifierRegles(fiche({ caption: 'Le MINDSET du jour.' }), R).conformite)
      .toEqual({ etat: 'rouge', causes: ['mot à éviter « mindset »'] });
    expect(verifierRegles(fiche({ caption: 'Tout est en link in bio.' }), R).conformite.causes)
      .toEqual(['mot à éviter « link in bio »']);
    expect(verifierRegles(fiche({ hashtags: ['nuit', 'bienveillance', 'paris'] }), R).conformite.causes)
      .toEqual(['mot à éviter « bienveillance »']);
  });

  it('ignore les mots à éviter vides', () => {
    expect(verifierRegles(fiche(), { ...R, mots_a_eviter: ['', '   '] }).conformite.etat).toBe('vert');
  });

  it('bloque un lien dans le texte, sauf pour une story qui mène à la porte', () => {
    const cause = 'lien dans le texte (seule une story qui mène à la porte peut porter un lien)';
    expect(verifierRegles(fiche({ caption: 'Tout est sur https://exemple.test/moi' }), R).conformite.causes).toEqual([cause]);
    expect(verifierRegles(fiche({ caption: 'Va voir exemple.com/x' }), R).conformite.causes).toEqual([cause]);
    expect(verifierRegles(fiche({ format: 'story', porte: true, caption: 'https://exemple.test/moi' }), R).conformite.etat).toBe('vert');
    expect(verifierRegles(fiche({ format: 'story', porte: false, caption: 'https://exemple.test/moi' }), R).conformite.causes).toEqual([cause]);
  });

  it('bloque un géotag plus précis que la ville', () => {
    expect(verifierRegles(fiche({ geotag: 'Paris' }), R).conformite.etat).toBe('vert');
    expect(verifierRegles(fiche({ geotag: '12 rue des Lilas' }), R).conformite.causes)
      .toEqual(['géotag trop précis « 12 rue des Lilas » (reste au niveau de la ville)']);
    expect(verifierRegles(fiche({ geotag: 'Chez moi' }), R).conformite.etat).toBe('rouge');
  });

  it('cumule plusieurs causes', () => {
    expect(verifierRegles(fiche({ caption: 'mindset https://exemple.test', geotag: '3 place X' }), R).conformite.causes).toHaveLength(3);
  });

  it('signale une accroche trop longue ou absente', () => {
    const longue = 'un deux trois quatre cinq six sept huit neuf dix onze douze treize quatorze quinze seize';
    expect(verifierRegles(fiche({ accroche: longue }), R).alertes)
      .toEqual([{ critere: 'accroche', texte: 'Accroche trop longue : 16 mots (15 au maximum).' }]);
    expect(verifierRegles(fiche({ accroche: '' }), R).alertes)
      .toEqual([{ critere: 'accroche', texte: 'Pas d’accroche.' }]);
  });

  it('signale un nombre de hashtags hors de la plage, sauf pour une story', () => {
    expect(verifierRegles(fiche({ hashtags: ['a', 'b'] }), R).alertes)
      .toEqual([{ critere: 'mecanique', texte: '2 hashtag(s) : vise entre 3 et 5.' }]);
    expect(verifierRegles(fiche({ format: 'story', hashtags: [] }), R).alertes).toEqual([]);
  });

  it('signale un contenu du feed hors créneau, pas une story', () => {
    const horsCreneau = { critere: 'accroche', texte: 'Hors des créneaux recommandés du profil.' };
    expect(verifierRegles(fiche({ date_heure: '2026-09-30T10:00:00.000Z' }), R).alertes).toEqual([horsCreneau]);
    expect(verifierRegles(fiche({ date_heure: '2026-09-28T13:00:00.000Z' }), R).alertes).toEqual([horsCreneau]);
    expect(verifierRegles(fiche({ format: 'story', date_heure: '2026-09-30T10:00:00.000Z' }), R).alertes).toEqual([]);
  });

  it('recommande un carrousel pour une photo seule, sans pénalité', () => {
    expect(verifierRegles(fiche({ format: 'post' }), R).alertes)
      .toEqual([{ critere: null, texte: 'Photo seule : le profil recommande un carrousel.' }]);
  });
});
```

- [ ] **Step 2 : lancer les tests pour vérifier qu'ils échouent**

Run : `npx vitest run tests/logique/regles-score.test.js`
Expected : FAIL (module introuvable).

- [ ] **Step 3 : implémenter**

`src/logique/regles-score.js` :

```js
import { heureLocale, partiesLocales } from './dates.js';

const FEED = new Set(['reel', 'carrousel', 'post']);
const MOTIF_LIEN = /(https?:\/\/|www\.)\S+|\b[a-z0-9-]+\.(com|fr|net|org|io|me|co|ly|link|page|bio)\b(\/\S*)?/i;
const MOTIF_ADRESSE = /\d|\b(rue|avenue|av\.|boulevard|bd|chemin|impasse|allée|place|chez|domicile|maison|appart(ement)?)\b/i;

const normaliser = texte => (texte ?? '').toLocaleLowerCase('fr-FR');

export const compterMots = texte => (texte ?? '').trim().split(/\s+/).filter(Boolean).length;

export function dansUnCreneau(iso, regles) {
  const { jourSemaine } = partiesLocales(iso, regles.fuseau);
  const heure = heureLocale(iso, regles.fuseau);
  return regles.creneaux.some(c => c.jours.includes(jourSemaine) && heure >= c.debut && heure < c.fin);
}

export function verifierRegles(fiche, regles) {
  const causes = [];
  const alertes = [];

  const textes = [fiche.accroche, fiche.caption, ...(fiche.hashtags ?? [])].map(normaliser).join('\n');
  for (const mot of regles.mots_a_eviter ?? []) {
    const cherche = normaliser(mot).trim();
    if (cherche && textes.includes(cherche)) causes.push(`mot à éviter « ${mot.trim()} »`);
  }

  const lienAutorise = fiche.format === 'story' && fiche.porte;
  if (!lienAutorise && MOTIF_LIEN.test(`${fiche.accroche ?? ''}\n${fiche.caption ?? ''}`)) {
    causes.push('lien dans le texte (seule une story qui mène à la porte peut porter un lien)');
  }

  if (fiche.geotag?.trim() && MOTIF_ADRESSE.test(fiche.geotag)) {
    causes.push(`géotag trop précis « ${fiche.geotag.trim()} » (reste au niveau de la ville)`);
  }

  const motsAccroche = compterMots(fiche.accroche);
  if (motsAccroche === 0) alertes.push({ critere: 'accroche', texte: 'Pas d’accroche.' });
  else if (motsAccroche > regles.accroche_mots_max) {
    alertes.push({ critere: 'accroche', texte: `Accroche trop longue : ${motsAccroche} mots (${regles.accroche_mots_max} au maximum).` });
  }

  const nbHashtags = (fiche.hashtags ?? []).length;
  if (fiche.format !== 'story' && (nbHashtags < regles.hashtags.min || nbHashtags > regles.hashtags.max)) {
    alertes.push({ critere: 'mecanique', texte: `${nbHashtags} hashtag(s) : vise entre ${regles.hashtags.min} et ${regles.hashtags.max}.` });
  }

  if (FEED.has(fiche.format) && !dansUnCreneau(fiche.date_heure, regles)) {
    alertes.push({ critere: 'accroche', texte: 'Hors des créneaux recommandés du profil.' });
  }

  if (fiche.format === 'post') {
    alertes.push({ critere: null, texte: 'Photo seule : le profil recommande un carrousel.' });
  }

  return { conformite: { etat: causes.length ? 'rouge' : 'vert', causes }, alertes, mesures: { motsAccroche, nbHashtags } };
}
```

- [ ] **Step 4 : lancer les tests**

Run : `npx vitest run tests/logique/regles-score.test.js`
Expected : PASS.

- [ ] **Step 5 : commit**

```bash
git add src/logique/regles-score.js tests/logique/regles-score.test.js
git commit -m "Score : règles calculées (mots, liens, géotag, accroche, hashtags, créneau)"
```

---

### Task 2 : composition du score et application de l'évaluation

**Files:**
- Create : `src/logique/score.js`, `tests/logique/score.test.js`
- Modify : `src/logique/fiche.js` (ajout de `appliquerEvaluation`), `tests/logique/fiche.test.js`, `docs/superpowers/specs/2026-09-27-studio-contenu-design.md` (§3.4 et §4)

**Interfaces:**
- Consumes : `empreinte` (`fiche.js`) ; la forme renvoyée par `verifierRegles` (Task 1).
- Produces :
  - `CRITERES` : `[{ cle, nom }]` pour `accroche`, `voix` et `mecanique` ;
  - `POIDS`, `PLAFOND_ROUGE` (40) ;
  - `fusionnerConformite(calculee, jugee)` → `{ etat, causes }` ;
  - `composerScore({ fiche, verification, jugement, versionProfil, maintenant })` → `{ total, criteres: [{ cle, nom, points, max, phrase }], conformite, alertes: string[], version_profil, evalue_le, empreinte }` ;
  - `jugement` a la forme `{ notes: { accroche, voix, mecanique } (0 à 10), phrases: { accroche, voix, mecanique }, conformite: { etat, causes } }` ;
  - `appliquerEvaluation(fiche, { score, variantes, suggestions, recommandations }, maintenant)` → `Fiche`.

- [ ] **Step 1 : écrire les tests du score**

`tests/logique/score.test.js` :

```js
import { describe, it, expect } from 'vitest';
import { nouvelleFiche, empreinte } from '../../src/logique/fiche.js';
import { composerScore, fusionnerConformite, POIDS, PLAFOND_ROUGE } from '../../src/logique/score.js';

const VERT = { etat: 'vert', causes: [] };
const f = (format = 'reel') => ({ ...nouvelleFiche({ id: 'f1', format, date_heure: '2026-09-28T10:00:00.000Z', maintenant: 'x' }), caption: 'c', visuel: 'a1' });
const jugement = (notes, conformite = VERT) => ({ notes, phrases: { accroche: 'A.', voix: 'V.', mecanique: 'M.' }, conformite });
const verif = (alertes = [], conformite = VERT) => ({ conformite, alertes, mesures: {} });
const composer = (fiche, v, j) => composerScore({ fiche, verification: v, jugement: j, versionProfil: 3, maintenant: 'T' });
const dix = { accroche: 10, voix: 10, mecanique: 10 };

describe('composerScore', () => {
  it('reel parfait : 100, poids 40/30/30', () => {
    const fiche = f('reel');
    expect(composer(fiche, verif(), jugement(dix))).toEqual({
      total: 100,
      criteres: [
        { cle: 'accroche', nom: 'Accroche et diffusion', points: 40, max: 40, phrase: 'A.' },
        { cle: 'voix', nom: 'Voix et esthétique', points: 30, max: 30, phrase: 'V.' },
        { cle: 'mecanique', nom: 'Mécanique de la caption', points: 30, max: 30, phrase: 'M.' },
      ],
      conformite: VERT, alertes: [], version_profil: 3, evalue_le: 'T', empreinte: empreinte(fiche),
    });
  });

  it('applique les poids de la story et du post (grille du carrousel)', () => {
    expect(composer(f('story'), verif(), jugement({ accroche: 5, voix: 5, mecanique: 5 })).total).toBe(50);
    expect(composer(f('post'), verif(), jugement(dix)).criteres.map(c => c.max)).toEqual([30, 35, 35]);
    expect(POIDS.carrousel).toEqual({ accroche: 30, voix: 35, mecanique: 35 });
  });

  it('retire 20 % du maximum du critère par alerte, jamais sous zéro', () => {
    const accroche = { critere: 'accroche', texte: 'x' };
    expect(composer(f('reel'), verif([accroche]), jugement(dix)).total).toBe(92);
    const deux = [{ critere: 'mecanique', texte: 'a' }, { critere: 'mecanique', texte: 'b' }];
    expect(composer(f('carrousel'), verif(deux), jugement({ accroche: 0, voix: 0, mecanique: 5 })).criteres[2].points).toBe(4);
    expect(composer(f('carrousel'), verif([...deux, ...deux]), jugement({ accroche: 0, voix: 0, mecanique: 1 })).criteres[2].points).toBe(0);
  });

  it('une alerte sans critère ne pénalise pas mais reste listée', () => {
    const s = composer(f('post'), verif([{ critere: null, texte: 'Photo seule.' }]), jugement(dix));
    expect(s.total).toBe(100);
    expect(s.alertes).toEqual(['Photo seule.']);
  });

  it('borne les notes entre 0 et 10', () => {
    expect(composer(f('reel'), verif(), jugement({ accroche: 12, voix: -3, mecanique: 'x' })).criteres.map(c => c.points)).toEqual([40, 0, 0]);
  });

  it('Claude ne peut pas lever un rouge calculé : plafond à 40', () => {
    const s = composer(f('reel'), verif([], { etat: 'rouge', causes: ['mot à éviter « mindset »'] }), jugement(dix));
    expect(s.conformite).toEqual({ etat: 'rouge', causes: ['mot à éviter « mindset »'] });
    expect(s.total).toBe(PLAFOND_ROUGE);
  });

  it('un rouge jugé par Claude bloque aussi ; un orange est gardé sans plafond', () => {
    const rouge = composer(f('reel'), verif(), jugement(dix, { etat: 'rouge', causes: ['groupe visé'] }));
    expect(rouge.conformite).toEqual({ etat: 'rouge', causes: ['groupe visé'] });
    expect(rouge.total).toBe(40);
    const orange = composer(f('reel'), verif(), jugement(dix, { etat: 'orange', causes: ['ambigu'] }));
    expect(orange.conformite).toEqual({ etat: 'orange', causes: ['ambigu'] });
    expect(orange.total).toBe(100);
  });
});

describe('fusionnerConformite', () => {
  it('garde la plus sévère et dédoublonne les causes', () => {
    expect(fusionnerConformite({ etat: 'rouge', causes: ['a'] }, { etat: 'orange', causes: ['a', 'b'] }))
      .toEqual({ etat: 'rouge', causes: ['a', 'b'] });
    expect(fusionnerConformite(VERT, VERT)).toEqual(VERT);
    expect(fusionnerConformite(VERT, { etat: 'inconnu', causes: [] }).etat).toBe('orange');
  });
});
```

- [ ] **Step 2 : ajouter les tests de `appliquerEvaluation`**

À la fin de `tests/logique/fiche.test.js`, ajouter `appliquerEvaluation` à l'import existant depuis `../../src/logique/fiche.js`, puis :

```js
describe('appliquerEvaluation', () => {
  it('pose le score et les suggestions sans toucher au contenu ni au statut', () => {
    const f = { ...base(), statut: 'brouillon', visuel: 'a1', caption: 'Une caption.' };
    const score = { total: 70, criteres: [], conformite: { etat: 'vert', causes: [] }, empreinte: empreinte(f) };
    const g = appliquerEvaluation(f, {
      score,
      variantes: [{ role: 'engagement', texte: 'V1' }, { role: 'deadpan', texte: 'V2' }],
      suggestions: { accroches: ['A1', 'A2'], hashtags: ['nuit'] },
      recommandations: ['R1', 'R2', 'R3'],
    }, '2026-09-28T09:00:00.000Z');
    expect(g).toMatchObject({ score, statut: 'brouillon', caption: 'Une caption.', maj_le: '2026-09-28T09:00:00.000Z', recommandations: ['R1', 'R2', 'R3'] });
    expect(g.suggestions).toEqual({ accroches: ['A1', 'A2'], hashtags: ['nuit'] });
    expect(aReevaluer(g)).toBe(false);
    expect(peutPasserA(g, 'valide')).toEqual({ ok: true });
  });
});
```

- [ ] **Step 3 : lancer les tests pour vérifier qu'ils échouent**

Run : `npx vitest run tests/logique/score.test.js tests/logique/fiche.test.js`
Expected : FAIL (`score.js` introuvable, `appliquerEvaluation` non exporté).

- [ ] **Step 4 : implémenter**

`src/logique/score.js` :

```js
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
```

Dans `src/logique/fiche.js`, ajouter à la fin :

```js
export function appliquerEvaluation(fiche, { score, variantes, suggestions, recommandations }, maintenant) {
  return { ...fiche, score, variantes, suggestions, recommandations, maj_le: maintenant };
}
```

- [ ] **Step 5 : lancer les tests**

Run : `npx vitest run tests/logique/score.test.js tests/logique/fiche.test.js`
Expected : PASS.

- [ ] **Step 6 : reporter les écarts dans la spec**

Dans `docs/superpowers/specs/2026-09-27-studio-contenu-design.md` :
- **§3.4**, ajouter à la fin : « Chaque alerte non bloquante (accroche absente ou trop longue, hashtags hors plage, contenu hors créneau) retire 20 % des points maximum du critère concerné. La conformité finale est la plus sévère entre la conformité calculée et celle jugée par Claude, et leurs causes sont cumulées. » ;
- **§4**, champs d'une fiche, ligne **recommandations** : « **recommandations**, **variantes** (2 captions `{ role, texte }`) et **suggestions** (`{ accroches, hashtags }`) » ;
- **§4**, tableau : ajouter les lignes `reference` (« Jeu de référence : un document par contenu `{ format, pilier, accroche, caption, hashtags, resultat: gagnant|perdant }` ») et `reference_resultats` (« Document `dernier` : bilan de la dernière vérification du classement »).

- [ ] **Step 7 : commit**

```bash
git add src/logique/score.js src/logique/fiche.js tests/logique/score.test.js tests/logique/fiche.test.js docs/superpowers/specs
git commit -m "Score : composition pondérée par format, plafond de conformité, application de l'évaluation"
```

---

### Task 3 : consigne pour Claude et validation de la réponse

**Files:**
- Create : `src/claude/evaluation.js`, `tests/claude/evaluation.test.js`

**Interfaces:**
- Consumes : `cleJour`, `heureLocale` (`dates.js`), `analyserHashtags` (`fiche.js`).
- Produces :
  - `TAILLE_PROFIL_MAX` (30000) ;
  - `extraireProfil(profil): string` ;
  - `construirePrompt({ fiche, profil, verification, fichesSemaine = [], avecImage = false }): string` ;
  - `validerReponse(reponse)` → `{ ok: true, jugement }` ou `{ ok: false, erreurs: string[] }`. `jugement` a la forme `{ notes, phrases, conformite, captions: [{ role, texte }], accroches: string[], hashtags: string[], recommandations: string[] }` ;
  - `messageErreurSample(e): string` ;
  - `CODES_INDISPONIBLES: Set<string>`.

- [ ] **Step 1 : écrire les tests**

`tests/claude/evaluation.test.js` :

```js
import { describe, it, expect } from 'vitest';
import fictif from '../../exemples/profil-fictif.json';
import { nouvelleFiche } from '../../src/logique/fiche.js';
import {
  extraireProfil, construirePrompt, validerReponse, messageErreurSample, CODES_INDISPONIBLES, TAILLE_PROFIL_MAX,
} from '../../src/claude/evaluation.js';

const profil = { ...fictif, version: 2 };
const fiche = (extra = {}) => ({
  ...nouvelleFiche({ id: 'f1', format: 'reel', date_heure: '2026-09-28T10:00:00.000Z', pilier: 'socio', maintenant: 'x' }),
  accroche: 'Accroche test', caption: 'Caption test', hashtags: ['nuit'], ...extra,
});
const verification = { conformite: { etat: 'vert', causes: [] }, alertes: [], mesures: { motsAccroche: 2, nbHashtags: 1 } };
const gros = {
  ...profil,
  formats_de_contenu: { scripts: 'a'.repeat(50000) },
  exemples_de_reference: { reels: 'b'.repeat(50000) },
  analyse_du_compte: { detail: 'c'.repeat(50000) },
};
const valide = () => ({
  notes: { accroche: 8, voix: 7, mecanique: 6 },
  phrases: { accroche: ' Nette. ', voix: 'Juste.', mecanique: 'Correcte.' },
  conformite: { etat: 'vert', causes: [] },
  captions: [{ role: 'engagement', texte: ' V1 ' }, { role: 'deadpan', texte: 'V2' }],
  accroches: ['A1', 'A2'],
  hashtags: ['#nuit', 'Nuit', 'socio'],
  recommandations: ['R1', 'R2', 'R3'],
});

describe('extraireProfil', () => {
  it('garde les sections utiles et écarte les exemples et l’analyse', () => {
    const texte = extraireProfil(profil);
    expect(texte).toContain('"regles_studio"');
    expect(texte).toContain('"ton_et_voix"');
    expect(extraireProfil(gros)).not.toContain('bbbb');
    expect(extraireProfil(gros)).not.toContain('cccc');
  });
  it('reste sous la taille maximale pour un profil volumineux, règles gardées', () => {
    const texte = extraireProfil(gros);
    expect(texte.length).toBeLessThanOrEqual(TAILLE_PROFIL_MAX);
    expect(texte).toContain('"regles_studio"');
  });
});

describe('construirePrompt', () => {
  it('contient le contenu, l’heure locale, les règles calculées et la semaine', () => {
    const autre = { ...fiche({ accroche: 'Autre de la semaine' }), id: 'f2' };
    const p = construirePrompt({ fiche: fiche(), profil, verification, fichesSemaine: [fiche(), autre] });
    expect(p).toContain('Accroche test');
    expect(p).toContain('"date_heure_locale":"2026-09-28 12:00"');
    expect(p).toContain(JSON.stringify(verification));
    expect(p).toContain('Autre de la semaine');
    expect(p.split('Accroche test').length - 1).toBe(1);
    expect(p).toContain('"visuel":"aucun"');
  });
  it('dit si le visuel est joint', () => {
    expect(construirePrompt({ fiche: fiche({ visuel: 'a1' }), profil, verification, avecImage: true })).toContain('"visuel":"joint à ce message"');
    expect(construirePrompt({ fiche: fiche({ visuel: 'a1' }), profil, verification })).toContain('"visuel":"présent mais non joint"');
  });
  it('reste sous la limite de 64 Kio avec un profil volumineux', () => {
    const p = construirePrompt({ fiche: fiche({ caption: 'x'.repeat(2000) }), profil: gros, verification, fichesSemaine: Array.from({ length: 20 }, (_, i) => ({ ...fiche(), id: `s${i}` })) });
    expect(new TextEncoder().encode(p).length).toBeLessThan(60000);
  });
});

describe('validerReponse', () => {
  it('accepte une réponse complète et la normalise', () => {
    const r = validerReponse(valide());
    expect(r.ok).toBe(true);
    expect(r.jugement.phrases.accroche).toBe('Nette.');
    expect(r.jugement.captions).toEqual([{ role: 'engagement', texte: 'V1' }, { role: 'deadpan', texte: 'V2' }]);
    expect(r.jugement.hashtags).toEqual(['nuit', 'socio']);
  });
  it('refuse ce qui n’est pas un objet', () => {
    expect(validerReponse([])).toEqual({ ok: false, erreurs: ['La réponse n’est pas un objet JSON.'] });
    expect(validerReponse(null).ok).toBe(false);
  });
  it('liste chaque manque', () => {
    const r = validerReponse({ ...valide(), notes: { accroche: 8, voix: 11, mecanique: 6 }, phrases: { voix: 'a', mecanique: 'b' } });
    expect(r.erreurs).toEqual(['phrases.accroche manquante.', 'notes.voix doit être un nombre de 0 à 10.']);
    expect(validerReponse({ ...valide(), captions: [{ role: 'cta', texte: 'a' }, { role: 'cta', texte: 'b' }] }).erreurs)
      .toEqual(['captions : exactement 2 captions de rôles différents.']);
    expect(validerReponse({ ...valide(), recommandations: ['a', 'b'] }).erreurs).toEqual(['recommandations : exactement 3 textes.']);
    expect(validerReponse({ ...valide(), accroches: ['a'] }).erreurs).toEqual(['accroches : 2 ou 3 textes.']);
    expect(validerReponse({ ...valide(), conformite: { etat: 'bleu', causes: [] } }).erreurs).toEqual(['conformite.etat doit valoir vert, orange ou rouge.']);
  });
});

describe('messageErreurSample', () => {
  it('traduit les codes et signale l’indisponibilité', () => {
    expect(messageErreurSample({ code: 'rate_limited' })).toBe('Trop de demandes à Claude pour le moment : réessaie un peu plus tard.');
    expect(messageErreurSample({ code: 'truc' })).toBe('L’évaluation a échoué (service indisponible) : réessaie. Rien n’a été modifié.');
    expect(CODES_INDISPONIBLES.has('not_granted')).toBe(true);
    expect(CODES_INDISPONIBLES.has('rate_limited')).toBe(false);
  });
});
```

- [ ] **Step 2 : lancer les tests pour vérifier qu'ils échouent**

Run : `npx vitest run tests/claude/evaluation.test.js`
Expected : FAIL (module introuvable).

- [ ] **Step 3 : implémenter**

`src/claude/evaluation.js` :

```js
import { cleJour, heureLocale } from '../logique/dates.js';
import { analyserHashtags } from '../logique/fiche.js';

export const TAILLE_PROFIL_MAX = 30000;
const SECTIONS_PROFIL = ['identite_de_marque', 'ton_et_voix', 'vocabulaire', 'regles_do', 'regles_dont', 'formats_de_contenu', 'audience', 'principe_directeur_final', 'regles_studio'];
const ORDRE_RETRAIT = ['audience', 'principe_directeur_final', 'vocabulaire', 'formats_de_contenu', 'regles_do', 'regles_dont', 'identite_de_marque'];
const ROLES = ['engagement', 'cta', 'deadpan'];
const CRITERES = ['accroche', 'voix', 'mecanique'];

export function extraireProfil(profil) {
  const extrait = {};
  for (const cle of SECTIONS_PROFIL) if (profil[cle] !== undefined) extrait[cle] = profil[cle];
  let texte = JSON.stringify(extrait);
  for (const cle of ORDRE_RETRAIT) {
    if (texte.length <= TAILLE_PROFIL_MAX) break;
    delete extrait[cle];
    texte = JSON.stringify(extrait);
  }
  return texte.length <= TAILLE_PROFIL_MAX ? texte : `${texte.slice(0, TAILLE_PROFIL_MAX - 12)}…(tronqué)`;
}

export function construirePrompt({ fiche, profil, verification, fichesSemaine = [], avecImage = false }) {
  const fz = profil.regles_studio.fuseau;
  const contenu = {
    format: fiche.format, pilier: fiche.pilier, format_valide: fiche.format_valide || null,
    role_caption: fiche.role_caption, appel_a_l_action: !!fiche.cta, ragebait: !!fiche.ragebait, mene_a_la_porte: !!fiche.porte,
    date_heure_locale: `${cleJour(fiche.date_heure, fz)} ${heureLocale(fiche.date_heure, fz)}`,
    accroche: fiche.accroche, caption: fiche.caption, hashtags: fiche.hashtags, geotag: fiche.geotag,
    visuel: avecImage ? 'joint à ce message' : fiche.visuel ? 'présent mais non joint' : 'aucun',
  };
  const semaine = fichesSemaine
    .filter(f => f.id !== fiche.id)
    .slice(0, 30)
    .map(f => ({ format: f.format, pilier: f.pilier, role_caption: f.role_caption, cta: !!f.cta, accroche: (f.accroche ?? '').slice(0, 120) }));
  return [
    'Tu es l’éditrice exigeante d’un compte Instagram. Évalue UN contenu au regard du profil de marque ci-dessous.',
    'Tu notes le contenu, tu ne le réécris pas. Tes suggestions suivent la voix du profil. N’invente aucune donnée.',
    '',
    '## Profil de marque (JSON)',
    extraireProfil(profil),
    '',
    '## Contenu à évaluer (JSON)',
    JSON.stringify(contenu),
    '',
    '## Règles calculées (elles font autorité : tu ne peux pas lever un blocage)',
    JSON.stringify(verification),
    '',
    '## Autres contenus de la semaine',
    JSON.stringify(semaine),
    '',
    '## Ce que tu notes, de 0 à 10',
    '- accroche : force de l’accroche (lisible en moins d’une seconde, paradoxe ou question), potentiel d’envoi et de sauvegarde, visage face caméra si le visuel est joint ;',
    '- voix : test de voix et vocabulaire du profil, esthétique si le visuel est joint, cohérence avec le pilier ;',
    '- mecanique : première ligne qui provoque avant « …plus », une seule micro-action, structure attendue pour ce format.',
    'Conformité : "rouge" si la surface n’est pas SFW, si un groupe ou une identité est visé, si l’âge adulte est ambigu ou si un boost payant est suggéré ; "orange" si un risque mérite attention ; sinon "vert". Causes courtes et précises.',
    '',
    '## Format de réponse',
    'Réponds uniquement avec un objet JSON de cette forme :',
    '{"notes":{"accroche":7,"voix":8,"mecanique":6},"phrases":{"accroche":"…","voix":"…","mecanique":"…"},"conformite":{"etat":"vert","causes":[]},"captions":[{"role":"engagement","texte":"…"},{"role":"deadpan","texte":"…"}],"accroches":["…","…"],"hashtags":["mot","autre"],"recommandations":["…","…","…"]}',
    'Contraintes : une phrase par critère ; exactement 2 captions de rôles différents parmi engagement, cta et deadpan ; 2 ou 3 accroches ; hashtags sans # ; exactement 3 recommandations concrètes ; tout en français.',
  ].join('\n');
}

const texte = v => typeof v === 'string' && v.trim().length > 0;

export function validerReponse(r) {
  if (!r || typeof r !== 'object' || Array.isArray(r)) return { ok: false, erreurs: ['La réponse n’est pas un objet JSON.'] };
  const erreurs = [];
  for (const c of CRITERES) {
    if (!texte(r.phrases?.[c])) erreurs.push(`phrases.${c} manquante.`);
  }
  for (const c of CRITERES) {
    const n = r.notes?.[c];
    if (typeof n !== 'number' || !Number.isFinite(n) || n < 0 || n > 10) erreurs.push(`notes.${c} doit être un nombre de 0 à 10.`);
  }
  if (!['vert', 'orange', 'rouge'].includes(r.conformite?.etat)) erreurs.push('conformite.etat doit valoir vert, orange ou rouge.');
  if (!Array.isArray(r.conformite?.causes) || !r.conformite.causes.every(texte)) erreurs.push('conformite.causes doit être une liste de textes.');
  const captionsOk = Array.isArray(r.captions) && r.captions.length === 2
    && r.captions.every(c => ROLES.includes(c?.role) && texte(c?.texte)) && r.captions[0].role !== r.captions[1].role;
  if (!captionsOk) erreurs.push('captions : exactement 2 captions de rôles différents.');
  if (!Array.isArray(r.accroches) || r.accroches.length < 2 || r.accroches.length > 3 || !r.accroches.every(texte)) erreurs.push('accroches : 2 ou 3 textes.');
  if (!Array.isArray(r.hashtags) || !r.hashtags.every(texte)) erreurs.push('hashtags : liste de textes.');
  if (!Array.isArray(r.recommandations) || r.recommandations.length !== 3 || !r.recommandations.every(texte)) erreurs.push('recommandations : exactement 3 textes.');
  if (erreurs.length) return { ok: false, erreurs };
  return {
    ok: true,
    jugement: {
      notes: { accroche: r.notes.accroche, voix: r.notes.voix, mecanique: r.notes.mecanique },
      phrases: { accroche: r.phrases.accroche.trim(), voix: r.phrases.voix.trim(), mecanique: r.phrases.mecanique.trim() },
      conformite: { etat: r.conformite.etat, causes: r.conformite.causes.map(s => s.trim()) },
      captions: r.captions.map(c => ({ role: c.role, texte: c.texte.trim() })),
      accroches: r.accroches.map(s => s.trim()),
      hashtags: analyserHashtags(r.hashtags.join(' ')),
      recommandations: r.recommandations.map(s => s.trim()),
    },
  };
}

export const CODES_INDISPONIBLES = new Set(['not_granted', 'sampling_disabled', 'not_declared', 'capability_disabled', 'capability_removed']);

export function messageErreurSample(e) {
  if (CODES_INDISPONIBLES.has(e?.code)) return 'L’évaluation par Claude n’est pas disponible pour ce compte ou cette vue.';
  switch (e?.code) {
    case 'rate_limited': return 'Trop de demandes à Claude pour le moment : réessaie un peu plus tard.';
    case 'session_expired': return 'Ta session a expiré : reconnecte-toi à claude.ai, puis réessaie.';
    case 'invalid_json': return 'La réponse de Claude était illisible : réessaie. Rien n’a été modifié.';
    case 'refused': return 'Claude a refusé d’évaluer ce contenu : reformule-le, puis réessaie.';
    case 'prompt_too_large': return 'Le contenu est trop long pour être évalué : raccourcis la caption.';
    case 'empty_completion': return 'Claude n’a rien répondu : réessaie. Rien n’a été modifié.';
    case 'image_rejected': return 'Le visuel n’a pas pu être envoyé à Claude : réessaie, ou remplace-le.';
    default: return 'L’évaluation a échoué (service indisponible) : réessaie. Rien n’a été modifié.';
  }
}
```

- [ ] **Step 4 : lancer les tests**

Run : `npx vitest run tests/claude/evaluation.test.js`
Expected : PASS.

- [ ] **Step 5 : commit**

```bash
git add src/claude/evaluation.js tests/claude/evaluation.test.js
git commit -m "Claude : consigne d'évaluation bornée, validation de la réponse, messages d'erreur"
```

---

### Task 4 : évaluer une fiche (contrôleur et démarrage)

**Files:**
- Create : `tests/interface/evaluation.test.js`
- Modify : `src/interface/controleur.js`, `src/interface/app.js`, `tests/interface/app.test.js`

**Interfaces:**
- Consumes :
  - `verifierRegles` (Task 1) ;
  - `composerScore` (Task 2) ;
  - `appliquerEvaluation` (Task 2) ;
  - `construirePrompt`, `validerReponse`, `messageErreurSample`, `CODES_INDISPONIBLES` (Task 3) ;
  - `fichesDeLaSemaine` (`controle.js`), `debutSemaine` (`dates.js`) ;
  - `sample` de l'Artifact : `sample.json(input, { signal, images })` et `sample.limits()`.
- Produces :
  - `creerControleur({ …, sample = null, chargerImage })`, où `chargerImage(idVisuel): Promise<Blob>`. Par défaut : `fetch('/_blob/' + id)`, puis `.blob()`, avec une erreur levée si la réponse n'est pas ok ;
  - `actions.evaluerFiche(id, { signal })`, qui renvoie :
    - `{ ok: true, fiche }` ;
    - `{ ok: false, annule: true }` ;
    - `{ ok: false, raison, indisponible? }` ;
  - fonction interne `evaluerContenu(fiche, { signal, fichesSemaine })` → `{ ok: true, score, jugement }` ou l'échec. La Task 6 la réutilise ;
  - `demarrer` obtient `sample` via `claude.use('sample')` et passe `capacites: { assets, sample: !!sample }` au rendu.

- [ ] **Step 1 : écrire les tests du contrôleur**

`tests/interface/evaluation.test.js` :

```js
import { describe, it, expect, vi } from 'vitest';
import fictif from '../../exemples/profil-fictif.json';
import { creerFausseBase } from '../aides/fausseBase.js';
import { creerDepot } from '../../src/donnees/depot.js';
import { creerEnregistreur } from '../../src/donnees/enregistreur.js';
import { creerEtat } from '../../src/interface/etat.js';
import { creerControleur } from '../../src/interface/controleur.js';
import { aReevaluer } from '../../src/logique/fiche.js';

const T = '2026-09-28T08:00:00.000Z';
const REPONSE = {
  notes: { accroche: 8, voix: 7, mecanique: 6 },
  phrases: { accroche: 'A.', voix: 'V.', mecanique: 'M.' },
  conformite: { etat: 'vert', causes: [] },
  captions: [{ role: 'engagement', texte: 'Variante A' }, { role: 'deadpan', texte: 'Variante B' }],
  accroches: ['Acc 1', 'Acc 2'],
  hashtags: ['nuit', '#socio'],
  recommandations: ['R1', 'R2', 'R3'],
};
const differe = () => { let resoudre, rejeter; const p = new Promise((a, b) => { resoudre = a; rejeter = b; }); return { p, resoudre, rejeter }; };
const fauxSample = (json = async () => REPONSE, limits = async () => ({ maxPromptBytes: 65536 })) =>
  Object.assign(vi.fn(), { json: vi.fn(json), limits: vi.fn(limits) });

async function monter({ sample = fauxSample(), chargerImage = vi.fn(async () => new Blob(['x'], { type: 'image/png' })), contenu = {} } = {}) {
  const db = creerFausseBase();
  const depot = creerDepot(db);
  const enregistreur = creerEnregistreur(f => depot.enregistrerFiche(f), 600);
  const etat = creerEtat({ profil: { ...fictif, version: 1 }, fiches: [], vue: 'semaine', ancre: T, ficheOuverte: null, erreur: null, sauvegarde: 'ok' });
  const actions = creerControleur({ etat, depot, enregistreur, assets: null, horloge: () => T, idAleatoire: () => 'f1', sample, chargerImage });
  await actions.creerFiche({ format: 'reel', date_heure: '2026-09-28T10:00:00.000Z' });
  actions.modifierFiche('f1', {
    accroche: 'Tu relis ce message pour la troisième fois.', caption: 'Une ligne. Dis-moi en commentaire.',
    hashtags: ['nuit', 'socio', 'humour', 'paris'], visuel: 'a1', visuel_type: 'video', ...contenu,
  });
  await enregistreur.vider('f1');
  return { db, etat, actions, sample, chargerImage };
}

describe('evaluerFiche', () => {
  it('évalue, enregistre le score et les suggestions, et permet de valider', async () => {
    const { db, etat, actions, sample } = await monter();
    const r = await actions.evaluerFiche('f1');
    expect(r.ok).toBe(true);
    expect(sample.json).toHaveBeenCalledTimes(1);
    expect(sample.json.mock.calls[0][0]).toContain('Tu relis ce message pour la troisième fois.');
    const enBase = db._docs.get('fiches/f1');
    expect(enBase.score.total).toBe(71);
    expect(enBase.variantes).toEqual(REPONSE.captions);
    expect(enBase.suggestions).toEqual({ accroches: ['Acc 1', 'Acc 2'], hashtags: ['nuit', 'socio'] });
    expect(enBase.recommandations).toEqual(['R1', 'R2', 'R3']);
    expect(etat.lire().fiches[0].score.total).toBe(71);
    expect(await actions.changerStatut('f1', 'valide')).toEqual({ ok: true });
  });

  it('garde le rouge calculé même si Claude répond vert, et refuse la validation', async () => {
    const { actions } = await monter({ contenu: { caption: 'Mon mindset du jour.' } });
    const r = await actions.evaluerFiche('f1');
    expect(r.fiche.score.conformite).toEqual({ etat: 'rouge', causes: ['mot à éviter « mindset »'] });
    expect(r.fiche.score.total).toBeLessThanOrEqual(40);
    expect(await actions.changerStatut('f1', 'valide')).toEqual({ ok: false, raison: 'Conformité au rouge : mot à éviter « mindset ».' });
  });

  it('une réponse incomplète ne modifie ni la fiche ni la base', async () => {
    const { db, etat, actions } = await monter({ sample: fauxSample(async () => ({ notes: {} })) });
    expect(await actions.evaluerFiche('f1')).toEqual({ ok: false, raison: 'La réponse de Claude était incomplète : réessaie. Rien n’a été modifié.' });
    expect(etat.lire().fiches[0].score).toBeNull();
    expect(db._docs.get('fiches/f1').score).toBeNull();
  });

  it('traduit un échec de Claude sans rien écrire', async () => {
    const { db, actions } = await monter({ sample: fauxSample(async () => { throw { code: 'invalid_json', message: 'x', text: 'bla' }; }) });
    const ecrituresAvant = db.ecritures.length;
    expect(await actions.evaluerFiche('f1')).toEqual({ ok: false, raison: 'La réponse de Claude était illisible : réessaie. Rien n’a été modifié.', indisponible: false });
    expect(db.ecritures.length).toBe(ecrituresAvant);
  });

  it('un arrêt demandé n’affiche pas d’erreur', async () => {
    const { etat, actions } = await monter({ sample: fauxSample(async () => { throw { code: 'cancelled', message: 'x' }; }) });
    expect(await actions.evaluerFiche('f1')).toEqual({ ok: false, annule: true });
    expect(etat.lire().erreur).toBeNull();
  });

  it('signale une évaluation indisponible', async () => {
    const { actions } = await monter({ sample: fauxSample(async () => { throw { code: 'not_granted', message: 'x' }; }) });
    expect(await actions.evaluerFiche('f1')).toMatchObject({ ok: false, indisponible: true });
    const sansSample = await monter({ sample: null });
    expect(await sansSample.actions.evaluerFiche('f1')).toEqual({ ok: false, raison: 'L’évaluation par Claude n’est pas disponible dans cette vue.', indisponible: true });
  });

  it('une modification pendant l’évaluation laisse la fiche à réévaluer', async () => {
    const reponse = differe();
    const { etat, actions } = await monter({ sample: fauxSample(() => reponse.p) });
    const enCours = actions.evaluerFiche('f1');
    await Promise.resolve();
    actions.modifierFiche('f1', { caption: 'Changée pendant l’évaluation.' });
    reponse.resoudre(REPONSE);
    const r = await enCours;
    expect(r.ok).toBe(true);
    expect(etat.lire().fiches[0].caption).toBe('Changée pendant l’évaluation.');
    expect(aReevaluer(etat.lire().fiches[0])).toBe(true);
    expect(await actions.changerStatut('f1', 'valide')).toEqual({ ok: false, raison: 'La fiche a changé depuis son évaluation : réévalue-la.' });
  });

  it('refuse une deuxième évaluation simultanée de la même fiche', async () => {
    const reponse = differe();
    const { actions } = await monter({ sample: fauxSample(() => reponse.p) });
    const premiere = actions.evaluerFiche('f1');
    expect(await actions.evaluerFiche('f1')).toEqual({ ok: false, raison: 'Une évaluation est déjà en cours pour cette fiche.' });
    reponse.resoudre(REPONSE);
    await premiere;
  });

  it('signale une fiche supprimée pendant l’évaluation', async () => {
    const reponse = differe();
    const { actions } = await monter({ sample: fauxSample(() => reponse.p) });
    const enCours = actions.evaluerFiche('f1');
    await actions.supprimerFiche('f1');
    reponse.resoudre(REPONSE);
    expect(await enCours).toEqual({ ok: false, raison: 'La fiche a été supprimée pendant l’évaluation.' });
  });

  it('joint le visuel image quand la vue le permet, et s’en passe sinon', async () => {
    const avecImages = fauxSample(undefined, async () => ({ maxPromptBytes: 65536, images: { maxCount: 1, maxInputBytes: 20e6, mediaTypes: ['image/png'] } }));
    const a = await monter({ sample: avecImages, contenu: { visuel_type: 'image' } });
    await a.actions.evaluerFiche('f1');
    expect(a.chargerImage).toHaveBeenCalledWith('a1');
    expect(avecImages.json.mock.calls[0][1].images).toBeInstanceOf(Blob);
    expect(avecImages.json.mock.calls[0][0]).toContain('"visuel":"joint à ce message"');

    const b = await monter({ contenu: { visuel_type: 'image' } });
    await b.actions.evaluerFiche('f1');
    expect(b.chargerImage).not.toHaveBeenCalled();

    const echec = vi.fn(async () => { throw new Error('404'); });
    const c = await monter({ sample: fauxSample(undefined, async () => ({ images: { maxCount: 1 } })), chargerImage: echec, contenu: { visuel_type: 'image' } });
    expect((await c.actions.evaluerFiche('f1')).ok).toBe(true);
  });
});
```

- [ ] **Step 2 : ajouter le test de démarrage**

Dans `tests/interface/app.test.js`, ajouter :

```js
  it('transmet la capacité sample au contrôleur', async () => {
    const db = creerFausseBase();
    const sample = Object.assign(async () => ({}), { json: vi.fn(async () => ({})), limits: async () => ({}) });
    const racine = document.createElement('div');
    const app = await demarrer(racine, { use: async nom => (nom === 'db' ? db : nom === 'sample' ? sample : null) }, { horloge });
    await app.actions.importerProfil(JSON.stringify(fictif));
    await app.actions.creerFiche({ format: 'reel', date_heure: '2026-09-28T10:00:00.000Z' });
    await app.actions.evaluerFiche(app.etat.lire().ficheOuverte);
    expect(sample.json).toHaveBeenCalledTimes(1);
  });
```

Si `vi` n'est pas encore importé dans `tests/interface/app.test.js`, ajoute-le à l'import de `vitest`.

- [ ] **Step 3 : lancer les tests pour vérifier qu'ils échouent**

Run : `npx vitest run tests/interface/evaluation.test.js tests/interface/app.test.js`
Expected : FAIL (`evaluerFiche` n'existe pas).

- [ ] **Step 4 : implémenter dans le contrôleur**

Dans `src/interface/controleur.js` :

1. Compléter les imports :

```js
import { appliquerEvaluation } from '../logique/fiche.js';
import { verifierRegles } from '../logique/regles-score.js';
import { composerScore } from '../logique/score.js';
import { fichesDeLaSemaine } from '../logique/controle.js';
import { construirePrompt, validerReponse, messageErreurSample, CODES_INDISPONIBLES } from '../claude/evaluation.js';
```

(`debutSemaine` est déjà importé depuis `dates.js`. `appliquerEvaluation` vient s'ajouter à l'import existant depuis `fiche.js`.)

2. Ajouter au-dessus de `creerControleur` :

```js
async function chargerImageParDefaut(id) {
  const reponse = await fetch(`/_blob/${id}`);
  if (!reponse.ok) throw new Error(`Visuel introuvable (${reponse.status})`);
  return reponse.blob();
}

const INDISPONIBLE = { ok: false, raison: 'L’évaluation par Claude n’est pas disponible dans cette vue.', indisponible: true };
```

3. Changer la signature en `creerControleur({ etat, depot, enregistreur, assets, horloge, idAleatoire = nouvelId, sample = null, chargerImage = chargerImageParDefaut })`.

4. Dans le corps de `creerControleur`, après `changerAncre` :

```js
  const evaluationsEnCours = new Set();

  async function evaluerContenu(fiche, { signal, fichesSemaine = [] } = {}) {
    if (!sample) return INDISPONIBLE;
    const { profil } = etat.lire();
    const verification = verifierRegles(fiche, profil.regles_studio);
    let images;
    if (fiche.visuel && fiche.visuel_type === 'image') {
      try {
        const limites = await sample.limits();
        if (limites?.images) images = await chargerImage(fiche.visuel);
      } catch {
        images = undefined;
      }
    }
    const prompt = construirePrompt({ fiche, profil, verification, fichesSemaine, avecImage: !!images });
    let brute;
    try {
      brute = await sample.json(prompt, images ? { signal, images } : { signal });
    } catch (e) {
      if (e?.code === 'cancelled') return { ok: false, annule: true };
      return { ok: false, raison: messageErreurSample(e), indisponible: CODES_INDISPONIBLES.has(e?.code) };
    }
    const reponse = validerReponse(brute);
    if (!reponse.ok) return { ok: false, raison: 'La réponse de Claude était incomplète : réessaie. Rien n’a été modifié.' };
    const score = composerScore({ fiche, verification, jugement: reponse.jugement, versionProfil: profil.version, maintenant: horloge() });
    return { ok: true, score, jugement: reponse.jugement };
  }

  async function evaluerFiche(id, { signal } = {}) {
    if (!sample) return INDISPONIBLE;
    if (evaluationsEnCours.has(id)) return { ok: false, raison: 'Une évaluation est déjà en cours pour cette fiche.' };
    const f = trouver(id);
    if (!f) return { ok: false, raison: 'Fiche introuvable.' };
    evaluationsEnCours.add(id);
    try {
      const { fiches, profil } = etat.lire();
      const fz = profil.regles_studio.fuseau;
      const semaine = fichesDeLaSemaine(fiches, debutSemaine(f.date_heure, fz), fz);
      const resultat = await evaluerContenu(f, { signal, fichesSemaine: semaine });
      if (!resultat.ok) return resultat;
      const actuelle = trouver(id);
      if (!actuelle) return { ok: false, raison: 'La fiche a été supprimée pendant l’évaluation.' };
      const g = appliquerEvaluation(actuelle, {
        score: resultat.score,
        variantes: resultat.jugement.captions,
        suggestions: { accroches: resultat.jugement.accroches, hashtags: resultat.jugement.hashtags },
        recommandations: resultat.jugement.recommandations,
      }, horloge());
      remplacer(g);
      await ecrireMaintenant(g);
      return { ok: true, fiche: g };
    } finally {
      evaluationsEnCours.delete(id);
    }
  }
```

5. Ajouter `evaluerFiche,` à l'objet renvoyé.

Le test « supprimée pendant l'évaluation » repose sur `supprimerFiche`, qui retire la fiche de l'état : `trouver(id)` renvoie alors `undefined`.

- [ ] **Step 5 : brancher `sample` dans `app.js`**

Dans `src/interface/app.js`, après la ligne `const assets = …` :

```js
  const sample = (await claude.use('sample')) ?? null;
```

Passer `sample` à `creerControleur({ etat, depot, enregistreur, assets, horloge, sample })`, et remplacer `{ assets: !!assets }` par `{ assets: !!assets, sample: !!sample }` dans l'appel à `creerRendu`.

- [ ] **Step 6 : lancer les tests**

Run : `npx vitest run tests/interface/evaluation.test.js tests/interface/app.test.js`
Expected : PASS.
Run : `npm test`
Expected : PASS, sortie propre.

- [ ] **Step 7 : commit**

```bash
git add src/interface/controleur.js src/interface/app.js tests/interface/evaluation.test.js tests/interface/app.test.js
git commit -m "Évaluation : appel à Claude sur clic, score composé, rien d'écrit en cas d'échec"
```

---

### Task 5 : évaluation dans le panneau de fiche

**Files:**
- Modify : `src/interface/panneau-fiche.js`, `src/interface/styles.css`, `tests/interface/panneau-fiche.test.js`, `tests/interface/app.test.js`

**Interfaces:**
- Consumes :
  - `actions.evaluerFiche(id, { signal })` (Task 4) ;
  - `capacites.sample` (Task 4) ;
  - la forme du score (Task 2) ;
  - `fiche.variantes`, `fiche.suggestions`, `fiche.recommandations`.
- Produces : dans le panneau,
  - bouton « Évaluer », ou « Réévaluer » si la fiche a déjà un score, visible seulement si `capacites.sample` est vrai et que l'évaluation n'a pas été déclarée indisponible ;
  - pendant l'évaluation : bouton désactivé « Évaluation… » et bouton « Arrêter » ;
  - détail du score, conformité, alertes, recommandations ;
  - captions proposées, accroches et hashtags, chacun avec un bouton « Utiliser ».

- [ ] **Step 1 : écrire les tests**

Dans `tests/interface/panneau-fiche.test.js`, ajouter `empreinte` à l'import depuis `fiche.js`, puis ajouter à la fin :

```js
describe('évaluation dans le panneau', () => {
  const evaluee = () => {
    const f = fiche({ caption: 'Base.', visuel: 'a1' });
    return {
      ...f,
      score: {
        total: 72,
        criteres: [
          { cle: 'accroche', nom: 'Accroche et diffusion', points: 30, max: 40, phrase: 'Nette.' },
          { cle: 'voix', nom: 'Voix et esthétique', points: 22, max: 30, phrase: 'Juste.' },
          { cle: 'mecanique', nom: 'Mécanique de la caption', points: 20, max: 30, phrase: 'Correcte.' },
        ],
        conformite: { etat: 'vert', causes: [] }, alertes: ['Hors des créneaux recommandés du profil.'], empreinte: empreinte(f),
      },
      variantes: [{ role: 'engagement', texte: 'Variante A' }, { role: 'deadpan', texte: 'Variante B' }],
      suggestions: { accroches: ['Acc 1', 'Acc 2'], hashtags: ['nuit', 'socio'] },
      recommandations: ['R1', 'R2', 'R3'],
    };
  };

  it('masque « Évaluer » sans la capacité sample', () => {
    const p = panneauFiche(fiche(), fictif, actionsFactices(), { assets: true, sample: false });
    expect(bouton(p, 'Évaluer')).toBeUndefined();
  });

  it('lance l’évaluation, permet de l’arrêter, puis affiche le score', async () => {
    let signalRecu;
    let resoudre;
    const actions = { ...actionsFactices(), evaluerFiche: vi.fn((id, { signal }) => { signalRecu = signal; return new Promise(r => { resoudre = r; }); }) };
    const p = panneauFiche(fiche(), fictif, actions, { assets: true, sample: true });
    bouton(p, 'Évaluer').click();
    expect(actions.evaluerFiche).toHaveBeenCalledWith('f1', expect.objectContaining({ signal: expect.any(AbortSignal) }));
    expect(bouton(p, 'Évaluation…').disabled).toBe(true);
    bouton(p, 'Arrêter').click();
    expect(signalRecu.aborted).toBe(true);
    resoudre({ ok: true, fiche: evaluee() });
    await vi.waitFor(() => expect(p.textContent).toContain('Score : 72/100'));
    expect(p.textContent).toContain('Accroche et diffusion : 30/40. Nette.');
    expect(p.textContent).toContain('Hors des créneaux recommandés du profil.');
    expect(p.textContent).toContain('R3');
    expect(bouton(p, 'Réévaluer')).toBeDefined();
  });

  it('affiche la raison d’un échec et garde le bouton', async () => {
    const actions = { ...actionsFactices(), evaluerFiche: vi.fn(async () => ({ ok: false, raison: 'Trop de demandes à Claude pour le moment : réessaie un peu plus tard.' })) };
    const p = panneauFiche(fiche(), fictif, actions, { assets: true, sample: true });
    bouton(p, 'Évaluer').click();
    await vi.waitFor(() => expect(p.querySelector('.panneau-message').textContent).toBe('Trop de demandes à Claude pour le moment : réessaie un peu plus tard.'));
    expect(bouton(p, 'Évaluer')).toBeDefined();
  });

  it('retire le bouton quand l’évaluation est indisponible', async () => {
    const actions = { ...actionsFactices(), evaluerFiche: vi.fn(async () => ({ ok: false, raison: 'Indisponible.', indisponible: true })) };
    const p = panneauFiche(fiche(), fictif, actions, { assets: true, sample: true });
    bouton(p, 'Évaluer').click();
    await vi.waitFor(() => expect(p.querySelector('.panneau-message').textContent).toBe('Indisponible.'));
    expect(bouton(p, 'Évaluer')).toBeUndefined();
  });

  it('un arrêt affiche « Évaluation arrêtée. »', async () => {
    const actions = { ...actionsFactices(), evaluerFiche: vi.fn(async () => ({ ok: false, annule: true })) };
    const p = panneauFiche(fiche(), fictif, actions, { assets: true, sample: true });
    bouton(p, 'Évaluer').click();
    await vi.waitFor(() => expect(p.querySelector('.panneau-message').textContent).toBe('Évaluation arrêtée.'));
  });

  it('montre une conformité bloquante avec ses causes', () => {
    const f = evaluee();
    const rouge = { ...f, score: { ...f.score, total: 40, conformite: { etat: 'rouge', causes: ['mot à éviter « mindset »'] } } };
    const p = panneauFiche(rouge, fictif, actionsFactices(), { assets: true, sample: true });
    expect(p.textContent).toContain('Conformité : bloquante. mot à éviter « mindset »');
  });

  it('« Utiliser » applique une caption, une accroche ou les hashtags proposés', () => {
    const actions = actionsFactices();
    const p = panneauFiche(evaluee(), fictif, actions, { assets: true, sample: true });
    const utiliser = [...p.querySelectorAll('.suggestion button')];
    utiliser[0].click();
    expect(actions.modifierFiche).toHaveBeenCalledWith('f1', { caption: 'Variante A' });
    expect(p.querySelector('textarea[name="caption"]').value).toBe('Variante A');
    bouton(p, 'Utiliser ces hashtags').click();
    expect(actions.modifierFiche).toHaveBeenCalledWith('f1', { hashtags: ['nuit', 'socio'] });
    const accroche = [...p.querySelectorAll('.suggestion')].find(li => li.textContent.includes('Acc 2')).querySelector('button');
    accroche.click();
    expect(actions.modifierFiche).toHaveBeenCalledWith('f1', { accroche: 'Acc 2' });
  });
});
```

Dans `tests/interface/app.test.js`, ajouter :

```js
  it('propose « Évaluer » dans la fiche quand la capacité sample existe', async () => {
    const db = creerFausseBase();
    const sample = Object.assign(async () => ({}), { json: async () => ({}), limits: async () => ({}) });
    const racine = document.createElement('div');
    const app = await demarrer(racine, { use: async nom => (nom === 'db' ? db : nom === 'sample' ? sample : null) }, { horloge });
    await app.actions.importerProfil(JSON.stringify(fictif));
    await app.actions.creerFiche({ format: 'reel', date_heure: '2026-09-28T10:00:00.000Z' });
    expect([...racine.querySelectorAll('button')].some(b => b.textContent === 'Évaluer')).toBe(true);
  });
```

- [ ] **Step 2 : lancer les tests pour vérifier qu'ils échouent**

Run : `npx vitest run tests/interface/panneau-fiche.test.js tests/interface/app.test.js`
Expected : FAIL (boutons absents).

- [ ] **Step 3 : implémenter dans le panneau**

Dans `src/interface/panneau-fiche.js` :

1. Sous la constante `ROLES`, ajouter :

```js
const LIBELLES_ROLE = { engagement: 'Engagement', cta: "Appel à l'action", deadpan: 'Deadpan' };
const LIBELLES_CONFORMITE = { vert: 'conforme', orange: 'à surveiller', rouge: 'bloquante' };
```

2. Dans `panneauFiche`, près de `let elementStatut = null;` :

```js
  let elementScore = null;
  let evaluationDisponible = capacites.sample === true;
  let controleurEvaluation = null;
  const remplacerScore = () => {
    const nouveau = sectionScore();
    elementScore.replaceWith(nouveau);
    elementScore = nouveau;
  };

  async function evaluer() {
    controleurEvaluation = new AbortController();
    remplacerScore();
    afficher('Évaluation en cours : cela peut prendre jusqu’à une minute.');
    const resultat = await actions.evaluerFiche(id, { signal: controleurEvaluation.signal });
    controleurEvaluation = null;
    if (resultat.ok) {
      const { score, variantes, suggestions, recommandations } = resultat.fiche;
      brouillon = { ...brouillon, score, variantes, suggestions, recommandations };
      remplacerScore();
      afficher('Évaluation terminée.');
      return;
    }
    if (resultat.indisponible) evaluationDisponible = false;
    remplacerScore();
    afficher(resultat.annule ? 'Évaluation arrêtée.' : resultat.raison);
  }

  const utiliser = (changements, messageFait) => {
    changer(changements);
    construire();
    afficher(messageFait);
  };
```

3. Remplacer entièrement `sectionScore` par :

```js
  const sectionScore = () => {
    const s = brouillon.score;
    const enfants = [h('h3', {}, s ? `Score : ${s.total}/100` : 'Score')];
    if (!s) enfants.push(h('p', { class: 'aide' }, 'Pas encore évaluée.'));
    if (s) {
      if (aReevaluer(brouillon)) enfants.push(h('p', { class: 'aide' }, 'La fiche a changé depuis son évaluation : réévalue-la.'));
      const etat = s.conformite?.etat;
      const causes = s.conformite?.causes ?? [];
      enfants.push(h('p', { class: `conformite conformite-${etat}` },
        `Conformité : ${LIBELLES_CONFORMITE[etat] ?? 'non évaluée'}.`, causes.length ? ` ${causes.join(' ; ')}` : ''));
      enfants.push(h('ul', { class: 'criteres' }, (s.criteres ?? []).map(c => h('li', {}, `${c.nom} : ${c.points}/${c.max}. ${c.phrase ?? ''}`))));
      if (s.alertes?.length) enfants.push(h('ul', { class: 'alertes' }, s.alertes.map(a => h('li', {}, a))));
    }
    if (brouillon.recommandations?.length) {
      enfants.push(h('h4', {}, 'Recommandations'), h('ol', { class: 'recommandations' }, brouillon.recommandations.map(r => h('li', {}, r))));
    }
    if (brouillon.variantes?.length) {
      enfants.push(h('h4', {}, 'Captions proposées'), h('ul', { class: 'suggestions' }, brouillon.variantes.map(v => h('li', { class: 'suggestion' },
        h('span', { class: 'suggestion-role' }, LIBELLES_ROLE[v.role] ?? v.role), h('span', { class: 'suggestion-texte' }, v.texte),
        h('button', { type: 'button', class: 'bouton-lien', onclick: () => utiliser({ caption: v.texte }, 'Caption remplacée.') }, 'Utiliser')))));
    }
    if (brouillon.suggestions?.accroches?.length) {
      enfants.push(h('h4', {}, 'Accroches proposées'), h('ul', { class: 'suggestions' }, brouillon.suggestions.accroches.map(a => h('li', { class: 'suggestion' },
        h('span', { class: 'suggestion-texte' }, a),
        h('button', { type: 'button', class: 'bouton-lien', onclick: () => utiliser({ accroche: a }, 'Accroche remplacée.') }, 'Utiliser')))));
    }
    if (brouillon.suggestions?.hashtags?.length) {
      enfants.push(h('p', { class: 'suggestion-hashtags' }, formaterHashtags(brouillon.suggestions.hashtags), ' ',
        h('button', { type: 'button', class: 'bouton-lien', onclick: () => utiliser({ hashtags: brouillon.suggestions.hashtags }, 'Hashtags remplacés.') }, 'Utiliser ces hashtags')));
    }
    if (evaluationDisponible) {
      enfants.push(controleurEvaluation
        ? h('div', { class: 'evaluation-actions' },
          h('button', { type: 'button', class: 'bouton-principal', disabled: true }, 'Évaluation…'),
          h('button', { type: 'button', class: 'bouton-secondaire', onclick: () => controleurEvaluation?.abort() }, 'Arrêter'))
        : h('div', { class: 'evaluation-actions' },
          h('button', { type: 'button', class: 'bouton-principal', onclick: evaluer }, s ? 'Réévaluer' : 'Évaluer')));
    }
    return h('section', { class: 'score' }, enfants);
  };
```

4. Dans `construire()`, remplacer `sectionScore()` par `elementScore = sectionScore()`, placé avant `racine.replaceChildren(…)`, puis utiliser `elementScore` dans la liste passée à `racine.replaceChildren(…)`.

Avec `construire()`, le bouton « Utiliser » reconstruit tout le panneau. La zone de caption reçoit ainsi la nouvelle valeur (`brouillon` a été mis à jour par `changer`).

- [ ] **Step 4 : ajouter les styles**

À la fin de `src/interface/styles.css` :

```css
/* Évaluation */
.score h4 { margin: 10px 0 4px; font-size: 13px; text-transform: uppercase; letter-spacing: .04em; color: var(--texte-2); }
.conformite { margin: 4px 0; padding: 4px 8px; border-radius: 6px; border-left: 4px solid var(--etat, var(--trait)); background: var(--surface-2); font-size: 14px; }
.conformite-vert { --etat: var(--vert); } .conformite-orange { --etat: var(--orange); } .conformite-rouge { --etat: var(--rouge); font-weight: 600; }
.criteres, .alertes, .recommandations, .suggestions { margin: 0; padding-left: 18px; font-size: 14px; display: grid; gap: 4px; }
.alertes { color: var(--orange); }
.suggestions { list-style: none; padding-left: 0; }
.suggestion { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 4px 8px; align-items: start; padding: 6px 8px; background: var(--surface-2); border-radius: 6px; }
.suggestion-role { grid-column: 1 / -1; font-size: 12px; font-weight: 600; color: var(--texte-2); }
.suggestion-texte { white-space: pre-wrap; overflow-wrap: anywhere; }
.suggestion-hashtags { font-family: var(--mono); font-size: 13px; margin: 4px 0; overflow-wrap: anywhere; }
.evaluation-actions { display: flex; gap: 8px; margin-top: 10px; flex-wrap: wrap; }
```

- [ ] **Step 5 : lancer les tests**

Run : `npx vitest run tests/interface/panneau-fiche.test.js tests/interface/app.test.js`
Expected : PASS.
Run : `npm test`
Expected : PASS, sortie propre.

- [ ] **Step 6 : commit**

```bash
git add src/interface/panneau-fiche.js src/interface/styles.css tests/interface/panneau-fiche.test.js tests/interface/app.test.js
git commit -m "Panneau : Évaluer, Arrêter, détail du score et suggestions à utiliser"
```

---

### Task 6 : jeu de référence

**Files:**
- Create : `src/logique/reference.js`, `tests/logique/reference.test.js`, `exemples/reference-fictive.json`, `tests/interface/reference.test.js`
- Modify : `src/donnees/depot.js`, `tests/donnees/depot.test.js`, `src/interface/controleur.js`, `src/interface/app.js`, `src/interface/rendu.js`, `src/interface/vue-profil.js`, `src/interface/styles.css`

**Interfaces:**
- Consumes : `FORMATS`, `nouvelleFiche` (`fiche.js`) ; `depuisSaisieLocale` (`dates.js`) ; `evaluerContenu`, interne au contrôleur (Task 4).
- Produces :
  - dans `reference.js` : `SEUIL_CLASSEMENT` (0.8), `validerReference(liste)` → `{ ok, erreurs, items? }`, `ficheDeReference(item, regles)` → `Fiche`, `verifierClassement(resultats)` → `{ taux, paires, ok, inversions: [{ gagnant, perdant }] }` ;
  - dans le dépôt : `ecouterReference(rappel, erreur)`, `remplacerReference(items, anciens)`, `ecouterResultatReference(rappel, erreur)`, `enregistrerResultatReference(bilan)` ;
  - dans le contrôleur : `importerReference(texte)` → `{ ok, erreurs, nombre? }`, `verifierReference()` → `{ ok, bilan? , raison?, annule? }`, `arreterReference()` ;
  - état : `reference: []`, `resultatReference: null`, `verificationReference: null | { fait, total }` ;
  - `vueProfil(etat, actions, capacites)`.

- [ ] **Step 1 : créer le jeu fictif**

`exemples/reference-fictive.json` :

```json
[
  { "format": "reel", "pilier": "nuit", "resultat": "gagnant", "accroche": "Personne ne m'attire. Sauf celui qui part avant la fin du set.", "caption": "Team « il reste » ou team « il file » ?", "hashtags": ["nuit", "club", "paris"] },
  { "format": "reel", "pilier": "socio", "resultat": "gagnant", "accroche": "Ce que ta façon de répondre en trois jours dit de toi.", "caption": "Tu sais qui envoyer. Envoie-lui.", "hashtags": ["socio", "dating", "humour"] },
  { "format": "carrousel", "pilier": "humour_sec", "resultat": "gagnant", "accroche": "Mon défaut préféré ? Avoir raison en retard.", "caption": "Complète : elle est le genre de fille qui ___", "hashtags": ["humour", "ironie", "paris"] },
  { "format": "reel", "pilier": "nuit", "resultat": "perdant", "accroche": "I want soul to soul, not skin to skin", "caption": "Bonne soirée à tous", "hashtags": ["love"] },
  { "format": "post", "pilier": "socio", "resultat": "perdant", "accroche": "Journée plage", "caption": "Belle journée ensoleillée à la plage avec mes amis, profitez bien de la vie", "hashtags": ["summer", "beach", "happy", "love", "friends", "sun", "vibes"] },
  { "format": "reel", "pilier": "humour_sec", "resultat": "perdant", "accroche": "Je ne sais pas qui a besoin d'entendre ça mais sois bienveillant avec toi-même aujourd'hui car tu le mérites vraiment", "caption": "Link in bio pour plus de mindset", "hashtags": ["mindset", "motivation", "bienveillance"] }
]
```

- [ ] **Step 2 : écrire les tests de la logique**

`tests/logique/reference.test.js` :

```js
import { describe, it, expect } from 'vitest';
import fictif from '../../exemples/profil-fictif.json';
import jeu from '../../exemples/reference-fictive.json';
import { validerReference, ficheDeReference, verifierClassement, SEUIL_CLASSEMENT } from '../../src/logique/reference.js';

describe('validerReference', () => {
  it('accepte le jeu fictif et numérote les contenus', () => {
    const r = validerReference(jeu);
    expect(r.ok).toBe(true);
    expect(r.items).toHaveLength(6);
    expect(r.items[0]).toMatchObject({ id: 'r1', format: 'reel', resultat: 'gagnant', pilier: 'nuit' });
  });
  it('refuse ce qui n’est pas une liste', () => {
    expect(validerReference({})).toEqual({ ok: false, erreurs: ['Le jeu de référence doit être une liste JSON.'] });
  });
  it('explique chaque élément invalide', () => {
    expect(validerReference([{ format: 'tiktok', resultat: 'moyen', accroche: '' }]).erreurs).toEqual([
      'Élément 1 : format inconnu.', 'Élément 1 : resultat doit valoir gagnant ou perdant.', 'Élément 1 : accroche manquante.',
    ]);
  });
  it('exige au moins un gagnant et un perdant, et 20 contenus au plus', () => {
    expect(validerReference([jeu[0]]).erreurs).toEqual(['Il faut au moins un contenu gagnant et un contenu perdant.']);
    expect(validerReference(Array.from({ length: 21 }, (_, i) => jeu[i % 6])).erreurs)
      .toContain('20 contenus au maximum (chaque vérification lance une évaluation par contenu).');
  });
});

describe('ficheDeReference', () => {
  it('place le contenu dans le premier créneau du profil', () => {
    const f = ficheDeReference(validerReference(jeu).items[0], fictif.regles_studio);
    expect(f).toMatchObject({ id: 'ref-r1', format: 'reel', date_heure: '2026-01-05T11:00:00.000Z', accroche: jeu[0].accroche, hashtags: jeu[0].hashtags });
  });
});

describe('verifierClassement', () => {
  it('compte les paires bien classées et liste les inversions', () => {
    const r = verifierClassement([
      { id: 'g1', resultat: 'gagnant', total: 80 }, { id: 'g2', resultat: 'gagnant', total: 50 },
      { id: 'p1', resultat: 'perdant', total: 40 }, { id: 'p2', resultat: 'perdant', total: 60 },
    ]);
    expect(r).toEqual({ taux: 0.75, paires: 4, ok: false, inversions: [{ gagnant: 'g2', perdant: 'p2' }] });
    expect(SEUIL_CLASSEMENT).toBe(0.8);
  });
  it('une égalité compte comme une inversion ; sans paire, rien n’est validé', () => {
    expect(verifierClassement([{ id: 'g', resultat: 'gagnant', total: 50 }, { id: 'p', resultat: 'perdant', total: 50 }]).ok).toBe(false);
    expect(verifierClassement([{ id: 'g', resultat: 'gagnant', total: 50 }])).toEqual({ taux: 0, paires: 0, ok: false, inversions: [] });
  });
});
```

- [ ] **Step 3 : écrire les tests du dépôt**

Ajouter à `tests/donnees/depot.test.js` :

```js
describe('jeu de référence', () => {
  it('remplace le jeu en supprimant les contenus retirés, et garde le dernier bilan', async () => {
    const db = creerFausseBase();
    const depot = creerDepot(db);
    const vus = [];
    depot.ecouterReference(liste => vus.push(liste));
    await depot.remplacerReference([{ id: 'r1', accroche: 'a' }, { id: 'r2', accroche: 'b' }], []);
    await depot.remplacerReference([{ id: 'r1', accroche: 'c' }], vus.at(-1));
    expect(vus.at(-1)).toEqual([{ id: 'r1', accroche: 'c' }]);
    const bilans = [];
    depot.ecouterResultatReference(b => bilans.push(b));
    expect(bilans[0]).toBeNull();
    await depot.enregistrerResultatReference({ taux: 1, ok: true });
    expect(bilans.at(-1)).toEqual({ taux: 1, ok: true });
  });
});
```

- [ ] **Step 4 : écrire les tests du contrôleur et de la vue**

`tests/interface/reference.test.js` :

```js
// @vitest-environment happy-dom
import { describe, it, expect, vi } from 'vitest';
import fictif from '../../exemples/profil-fictif.json';
import jeu from '../../exemples/reference-fictive.json';
import { creerFausseBase } from '../aides/fausseBase.js';
import { creerDepot } from '../../src/donnees/depot.js';
import { creerEnregistreur } from '../../src/donnees/enregistreur.js';
import { creerEtat } from '../../src/interface/etat.js';
import { creerControleur } from '../../src/interface/controleur.js';
import { vueProfil } from '../../src/interface/vue-profil.js';

const T = '2026-09-28T08:00:00.000Z';
const note = n => ({
  notes: { accroche: n, voix: n, mecanique: n }, phrases: { accroche: 'a', voix: 'v', mecanique: 'm' },
  conformite: { etat: 'vert', causes: [] }, captions: [{ role: 'engagement', texte: 'x' }, { role: 'deadpan', texte: 'y' }],
  accroches: ['a', 'b'], hashtags: ['h'], recommandations: ['1', '2', '3'],
});
const gagnants = new Set(jeu.filter(i => i.resultat === 'gagnant').map(i => i.accroche));
const sampleClasseur = () => Object.assign(vi.fn(), {
  limits: async () => ({}),
  json: vi.fn(async prompt => note([...gagnants].some(a => prompt.includes(a)) ? 9 : 3)),
});

function monter(sample = sampleClasseur()) {
  const db = creerFausseBase();
  const depot = creerDepot(db);
  const etat = creerEtat({ profil: { ...fictif, version: 1 }, fiches: [], vue: 'profil', ancre: T, ficheOuverte: null, erreur: null, sauvegarde: 'ok', reference: [], resultatReference: null, verificationReference: null });
  depot.ecouterReference(reference => etat.modifier({ reference }));
  depot.ecouterResultatReference(resultatReference => etat.modifier({ resultatReference }));
  const actions = creerControleur({ etat, depot, enregistreur: creerEnregistreur(f => depot.enregistrerFiche(f), 600), assets: null, horloge: () => T, sample });
  return { db, etat, actions, sample };
}

describe('jeu de référence (contrôleur)', () => {
  it('importe un jeu valide et refuse un JSON invalide', async () => {
    const { etat, actions } = monter();
    expect((await actions.importerReference('{oups')).erreurs[0]).toMatch(/^Ce texte n’est pas du JSON valide/);
    expect(await actions.importerReference(JSON.stringify(jeu))).toEqual({ ok: true, erreurs: [], nombre: 6 });
    expect(etat.lire().reference).toHaveLength(6);
  });

  it('vérifie le classement et enregistre le bilan', async () => {
    const { db, etat, actions, sample } = monter();
    await actions.importerReference(JSON.stringify(jeu));
    const r = await actions.verifierReference();
    expect(r.ok).toBe(true);
    expect(r.bilan).toMatchObject({ taux: 1, paires: 9, ok: true, version_profil: 1, verifie_le: T });
    expect(sample.json).toHaveBeenCalledTimes(6);
    expect(db._docs.get('reference_resultats/dernier')).toMatchObject({ taux: 1, ok: true });
    expect(etat.lire().verificationReference).toBeNull();
  });

  it('s’arrête à la première erreur, l’affiche et n’enregistre pas de bilan', async () => {
    const sample = Object.assign(vi.fn(), { limits: async () => ({}), json: vi.fn().mockResolvedValueOnce(note(9)).mockRejectedValueOnce({ code: 'rate_limited', message: 'x' }) });
    const { db, etat, actions } = monter(sample);
    await actions.importerReference(JSON.stringify(jeu));
    expect(await actions.verifierReference()).toEqual({ ok: false, raison: 'Trop de demandes à Claude pour le moment : réessaie un peu plus tard.' });
    expect(sample.json).toHaveBeenCalledTimes(2);
    expect(etat.lire().erreur).toBe('Trop de demandes à Claude pour le moment : réessaie un peu plus tard.');
    expect(db._docs.has('reference_resultats/dernier')).toBe(false);
  });

  it('peut être arrêtée', async () => {
    const sample = Object.assign(vi.fn(), {
      limits: async () => ({}),
      json: vi.fn((prompt, { signal }) => new Promise((ok, ko) => signal.addEventListener('abort', () => ko({ code: 'cancelled', message: 'x' })))),
    });
    const { etat, actions } = monter(sample);
    await actions.importerReference(JSON.stringify(jeu));
    const enCours = actions.verifierReference();
    await vi.waitFor(() => expect(sample.json).toHaveBeenCalledTimes(1));
    actions.arreterReference();
    expect(await enCours).toEqual({ ok: false, annule: true });
    expect(etat.lire().erreur).toBeNull();
  });

  it('refuse sans jeu importé ou sans Claude', async () => {
    expect(await monter().actions.verifierReference()).toEqual({ ok: false, raison: 'Importe d’abord un jeu de référence.' });
    expect((await monter(null).actions.verifierReference()).raison).toBe('L’évaluation par Claude n’est pas disponible dans cette vue.');
  });
});

describe('jeu de référence (vue Profil)', () => {
  const etatVue = extra => ({ profil: { ...fictif, version: 1, importe_le: T }, reference: [], resultatReference: null, verificationReference: null, ...extra });
  const actions = () => ({ importerProfil: vi.fn(), importerReference: vi.fn(async () => ({ ok: true, erreurs: [], nombre: 6 })), verifierReference: vi.fn(async () => ({ ok: true })), arreterReference: vi.fn() });
  const items = jeu.map((i, n) => ({ ...i, id: `r${n + 1}` }));

  it('résume le jeu et propose la vérification seulement avec Claude', () => {
    const a = actions();
    const avec = vueProfil(etatVue({ reference: items }), a, { sample: true });
    expect(avec.textContent).toContain('6 contenus (3 gagnants, 3 perdants)');
    const lancer = [...avec.querySelectorAll('button')].find(b => b.textContent.startsWith('Vérifier le classement'));
    expect(lancer.textContent).toBe('Vérifier le classement (6 évaluations sur ton compte Claude)');
    lancer.click();
    expect(a.verifierReference).toHaveBeenCalled();
    const sans = vueProfil(etatVue({ reference: items }), actions(), { sample: false });
    expect([...sans.querySelectorAll('button')].some(b => b.textContent.startsWith('Vérifier le classement'))).toBe(false);
  });

  it('affiche la progression, le bouton Arrêter et le dernier bilan', () => {
    const a = actions();
    const el = vueProfil(etatVue({
      reference: items, verificationReference: { fait: 2, total: 6 },
      resultatReference: { taux: 0.75, ok: false, paires: 4, inversions: [{ gagnant: 'r2', perdant: 'r4' }], resultats: [{ id: 'r2', accroche: 'G2' }, { id: 'r4', accroche: 'P4' }], version_profil: 1, verifie_le: T },
    }), a, { sample: true });
    expect(el.textContent).toContain('Vérification en cours : 2/6');
    [...el.querySelectorAll('button')].find(b => b.textContent === 'Arrêter').click();
    expect(a.arreterReference).toHaveBeenCalled();
    expect(el.textContent).toContain('75 % des paires bien classées (seuil 80 %) : à recalibrer.');
    expect(el.textContent).toContain('« G2 » n’est pas au-dessus de « P4 »');
  });

  it('importe un jeu collé', async () => {
    const a = actions();
    const el = vueProfil(etatVue(), a, { sample: true });
    el.querySelector('#reference-json').value = JSON.stringify(jeu);
    [...el.querySelectorAll('button')].find(b => b.textContent === 'Importer ce jeu').click();
    await vi.waitFor(() => expect(a.importerReference).toHaveBeenCalledWith(JSON.stringify(jeu)));
  });
});
```

- [ ] **Step 5 : lancer les tests pour vérifier qu'ils échouent**

Run : `npx vitest run tests/logique/reference.test.js tests/donnees/depot.test.js tests/interface/reference.test.js`
Expected : FAIL.

- [ ] **Step 6 : implémenter la logique**

`src/logique/reference.js` :

```js
import { FORMATS, nouvelleFiche } from './fiche.js';
import { depuisSaisieLocale } from './dates.js';

export const SEUIL_CLASSEMENT = 0.8;
const RESULTATS = ['gagnant', 'perdant'];
const MAXIMUM = 20;

export function validerReference(liste) {
  if (!Array.isArray(liste)) return { ok: false, erreurs: ['Le jeu de référence doit être une liste JSON.'] };
  const erreurs = [];
  liste.forEach((item, i) => {
    const n = i + 1;
    if (!item || typeof item !== 'object' || Array.isArray(item)) { erreurs.push(`Élément ${n} : objet attendu.`); return; }
    if (!FORMATS.includes(item.format)) erreurs.push(`Élément ${n} : format inconnu.`);
    if (!RESULTATS.includes(item.resultat)) erreurs.push(`Élément ${n} : resultat doit valoir gagnant ou perdant.`);
    if (typeof item.accroche !== 'string' || !item.accroche.trim()) erreurs.push(`Élément ${n} : accroche manquante.`);
  });
  if (!erreurs.length && (!liste.some(i => i.resultat === 'gagnant') || !liste.some(i => i.resultat === 'perdant'))) {
    erreurs.push('Il faut au moins un contenu gagnant et un contenu perdant.');
  }
  if (liste.length > MAXIMUM) erreurs.push(`${MAXIMUM} contenus au maximum (chaque vérification lance une évaluation par contenu).`);
  if (erreurs.length) return { ok: false, erreurs };
  return {
    ok: true,
    erreurs: [],
    items: liste.map((item, i) => ({
      id: `r${i + 1}`, format: item.format, pilier: item.pilier ?? '', accroche: item.accroche.trim(),
      caption: item.caption ?? '', hashtags: Array.isArray(item.hashtags) ? item.hashtags : [], resultat: item.resultat,
    })),
  };
}

export function ficheDeReference(item, regles) {
  const creneau = regles.creneaux[0];
  const jour = `2026-01-${String(4 + (creneau?.jours[0] ?? 1)).padStart(2, '0')}`;
  const date_heure = depuisSaisieLocale(jour, creneau?.debut ?? '12:00', regles.fuseau);
  return {
    ...nouvelleFiche({ id: `ref-${item.id}`, format: item.format, date_heure, pilier: item.pilier, maintenant: date_heure }),
    accroche: item.accroche, caption: item.caption, hashtags: item.hashtags,
  };
}

export function verifierClassement(resultats) {
  const gagnants = resultats.filter(r => r.resultat === 'gagnant');
  const perdants = resultats.filter(r => r.resultat === 'perdant');
  const inversions = [];
  let paires = 0;
  for (const g of gagnants) {
    for (const p of perdants) {
      paires++;
      if (g.total <= p.total) inversions.push({ gagnant: g.id, perdant: p.id });
    }
  }
  const taux = paires ? (paires - inversions.length) / paires : 0;
  return { taux, paires, ok: paires > 0 && taux >= SEUIL_CLASSEMENT, inversions };
}
```

Le 5 janvier 2026 est un lundi, donc `4 + jour` donne la date de ce jour de semaine dans cette semaine-là.

- [ ] **Step 7 : implémenter le dépôt**

Dans `src/donnees/depot.js`, ajouter à l'objet renvoyé :

```js
    ecouterReference(rappel, erreur) {
      return db.collection('reference').onSnapshot(snap => rappel(snap.docs.map(d => ({ id: d.id, ...d.data() }))), erreur);
    },

    async remplacerReference(items, anciens = []) {
      for (const ancien of anciens) {
        if (!items.some(i => i.id === ancien.id)) await db.doc(`reference/${ancien.id}`).delete();
      }
      for (const { id, ...corps } of items) await db.doc(`reference/${id}`).set(corps);
    },

    ecouterResultatReference(rappel, erreur) {
      return db.doc('reference_resultats/dernier').onSnapshot(s => rappel(s.exists ? s.data() : null), erreur);
    },

    async enregistrerResultatReference(bilan) {
      await db.doc('reference_resultats/dernier').set(bilan);
    },
```

- [ ] **Step 8 : implémenter le contrôleur**

Dans `src/interface/controleur.js`, importer `validerReference`, `ficheDeReference` et `verifierClassement` depuis `../logique/reference.js`. Ajouter ensuite dans `creerControleur`, après `evaluerFiche` :

```js
  let controleurReference = null;

  async function importerReference(texte) {
    let liste;
    try {
      liste = JSON.parse(texte);
    } catch (e) {
      return { ok: false, erreurs: [`Ce texte n’est pas du JSON valide : ${e.message}`] };
    }
    const verification = validerReference(liste);
    if (!verification.ok) return verification;
    try {
      await depot.remplacerReference(verification.items, etat.lire().reference ?? []);
      return { ok: true, erreurs: [], nombre: verification.items.length };
    } catch {
      return { ok: false, erreurs: ['L’import a échoué : la base du studio ne répond pas. Réessaie dans un instant.'] };
    }
  }

  async function verifierReference() {
    if (!sample) return INDISPONIBLE;
    const { profil, reference = [] } = etat.lire();
    if (!reference.length) return { ok: false, raison: 'Importe d’abord un jeu de référence.' };
    if (controleurReference) return { ok: false, raison: 'Une vérification est déjà en cours.' };
    controleurReference = new AbortController();
    const resultats = [];
    etat.modifier({ verificationReference: { fait: 0, total: reference.length }, erreur: null });
    try {
      for (const item of reference) {
        const r = await evaluerContenu(ficheDeReference(item, profil.regles_studio), { signal: controleurReference.signal, fichesSemaine: [] });
        if (!r.ok) {
          if (r.annule) return { ok: false, annule: true };
          etat.modifier({ erreur: r.raison });
          return { ok: false, raison: r.raison };
        }
        resultats.push({ id: item.id, resultat: item.resultat, total: r.score.total, accroche: item.accroche });
        etat.modifier({ verificationReference: { fait: resultats.length, total: reference.length } });
      }
      const bilan = { ...verifierClassement(resultats), resultats, version_profil: profil.version, verifie_le: horloge() };
      try {
        await depot.enregistrerResultatReference(bilan);
      } catch {
        etat.modifier({ erreur: 'Le bilan n’a pas pu être enregistré : réessaie dans un instant.' });
      }
      return { ok: true, bilan };
    } finally {
      controleurReference = null;
      etat.modifier({ verificationReference: null });
    }
  }
```

Ajouter à l'objet renvoyé : `importerReference`, `verifierReference` et `arreterReference: () => controleurReference?.abort()`.

- [ ] **Step 9 : brancher l'état, le rendu et la vue Profil**

1. Dans `src/interface/app.js`, ajouter `reference: [], resultatReference: null, verificationReference: null` à l'état initial. Après `depot.ecouterProfil(…)`, ajouter :

```js
  depot.ecouterReference(reference => etat.modifier({ reference }), err => etat.modifier({ erreur: messageErreurBase(err) }));
  depot.ecouterResultatReference(resultatReference => etat.modifier({ resultatReference }), err => etat.modifier({ erreur: messageErreurBase(err) }));
```

2. Dans `src/interface/rendu.js` :
   - `contenuVue(e, actions, capacites)` appelle `vueProfil(e, actions, capacites)` ;
   - l'appel devient `contenuVue(e2, actions, capacites)` ;
   - le mémo compare aussi `reference`, `resultatReference` et `verificationReference`. Ajoute-les à la condition de reconstruction de la vue et à l'objet `memo`.

3. Dans `src/interface/vue-profil.js`, changer la signature en `vueProfil({ profil, reference = [], resultatReference = null, verificationReference = null }, actions, capacites = {})`. Quand `profil` existe, ajouter `sectionReference(…)` après la section d'import du profil, avec la fonction :

```js
function sectionReference({ reference, resultatReference, verificationReference }, actions, capacites) {
  const zone = h('textarea', { id: 'reference-json', rows: 8, placeholder: 'Colle ici la liste JSON des contenus de référence (voir exemples/reference-fictive.json).' });
  const erreurs = h('ul', { class: 'erreurs', 'aria-live': 'polite' });
  const message = h('p', { class: 'aide', role: 'status' });
  const gagnants = reference.filter(i => i.resultat === 'gagnant').length;
  const perdants = reference.filter(i => i.resultat === 'perdant').length;
  const importer = async () => {
    erreurs.replaceChildren();
    message.textContent = '';
    const r = await actions.importerReference(zone.value);
    if (!r.ok) erreurs.replaceChildren(...r.erreurs.map(m => h('li', {}, m)));
    else message.textContent = `${r.nombre} contenus importés.`;
  };
  let commande = null;
  if (capacites.sample && reference.length) {
    commande = verificationReference
      ? h('div', { class: 'evaluation-actions' },
        h('p', { class: 'aide' }, `Vérification en cours : ${verificationReference.fait}/${verificationReference.total}`),
        h('button', { type: 'button', class: 'bouton-secondaire', onclick: () => actions.arreterReference() }, 'Arrêter'))
      : h('button', { type: 'button', class: 'bouton-principal', onclick: () => actions.verifierReference() },
        `Vérifier le classement (${reference.length} évaluations sur ton compte Claude)`);
  }
  return h('section', { class: 'reference' },
    h('h2', {}, 'Jeu de référence'),
    h('p', { class: 'aide' }, `${reference.length} contenus (${gagnants} gagnants, ${perdants} perdants). Le score doit classer les gagnants au-dessus des perdants.`),
    resultatReference ? bilanReference(resultatReference) : h('p', { class: 'aide' }, 'Pas encore vérifié.'),
    commande,
    h('label', { class: 'champ' }, h('span', { class: 'champ-libelle' }, 'Remplacer le jeu (JSON)'), zone),
    h('button', { type: 'button', class: 'bouton-secondaire', onclick: importer }, 'Importer ce jeu'),
    erreurs, message);
}

function bilanReference(b) {
  const accroche = id => b.resultats?.find(r => r.id === id)?.accroche ?? id;
  const date = new Date(b.verifie_le).toLocaleString('fr-FR');
  return h('div', { class: b.ok ? 'bilan bilan-ok' : 'bilan bilan-ko' },
    h('p', {}, `${Math.round(b.taux * 100)} % des paires bien classées (seuil 80 %) : ${b.ok ? 'calibration correcte' : 'à recalibrer'}. Vérifié le ${date}, profil version ${b.version_profil}.`),
    b.inversions?.length
      ? h('ul', {}, b.inversions.map(i => h('li', {}, `« ${accroche(i.gagnant)} » n’est pas au-dessus de « ${accroche(i.perdant)} »`)))
      : null);
}
```

4. Ajouter à `src/interface/styles.css` :

```css
.reference { display: grid; gap: 10px; }
.bilan { border-left: 4px solid var(--etat); padding: 6px 10px; background: var(--surface-2); border-radius: 6px; }
.bilan p { margin: 0; }
.bilan ul { margin: 6px 0 0; padding-left: 18px; font-size: 14px; }
.bilan-ok { --etat: var(--vert); } .bilan-ko { --etat: var(--rouge); }
```

- [ ] **Step 10 : lancer les tests**

Run : `npx vitest run tests/logique/reference.test.js tests/donnees/depot.test.js tests/interface/reference.test.js`
Expected : PASS.
Run : `npm test`
Expected : PASS, sortie propre (les tests existants de la vue Profil et du rendu restent verts).

- [ ] **Step 11 : commit**

```bash
git add src/logique/reference.js src/donnees/depot.js src/interface exemples/reference-fictive.json tests
git commit -m "Jeu de référence : import, vérification du classement, bilan"
```

---

### Task 7 : publication, studio réel et vérification

Cette tâche est faite par le contrôleur, qui dispose des outils `Artifact` et `ArtifactData`. Elle n'est pas confiée à un sous-agent.

**Files:**
- Modify (non versionné) : `.studio.local.json`
- Modify : `README.md` (Statut), `docs/superpowers/HANDOFF-brainstorming.md` (Reste à faire)

- [ ] **Step 1 : construire**

Run : `npm test && npm run build`
Expected : tous les tests PASS, puis `dist/studio.html (… Ko)`.

- [ ] **Step 2 : republier le studio de test avec `sample`**

Charger les skills `artifact-design` et `artifact-capabilities`. Republier `dist/studio.html` sur l'URL du studio de test (lue dans `.studio.local.json`, champ `test`) avec `capabilities: {"db": {}, "assets": {}, "sample": {}}`. Comme la déclaration de capacités est un ensemble complet, les trois doivent y figurer.

Semer le jeu fictif avec `ArtifactData` en `batch`, sur la collection `reference`, avec les documents `r1` à `r6` de `exemples/reference-fictive.json`, dans la forme produite par `validerReference`.

- [ ] **Step 3 : préparer le profil réel, hors du dépôt**

Lire le profil réel fourni par Jean (hors dépôt). En écrire une copie dans le scratchpad de session, **jamais dans le dépôt**, en y ajoutant le bloc `regles_studio`, déduit du profil :
- `fuseau` : le fuseau de l'utilisatrice indiqué dans le profil ;
- `piliers` : les clés des piliers validés, avec une couleur `#rrggbb` distincte par pilier ;
- `cadence` : la cadence hebdomadaire du profil ;
- `cta_ratio_max` : la part d'appels à l'action ;
- `roles_caption` : la rotation des rôles ;
- `ragebait_max` : le plafond hebdomadaire de ragebait ;
- `stories_porte` : le nombre de stories qui mènent à la porte ;
- `creneaux` : les jours et heures de pic ;
- `mots_a_eviter` : des termes courts et non ambigus, tirés de la liste des mots à éviter ;
- `hashtags` : la plage de hashtags ;
- `accroche_mots_max` : la longueur maximale de l'accroche.

Vérifier la copie avec `node -e` et `validerProfil` : le résultat doit être `ok: true`.

- [ ] **Step 4 : publier le studio réel**

Copier `dist/studio.html` dans un dossier du scratchpad (par exemple `studio-reel/studio.html`) pour obtenir une URL distincte. Publier cette copie comme un **nouvel** Artifact, avec :
- `icon` : `calendar` ;
- `description` : « Studio de planification Instagram, profil réel. » ;
- `capabilities` : `{"db": {}, "assets": {}, "sample": {}}`.

Noter l'URL dans `.studio.local.json`, champ `reel`.

- [ ] **Step 5 : semer le studio réel**

Avec `ArtifactData` :
- `set` sur `profil/courant`, avec la copie de l'étape 3, en passant `file_path`, et en ajoutant `version: 1` et `importe_le` à l'heure actuelle en ISO ;
- `batch` sur `reference` : une dizaine de contenus réels dont les résultats sont connus, tirés du profil réel (gagnants et perdants), dans la forme de `validerReference`.

Ces données ne vont que dans la base du studio réel.

Relire les deux collections avec `ArtifactData` (`list`) pour vérifier.

- [ ] **Step 6 : checklist à dérouler par Jean**

Le navigateur intégré n'est pas connecté à claude.ai : c'est Jean qui fait cette vérification. D'abord sur le studio de test :
1. Ouvrir une fiche, remplir l'accroche, la caption et les hashtags, ajouter un visuel, puis cliquer sur « Évaluer ». La demande d'autorisation de claude.ai apparaît, puis le score, les critères, la conformité, les captions, les accroches, les hashtags et les recommandations.
2. Cliquer sur « Utiliser » pour une caption. Elle remplace la caption, et la fiche passe « à réévaluer ».
3. Écrire un mot à éviter du profil dans la caption, puis réévaluer. La conformité passe au rouge, le score est plafonné à 40, et « Validé » est refusé avec la cause.
4. Lancer une évaluation, puis cliquer sur « Arrêter ». Le message « Évaluation arrêtée. » s'affiche.
5. Onglet Profil : cliquer sur « Vérifier le classement ». La progression s'affiche, puis le bilan.

Puis sur le studio réel :
6. Vérifier l'onglet Profil : version 1 et bon fuseau.
7. Lancer la vérification du jeu de référence et noter le taux.
8. Partager le studio avec la créatrice, en tant qu'Éditrice, depuis le menu Partager de la page.

- [ ] **Step 7 : mettre à jour le statut du projet**

Dans `README.md`, cocher « Plan 2 : évaluation par Claude et studio réel ». Dans `docs/superpowers/HANDOFF-brainstorming.md`, retirer le point 1 de « Reste à faire » et renuméroter.

- [ ] **Step 8 : commit**

```bash
git add README.md docs/superpowers/HANDOFF-brainstorming.md
git commit -m "Plan 2 livré : évaluation par Claude, studio réel publié"
```
