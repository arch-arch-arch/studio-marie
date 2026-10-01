# Plan 6 : confiance dans les données : plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Trois améliorations :
- dire ce que Claude a réellement examiné et pourquoi il recommande chaque correction ;
- adapter le tableau de bord aux petits volumes ;
- permettre d'exporter et de restaurer toute la base du studio.

**Architecture:**
- **A.** `src/claude/evaluation.js` produit une « demande » : le texte du prompt, plus ce qui a été envoyé. `src/logique/score.js` construit le bloc `examen` du score et ses libellés. Le contrôleur et la veille le remplissent, et le panneau l'affiche.
- **B.** `src/logique/tableau-bord.js` gagne des calculs par contenu et par format, ainsi qu'un seuil. `vue-tableau.js` les affiche avant les graphiques.
- **C.** `src/logique/sauvegarde.js`, en logique pure, construit et valide les exports. Le dépôt lit et écrit des documents quelconques. Le contrôleur exporte via la capacité `downloads` et restaure. L'onglet Profil gagne une section « Sauvegarde ».

**Tech Stack:** JavaScript (modules ES), DOM vanilla via `h()`, Vitest + happy-dom, esbuild ; capacités d'Artifact `db`, `assets`, `sample` et `downloads`.

**Spec:** `docs/superpowers/specs/2026-09-29-plan-6-confiance-design.md` (complète `docs/superpowers/specs/2026-09-27-studio-contenu-design.md`). Ce plan part de `main` (plans 1 à 5 fusionnés), sur la branche `plan-6-confiance`.

## Global Constraints

- **Dépôt privé et anonymisé :** aucune donnée réelle dans git. Les exports du studio réel ne vont jamais dans le dépôt.
- **Langue :** interface en français, au tutoiement, sans emoji, avec l'apostrophe typographique `’` dans les textes de l'interface.
- **`SEUIL_COMPARAISON = 5`** : nombre de contenus relevés dont le taux est calculable.
- **Format d'export :** `{ format: "studio-contenu-export", version: 1, exporte_le, note, collections }`. Chaque document s'écrit `{ id, data }`, et `COLLECTIONS_EXPORT` est la seule source de vérité.
- **Restauration :** réécrit par `set` les documents du fichier, et ne supprime jamais rien.
- **Pas de dépendance nouvelle.** `Element.replaceChildren` natif n'aplatit pas les tableaux et affiche `null` en texte : ne lui passer que des nœuds, dépliés et filtrés. `h()` aplatit et ignore `null` et `false`.
- **Commits :** chaque commit se termine par une ligne `Co-Authored-By:` qui nomme le modèle auteur.

## Écarts assumés et précisions

- **Prompt :** plutôt que de changer ce que renvoie `construirePrompt`, on ajoute `construireDemande(...)`, qui renvoie `{ texte, sections_profil, contenus_semaine }`. `construirePrompt(...)` reste disponible et renvoie `construireDemande(...).texte`, ce qui évite de réécrire les tests existants.
- **`composerScore` :** il n'ajoute `examen` au score que s'il le reçoit. Les scores de test existants restent donc identiques.
- **Recommandations :** elles sont enregistrées sous forme d'objets `{ texte, pourquoi }`. Les tests existants qui attendaient des textes dans la base doivent être adaptés : leur réponse de Claude reste sous forme de textes, qui sont normalisés en `{ texte, pourquoi: '' }`.

## Review Focus

1. **Fiche évaluée avant ce plan** (sans `examen`, recommandations sous forme de textes) : elle s'affiche sans erreur, avec « Détail non disponible… », et ses recommandations restent lisibles. *(Task 3)*
2. **Réponse de Claude avec des recommandations mélangées** (textes et objets, `pourquoi` absent ou vide) : elle est acceptée et normalisée. Un objet sans `texte` est refusé. *(Task 1)*
3. **Restauration d'un fichier d'un autre outil, tronqué ou d'une autre version** : message clair, et rien n'est écrit. *(Tasks 5 et 6)*
4. **Téléchargement indisponible, ou refusé par l'utilisatrice** : « Sauvegarder puis restaurer » n'écrit rien. *(Task 5)*
5. **Tableau de bord avec 0, 1 ou 4 contenus** : aucun classement ni nuage de points, un en-tête juste, et pas de `NaN` dans les moyennes. *(Task 4)*

---

## Structure des fichiers

```
src/claude/evaluation.js      extraireProfilDetaille, construireDemande, recommandations avec pourquoi (Task 1)
src/logique/score.js          construireExamen, lignesExamen, composerScore({ examen }) (Task 1)
src/claude/veille.md          format des recommandations (Task 1)
src/interface/controleur.js   examen de l'évaluation (Task 2) ; exporterDonnees, analyserRestauration, restaurerDonnees (Task 5)
src/logique/veille.js         examen des idées (Task 2)
src/interface/panneau-fiche.js « Avis de Claude », « Ce que Claude a examiné », « Pourquoi : » (Task 3)
src/logique/tableau-bord.js   SEUIL_COMPARAISON, resultatsParContenu, resultatsParFormat, resumeVolume, nombreComparable (Task 4)
src/interface/vue-tableau.js  en-tête, tableaux, seuil (Task 4)
src/logique/sauvegarde.js     COLLECTIONS_EXPORT, construireExport, validerExport, resumeRestauration, nomFichierExport (Task 5)
src/donnees/depot.js          lireCollection, ecrireDocument (Task 5)
src/interface/vue-profil.js   section Sauvegarde (Task 6)
src/interface/app.js          capacité downloads (Task 6)
src/interface/styles.css      styles (Tasks 3, 4 et 6)
```

---

### Task 1 : demande, examen et recommandations avec pourquoi (logique)

**Files:**
- Modify: `src/claude/evaluation.js`, `src/logique/score.js`, `src/claude/veille.md`
- Test: `tests/claude/evaluation.test.js`, `tests/logique/score.test.js`, `tests/claude/veille-consignes.test.js`

**Interfaces:**
- Produces :
  - `extraireProfilDetaille(profil)` → `{ texte, sections }` (`extraireProfil` renvoie toujours `texte`) ;
  - `construireDemande({ fiche, profil, verification, fichesSemaine, avecImage })` → `{ texte, sections_profil, contenus_semaine }` ;
  - `validerReponse` → des `jugement.recommandations` de la forme `[{ texte, pourquoi }]` ;
  - `construireExamen({ visuel, raison_visuel, version_profil, sections_profil, contenus_semaine, verification })` → `examen` ;
  - `lignesExamen(examen)` → `string[]` ;
  - `composerScore({ ..., examen })`.

- [ ] **Step 1: Write the failing tests.** In `tests/claude/evaluation.test.js`, add `extraireProfilDetaille, construireDemande` to the import, then:

```js
describe('construireDemande', () => {
  it('renvoie le texte, les sections envoyées et le nombre de contenus comparés', () => {
    const autre = { ...fiche({ accroche: 'Autre' }), id: 'f2' };
    const d = construireDemande({ fiche: fiche(), profil, verification, fichesSemaine: [fiche(), autre] });
    expect(d.texte).toBe(construirePrompt({ fiche: fiche(), profil, verification, fichesSemaine: [fiche(), autre] }));
    expect(d.sections_profil).toEqual(extraireProfilDetaille(profil).sections);
    expect(d.sections_profil).toContain('regles_studio');
    expect(d.contenus_semaine).toBe(1);
  });
  it('compte 0 contenu quand le prompt a dû être réduit', () => {
    const grosseVerification = { ...verification, alertes: [{ critere: null, texte: 'v'.repeat(60000) }] };
    const d = construireDemande({ fiche: fiche(), profil, verification: grosseVerification, fichesSemaine: Array.from({ length: 3 }, (_, i) => ({ ...fiche(), id: `s${i}` })) });
    expect(d.contenus_semaine).toBe(0);
  });
  it('les sections envoyées suivent les retraits dus à la taille', () => {
    const { sections } = extraireProfilDetaille(gros);
    expect(sections).toContain('regles_studio');
    expect(sections).not.toContain('exemples_de_reference');
  });
});

describe('recommandations avec pourquoi', () => {
  it('accepte les objets et les textes, et normalise en objets', () => {
    const r = validerReponse({ ...valide(), recommandations: [{ texte: ' Raccourcis. ', pourquoi: ' 18 mots. ' }, 'Ajoute un visage.', { texte: 'Coupe la fin.' }] });
    expect(r.ok).toBe(true);
    expect(r.jugement.recommandations).toEqual([
      { texte: 'Raccourcis.', pourquoi: '18 mots.' }, { texte: 'Ajoute un visage.', pourquoi: '' }, { texte: 'Coupe la fin.', pourquoi: '' },
    ]);
  });
  it('refuse un objet sans texte ou un pourquoi qui n’est pas du texte', () => {
    const msg = ['recommandations : exactement 3 recommandations (texte, et pourquoi facultatif).'];
    expect(validerReponse({ ...valide(), recommandations: [{ pourquoi: 'x' }, 'b', 'c'] }).erreurs).toEqual(msg);
    expect(validerReponse({ ...valide(), recommandations: [{ texte: 'a', pourquoi: 3 }, 'b', 'c'] }).erreurs).toEqual(msg);
  });
  it('le prompt demande un pourquoi pour chaque recommandation', () => {
    expect(construirePrompt({ fiche: fiche(), profil, verification })).toContain('"recommandations":[{"texte":"…","pourquoi":"…"}');
  });
});
```

In the same file, replace in the existing `validerReponse` test the expected message `'recommandations : exactement 3 textes.'` with `'recommandations : exactement 3 recommandations (texte, et pourquoi facultatif).'`.

In `tests/logique/score.test.js`, add `construireExamen, lignesExamen` to the import from `score.js` and add (`verification` : use the shape `{ conformite: { etat, causes }, alertes: [...] }`, as elsewhere in the file):

```js
describe('examen', () => {
  const verification = { conformite: { etat: 'orange', causes: ['c1'] }, alertes: [{ critere: 'accroche', texte: 'a1' }, { critere: null, texte: 'a2' }] };
  const base = { version_profil: 3, sections_profil: ['regles_studio', 'ton_et_voix'], contenus_semaine: 2, verification };

  it('construit le bloc examen', () => {
    expect(construireExamen({ ...base, visuel: 'non_joint', raison_visuel: 'taille' })).toEqual({
      visuel: 'non_joint', raison_visuel: 'taille', version_profil: 3, sections_profil: ['regles_studio', 'ton_et_voix'],
      contenus_semaine: 2, alertes_calculees: 2, blocages_calcules: 1,
    });
    expect(construireExamen({ ...base, visuel: 'joint' }).raison_visuel).toBeNull();
  });

  it('traduit l’examen en phrases', () => {
    expect(lignesExamen(construireExamen({ ...base, visuel: 'joint' }))).toEqual([
      'Visuel examiné.',
      'Profil version 3 : sections regles_studio, ton_et_voix.',
      '2 autres contenus de la semaine comparés.',
      '2 alertes et 1 blocage calculés par le studio.',
    ]);
    const un = construireExamen({ ...base, visuel: 'aucun', contenus_semaine: 1, verification: { conformite: { etat: 'vert', causes: [] }, alertes: [] } });
    expect(lignesExamen(un)).toEqual([
      'Pas de visuel.', 'Profil version 3 : sections regles_studio, ton_et_voix.', '1 autre contenu de la semaine comparé.', '0 alerte et 0 blocage calculés par le studio.',
    ]);
    expect(lignesExamen({ ...un, contenus_semaine: 0 })[2]).toBe('Aucun autre contenu de la semaine comparé.');
    for (const [raison, texte] of [['video', 'Visuel non examiné : vidéo (seules les images sont envoyées).'], ['type', 'Visuel non examiné : format refusé.'], ['taille', 'Visuel non examiné : fichier trop lourd.'], ['indisponible', 'Visuel non examiné : envoi d’images indisponible.']]) {
      expect(lignesExamen(construireExamen({ ...base, visuel: 'non_joint', raison_visuel: raison }))[0]).toBe(texte);
    }
  });

  it('signale une évaluation antérieure sans examen', () => {
    expect(lignesExamen(null)).toEqual(['Détail non disponible pour cette évaluation (antérieure).']);
    expect(lignesExamen(undefined)).toEqual(['Détail non disponible pour cette évaluation (antérieure).']);
  });
});
```

Add to the existing `describe` of `composerScore` a test named `'ajoute l’examen seulement s’il est fourni'`. It takes the same arguments as the first `composerScore` test in the file (call them `args`), calls `const sans = composerScore(args)` and `const avec = composerScore({ ...args, examen: { visuel: 'aucun' } })`, then checks `expect(sans).not.toHaveProperty('examen')` and `expect(avec.examen).toEqual({ visuel: 'aucun' })`.

In `tests/claude/veille-consignes.test.js`, add `'"pourquoi"'` to the `attendu` list.

- [ ] **Step 2: Run to see them fail**

Run: `npx vitest run tests/claude tests/logique/score.test.js`
Expected: FAIL.

- [ ] **Step 3: Implement `src/claude/evaluation.js`.**
  - Replace `extraireProfil` with:

```js
export function extraireProfilDetaille(profil) {
  const extrait = {};
  if (profil.regles_studio !== undefined) extrait.regles_studio = profil.regles_studio;
  for (const cle of AUTRES_SECTIONS_PROFIL) if (profil[cle] !== undefined) extrait[cle] = profil[cle];
  let texte = JSON.stringify(extrait);
  for (const cle of ORDRE_RETRAIT) {
    if (octets(texte) <= TAILLE_PROFIL_MAX) break;
    delete extrait[cle];
    texte = JSON.stringify(extrait);
  }
  return { texte, sections: Object.keys(extrait) };
}

export const extraireProfil = profil => extraireProfilDetaille(profil).texte;
```

  - In `assemblerPrompt`, compute `const profilEnvoye = extraireProfilDetaille(profil);`. In the array of lines, replace `extraireProfil(profil)` with `profilEnvoye.texte`. At the end, instead of `return [ … ].join('\n');`, return:

```js
  return { texte: [ /* mêmes lignes */ ].join('\n'), sections_profil: profilEnvoye.sections, contenus_semaine: semaine.length };
```

  - In the lines of the response format, replace the example `"recommandations":["…","…","…"]` with `"recommandations":[{"texte":"…","pourquoi":"…"},{"texte":"…","pourquoi":"…"},{"texte":"…","pourquoi":"…"}]`. In the constraints line, replace `exactement 3 recommandations concrètes` with `exactement 3 recommandations concrètes, chacune avec un pourquoi court qui cite ce que tu as observé`.
  - Replace `construirePrompt` with:

```js
export function construireDemande({ fiche, profil, verification, fichesSemaine = [], avecImage = false }) {
  const demande = assemblerPrompt({ fiche, profil, verification, fichesSemaine, avecImage });
  if (octets(demande.texte) <= TAILLE_PROMPT_MAX) return demande;
  return assemblerPrompt({ fiche, profil, verification, fichesSemaine: [], avecImage });
}

export const construirePrompt = args => construireDemande(args).texte;
```

  - In `validerReponse`, replace the recommendations check with:

```js
  const recoOk = Array.isArray(r.recommandations) && r.recommandations.length === 3
    && r.recommandations.every(x => texte(x) || (x && typeof x === 'object' && texte(x.texte) && (x.pourquoi == null || typeof x.pourquoi === 'string')));
  if (!recoOk) erreurs.push('recommandations : exactement 3 recommandations (texte, et pourquoi facultatif).');
```

    and, in the returned `jugement`:

```js
      recommandations: r.recommandations.map(x => (typeof x === 'string' ? { texte: x.trim(), pourquoi: '' } : { texte: x.texte.trim(), pourquoi: (x.pourquoi ?? '').trim() })),
```

- [ ] **Step 4: Implement `src/logique/score.js`.**
  - Add to the file:

```js
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
```

  - Change the signature of `composerScore` to `composerScore({ fiche, verification, jugement, versionProfil, maintenant, examen = null })`, then add `...(examen ? { examen } : {}),` to the returned object, after `empreinte: empreinte(fiche),`.

- [ ] **Step 5: Update `src/claude/veille.md`.** In the example `"jugement"` of step 4, replace `"recommandations":["…","…","…"]` with `"recommandations":[{"texte":"…","pourquoi":"…"},{"texte":"…","pourquoi":"…"},{"texte":"…","pourquoi":"…"}]`. In the rules of the judgment, replace `- 3 recommandations ;` with `- 3 recommandations, chacune avec un pourquoi court ;`.

- [ ] **Step 6: Run the tests**

Run: `npx vitest run tests/claude tests/logique/score.test.js`, puis `npm test`.
Expected: PASS. Les tests existants qui vérifient `recommandations` en base (`tests/interface/evaluation.test.js` : `expect(enBase.recommandations).toEqual(['R1', 'R2', 'R3'])`, et d'autres semblables) attendent désormais `[{ texte: 'R1', pourquoi: '' }, { texte: 'R2', pourquoi: '' }, { texte: 'R3', pourquoi: '' }]`. Adapte **uniquement** ces attentes, et liste-les dans ton rapport.

- [ ] **Step 7: Commit**

```bash
git add src/claude/evaluation.js src/logique/score.js src/claude/veille.md tests
git commit -m "Évaluation : ce qui est envoyé à Claude, bloc examen et recommandations avec pourquoi

Co-Authored-By: <modèle auteur>"
```

---

### Task 2 : remplir l'examen (contrôleur et veille)

**Files:**
- Modify: `src/interface/controleur.js`, `src/logique/veille.js`
- Test: `tests/interface/evaluation.test.js`, `tests/logique/veille.test.js`

**Interfaces:**
- Consumes (Task 1) : `construireDemande`, `extraireProfilDetaille`, `construireExamen`, `composerScore({ examen })`.
- Produces : `score.examen` renseigné sur chaque nouvelle évaluation et sur chaque idée de la veille.

- [ ] **Step 1: Write the failing tests.** In `tests/interface/evaluation.test.js`, reuse `monter`, `fauxSample` and `REPONSE`. The default fiche there has `visuel: 'a1', visuel_type: 'video'` :

```js
describe('examen de l’évaluation', () => {
  const images = extra => fauxSample(undefined, async () => ({ maxPromptBytes: 65536, images: { maxCount: 1, maxInputBytes: 20e6, mediaTypes: ['image/png'], ...extra } }));
  it('vidéo : visuel non joint pour cause de vidéo', async () => {
    const { actions } = await monter();
    const r = await actions.evaluerFiche('f1');
    expect(r.fiche.score.examen).toMatchObject({ visuel: 'non_joint', raison_visuel: 'video', version_profil: 1, contenus_semaine: 0 });
    expect(r.fiche.score.examen.sections_profil).toContain('regles_studio');
  });
  it('sans visuel : aucun', async () => {
    const { actions } = await monter({ contenu: { visuel: null, visuel_type: null } });
    expect((await actions.evaluerFiche('f1')).fiche.score.examen.visuel).toBe('aucun');
  });
  it('image jointe, refusée par type ou par taille, ou envoi indisponible', async () => {
    const joint = await monter({ sample: images(), contenu: { visuel_type: 'image' } });
    expect((await joint.actions.evaluerFiche('f1')).fiche.score.examen).toMatchObject({ visuel: 'joint', raison_visuel: null });
    const type = await monter({ sample: images({ mediaTypes: ['image/jpeg'] }), contenu: { visuel_type: 'image' } });
    expect((await type.actions.evaluerFiche('f1')).fiche.score.examen).toMatchObject({ visuel: 'non_joint', raison_visuel: 'type' });
    const taille = await monter({ sample: images({ maxInputBytes: 0 }), contenu: { visuel_type: 'image' } });
    expect((await taille.actions.evaluerFiche('f1')).fiche.score.examen).toMatchObject({ visuel: 'non_joint', raison_visuel: 'taille' });
    const indispo = await monter({ sample: fauxSample(), contenu: { visuel_type: 'image' } });
    expect((await indispo.actions.evaluerFiche('f1')).fiche.score.examen).toMatchObject({ visuel: 'non_joint', raison_visuel: 'indisponible' });
  });
  it('les recommandations sont enregistrées avec leur pourquoi', async () => {
    const { db, actions } = await monter({ sample: fauxSample(async () => ({ ...REPONSE, recommandations: [{ texte: 'R1', pourquoi: 'P1' }, 'R2', 'R3'] })) });
    await actions.evaluerFiche('f1');
    expect(db._docs.get('fiches/f1').recommandations[0]).toEqual({ texte: 'R1', pourquoi: 'P1' });
  });
});
```

In `tests/logique/veille.test.js`, in the `describe` of `construireVeille`, reusing `entree()` and the file's arguments:

```js
  it('chaque idée porte un examen sans visuel', () => {
    const r = construireVeille({ profil: { ...fictif, version: 4 }, fiches: [], entree: entree(), maintenant: '2026-09-27T18:00:00.000Z', idAleatoire: () => `ex${n++}` });
    const examen = r.fichesCreees[0].score.examen;
    expect(examen).toMatchObject({ visuel: 'aucun', raison_visuel: null, version_profil: 4, contenus_semaine: 0 });
    expect(examen.sections_profil).toContain('regles_studio');
  });
```

- [ ] **Step 2: Run to see them fail**

Run: `npx vitest run tests/interface/evaluation.test.js tests/logique/veille.test.js`
Expected: FAIL.

- [ ] **Step 3: Implement the controller.** In `src/interface/controleur.js` :
  - Import `construireDemande` in addition to `construirePrompt`, then remove `construirePrompt` from the import if it is no longer used. Import `construireExamen` from `../logique/score.js`, next to `composerScore`.
  - In `evaluerContenu`, replace the whole block from `let images;` through `sample.json(...)` included with:

```js
    let images;
    let visuel = fiche.visuel ? 'non_joint' : 'aucun';
    let raisonVisuel = null;
    if (fiche.visuel && fiche.visuel_type === 'video') raisonVisuel = 'video';
    else if (fiche.visuel) {
      raisonVisuel = 'indisponible';
      if (fiche.visuel_type === 'image') {
        try {
          const limites = await sample.limits();
          if (limites?.images) {
            const blob = await chargerImage(fiche.visuel);
            const { mediaTypes, maxInputBytes } = limites.images;
            const typeOk = !mediaTypes || mediaTypes.includes(blob.type);
            const tailleOk = maxInputBytes == null || blob.size <= maxInputBytes;
            if (typeOk && tailleOk) images = blob;
            else raisonVisuel = !typeOk ? 'type' : 'taille';
          }
        } catch {
          images = undefined;
        }
      }
    }
    if (images) { visuel = 'joint'; raisonVisuel = null; }
    const demande = construireDemande({ fiche, profil, verification, fichesSemaine, avecImage: !!images });
    let brute;
    try {
      brute = await sample.json(demande.texte, images ? { signal, images } : { signal });
```

    Keep the rest unchanged, except the call to `composerScore`, which becomes:

```js
    const examen = construireExamen({ visuel, raison_visuel: raisonVisuel, version_profil: profil.version ?? null, sections_profil: demande.sections_profil, contenus_semaine: demande.contenus_semaine, verification });
    const score = composerScore({ fiche, verification, jugement: reponse.jugement, versionProfil: profil.version, maintenant: horloge(), examen });
```

- [ ] **Step 4: Implement the watch.** In `src/logique/veille.js`, import `extraireProfilDetaille` from `../claude/evaluation.js` (next to `validerReponse`) and `construireExamen` from `./score.js`. In `construireVeille`, before `const fichesCreees = …`, add `const sectionsProfil = extraireProfilDetaille(profil).sections;`. In the creation of each fiche, replace:

```js
    const score = composerScore({ fiche: base, verification: verifierRegles(base, r), jugement: idee.jugement, versionProfil: profil.version, maintenant });
```

with:

```js
    const verification = verifierRegles(base, r);
    const examen = construireExamen({ visuel: 'aucun', version_profil: profil.version ?? null, sections_profil: sectionsProfil, contenus_semaine: 0, verification });
    const score = composerScore({ fiche: base, verification, jugement: idee.jugement, versionProfil: profil.version, maintenant, examen });
```

- [ ] **Step 5: Run the tests**

Run: `npx vitest run tests/interface/evaluation.test.js tests/logique/veille.test.js tests/scripts`, puis `npm test`.
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/interface/controleur.js src/logique/veille.js tests/interface/evaluation.test.js tests/logique/veille.test.js
git commit -m "Évaluation et veille : enregistrent ce que Claude a examiné

Co-Authored-By: <modèle auteur>"
```

---

### Task 3 : affichage de l'avis dans la fiche

**Files:**
- Modify: `src/interface/panneau-fiche.js`, `src/interface/styles.css`
- Test: `tests/interface/panneau-fiche.test.js`

**Interfaces:**
- Consumes (Task 1) : `lignesExamen(examen)`.

- [ ] **Step 1: Write the failing tests.** Add them to `tests/interface/panneau-fiche.test.js`, reusing `fiche`, `actionsFactices`, `fictif` and `empreinte` :

```js
describe('avis de Claude', () => {
  const evaluee = (extra = {}, score = {}) => {
    const f = fiche({ caption: 'Une caption.', ...extra });
    return { ...f, score: { total: 64, criteres: [], conformite: { etat: 'vert', causes: [] }, empreinte: empreinte(f), ...score } };
  };
  it('présente le score comme un avis', () => {
    const p = panneauFiche(evaluee(), fictif, actionsFactices(), { assets: true });
    expect(p.querySelector('.score h3').textContent).toBe('Avis de Claude : 64/100');
    expect(p.querySelector('.score').textContent).toContain('Avis d’expert, pas une prédiction de performance.');
    const vide = panneauFiche(fiche(), fictif, actionsFactices(), { assets: true });
    expect(vide.querySelector('.score h3').textContent).toBe('Avis de Claude');
  });
  it('détaille ce que Claude a examiné', () => {
    const examen = { visuel: 'non_joint', raison_visuel: 'video', version_profil: 2, sections_profil: ['regles_studio'], contenus_semaine: 3, alertes_calculees: 1, blocages_calcules: 0 };
    const p = panneauFiche(evaluee({}, { examen }), fictif, actionsFactices(), { assets: true });
    const d = p.querySelector('details.examen');
    expect(d.querySelector('summary').textContent).toBe('Ce que Claude a examiné');
    expect([...d.querySelectorAll('li')].map(li => li.textContent)).toEqual([
      'Visuel non examiné : vidéo (seules les images sont envoyées).', 'Profil version 2 : sections regles_studio.',
      '3 autres contenus de la semaine comparés.', '1 alerte et 0 blocage calculés par le studio.',
    ]);
  });
  it('signale une évaluation antérieure', () => {
    const p = panneauFiche(evaluee(), fictif, actionsFactices(), { assets: true });
    expect(p.querySelector('details.examen').textContent).toContain('Détail non disponible pour cette évaluation (antérieure).');
  });
  it('affiche le pourquoi des recommandations, et les anciennes sous forme de texte', () => {
    const p = panneauFiche(evaluee({ recommandations: [{ texte: 'Raccourcis.', pourquoi: '18 mots.' }, { texte: 'Visage.', pourquoi: '' }, 'Ancienne.'] }), fictif, actionsFactices(), { assets: true });
    const items = [...p.querySelectorAll('.recommandations li')];
    expect(items[0].textContent).toBe('Raccourcis. Pourquoi : 18 mots.');
    expect(items[1].textContent).toBe('Visage.');
    expect(items[2].textContent).toBe('Ancienne.');
    expect(p.textContent).not.toContain('[object Object]');
    expect(p.textContent).not.toContain('null');
  });
});
```

If an existing test looked for the text `Score : …/100`, update it to `Avis de Claude : …/100` and say so in your report.

- [ ] **Step 2: Run to see them fail**

Run: `npx vitest run tests/interface/panneau-fiche.test.js`
Expected: FAIL.

- [ ] **Step 3: Implement.** In `src/interface/panneau-fiche.js`, add `import { lignesExamen } from '../logique/score.js';`. In `sectionScore` :
  - replace `const enfants = [h('h3', {}, s ? \`Score : ${s.total}/100\` : 'Score')];` with:

```js
    const enfants = [
      h('h3', {}, s ? `Avis de Claude : ${s.total}/100` : 'Avis de Claude'),
      h('p', { class: 'aide' }, 'Avis d’expert, pas une prédiction de performance.'),
    ];
```

  - in the `if (s) { … }` block, after the criteria and alerts, add:

```js
      enfants.push(h('details', { class: 'examen' }, h('summary', {}, 'Ce que Claude a examiné'),
        h('ul', {}, lignesExamen(s.examen).map(l => h('li', {}, l)))));
```

  - replace the rendering of the recommendations with:

```js
      enfants.push(h('h4', {}, 'Recommandations'), h('ol', { class: 'recommandations' }, brouillon.recommandations.map(r => (typeof r === 'string'
        ? h('li', {}, r)
        : h('li', {}, r.texte, r.pourquoi ? h('span', { class: 'pourquoi' }, ` Pourquoi : ${r.pourquoi}`) : null)))));
```

- [ ] **Step 4: Add the styles** at the end of `src/interface/styles.css` :

```css
.examen { font-size: 13px; color: var(--texte-2); }
.examen summary { cursor: pointer; }
.examen ul { margin: 6px 0 0; padding-left: 18px; }
.recommandations .pourquoi { color: var(--texte-2); }
```

- [ ] **Step 5: Run the tests**

Run: `npx vitest run tests/interface`, puis `npm test`.
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/interface/panneau-fiche.js src/interface/styles.css tests/interface/panneau-fiche.test.js
git commit -m "Fiche : l’avis de Claude, ce qu’il a examiné et le pourquoi des recommandations

Co-Authored-By: <modèle auteur>"
```

---

### Task 4 : tableau de bord à faible volume

**Files:**
- Modify: `src/logique/tableau-bord.js`, `src/interface/vue-tableau.js`, `src/interface/styles.css`
- Test: `tests/logique/tableau-bord.test.js`, `tests/interface/vue-tableau.test.js`

**Interfaces:**
- Produces :
  - `SEUIL_COMPARAISON` (5) ;
  - `resultatsParContenu(stats)` → `[{ fiche, date, format, accroche, vues, nouveaux_abonnes, taux, partages_envois, releve }]`, du plus récent au plus ancien ;
  - `resultatsParFormat(stats)` → `[{ format, nombre, taux_moyen, partages_moyens }]` dans l'ordre de `FORMATS` ;
  - `nombreComparable(stats)` → nombre entier ;
  - `resumeVolume(stats)` → texte.

- [ ] **Step 1: Write the failing tests.** In `tests/logique/tableau-bord.test.js`, add `SEUIL_COMPARAISON, resultatsParContenu, resultatsParFormat, nombreComparable, resumeVolume` to the import. The file already has `stat(fiche, releve, extra)` :

```js
describe('faible volume', () => {
  const stats = [
    stat('a', '48h', { date_publication: '2026-09-10T10:00:00.000Z', vues: 500 }), stat('a', '7j', { date_publication: '2026-09-10T10:00:00.000Z', vues: 1000, nouveaux_abonnes: 4 }),
    stat('b', '7j', { date_publication: '2026-09-20T10:00:00.000Z', format: 'carrousel', partages_envois: 30, nouveaux_abonnes: 2 }),
    stat('z', '48h', { date_publication: '2026-09-22T10:00:00.000Z', vues: 0, nouveaux_abonnes: 0, partages_envois: 1 }),
  ];
  it('liste un résultat par contenu, du plus récent au plus ancien', () => {
    const r = resultatsParContenu(stats);
    expect(r.map(x => [x.fiche, x.releve])).toEqual([['z', '48h'], ['b', '7j'], ['a', '7j']]);
    expect(r[0].taux).toBeNull();
    expect(r[2]).toMatchObject({ vues: 1000, nouveaux_abonnes: 4, partages_envois: 10, format: 'reel', accroche: 'Accroche a' });
    expect(r[2].taux).toBeCloseTo(0.004);
  });
  it('résume par format sans NaN', () => {
    expect(resultatsParFormat(stats)).toEqual([
      { format: 'reel', nombre: 2, taux_moyen: 0.004, partages_moyens: 5.5 },
      { format: 'carrousel', nombre: 1, taux_moyen: 0.002, partages_moyens: 30 },
    ]);
    expect(resultatsParFormat([stat('z', '48h', { vues: 0 })])).toEqual([{ format: 'reel', nombre: 1, taux_moyen: null, partages_moyens: 10 }]);
    expect(resultatsParFormat([])).toEqual([]);
  });
  it('compte les contenus comparables et résume le volume', () => {
    expect(SEUIL_COMPARAISON).toBe(5);
    expect(nombreComparable(stats)).toBe(2);
    expect(resumeVolume([])).toBe('Aucun contenu relevé sur 12 semaines.');
    expect(resumeVolume([stat('a', '7j')])).toBe('1 contenu relevé sur 12 semaines (1 Reel).');
    expect(resumeVolume(stats)).toBe('3 contenus relevés sur 12 semaines (2 Reels, 1 carrousel).');
  });
});
```

In `tests/interface/vue-tableau.test.js`, which has `stat`, `actions`, `etat` and `fictif` :

```js
describe('faible volume', () => {
  const cinq = ['a', 'b', 'c', 'd', 'e'].map((id, i) => stat(id, { nouveaux_abonnes: i + 1 }));
  it('affiche le volume, les tableaux, et masque les comparaisons sous le seuil', () => {
    const v = vueTableau(etat({ stats: cinq.slice(0, 4) }), actions());
    expect(v.querySelector('.volume').textContent).toBe('4 contenus relevés sur 12 semaines (4 Reels).');
    expect(v.querySelectorAll('.resultats-contenus tbody tr')).toHaveLength(4);
    expect(v.querySelectorAll('.resultats-formats tbody tr')).toHaveLength(1);
    expect(v.textContent).toContain('Il faut au moins 5 contenus relevés pour comparer (actuellement 4).');
    expect(v.querySelector('.graphique .point[cx]') ?? null).not.toBeNull();
    expect(v.textContent).not.toContain('NaN');
  });
  it('affiche les comparaisons à partir de 5 contenus', () => {
    const v = vueTableau(etat({ stats: cinq }), actions());
    expect(v.textContent).not.toContain('Il faut au moins 5 contenus relevés');
    expect(v.textContent).toContain('Meilleurs');
  });
  it('place les tableaux avant les graphiques', () => {
    const v = vueTableau(etat({ stats: cinq }), actions());
    const tout = [...v.querySelectorAll('.resultats-contenus, .graphiques')];
    expect(tout[0].classList.contains('resultats-contenus')).toBe(true);
  });
  it('met à jour le volume et les tableaux sans reconstruire la vue', () => {
    const v = vueTableau(etat({ stats: [] }), actions());
    v.mettreAJour({ ...etat({ stats: cinq }) });
    expect(v.querySelector('.volume').textContent).toBe('5 contenus relevés sur 12 semaines (5 Reels).');
    expect(v.querySelectorAll('.resultats-contenus tbody tr')).toHaveLength(5);
  });
});
```

Existing tests in this file that expect the ranking with only 2 contents (for example « affiche les six graphiques et le classement », which checks `Accroche a`) must be adapted: pass 5 contents, or check the message instead. Keep the check of the six `figcaption`, and report it.

- [ ] **Step 2: Run to see them fail**

Run: `npx vitest run tests/logique/tableau-bord.test.js tests/interface/vue-tableau.test.js`
Expected: FAIL.

- [ ] **Step 3: Implement in `src/logique/tableau-bord.js`.** Add `import { FORMATS } from './fiche.js';` (together with `datePublication` if that import already exists) and:

```js
export const SEUIL_COMPARAISON = 5;
const PLURIELS_FORMAT = { reel: ['Reel', 'Reels'], carrousel: ['carrousel', 'carrousels'], story: ['story', 'stories'], post: ['post', 'posts'] };

export function resultatsParContenu(stats) {
  return relevesParFiche(stats).slice().reverse().map(s => ({
    fiche: s.fiche, date: s.date_publication, format: s.format, accroche: s.accroche ?? '', vues: s.vues,
    nouveaux_abonnes: s.nouveaux_abonnes, taux: tauxAbonnesParVue(s), partages_envois: s.partages_envois, releve: s.releve,
  }));
}

export function resultatsParFormat(stats) {
  const lignes = relevesParFiche(stats);
  return FORMATS.map(format => {
    const duFormat = lignes.filter(s => s.format === format);
    if (!duFormat.length) return null;
    const taux = duFormat.map(tauxAbonnesParVue).filter(v => v != null);
    const partages = duFormat.map(s => s.partages_envois).filter(v => v != null);
    return { format, nombre: duFormat.length, taux_moyen: moyenne(taux), partages_moyens: moyenne(partages) };
  }).filter(Boolean);
}

export const nombreComparable = stats => relevesParFiche(stats).filter(s => tauxAbonnesParVue(s) != null).length;

export function resumeVolume(stats) {
  const n = relevesParFiche(stats).length;
  if (!n) return 'Aucun contenu relevé sur 12 semaines.';
  const parts = resultatsParFormat(stats).map(f => `${f.nombre} ${PLURIELS_FORMAT[f.format][f.nombre > 1 ? 1 : 0]}`);
  return `${n} contenu${n > 1 ? 's' : ''} relevé${n > 1 ? 's' : ''} sur 12 semaines (${parts.join(', ')}).`;
}
```

`moyenne` already exists in the file. It returns `null` for an empty list. Check it, and make sure `taux_moyen` is exactly `0.004` in the test with a single rate. If it's not exactly equal, use `toBeCloseTo` in the test and report it.

- [ ] **Step 4: Implement in `src/interface/vue-tableau.js`.**
  - Import `SEUIL_COMPARAISON, resultatsParContenu, resultatsParFormat, nombreComparable, resumeVolume` from `../logique/tableau-bord.js` and `LIBELLES_FORMAT` (already imported).
  - Add:

```js
function tableaux(stats, fz) {
  const jour = iso => new Date(iso).toLocaleDateString('fr-FR', { timeZone: fz, day: 'numeric', month: 'short' });
  const lignes = resultatsParContenu(stats);
  const formats = resultatsParFormat(stats);
  const cellules = valeurs => valeurs.map(v => h('td', {}, v));
  return [
    h('section', { class: 'resultats-contenus' }, h('h3', {}, 'Résultats par contenu'),
      lignes.length
        ? h('table', {},
          h('thead', {}, h('tr', {}, ['Date', 'Format', 'Accroche', 'Vues', 'Nouveaux abonnés', 'Abonnés par vue', 'Partages et envois', 'Relevé'].map(t => h('th', {}, t)))),
          h('tbody', {}, lignes.map(l => h('tr', {}, cellules([
            jour(l.date), LIBELLES_FORMAT[l.format] ?? l.format, l.accroche || 'Sans accroche', entier(l.vues), entier(l.nouveaux_abonnes),
            pct(l.taux), entier(l.partages_envois), l.releve === '48h' ? '48 h' : '7 jours',
          ])))))
        : h('p', { class: 'aide' }, VIDE)),
    h('section', { class: 'resultats-formats' }, h('h3', {}, 'Par format'),
      formats.length
        ? h('table', {},
          h('thead', {}, h('tr', {}, ['Format', 'Contenus', 'Abonnés par vue (moyenne)', 'Partages et envois (moyenne)'].map(t => h('th', {}, t)))),
          h('tbody', {}, formats.map(f => h('tr', {}, cellules([LIBELLES_FORMAT[f.format] ?? f.format, String(f.nombre), pct(f.taux_moyen), entier(f.partages_moyens)])))))
        : h('p', { class: 'aide' }, VIDE)),
  ];
}
```

  - In `graphiquesTableau`, take the threshold into account. Compute `const comparable = nombreComparable(stats);` and `const attente = \`Il faut au moins ${SEUIL_COMPARAISON} contenus relevés pour comparer (actuellement ${comparable}).\`;`. Replace `classement(s.classement)` with `comparable >= SEUIL_COMPARAISON ? classement(s.classement) : figure('Meilleurs et pires contenus', '', attente)`. For the last figure, pass `comparable >= SEUIL_COMPARAISON ? svgNuage(...) : ''` and, as the empty message, `comparable >= SEUIL_COMPARAISON ? 'Aucun contenu évalué et relevé.' : attente`.
  - In `vueTableau`, build:

```js
  const volume = h('p', { class: 'volume' }, resumeVolume(stats));
  const zoneTableaux = h('div', { class: 'tableaux-resultats' }, ...tableaux(stats, fz));
```

    Insert `volume` at the very top of `racine`, then `zoneTableaux` between the input block and `graphiques`. In `racine.mettreAJour`, add:

```js
    volume.textContent = resumeVolume(e2.stats);
    zoneTableaux.replaceChildren(...tableaux(e2.stats, fz));
```

- [ ] **Step 5: Add the styles** at the end of `src/interface/styles.css` :

```css
.volume { margin: 0; font-weight: 600; }
.tableaux-resultats { display: grid; gap: 16px; }
.tableaux-resultats table { width: 100%; border-collapse: collapse; font-size: 13px; }
.tableaux-resultats th, .tableaux-resultats td { text-align: left; padding: 4px 8px; border-bottom: 1px solid var(--trait); }
.tableaux-resultats section { overflow-x: auto; }
```

- [ ] **Step 6: Run the tests**

Run: `npx vitest run tests/logique/tableau-bord.test.js tests/interface`, puis `npm test`.
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/logique/tableau-bord.js src/interface/vue-tableau.js src/interface/styles.css tests/logique/tableau-bord.test.js tests/interface/vue-tableau.test.js
git commit -m "Tableau de bord : résultats par contenu et par format, comparaisons à partir de 5 contenus

Co-Authored-By: <modèle auteur>"
```

---

### Task 5 : export et restauration (logique, dépôt, contrôleur)

**Files:**
- Create: `src/logique/sauvegarde.js`
- Modify: `src/donnees/depot.js`, `src/interface/controleur.js`
- Test: `tests/logique/sauvegarde.test.js`, `tests/donnees/depot.test.js`, `tests/interface/controleur.test.js`

**Interfaces:**
- Produces :
  - `COLLECTIONS_EXPORT` ;
  - `construireExport(collections, maintenant)` → objet d'export ;
  - `validerExport(objet)` → `{ ok: true, collections, total, ignorees }` ou `{ ok: false, erreurs }` ;
  - `resumeRestauration(validation)` → texte ;
  - `nomFichierExport(maintenant, fuseau)` → nom de fichier ;
  - dépôt : `lireCollection(nom)` → `[{ id, data }]`, `ecrireDocument(collection, id, data)` ;
  - contrôleur, via `creerControleur({ …, downloads = null })` :
    - `exporterDonnees()` → `{ ok, message }` ou `{ ok: false, raison }` ;
    - `analyserRestauration(texte)` → `{ ok, resume, validation }` ou `{ ok: false, erreurs }` ;
    - `restaurerDonnees(validation, { sauvegarder })` → `{ ok, message, restaures }` ou `{ ok: false, erreurs, restaures }`.

- [ ] **Step 1: Write the failing tests.** Create `tests/logique/sauvegarde.test.js` :

```js
import { describe, it, expect } from 'vitest';
import { COLLECTIONS_EXPORT, construireExport, validerExport, resumeRestauration, nomFichierExport } from '../../src/logique/sauvegarde.js';

const M = '2026-09-29T22:30:00.000Z';
const vide = () => Object.fromEntries(COLLECTIONS_EXPORT.map(c => [c, []]));

describe('export', () => {
  it('liste les collections du studio', () => {
    expect(COLLECTIONS_EXPORT).toEqual(['profil', 'profil_archives', 'fiches', 'bulletins', 'stats_contenu', 'releves_compte', 'reference', 'reference_resultats', 'config']);
  });
  it('construit le fichier', () => {
    const e = construireExport({ ...vide(), fiches: [{ id: 'f1', data: { accroche: 'x' } }] }, M);
    expect(e).toEqual({
      format: 'studio-contenu-export', version: 1, exporte_le: M,
      note: 'Les visuels ne sont pas inclus : seuls leurs identifiants le sont.',
      collections: { ...vide(), fiches: [{ id: 'f1', data: { accroche: 'x' } }] },
    });
  });
  it('nomme le fichier selon le jour local', () => {
    expect(nomFichierExport(M, 'Europe/Paris')).toBe('studio-contenu-2026-09-30.json');
    expect(nomFichierExport(M, 'UTC')).toBe('studio-contenu-2026-09-29.json');
  });
});

describe('validerExport', () => {
  const bon = () => construireExport({ ...vide(), fiches: [{ id: 'f1', data: { a: 1 } }, { id: 'f2', data: {} }], profil: [{ id: 'courant', data: { version: 2 } }] }, M);
  it('accepte un export valide, compte et ignore les collections inconnues', () => {
    const e = bon();
    e.collections.inconnue = [{ id: 'x', data: {} }];
    const v = validerExport(e);
    expect(v.ok).toBe(true);
    expect(v.total).toBe(3);
    expect(v.ignorees).toEqual(['inconnue']);
    expect(v.collections.fiches).toHaveLength(2);
    expect(resumeRestauration(v)).toBe('À restaurer : profil : 1, fiches : 2 (total 3 documents). Les documents de même identifiant seront remplacés ; rien ne sera supprimé. Collections inconnues ignorées : inconnue.');
  });
  it('refuse les fichiers d’un autre format ou d’une autre version', () => {
    expect(validerExport(null).erreurs).toEqual(['Ce fichier n’est pas un export du studio.']);
    expect(validerExport({ format: 'autre' }).erreurs).toEqual(['Ce fichier n’est pas un export du studio.']);
    expect(validerExport({ ...bon(), version: 2 }).erreurs).toEqual(['Version d’export non prise en charge : 2.']);
    expect(validerExport({ ...bon(), collections: [] }).erreurs).toEqual(['Le fichier ne contient pas de collections.']);
  });
  it('refuse les documents mal formés', () => {
    const e = bon();
    e.collections.fiches = [{ id: '', data: {} }, { id: 'a/b', data: {} }, { id: 'ok', data: [] }, 'x'];
    expect(validerExport(e).erreurs).toEqual([
      'fiches, document 1 : identifiant invalide.', 'fiches, document 2 : identifiant invalide.',
      'fiches, document 3 : contenu invalide.', 'fiches, document 4 : contenu invalide.',
    ]);
    const e2 = bon();
    e2.collections.bulletins = 'x';
    expect(validerExport(e2).erreurs).toEqual(['bulletins : liste de documents attendue.']);
  });
  it('accepte une collection absente comme vide', () => {
    const e = bon();
    delete e.collections.config;
    expect(validerExport(e).ok).toBe(true);
  });
});
```

In `tests/donnees/depot.test.js` :

```js
describe('sauvegarde', () => {
  it('lit une collection entière et écrit un document quelconque', async () => {
    const db = creerFausseBase();
    const depot = creerDepot(db);
    await depot.ecrireDocument('bulletins', '2026-W40', { semaine: '2026-W40' });
    await depot.ecrireDocument('profil', 'courant', { version: 3 });
    expect(await depot.lireCollection('bulletins')).toEqual([{ id: '2026-W40', data: { semaine: '2026-W40' } }]);
    expect(await depot.lireCollection('profil')).toEqual([{ id: 'courant', data: { version: 3 } }]);
    expect(await depot.lireCollection('config')).toEqual([]);
  });
});
```

In `tests/interface/controleur.test.js`, add after `monter()` a variant that injects `downloads` and, if needed, a failing dépôt. Add `import { construireExport, COLLECTIONS_EXPORT } from '../../src/logique/sauvegarde.js';` at the top:

```js
describe('sauvegarde', () => {
  const avecDownloads = (save = vi.fn(async () => ({ status: 'saved' })), envelopper = d => d) => {
    const db = creerFausseBase();
    const depot = envelopper(creerDepot(db));
    const enregistreur = creerEnregistreur(f => depot.enregistrerFiche(f), 600);
    const etat = creerEtat({ profil: { ...fictif, version: 1 }, fiches: [], vue: 'profil', ancre: T, ficheOuverte: null, erreur: null, sauvegarde: 'ok' });
    const downloads = { save };
    const actions = creerControleur({ etat, depot, enregistreur, assets: null, horloge: () => T, downloads });
    return { db, depot, etat, actions, downloads };
  };
  const exportAvec = docs => JSON.stringify(construireExport({ ...Object.fromEntries(COLLECTIONS_EXPORT.map(c => [c, []])), ...docs }, T));

  it('exporte toutes les collections via downloads', async () => {
    const { db, actions, downloads } = avecDownloads();
    await db.doc('fiches/f1').set({ accroche: 'x' });
    expect(await actions.exporterDonnees()).toEqual({ ok: true, message: 'Export enregistré.' });
    const { filename, data } = downloads.save.mock.calls[0][0];
    expect(filename).toBe('studio-contenu-2026-09-28.json');
    expect(JSON.parse(data).collections.fiches).toEqual([{ id: 'f1', data: { accroche: 'x' } }]);
  });

  it('traduit les refus de téléchargement', async () => {
    const refuse = avecDownloads(vi.fn(async () => { throw { code: 'declined' }; }));
    expect(await refuse.actions.exporterDonnees()).toEqual({ ok: false, raison: 'Export annulé.' });
    const indispo = avecDownloads(vi.fn(async () => { throw { code: 'unavailable' }; }));
    expect(await indispo.actions.exporterDonnees()).toEqual({ ok: false, raison: 'L’export n’est pas disponible dans cette vue.' });
    const m = monter();
    expect(await m.actions.exporterDonnees()).toEqual({ ok: false, raison: 'L’export n’est pas disponible dans cette vue.' });
  });

  it('analyse puis restaure sans rien supprimer', async () => {
    const { db, actions } = avecDownloads();
    await db.doc('fiches/garde').set({ accroche: 'reste' });
    const a = await actions.analyserRestauration(exportAvec({ fiches: [{ id: 'f1', data: { accroche: 'restaurée' } }] }));
    expect(a.ok).toBe(true);
    expect(a.resume).toContain('fiches : 1');
    const r = await actions.restaurerDonnees(a.validation, { sauvegarder: false });
    expect(r).toEqual({ ok: true, message: 'Restauration terminée : 1 document(s) restauré(s).', restaures: 1 });
    expect(db._docs.get('fiches/f1')).toEqual({ accroche: 'restaurée' });
    expect(db._docs.get('fiches/garde')).toEqual({ accroche: 'reste' });
  });

  it('refuse un texte illisible ou un autre format sans rien écrire', async () => {
    const { db, actions } = avecDownloads();
    expect(await actions.analyserRestauration('pas du json')).toEqual({ ok: false, erreurs: ['Ce fichier n’est pas du JSON valide.'] });
    expect((await actions.analyserRestauration('{"format":"autre"}')).erreurs).toEqual(['Ce fichier n’est pas un export du studio.']);
    expect(db.ecritures).toEqual([]);
  });

  it('sauvegarde d’abord, et n’écrit rien si la sauvegarde est refusée', async () => {
    const { db, actions, downloads } = avecDownloads(vi.fn(async () => { throw { code: 'declined' }; }));
    const a = await actions.analyserRestauration(exportAvec({ fiches: [{ id: 'f1', data: {} }] }));
    const r = await actions.restaurerDonnees(a.validation, { sauvegarder: true });
    expect(r).toEqual({ ok: false, erreurs: ['Sauvegarde préalable impossible : Export annulé. Rien n’a été restauré.'], restaures: 0 });
    expect(downloads.save).toHaveBeenCalledTimes(1);
    expect(db.ecritures).toEqual([]);
  });

  it('s’arrête sur une écriture en échec et donne le compteur', async () => {
    let n = 0;
    const { actions } = avecDownloads(undefined, d => ({ ...d, ecrireDocument: async (...args) => { n += 1; if (n === 2) throw new Error('x'); return d.ecrireDocument(...args); } }));
    const a = await actions.analyserRestauration(exportAvec({ fiches: [{ id: 'f1', data: {} }, { id: 'f2', data: {} }, { id: 'f3', data: {} }] }));
    expect(await actions.restaurerDonnees(a.validation, { sauvegarder: false })).toEqual({
      ok: false, restaures: 1,
      erreurs: ['Restauration interrompue après 1 document(s) sur 3 : réessaie, les documents déjà restaurés seront simplement réécrits.'],
    });
  });
});
```

`monter()` is the file's existing helper (without `downloads`). Adapt `monter()`'s return if it does not expose `actions` under that name.

- [ ] **Step 2: Run to see them fail**

Run: `npx vitest run tests/logique/sauvegarde.test.js tests/donnees/depot.test.js tests/interface/controleur.test.js`
Expected: FAIL.

- [ ] **Step 3: Implement** `src/logique/sauvegarde.js` :

```js
import { cleJour } from './dates.js';

export const COLLECTIONS_EXPORT = ['profil', 'profil_archives', 'fiches', 'bulletins', 'stats_contenu', 'releves_compte', 'reference', 'reference_resultats', 'config'];
const FORMAT = 'studio-contenu-export';
const VERSION = 1;
const NOTE = 'Les visuels ne sont pas inclus : seuls leurs identifiants le sont.';

export function construireExport(collections, maintenant) {
  return {
    format: FORMAT, version: VERSION, exporte_le: maintenant, note: NOTE,
    collections: Object.fromEntries(COLLECTIONS_EXPORT.map(c => [c, collections[c] ?? []])),
  };
}

export const nomFichierExport = (maintenant, fuseau) => `studio-contenu-${cleJour(maintenant, fuseau || 'UTC')}.json`;

const estObjet = v => v != null && typeof v === 'object' && !Array.isArray(v);

export function validerExport(e) {
  if (!estObjet(e) || e.format !== FORMAT) return { ok: false, erreurs: ['Ce fichier n’est pas un export du studio.'] };
  if (e.version !== VERSION) return { ok: false, erreurs: [`Version d’export non prise en charge : ${e.version}.`] };
  if (!estObjet(e.collections)) return { ok: false, erreurs: ['Le fichier ne contient pas de collections.'] };
  const erreurs = [];
  const collections = {};
  for (const c of COLLECTIONS_EXPORT) {
    const liste = e.collections[c] ?? [];
    if (!Array.isArray(liste)) { erreurs.push(`${c} : liste de documents attendue.`); continue; }
    liste.forEach((d, i) => {
      if (!estObjet(d) || !estObjet(d.data)) {
        if (estObjet(d) && (typeof d.id !== 'string' || !d.id || d.id.includes('/'))) erreurs.push(`${c}, document ${i + 1} : identifiant invalide.`);
        else erreurs.push(`${c}, document ${i + 1} : contenu invalide.`);
        return;
      }
      if (typeof d.id !== 'string' || !d.id || d.id.includes('/')) erreurs.push(`${c}, document ${i + 1} : identifiant invalide.`);
    });
    collections[c] = liste;
  }
  if (erreurs.length) return { ok: false, erreurs };
  const total = COLLECTIONS_EXPORT.reduce((t, c) => t + collections[c].length, 0);
  const ignorees = Object.keys(e.collections).filter(c => !COLLECTIONS_EXPORT.includes(c));
  return { ok: true, collections, total, ignorees };
}

export function resumeRestauration({ collections, total, ignorees }) {
  const parties = COLLECTIONS_EXPORT.filter(c => collections[c].length).map(c => `${c} : ${collections[c].length}`);
  const base = `À restaurer : ${parties.join(', ') || 'rien'} (total ${total} document${total > 1 ? 's' : ''}). Les documents de même identifiant seront remplacés ; rien ne sera supprimé.`;
  return ignorees.length ? `${base} Collections inconnues ignorées : ${ignorees.join(', ')}.` : base;
}
```

Check the exact order of the error messages expected by the test « refuse les documents mal formés » : the first two (id `''` and `'a/b'`, with a valid `data`) give « identifiant invalide », and the last two (`data: []` and `'x'`) give « contenu invalide ». Adjust the code if needed, not the test.

- [ ] **Step 4: Implement the repository.** In `src/donnees/depot.js`, add:

```js
    async lireCollection(nom) {
      const snap = await db.collection(nom).get();
      return snap.docs.map(d => ({ id: d.id, data: d.data() }));
    },

    async ecrireDocument(collection, id, data) {
      await db.doc(`${collection}/${id}`).set(data);
    },
```

- [ ] **Step 5: Implement the controller.** In `src/interface/controleur.js` :
  - add `downloads = null` to the parameters of `creerControleur` ;
  - add `import { COLLECTIONS_EXPORT, construireExport, validerExport, resumeRestauration, nomFichierExport } from '../logique/sauvegarde.js';` ;
  - add before the `return {` :

```js
  const INDISPONIBLE_EXPORT = 'L’export n’est pas disponible dans cette vue.';

  async function exporterDonnees() {
    if (!downloads) return { ok: false, raison: INDISPONIBLE_EXPORT };
    let collections;
    try {
      collections = Object.fromEntries(await Promise.all(COLLECTIONS_EXPORT.map(async c => [c, await depot.lireCollection(c)])));
    } catch {
      return { ok: false, raison: 'L’export a échoué : réessaie dans un instant.' };
    }
    const maintenant = horloge();
    const exp = construireExport(collections, maintenant);
    try {
      await downloads.save({ filename: nomFichierExport(maintenant, etat.lire().profil?.regles_studio?.fuseau), data: JSON.stringify(exp, null, 2) });
    } catch (e) {
      if (e?.code === 'declined') return { ok: false, raison: 'Export annulé.' };
      if (e?.code === 'rate_limited') return { ok: false, raison: 'Une demande d’enregistrement est déjà ouverte : réessaie dans un instant.' };
      return { ok: false, raison: INDISPONIBLE_EXPORT };
    }
    return { ok: true, message: 'Export enregistré.' };
  }

  function analyserRestauration(texte) {
    let brut;
    try { brut = JSON.parse(texte); } catch { return { ok: false, erreurs: ['Ce fichier n’est pas du JSON valide.'] }; }
    const validation = validerExport(brut);
    if (!validation.ok) return { ok: false, erreurs: validation.erreurs };
    return { ok: true, resume: resumeRestauration(validation), validation };
  }

  async function restaurerDonnees(validation, { sauvegarder }) {
    if (sauvegarder) {
      const s = await exporterDonnees();
      if (!s.ok) return { ok: false, erreurs: [`Sauvegarde préalable impossible : ${s.raison} Rien n’a été restauré.`], restaures: 0 };
    }
    let restaures = 0;
    for (const c of COLLECTIONS_EXPORT) {
      for (const d of validation.collections[c]) {
        try {
          await depot.ecrireDocument(c, d.id, d.data);
        } catch {
          return { ok: false, restaures, erreurs: [`Restauration interrompue après ${restaures} document(s) sur ${validation.total} : réessaie, les documents déjà restaurés seront simplement réécrits.`] };
        }
        restaures += 1;
      }
    }
    return { ok: true, message: `Restauration terminée : ${restaures} document(s) restauré(s).`, restaures };
  }
```

  - expose `exporterDonnees`, `analyserRestauration` (asynchronous for callers: `analyserRestauration: async texte => analyserRestauration(texte)`) and `restaurerDonnees` in the returned object.

- [ ] **Step 6: Run the tests**

Run: `npx vitest run tests/logique/sauvegarde.test.js tests/donnees tests/interface/controleur.test.js`, puis `npm test`.
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/logique/sauvegarde.js src/donnees/depot.js src/interface/controleur.js tests/logique/sauvegarde.test.js tests/donnees/depot.test.js tests/interface/controleur.test.js
git commit -m "Sauvegarde : export complet via downloads et restauration sans suppression

Co-Authored-By: <modèle auteur>"
```

---

### Task 6 : section Sauvegarde et capacité downloads

**Files:**
- Modify: `src/interface/vue-profil.js`, `src/interface/app.js`, `src/interface/styles.css`
- Test: `tests/interface/reference.test.js` (or the test file that already covers `vueProfil` : search `vueProfil(` in `tests/interface`), `tests/interface/app.test.js`

**Interfaces:**
- Consumes (Task 5) : les actions `exporterDonnees`, `analyserRestauration` et `restaurerDonnees`.
- Produces : `capacites.downloads` (booléen) ; `demarrer` récupère `claude.use('downloads')` et le passe à `creerControleur`.

- [ ] **Step 1: Write the failing tests.** In the test file of `vueProfil` (find it with `grep -rl "vueProfil(" tests/interface`), add, importing `vueProfil` and `fictif` if needed:

```js
describe('section Sauvegarde', () => {
  const actionsSauvegarde = extra => ({
    importerProfil: vi.fn(), importerReference: vi.fn(), verifierReference: vi.fn(), arreterReference: vi.fn(),
    exporterDonnees: vi.fn(async () => ({ ok: true, message: 'Export enregistré.' })),
    analyserRestauration: vi.fn(async () => ({ ok: true, resume: 'À restaurer : fiches : 1 (total 1 document).', validation: { total: 1 } })),
    restaurerDonnees: vi.fn(async () => ({ ok: true, message: 'Restauration terminée : 1 document(s) restauré(s).', restaures: 1 })),
    ...extra,
  });
  const fichierJson = texte => ({ text: async () => texte, name: 'export.json' });
  const choisir = async (v, texte) => {
    const input = v.querySelector('.sauvegarde input[type="file"]');
    Object.defineProperty(input, 'files', { configurable: true, value: [fichierJson(texte)] });
    input.dispatchEvent(new Event('change'));
  };

  it('exporte et affiche le message', async () => {
    const a = actionsSauvegarde();
    const v = vueProfil({ profil: fictif }, a, { downloads: true });
    [...v.querySelectorAll('.sauvegarde button')].find(b => b.textContent === 'Exporter les données').click();
    await vi.waitFor(() => expect(v.querySelector('.sauvegarde').textContent).toContain('Export enregistré.'));
  });

  it('masque l’export sans downloads mais garde la restauration', () => {
    const v = vueProfil({ profil: fictif }, actionsSauvegarde(), { downloads: false });
    expect([...v.querySelectorAll('.sauvegarde button')].some(b => b.textContent === 'Exporter les données')).toBe(false);
    expect(v.querySelector('.sauvegarde').textContent).toContain('L’export n’est pas disponible dans cette vue.');
    expect(v.querySelector('.sauvegarde input[type="file"]')).not.toBeNull();
  });

  it('montre l’aperçu puis restaure après sauvegarde', async () => {
    const a = actionsSauvegarde();
    const v = vueProfil({ profil: fictif }, a, { downloads: true });
    await choisir(v, '{}');
    await vi.waitFor(() => expect(v.querySelector('.sauvegarde').textContent).toContain('À restaurer : fiches : 1'));
    [...v.querySelectorAll('.sauvegarde button')].find(b => b.textContent === 'Sauvegarder l’état actuel puis restaurer').click();
    await vi.waitFor(() => expect(a.restaurerDonnees).toHaveBeenCalledWith({ total: 1 }, { sauvegarder: true }));
    await vi.waitFor(() => expect(v.querySelector('.sauvegarde').textContent).toContain('Restauration terminée : 1 document(s) restauré(s).'));
  });

  it('sans downloads, seule la restauration sans sauvegarde est proposée', async () => {
    const a = actionsSauvegarde();
    const v = vueProfil({ profil: fictif }, a, { downloads: false });
    await choisir(v, '{}');
    await vi.waitFor(() => expect([...v.querySelectorAll('.sauvegarde button')].map(b => b.textContent)).toContain('Restaurer sans sauvegarde'));
    expect([...v.querySelectorAll('.sauvegarde button')].map(b => b.textContent)).not.toContain('Sauvegarder l’état actuel puis restaurer');
  });

  it('affiche les erreurs d’un fichier invalide', async () => {
    const a = actionsSauvegarde({ analyserRestauration: vi.fn(async () => ({ ok: false, erreurs: ['Ce fichier n’est pas un export du studio.'] })) });
    const v = vueProfil({ profil: fictif }, a, { downloads: true });
    await choisir(v, '{}');
    await vi.waitFor(() => expect(v.querySelector('.sauvegarde').textContent).toContain('Ce fichier n’est pas un export du studio.'));
    expect(a.restaurerDonnees).not.toHaveBeenCalled();
  });

  it('reste disponible tant qu’aucun profil n’est importé', () => {
    const v = vueProfil({ profil: null }, actionsSauvegarde(), { downloads: true });
    expect(v.querySelector('.sauvegarde')).not.toBeNull();
  });
});
```

The section also stays visible without a profile: that is how you restore a studio. The last test checks it.

In `tests/interface/app.test.js`, in the style of the existing tests (fake base, `demarrer`) :

```js
  it('passe downloads au contrôleur quand la capacité est disponible', async () => {
    const db = creerFausseBase();
    const save = vi.fn(async () => ({ status: 'saved' }));
    const racine = document.createElement('div');
    const app = await demarrer(racine, { use: async nom => (nom === 'db' ? db : nom === 'downloads' ? { save } : null) }, { horloge });
    expect(await app.actions.exporterDonnees()).toEqual({ ok: true, message: 'Export enregistré.' });
    await vi.waitFor(() => expect(racine.querySelector('.sauvegarde button')?.textContent).toBe('Exporter les données'));
  });
```

- [ ] **Step 2: Run to see them fail**

Run: `npx vitest run tests/interface`
Expected: FAIL.

- [ ] **Step 3: Implement the section.** In `src/interface/vue-profil.js`, add the function:

```js
function sectionSauvegarde(actions, capacites) {
  const message = h('p', { class: 'aide', role: 'status' });
  const erreurs = h('ul', { class: 'erreurs', 'aria-live': 'polite' });
  const apercu = h('div', { class: 'apercu-restauration' });
  const afficherErreurs = liste => erreurs.replaceChildren(...liste.map(m => h('li', {}, m)));

  async function exporter() {
    message.textContent = 'Préparation de l’export…';
    const r = await actions.exporterDonnees();
    message.textContent = r.ok ? r.message : r.raison;
  }

  async function restaurer(validation, sauvegarder) {
    apercu.replaceChildren();
    message.textContent = 'Restauration en cours…';
    const r = await actions.restaurerDonnees(validation, { sauvegarder });
    if (r.ok) { message.textContent = r.message; erreurs.replaceChildren(); return; }
    message.textContent = '';
    afficherErreurs(r.erreurs);
  }

  async function choisir(fichier) {
    if (!fichier) return;
    erreurs.replaceChildren();
    apercu.replaceChildren();
    message.textContent = '';
    const r = await actions.analyserRestauration(await fichier.text());
    if (!r.ok) { afficherErreurs(r.erreurs); return; }
    apercu.replaceChildren(
      h('p', {}, r.resume),
      h('div', { class: 'evaluation-actions' },
        capacites.downloads ? h('button', { type: 'button', class: 'bouton-principal', onclick: () => restaurer(r.validation, true) }, 'Sauvegarder l’état actuel puis restaurer') : null,
        h('button', { type: 'button', class: 'bouton-secondaire', onclick: () => restaurer(r.validation, false) }, 'Restaurer sans sauvegarde'),
        h('button', { type: 'button', class: 'bouton-lien', onclick: () => apercu.replaceChildren() }, 'Annuler')));
  }

  return h('section', { class: 'sauvegarde' },
    h('h2', {}, 'Sauvegarde'),
    h('p', { class: 'aide' }, 'L’export contient le profil, les fiches, les bulletins, les statistiques et le jeu de référence. Les visuels ne sont pas inclus : seuls leurs identifiants le sont.'),
    capacites.downloads
      ? h('button', { type: 'button', class: 'bouton-secondaire', onclick: exporter }, 'Exporter les données')
      : h('p', { class: 'aide' }, 'L’export n’est pas disponible dans cette vue.'),
    h('label', { class: 'champ' }, h('span', { class: 'champ-libelle' }, 'Restaurer depuis un export…'),
      h('input', { type: 'file', accept: '.json,application/json', onchange: e => choisir(e.target.files?.[0]) })),
    apercu, message, erreurs);
}
```

In `vueProfil`, append `sectionSauvegarde(actions, capacites)` to the end of the `enfants` list, whether or not a profile exists.

- [ ] **Step 4: Implement the capability.** In `src/interface/app.js` :
  - after `const sample = …`, add `const downloads = (await claude.use('downloads')) ?? null;` ;
  - pass `downloads` to `creerControleur({ …, downloads })` ;
  - in `creerRendu(racine, actions, { assets: !!assets, sample: !!sample }, horloge)`, add `downloads: !!downloads`.

- [ ] **Step 5: Add the styles** at the end of `src/interface/styles.css` :

```css
.sauvegarde { display: grid; gap: 10px; }
.apercu-restauration { display: grid; gap: 8px; }
```

- [ ] **Step 6: Run the tests**

Run: `npx vitest run tests/interface`, puis `npm test` et `npm run build`.
Expected: PASS. Le build sort `dist/studio.html`.

- [ ] **Step 7: Commit**

```bash
git add src/interface/vue-profil.js src/interface/app.js src/interface/styles.css tests/interface
git commit -m "Profil : section Sauvegarde (export et restauration)

Co-Authored-By: <modèle auteur>"
```

---

### Task 7 : mise en ligne et vérification

Cette tâche revient au contrôleur.

- [ ] **Step 1 :** lancer `npm test` et `npm run build`.
- [ ] **Step 2 :** republier `dist/studio.html` sur les deux studios avec la déclaration complète `capabilities: { db: {}, assets: {}, sample: {}, downloads: true }`. Une déclaration non vide remplace entièrement la précédente, d'où la déclaration complète.
- [ ] **Step 3 :** vérifier avec `ArtifactData` que la base du studio de test est intacte : `list` sur `fiches` et `stats_contenu`.
- [ ] **Step 4 : checklist pour Jean** :
  1. évaluer une fiche avec une image, puis avec une vidéo, et lire « Ce que Claude a examiné » ;
  2. lire le « Pourquoi » des recommandations ;
  3. dans le tableau de bord, vérifier que l'en-tête donne le nombre de contenus, que les deux tableaux s'affichent, et que le classement est masqué sous 5 contenus ;
  4. dans l'onglet Profil, faire « Exporter les données » et ouvrir le fichier ;
  5. sur le studio de test seulement, faire « Restaurer depuis un export… » avec ce fichier, puis « Sauvegarder l’état actuel puis restaurer ».
- [ ] **Step 5 :** mettre à jour le README, le fichier de passation et la fiche technique JSON, puis commit et push.
