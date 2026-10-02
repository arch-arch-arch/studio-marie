# Plan 8 : analyse par dossier : plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Un bouton « Analyser la semaine » (ou le mois) produit un PDF unique que la créatrice joint dans Claude ou ChatGPT ; elle colle la réponse dans le studio, qui range l'avis dans chaque fiche.

**Architecture:** La logique est pure et testée (`src/logique/dossier.js`, `src/logique/retour-dossier.js`). La fabrication du fichier (cartes sur canvas, PDF) vit dans `src/dossier/`, construite dans un second fichier `public/dossier.js` chargé à la demande. Le contrôleur orchestre ; une nouvelle collection `analyses` garde la correspondance des références et le retour.

**Tech Stack:** JavaScript vanilla (modules ES), DOM via `h()`, Vitest + happy-dom, esbuild, une dépendance nouvelle : `jspdf`.

**Spec:** `docs/superpowers/specs/2026-10-01-plan-8-analyse-par-dossier-design.md`

## Global Constraints

- Aucune donnée réelle, aucun secret, aucune adresse de projet dans le code, les tests ou la documentation. N'ouvrir aucun fichier `.env*` autre que `.env.example` ; ne rien lire dans `data/`.
- Interface en français, tutoiement, pas d'emoji. Caractères typographiques ’ « » à l'identique dans les messages.
- `h()` aplatit et ignore `null`/`false` ; `Element.replaceChildren` natif n'aplatit pas : seulement des nœuds.
- Une seule dépendance nouvelle : `jspdf`. Elle ne doit pas entrer dans `public/index.html`.
- Au plus 30 fiches par dossier ; fiches publiées exclues.
- Carte : bord long de 1 568 px au plus, JPEG qualité 0,85.
- Rôles de caption autorisés : `engagement`, `cta`, `deadpan`.
- Texte du PDF : Latin-1 seulement ; un caractère hors Latin-1 devient `[U+XXXX]`.
- Rien n'est écrit si le retour est illisible ou d'un dossier inconnu.
- Les règles calculées gardent l'autorité : un blocage calculé n'est pas levé par le modèle.
- Aucun appel réseau réel dans les tests.

## Review Focus

1. **Fiche modifiée entre le dossier et le retour** : elle ne doit pas recevoir de note sur son ancien texte ; le résultat le dit. (Task 3, test « écarte une fiche modifiée ».)
2. **Réponse du chat abîmée** : bloc sans `json`, préambule, marqueurs de citation, JSON coupé, deux blocs de code. Le studio lit ce qui est lisible et n'écrit rien sinon. (Task 2.)
3. **Retour collé deux fois, ou après un échec d'écriture** : pas de doublon, reprise possible. (Task 3, test « reprend après un échec ».)
4. **Photo de téléphone couchée ou visuel introuvable** : la carte est redressée ; un visuel manquant ne bloque pas le dossier et la fiche le mentionne. (Task 4, essai manuel de la Task 6 ; Task 1 pour la mention.)
5. **Caractères hors Latin-1 dans une caption** (émojis, guillemets courbes) : jamais d'exception à la génération, texte lisible. (Task 1, test `versLatin1` ; Task 4, test du PDF.)

---

### Task 1 : contenu du dossier (logique pure)

**Files:**
- Create: `src/logique/dossier.js`
- Test: `tests/logique/dossier.test.js`

**Interfaces:**
- Consumes : `debutSemaine`, `ajouterJours`, `debutMois`, `ajouterMois`, `cleSemaineIso`, `cleJour`, `heureLocale`, `partiesLocales` (`src/logique/dates.js`) ; `empreinte`, `LIBELLES_FORMAT` (`src/logique/fiche.js`) ; `verifierRegles` (`src/logique/regles-score.js`) ; `controlerSemaine` (`src/logique/controle.js`, renvoie une liste de pastilles `{ libelle, valeur, etat }`) ; `extraireProfilDetaille` (`src/claude/evaluation.js`, renvoie `{ texte, sections }` où `texte` est le JSON du profil réduit).
- Produces :
  - `FICHES_MAX = 30`, `MESSAGE_A_COLLER` (texte de la spec §3.5).
  - `periodeAffichee(vue, ancre, fuseau)` → `{ type: 'semaine' | 'mois', cle, debut, fin, libelle }`.
  - `choisirFiches(fiches, periode)` → `{ ok: true, fiches }` ou `{ ok: false, raison }`.
  - `codeDossier(aleatoire = Math.random)` → `'D-xxxxxx'`.
  - `attribuerReferences(fiches)` → `[{ ref: 'F01', id, empreinte }]`.
  - `etatVisuel(fiche, carte)` → `{ visuel: 'joint' | 'non_joint' | 'aucun', raison_visuel, mention }` ; `carte` vaut `{ ok: boolean }` ou `null`.
  - `versLatin1(texte)` → texte.
  - `contenuDossier({ profil, entrees, periode, code, toutesLesFiches })` → `{ titre, intro, strategie: [{ titre, lignes }], sectionsProfil, regles: [lignes], fiches: [{ ref, etiquette, lignes }], consigne: [lignes] }`. `entrees` est une liste de `{ ref, fiche, etat }` où `etat` vient de `etatVisuel`. Toutes les chaînes sont déjà passées par `versLatin1`.

- [ ] **Step 1: Write the failing tests** : `tests/logique/dossier.test.js`

```js
import { describe, it, expect } from 'vitest';
import fictif from '../../exemples/profil-fictif.json';
import { nouvelleFiche, empreinte } from '../../src/logique/fiche.js';
import {
  FICHES_MAX, MESSAGE_A_COLLER, periodeAffichee, choisirFiches, codeDossier, attribuerReferences, etatVisuel, versLatin1, contenuDossier,
} from '../../src/logique/dossier.js';

const FZ = 'Europe/Paris';
const profil = { ...fictif, version: 3 };
const fiche = (id, date_heure, plus = {}) => ({ ...nouvelleFiche({ id, format: 'reel', date_heure, pilier: profil.regles_studio.piliers[0].cle, maintenant: '2026-10-01T08:00:00.000Z' }), accroche: `Accroche ${id}`, caption: `Caption ${id}`, ...plus });

describe('periodeAffichee', () => {
  it('donne la semaine ou le mois affiché', () => {
    expect(periodeAffichee('semaine', '2026-10-07T10:00:00.000Z', FZ)).toEqual({
      type: 'semaine', cle: '2026-W41', debut: '2026-10-04T22:00:00.000Z', fin: '2026-10-11T22:00:00.000Z', libelle: 'semaine du 5 au 11 octobre 2026',
    });
    expect(periodeAffichee('mois', '2026-10-15T10:00:00.000Z', FZ)).toMatchObject({ type: 'mois', cle: '2026-10', debut: '2026-09-30T22:00:00.000Z', fin: '2026-10-31T23:00:00.000Z', libelle: 'octobre 2026' });
    expect(periodeAffichee('jour', '2026-10-07T10:00:00.000Z', FZ).type).toBe('semaine');
  });
});

describe('choisirFiches', () => {
  const periode = periodeAffichee('semaine', '2026-10-07T10:00:00.000Z', FZ);
  it('garde les fiches de la période qui ne sont pas publiées, par date', () => {
    const fiches = [
      fiche('b', '2026-10-08T10:00:00.000Z'), fiche('a', '2026-10-05T10:00:00.000Z'),
      fiche('p', '2026-10-06T10:00:00.000Z', { statut: 'publie' }), fiche('h', '2026-10-12T10:00:00.000Z'),
    ];
    const r = choisirFiches(fiches, periode);
    expect(r.ok).toBe(true);
    expect(r.fiches.map(f => f.id)).toEqual(['a', 'b']);
  });
  it('refuse une période vide ou trop chargée', () => {
    expect(choisirFiches([], periode)).toEqual({ ok: false, raison: 'Aucune fiche à analyser sur cette période.' });
    const trop = Array.from({ length: FICHES_MAX + 1 }, (_, i) => fiche(`f${i}`, '2026-10-06T10:00:00.000Z'));
    expect(choisirFiches(trop, periode)).toEqual({ ok: false, raison: 'Trop de fiches pour un seul dossier : analyse semaine par semaine.' });
  });
});

describe('références et code', () => {
  it('numérote les fiches et garde leur empreinte', () => {
    const fiches = [fiche('a', '2026-10-05T10:00:00.000Z'), fiche('b', '2026-10-06T10:00:00.000Z')];
    expect(attribuerReferences(fiches)).toEqual([
      { ref: 'F01', id: 'a', empreinte: empreinte(fiches[0]) }, { ref: 'F02', id: 'b', empreinte: empreinte(fiches[1]) },
    ]);
  });
  it('donne un code de dossier court', () => {
    expect(codeDossier(() => 0)).toMatch(/^D-[a-z0-9]{6}$/);
    expect(codeDossier()).not.toBe(codeDossier());
  });
});

describe('etatVisuel', () => {
  const f = plus => fiche('a', '2026-10-05T10:00:00.000Z', plus);
  it('couvre chaque cas de la spec', () => {
    expect(etatVisuel(f({}), null)).toEqual({ visuel: 'aucun', raison_visuel: null, mention: 'aucun' });
    expect(etatVisuel(f({ visuel: 'v', visuel_type: 'image' }), { ok: true })).toEqual({ visuel: 'joint', raison_visuel: null, mention: 'image' });
    expect(etatVisuel(f({ visuel: 'v', visuel_type: 'image', format: 'carrousel' }), { ok: true }).mention).toBe('image (une seule image du carrousel est fournie)');
    expect(etatVisuel(f({ visuel: 'v', visuel_type: 'video' }), { ok: true }).mention).toBe('vidéo (couverture et images extraites, de gauche à droite)');
    expect(etatVisuel(f({ visuel: 'v', visuel_type: 'video' }), { ok: false })).toEqual({ visuel: 'non_joint', raison_visuel: 'video', mention: 'vidéo, non jointe' });
    expect(etatVisuel(f({ visuel: 'v', visuel_type: 'image' }), { ok: false })).toEqual({ visuel: 'non_joint', raison_visuel: 'indisponible', mention: 'présent mais non joint' });
    expect(etatVisuel(f({ visuel: 'v', visuel_type: 'image' }), null).visuel).toBe('non_joint');
  });
});

describe('versLatin1', () => {
  it('garde le Latin-1, traduit la typographie et code le reste', () => {
    expect(versLatin1('Été « chic » à 5 €')).toBe('Été « chic » à 5 EUR');
    expect(versLatin1('l’œuvre… – fin — là')).toBe("l'oeuvre... - fin - là");
    expect(versLatin1('Feu 🔥 !')).toBe('Feu [U+1F525] !');
    expect(versLatin1('a b c')).toBe('a b c');
    expect(versLatin1(null)).toBe('');
  });
});

describe('contenuDossier', () => {
  const periode = periodeAffichee('semaine', '2026-10-07T10:00:00.000Z', FZ);
  const f1 = fiche('a', '2026-10-05T10:00:00.000Z', { visuel: 'v1', visuel_type: 'image', hashtags: ['nuit', 'club'], cta: true, role_caption: 'cta', caption: 'Feu 🔥' });
  const f2 = fiche('b', '2026-10-06T16:30:00.000Z', { format: 'story' });
  const entrees = [
    { ref: 'F01', fiche: f1, etat: etatVisuel(f1, { ok: true }) },
    { ref: 'F02', fiche: f2, etat: etatVisuel(f2, null) },
  ];
  const c = contenuDossier({ profil, entrees, periode, code: 'D-abc123', toutesLesFiches: [f1, f2] });
  const tout = JSON.stringify(c);

  it('présente la période, le code et la stratégie avant les fiches', () => {
    expect(c.titre).toBe("Dossier d'analyse : semaine du 5 au 11 octobre 2026");
    expect(c.intro).toContain('D-abc123');
    expect(c.strategie.length).toBeGreaterThan(0);
    expect(c.sectionsProfil).toContain('regles_studio');
    expect(c.strategie.every(s => typeof s.titre === 'string' && s.lignes.every(l => typeof l === 'string'))).toBe(true);
    expect(tout).not.toContain('{"');
  });
  it('donne les règles de la période', () => {
    expect(c.regles.join('\n')).toContain('Reels');
    expect(c.regles.join('\n')).toContain('2026-W41');
  });
  it('décrit chaque fiche dans un bloc délimité', () => {
    expect(c.fiches.map(x => x.ref)).toEqual(['F01', 'F02']);
    expect(c.fiches[0].etiquette).toBe('F01 · lun. 05/10 · Reel');
    const lignes = c.fiches[0].lignes;
    expect(lignes[0]).toBe('<fiche id="F01">');
    expect(lignes.at(-1)).toBe('</fiche>');
    const texte = lignes.join('\n');
    for (const attendu of ['date : lundi 5 octobre 2026, 12:00', 'format : Reel', `pilier : ${profil.regles_studio.piliers[0].nom}`, 'rôle de caption : cta', "appel vers l'offre : oui", 'mène à la porte : non', 'accroche : Accroche a', 'caption : Feu [U+1F525]', 'hashtags : nuit, club', 'visuel : image', 'alertes calculées :', 'blocages calculés :']) {
      expect(texte).toContain(attendu);
    }
    expect(c.fiches[1].lignes.join('\n')).toContain('visuel : aucun');
    expect(c.fiches[1].lignes.join('\n')).toContain('hashtags : aucun');
  });
  it('termine par la consigne, le code et la forme de la réponse', () => {
    const consigne = c.consigne.join('\n');
    for (const attendu of ['"dossier": "D-abc123"', 'engagement, cta, deadpan', 'Bloc à coller dans le studio :', '"periode"', '"ordre_conseille"', 'F01', '[U+', "une simple question au public n'est pas un appel vers l'offre", 'exactement 3 recommandations']) {
      expect(consigne).toContain(attendu);
    }
  });
  it('demande une analyse courte quand le dossier est long', () => {
    const beaucoup = Array.from({ length: 11 }, (_, i) => ({ ref: `F${String(i + 1).padStart(2, '0')}`, fiche: fiche(`x${i}`, '2026-10-05T10:00:00.000Z'), etat: etatVisuel(fiche('z', '2026-10-05T10:00:00.000Z'), null) }));
    const long = contenuDossier({ profil, entrees: beaucoup, periode, code: 'D-abc123', toutesLesFiches: beaucoup.map(e => e.fiche) });
    expect(long.consigne.join('\n')).toContain('au plus trois lignes par fiche');
    expect(c.consigne.join('\n')).not.toContain('au plus trois lignes par fiche');
  });
  it('fixe le message à coller', () => {
    expect(MESSAGE_A_COLLER).toBe('Voici le dossier d’analyse de mes contenus. Lis-le en entier, regarde chaque visuel, puis réponds en suivant exactement la consigne qui se trouve à la fin du dossier.');
  });
});
```

Les dates attendues supposent le profil fictif en `Europe/Paris`. Si `exemples/profil-fictif.json` a un autre fuseau, garde les assertions et passe `FZ` là où le test construit la période ; ne change pas le profil fictif.

- [ ] **Step 2: Run to see it fail**

Run: `npx vitest run tests/logique/dossier.test.js`
Expected: FAIL (module absent).

- [ ] **Step 3: Implement** `src/logique/dossier.js`

```js
import { debutSemaine, ajouterJours, debutMois, ajouterMois, cleSemaineIso, heureLocale, partiesLocales } from './dates.js';
import { empreinte, LIBELLES_FORMAT } from './fiche.js';
import { verifierRegles } from './regles-score.js';
import { controlerSemaine } from './controle.js';
import { extraireProfilDetaille } from '../claude/evaluation.js';

export const FICHES_MAX = 30;
export const MESSAGE_A_COLLER = 'Voici le dossier d’analyse de mes contenus. Lis-le en entier, regarde chaque visuel, puis réponds en suivant exactement la consigne qui se trouve à la fin du dossier.';
const ROLES = ['engagement', 'cta', 'deadpan'];
const ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';
const JOURS_COURTS = ['lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.', 'dim.'];
const deux = n => String(n).padStart(2, '0');
const date = (iso, fz, options) => new Intl.DateTimeFormat('fr-FR', { timeZone: fz, ...options }).format(new Date(iso));

export function periodeAffichee(vue, ancre, fuseau) {
  if (vue === 'mois') {
    const debut = debutMois(ancre, fuseau);
    const p = partiesLocales(debut, fuseau);
    return { type: 'mois', cle: `${p.annee}-${deux(p.mois)}`, debut, fin: ajouterMois(debut, 1, fuseau), libelle: date(debut, fuseau, { month: 'long', year: 'numeric' }) };
  }
  const debut = debutSemaine(ancre, fuseau);
  const dernier = ajouterJours(debut, 6, fuseau);
  return {
    type: 'semaine', cle: cleSemaineIso(debut, fuseau), debut, fin: ajouterJours(debut, 7, fuseau),
    libelle: `semaine du ${date(debut, fuseau, { day: 'numeric' })} au ${date(dernier, fuseau, { day: 'numeric', month: 'long', year: 'numeric' })}`,
  };
}

export function choisirFiches(fiches, periode) {
  const retenues = fiches
    .filter(f => f.date_heure >= periode.debut && f.date_heure < periode.fin && f.statut !== 'publie')
    .sort((a, b) => a.date_heure.localeCompare(b.date_heure) || a.id.localeCompare(b.id));
  if (!retenues.length) return { ok: false, raison: 'Aucune fiche à analyser sur cette période.' };
  if (retenues.length > FICHES_MAX) return { ok: false, raison: 'Trop de fiches pour un seul dossier : analyse semaine par semaine.' };
  return { ok: true, fiches: retenues };
}

export function codeDossier(aleatoire = Math.random) {
  let code = 'D-';
  for (let i = 0; i < 6; i += 1) code += ALPHABET[Math.floor(aleatoire() * ALPHABET.length) % ALPHABET.length];
  return code;
}

export const attribuerReferences = fiches => fiches.map((f, i) => ({ ref: `F${deux(i + 1)}`, id: f.id, empreinte: empreinte(f) }));

export function etatVisuel(fiche, carte) {
  if (!fiche.visuel) return { visuel: 'aucun', raison_visuel: null, mention: 'aucun' };
  const video = fiche.visuel_type === 'video';
  if (carte?.ok) {
    const mention = video ? 'vidéo (couverture et images extraites, de gauche à droite)'
      : fiche.format === 'carrousel' ? 'image (une seule image du carrousel est fournie)' : 'image';
    return { visuel: 'joint', raison_visuel: null, mention };
  }
  return video
    ? { visuel: 'non_joint', raison_visuel: 'video', mention: 'vidéo, non jointe' }
    : { visuel: 'non_joint', raison_visuel: 'indisponible', mention: 'présent mais non joint' };
}

const TYPO = { '’': "'", '‘': "'", '“': '"', '”': '"', '…': '...', '–': '-', '—': '-', 'œ': 'oe', 'Œ': 'OE', '€': 'EUR', ' ': ' ', ' ': ' ', ' ': ' ', '•': '-' };

export function versLatin1(texte) {
  let sortie = '';
  for (const c of String(texte ?? '')) {
    const code = c.codePointAt(0);
    if (TYPO[c] !== undefined) sortie += TYPO[c];
    else if (code <= 0xFF) sortie += c;
    else if (code === 0xFE0F || code === 0x200D) continue;
    else sortie += `[U+${code.toString(16).toUpperCase()}]`;
  }
  return sortie;
}

const titreSection = cle => cle.replace(/_/g, ' ');

function enListes(valeur, niveau = 0) {
  const retrait = '  '.repeat(niveau);
  if (Array.isArray(valeur)) {
    return valeur.flatMap(x => (x !== null && typeof x === 'object'
      ? enListes(x, niveau + 1).map((l, i) => (i === 0 ? `${retrait}- ${l.trimStart().replace(/^- /, '')}` : l))
      : [`${retrait}- ${x}`]));
  }
  if (valeur !== null && typeof valeur === 'object') {
    return Object.entries(valeur).flatMap(([k, x]) => (x !== null && typeof x === 'object'
      ? [`${retrait}- ${titreSection(k)} :`, ...enListes(x, niveau + 1)]
      : [`${retrait}- ${titreSection(k)} : ${x}`]));
  }
  return [`${retrait}${valeur}`];
}

function semainesDeLaPeriode(periode, fuseau) {
  const debuts = [];
  for (let d = debutSemaine(periode.debut, fuseau); d < periode.fin; d = ajouterJours(d, 7, fuseau)) debuts.push(d);
  return debuts;
}

function blocFiche({ ref, fiche, etat }, profil) {
  const regles = profil.regles_studio;
  const fz = regles.fuseau;
  const pilier = regles.piliers.find(p => p.cle === fiche.pilier)?.nom ?? fiche.pilier ?? '';
  const v = verifierRegles(fiche, regles);
  const liste = (xs, vide) => (xs.length ? xs.join(' ; ') : vide);
  return [
    `<fiche id="${ref}">`,
    `date : ${date(fiche.date_heure, fz, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}, ${heureLocale(fiche.date_heure, fz)}`,
    `format : ${LIBELLES_FORMAT[fiche.format] ?? fiche.format}`,
    `pilier : ${pilier}`,
    `rôle de caption : ${fiche.role_caption ?? 'non choisi'}`,
    `appel vers l'offre : ${fiche.cta ? 'oui' : 'non'}`,
    `mène à la porte : ${fiche.porte ? 'oui' : 'non'}`,
    `accroche : ${fiche.accroche ?? ''}`,
    `caption : ${fiche.caption ?? ''}`,
    `hashtags : ${liste(fiche.hashtags ?? [], 'aucun').replace(/ ; /g, ', ')}`,
    `géotag : ${fiche.geotag || 'aucun'}`,
    `visuel : ${etat.mention}`,
    `alertes calculées : ${liste(v.alertes.map(a => a.texte), 'aucune')}`,
    `blocages calculés : ${liste(v.conformite.causes, 'aucun')}`,
    '</fiche>',
  ].map(versLatin1);
}

function etiquette(ref, fiche, fz) {
  const p = partiesLocales(fiche.date_heure, fz);
  return versLatin1(`${ref} · ${JOURS_COURTS[p.jourSemaine - 1]} ${deux(p.jour)}/${deux(p.mois)} · ${LIBELLES_FORMAT[fiche.format] ?? fiche.format}`);
}

function consigne(entrees, code) {
  const refs = entrees.map(e => e.ref);
  const courte = entrees.length > 10 ? ' Dans cette partie, au plus trois lignes par fiche.' : '';
  const exemple = {
    dossier: code,
    fiches: [{
      id: refs[0],
      notes: { accroche: 7, voix: 8, mecanique: 6 },
      phrases: { accroche: '…', voix: '…', mecanique: '…' },
      conformite: { etat: 'vert', causes: [] },
      captions: [{ role: 'engagement', texte: '…' }, { role: 'deadpan', texte: '…' }],
      accroches: ['…', '…'],
      hashtags: ['mot'],
      recommandations: [{ texte: '…', pourquoi: '…' }, { texte: '…', pourquoi: '…' }, { texte: '…', pourquoi: '…' }],
    }],
    periode: { avis: '…', points_forts: ['…'], risques: ['…'], ordre_conseille: refs.slice(0, 2) },
  };
  return [
    'Tu es une éditrice exigeante. Analyse ces contenus Instagram au regard de la stratégie donnée plus haut.',
    'Chaque fiche a une référence, écrite en gros sur le bandeau noir de son visuel. Regarde le visuel et le texte ensemble.',
    'Tu notes chaque contenu sans le modifier ; tes captions et tes accroches sont des variantes à part, dans la voix du profil. N’invente aucune donnée.',
    '',
    'Ce que tu notes, de 0 à 10, pour chaque fiche :',
    '- accroche : force de l’accroche (lisible en moins d’une seconde, paradoxe ou question), potentiel d’envoi et de sauvegarde, visage face caméra si le visuel est joint ;',
    '- voix : test de voix et vocabulaire du profil, esthétique du visuel, cohérence avec le pilier ;',
    '- mecanique : première ligne qui provoque avant « …plus », une seule micro-action, structure attendue pour ce format.',
    'Conformité : "rouge" si la surface n’est pas SFW, si un groupe ou une identité est visé, si l’âge adulte est ambigu ou si un boost payant est suggéré ; "orange" si un risque mérite attention ; sinon "vert". Causes courtes et précises.',
    'Les alertes et blocages calculés par le studio font autorité : tu ne peux pas lever un blocage.',
    "Le champ « appel vers l'offre » ne concerne que le renvoi vers l'offre : une simple question au public n'est pas un appel vers l'offre.",
    'Les caractères que ce document ne sait pas écrire (émojis) sont notés par leur code entre crochets, par exemple [U+1F525].',
    '',
    'Ta réponse a deux parties.',
    `1. D’abord ton analyse en français courant, fiche par fiche, puis sur l’ensemble de la période.${courte}`,
    '2. Ensuite, la phrase « Bloc à coller dans le studio : » suivie d’UN SEUL bloc de code JSON, de cette forme exacte :',
    '',
    JSON.stringify(exemple, null, 2),
    '',
    `Contraintes du bloc : une entrée par fiche, dans l’ordre, avec les références recopiées telles quelles (${refs[0]} à ${refs.at(-1)}) ; une phrase par critère ; exactement 2 captions de rôles différents parmi engagement, cta, deadpan ; 2 ou 3 accroches ; hashtags sans # ; exactement 3 recommandations concrètes, chacune avec un pourquoi court qui cite ce que tu as observé ; "ordre_conseille" ne contient que des références du dossier ; tout en français ; aucun texte après le bloc.`,
  ].flatMap(l => l.split('\n')).map(versLatin1);
}

export function contenuDossier({ profil, entrees, periode, code, toutesLesFiches }) {
  const fz = profil.regles_studio.fuseau;
  const detail = extraireProfilDetaille(profil);
  const extrait = JSON.parse(detail.texte);
  const strategie = detail.sections.map(cle => ({ titre: versLatin1(titreSection(cle)), lignes: enListes(extrait[cle]).map(versLatin1) }));
  const regles = semainesDeLaPeriode(periode, fz).flatMap(debut => [
    `Semaine ${cleSemaineIso(debut, fz)} :`,
    ...controlerSemaine(toutesLesFiches, profil.regles_studio, debut).map(p => `- ${p.libelle} : ${p.valeur} (${p.etat})`),
  ]).map(versLatin1);
  return {
    titre: versLatin1(`Dossier d'analyse : ${periode.libelle}`),
    intro: versLatin1(`Dossier ${code}. Ce document contient la stratégie du compte, les règles de la période, puis une page par contenu avec son visuel. Chaque contenu a une référence (F01, F02…) écrite en gros sur le bandeau noir de son visuel. La consigne et la forme de la réponse sont à la fin.`),
    strategie,
    sectionsProfil: detail.sections,
    regles,
    fiches: entrees.map(e => ({ ref: e.ref, etiquette: etiquette(e.ref, e.fiche, fz), lignes: blocFiche(e, profil) })),
    consigne: consigne(entrees, code),
  };
}
```

Si le rendu de `enListes` sur le profil fictif produit des lignes mal indentées, corrige la fonction : le test n'exige que des chaînes et l'absence de JSON brut (`{"`).

- [ ] **Step 4: Run the tests**

Run: `npx vitest run tests/logique/dossier.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/logique/dossier.js tests/logique/dossier.test.js
git commit -m "Dossier d'analyse : période, choix des fiches, références et contenu

Co-Authored-By: <modèle auteur>"
```

---

### Task 2 : lecture et validation du retour

**Files:**
- Create: `src/logique/retour-dossier.js`
- Test: `tests/logique/retour-dossier.test.js`

**Interfaces:**
- Consumes : `validerReponse(r)` (`src/claude/evaluation.js`) → `{ ok: true, jugement }` ou `{ ok: false, erreurs }`.
- Produces :
  - `lireRetour(texte)` → `{ ok: true, dossier, fiches: [objet brut], periode: objet | null }` ou `{ ok: false, raison }`.
  - `validerRetour(retour, analyse)` → `{ valides: [{ ref, id, empreinte, jugement }], ecartees: [{ ref, raison }], periode: { avis, points_forts, risques, ordre_conseille } | null }`. `analyse` est le document de la collection `analyses` (`{ fiches: [{ ref, id, empreinte }] }`).
  - `MESSAGE_SANS_BLOC`, `MESSAGE_COUPE`.

- [ ] **Step 1: Write the failing tests** : `tests/logique/retour-dossier.test.js`

```js
import { describe, it, expect } from 'vitest';
import { lireRetour, validerRetour, MESSAGE_SANS_BLOC, MESSAGE_COUPE } from '../../src/logique/retour-dossier.js';

const jugement = (id, plus = {}) => ({
  id,
  notes: { accroche: 7, voix: 8, mecanique: 6 },
  phrases: { accroche: 'Bonne.', voix: 'Juste.', mecanique: 'Claire.' },
  conformite: { etat: 'vert', causes: [] },
  captions: [{ role: 'engagement', texte: 'A ?' }, { role: 'deadpan', texte: 'B.' }],
  accroches: ['Une', 'Deux'],
  hashtags: ['nuit'],
  recommandations: [{ texte: 'r1', pourquoi: 'p1' }, { texte: 'r2', pourquoi: 'p2' }, { texte: 'r3', pourquoi: 'p3' }],
  ...plus,
});
const bloc = (objet, langue = 'json') => `\`\`\`${langue}\n${JSON.stringify(objet, null, 2)}\n\`\`\``;
const objet = { dossier: 'D-abc123', fiches: [jugement('F01'), jugement('F02')], periode: { avis: 'Bien.', points_forts: ['a'], risques: ['b'], ordre_conseille: ['F02', 'F01', 'F09'] } };
const analyse = { fiches: [{ ref: 'F01', id: 'a', empreinte: 'e1' }, { ref: 'F02', id: 'b', empreinte: 'e2' }] };

describe('lireRetour', () => {
  it('lit le dernier bloc de code, avec ou sans mention json', () => {
    const texte = `Voici mon analyse.\n\n\`\`\`json\n{"exemple": true}\n\`\`\`\n\nBloc à coller dans le studio :\n${bloc(objet)}`;
    expect(lireRetour(texte)).toMatchObject({ ok: true, dossier: 'D-abc123' });
    expect(lireRetour(`Analyse…\n${bloc(objet, '')}`).ok).toBe(true);
  });
  it('lit un objet sans bloc de code, malgré un préambule', () => {
    const r = lireRetour(`Voici : ${JSON.stringify(objet)} Voilà.`);
    expect(r.ok).toBe(true);
    expect(r.fiches).toHaveLength(2);
  });
  it('retire les marqueurs de citation des textes', () => {
    const sale = { ...objet, periode: { ...objet.periode, avis: 'Bien. Source : :codex-file-citation{path="x.pdf" purpose="source"}. Fin 【4†source】 [oaicite:2] citeturn0file0.' } };
    expect(lireRetour(bloc(sale)).periode.avis).toBe('Bien. Source : . Fin .');
  });
  it('explique un retour vide, sans bloc ou coupé', () => {
    expect(lireRetour('')).toEqual({ ok: false, raison: MESSAGE_SANS_BLOC });
    expect(lireRetour('Juste du texte.')).toEqual({ ok: false, raison: MESSAGE_SANS_BLOC });
    expect(lireRetour(`\`\`\`json\n${JSON.stringify(objet).slice(0, 200)}`)).toEqual({ ok: false, raison: MESSAGE_COUPE });
    expect(lireRetour(bloc({ fiches: [] }))).toEqual({ ok: false, raison: MESSAGE_SANS_BLOC });
    expect(lireRetour(bloc({ dossier: 'D-abc123', fiches: 'non' }))).toEqual({ ok: false, raison: MESSAGE_SANS_BLOC });
  });
  it('fixe les messages', () => {
    expect(MESSAGE_SANS_BLOC).toBe('Je ne trouve pas le bloc à coller dans cette réponse. Copie toute la réponse de l’assistant, puis recolle-la.');
    expect(MESSAGE_COUPE).toBe(`${MESSAGE_SANS_BLOC} Si la réponse a été coupée, demande à l’assistant de redonner seulement le bloc.`);
  });
});

describe('validerRetour', () => {
  it('relie chaque fiche valide à son identifiant', () => {
    const r = validerRetour(lireRetour(bloc(objet)), analyse);
    expect(r.valides.map(v => [v.ref, v.id, v.empreinte])).toEqual([['F01', 'a', 'e1'], ['F02', 'b', 'e2']]);
    expect(r.valides[0].jugement.recommandations[0]).toEqual({ texte: 'r1', pourquoi: 'p1' });
    expect(r.ecartees).toEqual([]);
    expect(r.periode).toEqual({ avis: 'Bien.', points_forts: ['a'], risques: ['b'], ordre_conseille: ['F02', 'F01'] });
  });
  it('écarte les fiches invalides, inconnues ou en double et garde les autres', () => {
    const mauvais = { ...objet, fiches: [jugement('F01'), jugement('F02', { captions: [{ role: 'envoi', texte: 'x' }, { role: 'deadpan', texte: 'y' }] }), jugement('F07'), jugement('F01'), { notes: {} }] };
    const r = validerRetour(lireRetour(bloc(mauvais)), analyse);
    expect(r.valides.map(v => v.ref)).toEqual(['F01']);
    expect(r.ecartees).toEqual([
      { ref: 'F02', raison: 'réponse incomplète (captions : exactement 2 captions de rôles différents.)' },
      { ref: 'F07', raison: 'référence inconnue' },
      { ref: 'F01', raison: 'référence en double' },
      { ref: '?', raison: 'référence inconnue' },
    ]);
  });
  it('signale les fiches du dossier absentes de la réponse', () => {
    const r = validerRetour(lireRetour(bloc({ ...objet, fiches: [jugement('F01')] })), analyse);
    expect(r.ecartees).toEqual([{ ref: 'F02', raison: 'absente de la réponse' }]);
  });
  it('tolère une période absente ou invalide', () => {
    expect(validerRetour(lireRetour(bloc({ dossier: 'D-abc123', fiches: [jugement('F01')] })), analyse).periode).toBeNull();
    expect(validerRetour(lireRetour(bloc({ ...objet, periode: { avis: 3 } })), analyse).periode).toBeNull();
    expect(validerRetour(lireRetour(bloc({ ...objet, periode: { avis: 'Ok.', points_forts: 'x', risques: [1, 'r'] } })), analyse).periode)
      .toEqual({ avis: 'Ok.', points_forts: [], risques: ['r'], ordre_conseille: [] });
  });
});
```

- [ ] **Step 2: Run to see it fail**

Run: `npx vitest run tests/logique/retour-dossier.test.js`
Expected: FAIL.

- [ ] **Step 3: Implement** `src/logique/retour-dossier.js`

```js
import { validerReponse } from '../claude/evaluation.js';

export const MESSAGE_SANS_BLOC = 'Je ne trouve pas le bloc à coller dans cette réponse. Copie toute la réponse de l’assistant, puis recolle-la.';
export const MESSAGE_COUPE = `${MESSAGE_SANS_BLOC} Si la réponse a été coupée, demande à l’assistant de redonner seulement le bloc.`;

const CITATIONS = [/:codex-file-citation\{[^}]*\}/g, /【[^】]*】/g, /\[oaicite:[^\]]*\]/g, /?cite[^\s.]*?/g, /\bciteturn\S*/g];
const estObjet = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const estTexte = v => typeof v === 'string' && v.trim().length > 0;

function nettoyer(valeur) {
  if (typeof valeur === 'string') {
    let t = valeur;
    for (const re of CITATIONS) t = t.replace(re, '');
    return t.replace(/[ \t]{2,}/g, ' ').replace(/ +([.,;:!?])/g, (m, p, i, s) => (/[:;!?]/.test(p) && s[i - 1] !== ' ' ? m : m)).trim();
  }
  if (Array.isArray(valeur)) return valeur.map(nettoyer);
  if (estObjet(valeur)) return Object.fromEntries(Object.entries(valeur).map(([k, v]) => [k, nettoyer(v)]));
  return valeur;
}

function candidats(texte) {
  const blocs = [...texte.matchAll(/```[a-zA-Z]*\s*\n([\s\S]*?)```/g)].map(m => m[1]).reverse();
  const debut = texte.indexOf('{');
  const fin = texte.lastIndexOf('}');
  if (debut >= 0 && fin > debut) blocs.push(texte.slice(debut, fin + 1));
  return blocs;
}

export function lireRetour(texte) {
  const brut = String(texte ?? '');
  for (const c of candidats(brut)) {
    let objet;
    try { objet = JSON.parse(c); } catch { continue; }
    if (estObjet(objet) && estTexte(objet.dossier) && Array.isArray(objet.fiches)) {
      const propre = nettoyer(objet);
      return { ok: true, dossier: propre.dossier.trim(), fiches: propre.fiches, periode: estObjet(propre.periode) ? propre.periode : null };
    }
  }
  const coupe = /"dossier"\s*:/.test(brut);
  return { ok: false, raison: coupe ? MESSAGE_COUPE : MESSAGE_SANS_BLOC };
}

function validerPeriode(p, refs) {
  if (!estObjet(p) || !estTexte(p.avis)) return null;
  const textes = xs => (Array.isArray(xs) ? xs.filter(estTexte).map(s => s.trim()) : []);
  return { avis: p.avis.trim(), points_forts: textes(p.points_forts), risques: textes(p.risques), ordre_conseille: textes(p.ordre_conseille).filter(r => refs.has(r)) };
}

export function validerRetour(retour, analyse) {
  const parRef = new Map(analyse.fiches.map(f => [f.ref, f]));
  const vues = new Set();
  const valides = [];
  const ecartees = [];
  for (const brute of retour.fiches) {
    const ref = estObjet(brute) && estTexte(brute.id) ? brute.id.trim() : '?';
    const connue = parRef.get(ref);
    if (!connue) { ecartees.push({ ref, raison: 'référence inconnue' }); continue; }
    if (vues.has(ref)) { ecartees.push({ ref, raison: 'référence en double' }); continue; }
    vues.add(ref);
    const v = validerReponse(brute);
    if (!v.ok) { ecartees.push({ ref, raison: `réponse incomplète (${v.erreurs[0]})` }); continue; }
    valides.push({ ref, id: connue.id, empreinte: connue.empreinte, jugement: v.jugement });
  }
  for (const f of analyse.fiches) if (!vues.has(f.ref)) ecartees.push({ ref: f.ref, raison: 'absente de la réponse' });
  return { valides, ecartees, periode: validerPeriode(retour.periode, new Set(parRef.keys())) };
}
```

Simplifie `nettoyer` si besoin : le seul comportement exigé est celui du test (marqueurs retirés, espaces doubles réduits, espace avant un point supprimé). Le test attend `'Bien. Source : . Fin .'` : l'espace avant « : » est gardé, les espaces avant « . » sont retirés.

- [ ] **Step 4: Run the tests**

Run: `npx vitest run tests/logique/retour-dossier.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/logique/retour-dossier.js tests/logique/retour-dossier.test.js
git commit -m "Dossier d'analyse : lecture et validation du retour collé

Co-Authored-By: <modèle auteur>"
```

---

### Task 3 : données, contrôleur et application aux fiches

**Files:**
- Modify: `src/donnees/depot.js`, `src/logique/sauvegarde.js`, `src/logique/score.js`, `src/interface/controleur.js`, `src/interface/app.js`
- Test: `tests/donnees/depot.test.js`, `tests/logique/sauvegarde.test.js`, `tests/logique/score.test.js`, `tests/interface/controleur.test.js`

**Interfaces:**
- Consumes : Task 1 (`periodeAffichee`, `choisirFiches`, `codeDossier`, `attribuerReferences`, `etatVisuel`, `contenuDossier`, `MESSAGE_A_COLLER`) ; Task 2 (`lireRetour`, `validerRetour`) ; l'existant `verifierRegles`, `composerScore`, `construireExamen`, `appliquerEvaluation`, `empreinte`, `verrouillerSiRouge`, `ecrireMaintenant`, `remplacer`, `trouver` du contrôleur.
- Produces :
  - Dépôt : `enregistrerAnalyse(code, doc)`, `lireAnalyse(code)` → doc ou `null`, `ecouterAnalyses(rappel, erreur)` → liste de `{ id, ...data }`.
  - `COLLECTIONS_EXPORT` contient `'analyses'` en dernier.
  - `nomAssistant(examen)` → `'Claude' | 'ChatGPT' | 'l’assistant'` ; `lignesExamen(examen)` commence par « Analyse par dossier (Claude). » quand `examen.source === 'dossier'`.
  - Capacité injectée `dossier` du contrôleur : `{ fabrique(): Promise<{ preparerCartes(demandes, chargerVisuel), assemblerPdf(contenu, cartes) }>, peutPartager(fichier), partager(fichier), copier(texte) }`.
    - `preparerCartes([{ ref, etiquette, visuel, type }], chargerVisuel)` → `Map<ref, { ok: boolean, carte?: Blob }>`.
    - `assemblerPdf(contenu, cartes)` → `Blob` (`application/pdf`).
  - Actions du contrôleur :
    - `ouvrirAnalyse()` : met `etat.analyse = { etape: 'preparation' }`, puis `{ etape: 'pret', code, periode, nombre, sansVisuel: [ref], fichier: Blob, nom, retour: null }` ou `{ etape: 'erreur', message }`.
    - `fermerAnalyse()` : `etat.analyse = null`.
    - `partagerDossier()`, `telechargerDossier()`, `copierMessage()` → `{ ok, message }`.
    - `noterAssistant(nom)` : enregistre `assistant` dans le document du dossier ouvert.
    - `enregistrerRetour(texte)` → `{ ok: true, appliquees: n, ecartees: [{ ref, raison }], avisRecu: boolean }` ou `{ ok: false, raison }`.
  - État : `analyse` (ci-dessus) et `analyses` (liste des documents, alimentée par `ecouterAnalyses`).

- [ ] **Step 1: Write the failing tests.**

Dans `tests/logique/sauvegarde.test.js` :

```js
describe('collection analyses', () => {
  it('est exportée, et un export ancien sans elle reste valide', () => {
    expect(COLLECTIONS_EXPORT.at(-1)).toBe('analyses');
    const ancien = { format: 'studio-contenu-export', version: 1, exporte_le: '2026-10-01T08:00:00.000Z', collections: { fiches: [{ id: 'f1', data: {} }] } };
    const v = validerExport(ancien);
    expect(v.ok).toBe(true);
    expect(v.collections.analyses).toEqual([]);
  });
});
```

Ajoute `analyses: 'analyses'` aux libellés de `resumeRestauration` et vérifie que les tests existants de ce fichier restent verts (certains énumèrent les collections : mets-les à jour en ajoutant `analyses`, sans retirer d'assertion).

Dans `tests/logique/score.test.js` :

```js
describe('analyse par dossier', () => {
  const base = { visuel: 'joint', raison_visuel: null, version_profil: 2, sections_profil: ['regles_studio'], contenus_semaine: 4, alertes_calculees: 0, blocages_calcules: 0 };
  it('nomme l’assistant et l’annonce en première ligne', () => {
    expect(nomAssistant({ ...base, source: 'dossier', assistant: 'chatgpt' })).toBe('ChatGPT');
    expect(nomAssistant({ ...base, source: 'dossier', assistant: 'claude' })).toBe('Claude');
    expect(nomAssistant({ ...base, source: 'dossier', assistant: 'inconnu' })).toBe('l’assistant');
    expect(nomAssistant(base)).toBe('Claude');
    expect(nomAssistant(null)).toBe('Claude');
    expect(lignesExamen({ ...base, source: 'dossier', assistant: 'chatgpt' })[0]).toBe('Analyse par dossier (ChatGPT).');
    expect(lignesExamen({ ...base, source: 'dossier', assistant: 'inconnu' })[0]).toBe('Analyse par dossier.');
    expect(lignesExamen(base)[0]).toBe('Visuel examiné.');
  });
});
```

Dans `tests/donnees/depot.test.js` (regarde comment ce fichier crée la fausse base) :

```js
describe('analyses', () => {
  it('enregistre, relit et écoute les dossiers', async () => {
    const db = creerFausseBase();
    const depot = creerDepot(db);
    expect(await depot.lireAnalyse('D-abc123')).toBeNull();
    await depot.enregistrerAnalyse('D-abc123', { cree_le: 'T', fiches: [] });
    expect(await depot.lireAnalyse('D-abc123')).toEqual({ cree_le: 'T', fiches: [] });
    const vus = [];
    depot.ecouterAnalyses(liste => vus.push(liste.map(a => a.id)));
    await vi.waitFor(() => expect(vus.at(-1)).toEqual(['D-abc123']));
  });
});
```

Dans `tests/interface/controleur.test.js`. Étends l'aide `monter` pour accepter `dossier` et le passer à `creerControleur` (les appels existants ne changent pas) :

```js
function fauxDossier({ cartes = () => ({ ok: true, carte: new Blob(['c'], { type: 'image/jpeg' }) }), pdfEchoue = false, partage = true } = {}) {
  const appels = { demandes: null, contenu: null, partages: [], copies: [] };
  return {
    appels,
    fabrique: async () => ({
      preparerCartes: async demandes => { appels.demandes = demandes; return new Map(demandes.map(d => [d.ref, cartes(d)])); },
      assemblerPdf: async (contenu, lesCartes) => {
        if (pdfEchoue) throw new Error('pdf');
        appels.contenu = contenu; appels.cartes = lesCartes;
        return new Blob(['%PDF'], { type: 'application/pdf' });
      },
    }),
    peutPartager: () => partage,
    partager: async fichier => { appels.partages.push(fichier); },
    copier: async texte => { appels.copies.push(texte); },
  };
}

const reponse = (code, refs, plus = {}) => '```json\n' + JSON.stringify({
  dossier: code,
  fiches: refs.map(id => ({
    id, notes: { accroche: 7, voix: 8, mecanique: 6 }, phrases: { accroche: 'a', voix: 'b', mecanique: 'c' },
    conformite: { etat: 'vert', causes: [] }, captions: [{ role: 'engagement', texte: 'A ?' }, { role: 'deadpan', texte: 'B.' }],
    accroches: ['Une', 'Deux'], hashtags: ['nuit'],
    recommandations: [{ texte: 'r1', pourquoi: 'p1' }, { texte: 'r2', pourquoi: 'p2' }, { texte: 'r3', pourquoi: 'p3' }],
  })),
  periode: { avis: 'Semaine correcte.', points_forts: ['x'], risques: ['y'], ordre_conseille: refs },
  ...plus,
}) + '\n```';

describe('analyse par dossier', () => {
  async function avecDeuxFiches(options) {
    const dossier = fauxDossier(options);
    const m = monter({ dossier, assets: { upload: vi.fn(), telecharger: vi.fn(async () => new Blob(['i'], { type: 'image/png' })) } });
    await m.actions.creerFiche({ format: 'reel', date_heure: '2026-09-29T10:00:00.000Z' });
    await m.actions.creerFiche({ format: 'story', date_heure: '2026-09-30T10:00:00.000Z' });
    const [a, b] = m.etat.lire().fiches;
    m.actions.modifierFiche(a.id, { accroche: 'Première', caption: 'Texte', visuel: 'v1', visuel_type: 'image' });
    m.actions.modifierFiche(b.id, { accroche: 'Seconde', caption: 'Texte' });
    await m.actions.fermerPanneau();
    return { ...m, dossier, a: m.etat.lire().fiches.find(f => f.id === a.id), b: m.etat.lire().fiches.find(f => f.id === b.id) };
  }

  it('prépare le dossier, l’enregistre et le met à disposition', async () => {
    const { actions, etat, db, dossier, a, b } = await avecDeuxFiches();
    await actions.ouvrirAnalyse();
    const an = etat.lire().analyse;
    expect(an).toMatchObject({ etape: 'pret', nombre: 2, sansVisuel: [], nom: 'analyse-2026-W40.pdf' });
    expect(an.code).toMatch(/^D-/);
    expect(an.fichier.type).toBe('application/pdf');
    expect(dossier.appels.demandes).toEqual([{ ref: 'F01', etiquette: expect.stringContaining('F01'), visuel: 'v1', type: 'image' }]);
    expect(dossier.appels.contenu.fiches.map(f => f.ref)).toEqual(['F01', 'F02']);
    const doc = db.lire(`analyses/${an.code}`);
    expect(doc).toMatchObject({
      periode: { type: 'semaine', cle: '2026-W40' }, cree_le: T, assistant: 'inconnu',
      fiches: [{ ref: 'F01', id: a.id, empreinte: empreinte(a), visuel: 'joint', raison_visuel: null }, { ref: 'F02', id: b.id, empreinte: empreinte(b), visuel: 'aucun', raison_visuel: null }],
    });
    expect(doc.retour).toBeUndefined();
  });

  it('signale les fiches parties sans visuel et les erreurs de préparation', async () => {
    const sans = await avecDeuxFiches({ cartes: () => ({ ok: false }) });
    await sans.actions.ouvrirAnalyse();
    expect(sans.etat.lire().analyse.sansVisuel).toEqual(['F01']);
    const casse = await avecDeuxFiches({ pdfEchoue: true });
    await casse.actions.ouvrirAnalyse();
    expect(casse.etat.lire().analyse).toEqual({ etape: 'erreur', message: 'Le dossier n’a pas pu être préparé : réessaie.' });
    expect(casse.db.lister('analyses')).toEqual([]);
    const vide = monter({ dossier: fauxDossier() });
    await vide.actions.ouvrirAnalyse();
    expect(vide.etat.lire().analyse).toEqual({ etape: 'erreur', message: 'Aucune fiche à analyser sur cette période.' });
    const absent = monter();
    await absent.actions.ouvrirAnalyse();
    expect(absent.etat.lire().analyse).toEqual({ etape: 'erreur', message: 'L’analyse par dossier n’est pas disponible dans cette vue.' });
  });

  it('partage, télécharge et copie', async () => {
    const { actions, dossier } = await avecDeuxFiches();
    await actions.ouvrirAnalyse();
    expect(await actions.partagerDossier()).toEqual({ ok: true, message: 'Dossier partagé.' });
    expect(dossier.appels.partages).toHaveLength(1);
    expect(await actions.copierMessage()).toEqual({ ok: true, message: 'Message copié.' });
    expect(dossier.appels.copies[0]).toContain('Voici le dossier d’analyse de mes contenus.');
    expect((await actions.telechargerDossier()).ok).toBe(false);
  });

  it('applique le retour à chaque fiche et garde l’avis de la période', async () => {
    const { actions, etat, db, a, b } = await avecDeuxFiches();
    await actions.ouvrirAnalyse();
    const { code } = etat.lire().analyse;
    await actions.noterAssistant('chatgpt');
    const r = await actions.enregistrerRetour(`Mon analyse…\n\nBloc à coller dans le studio :\n${reponse(code, ['F01', 'F02'])}`);
    expect(r).toEqual({ ok: true, appliquees: 2, ecartees: [], avisRecu: true });
    const fa = db.lire(`fiches/${a.id}`);
    expect(fa.score.total).toBeGreaterThan(0);
    expect(fa.score.examen).toMatchObject({ source: 'dossier', assistant: 'chatgpt', visuel: 'joint', contenus_semaine: 1, version_profil: 1 });
    expect(fa.recommandations).toHaveLength(3);
    expect(fa.variantes.map(v => v.role)).toEqual(['engagement', 'deadpan']);
    expect(db.lire(`fiches/${b.id}`).score.examen.visuel).toBe('aucun');
    expect(db.lire(`analyses/${code}`).retour).toMatchObject({ recu_le: T, avis: 'Semaine correcte.', ordre_conseille: ['F01', 'F02'], appliquees: [a.id, b.id], ecartees: [] });
    expect(etat.lire().analyse.retour).toEqual(r);
  });

  it('écarte une fiche modifiée ou supprimée depuis le dossier', async () => {
    const { actions, etat, db, a, b } = await avecDeuxFiches();
    await actions.ouvrirAnalyse();
    const { code } = etat.lire().analyse;
    actions.modifierFiche(a.id, { accroche: 'Autre accroche' });
    await actions.supprimerFiche(b.id);
    const r = await actions.enregistrerRetour(reponse(code, ['F01', 'F02']));
    expect(r).toEqual({ ok: true, appliquees: 0, avisRecu: true, ecartees: [
      { ref: 'F01', raison: 'fiche modifiée depuis le dossier : refais une analyse' },
      { ref: 'F02', raison: 'fiche supprimée depuis le dossier' },
    ] });
    expect(db.lire(`fiches/${a.id}`)?.score ?? null).toBeNull();
  });

  it('n’écrit rien pour un retour illisible ou d’un autre dossier', async () => {
    const { actions, etat, db } = await avecDeuxFiches();
    await actions.ouvrirAnalyse();
    const { code } = etat.lire().analyse;
    expect((await actions.enregistrerRetour('Bonjour')).ok).toBe(false);
    expect(await actions.enregistrerRetour(reponse('D-zzzzzz', ['F01']))).toEqual({ ok: false, raison: 'Ce retour ne correspond à aucun dossier produit par le studio.' });
    expect(db.lire(`analyses/${code}`).retour).toBeUndefined();
  });

  it('garde un blocage calculé malgré un avis vert', async () => {
    const { actions, etat, db, a } = await avecDeuxFiches();
    const interdit = etat.lire().profil.regles_studio.mots_a_eviter[0];
    actions.modifierFiche(a.id, { caption: `Texte avec ${interdit}` });
    await actions.fermerPanneau();
    await actions.ouvrirAnalyse();
    await actions.enregistrerRetour(reponse(etat.lire().analyse.code, ['F01', 'F02']));
    expect(db.lire(`fiches/${a.id}`).score.conformite.etat).toBe('rouge');
  });

  it('reprend après un échec d’écriture, sans doublon', async () => {
    const { actions, etat, db, a, b } = await avecDeuxFiches();
    await actions.ouvrirAnalyse();
    const { code } = etat.lire().analyse;
    db.echouerEcritures(`fiches/${b.id}`);
    const r1 = await actions.enregistrerRetour(reponse(code, ['F01', 'F02']));
    expect(r1).toEqual({ ok: false, raison: 'L’enregistrement a été interrompu après 1 fiche sur 2 : réessaie, les fiches déjà notées seront simplement réécrites.' });
    db.echouerEcritures(null);
    const r2 = await actions.enregistrerRetour(reponse(code, ['F01', 'F02']));
    expect(r2).toMatchObject({ ok: true, appliquees: 2 });
    expect(db.lister('fiches')).toHaveLength(2);
    expect(db.lire(`analyses/${code}`).retour.appliquees).toEqual([a.id, b.id]);
  });
});
```

`tests/aides/fausseBase.js` : vérifie les noms réels de ses aides de lecture. Si `db.lire(chemin)`, `db.lister(collection)` ou `db.echouerEcritures(chemin | null)` n'existent pas, ajoute-les à la fausse base (lecture directe d'un document, liste d'une collection, échec provoqué des `set` sur un chemin) ou adapte les appels du test aux aides existantes, sans changer ce qui est vérifié. La date `T` du fichier de test (`2026-09-28T08:00:00.000Z`, un lundi) donne la semaine `2026-W40` en `Europe/Paris`.

- [ ] **Step 2: Run to see them fail**

Run: `npx vitest run tests/logique/sauvegarde.test.js tests/logique/score.test.js tests/donnees/depot.test.js tests/interface/controleur.test.js`
Expected: FAIL.

- [ ] **Step 3: Dépôt, export et libellés.**

`src/donnees/depot.js`, avant `lireCollection` :

```js
    async enregistrerAnalyse(code, doc) {
      await db.doc(`analyses/${code}`).set(doc);
    },

    async lireAnalyse(code) {
      const doc = await db.doc(`analyses/${code}`).get();
      return doc.exists ? doc.data() : null;
    },

    ecouterAnalyses(rappel, erreur) {
      return db.collection('analyses').onSnapshot(snap => rappel(snap.docs.map(d => ({ id: d.id, ...d.data() }))), erreur);
    },
```

`src/logique/sauvegarde.js` : ajoute `'analyses'` à la fin de `COLLECTIONS_EXPORT` et `analyses: 'analyses'` à `LIBELLES_COLLECTIONS`.

`src/logique/score.js` :

```js
const ASSISTANTS = { claude: 'Claude', chatgpt: 'ChatGPT' };
export const nomAssistant = examen => (examen?.source === 'dossier' ? (ASSISTANTS[examen.assistant] ?? 'l’assistant') : 'Claude');
```

et dans `lignesExamen`, juste avant le `return` final :

```js
  const lignes = [visuel, `Profil version ${examen.version_profil ?? '?'}${sections}.`, semaine, `${a} alerte${s(a)} et ${b} blocage${s(b)} calculés par le studio.`];
  if (examen.source !== 'dossier') return lignes;
  const nom = ASSISTANTS[examen.assistant];
  return [nom ? `Analyse par dossier (${nom}).` : 'Analyse par dossier.', ...lignes];
```

(en remplaçant le `return [ … ]` actuel).

- [ ] **Step 4: Contrôleur.** Dans `src/interface/controleur.js` :

Imports :

```js
import { periodeAffichee, choisirFiches, codeDossier, attribuerReferences, etatVisuel, contenuDossier, MESSAGE_A_COLLER } from '../logique/dossier.js';
import { lireRetour, validerRetour } from '../logique/retour-dossier.js';
import { empreinte } from '../logique/fiche.js';
```

(`empreinte` rejoint l'import existant de `../logique/fiche.js`.) Ajoute les paramètres `dossier = null` et `aleatoire = Math.random` à `creerControleur`. Avant le `return` des actions :

```js
  const ANALYSE_INDISPONIBLE = 'L’analyse par dossier n’est pas disponible dans cette vue.';

  async function ouvrirAnalyse() {
    if (!dossier) { etat.modifier({ analyse: { etape: 'erreur', message: ANALYSE_INDISPONIBLE } }); return; }
    const { profil, fiches, vue, ancre } = etat.lire();
    const periode = periodeAffichee(vue, ancre, profil.regles_studio.fuseau);
    const choix = choisirFiches(fiches, periode);
    if (!choix.ok) { etat.modifier({ analyse: { etape: 'erreur', message: choix.raison } }); return; }
    etat.modifier({ analyse: { etape: 'preparation' } });
    try {
      const refs = attribuerReferences(choix.fiches);
      const code = codeDossier(aleatoire);
      const fabrique = await dossier.fabrique();
      const provisoire = contenuDossier({ profil, entrees: choix.fiches.map((fiche, i) => ({ ref: refs[i].ref, fiche, etat: etatVisuel(fiche, null) })), periode, code, toutesLesFiches: fiches });
      const demandes = choix.fiches
        .map((fiche, i) => ({ ref: refs[i].ref, etiquette: provisoire.fiches[i].etiquette, visuel: fiche.visuel ?? null, type: fiche.visuel_type ?? null }))
        .filter(d => d.visuel);
      const cartes = await fabrique.preparerCartes(demandes, id => chargerImage(id));
      const entrees = choix.fiches.map((fiche, i) => ({ ref: refs[i].ref, fiche, etat: etatVisuel(fiche, cartes.get(refs[i].ref) ?? null) }));
      const contenu = contenuDossier({ profil, entrees, periode, code, toutesLesFiches: fiches });
      const fichier = await fabrique.assemblerPdf(contenu, cartes);
      await depot.enregistrerAnalyse(code, {
        periode: { type: periode.type, cle: periode.cle, debut: periode.debut, fin: periode.fin },
        cree_le: horloge(),
        assistant: 'inconnu',
        version_profil: profil.version ?? null,
        sections_profil: contenu.sectionsProfil,
        fiches: entrees.map((e, i) => ({ ...refs[i], visuel: e.etat.visuel, raison_visuel: e.etat.raison_visuel })),
      });
      etat.modifier({ analyse: {
        etape: 'pret', code, periode, nombre: entrees.length, fichier, nom: `analyse-${periode.cle}.pdf`, retour: null,
        sansVisuel: entrees.filter(e => e.etat.visuel === 'non_joint').map(e => e.ref),
      } });
    } catch {
      etat.modifier({ analyse: { etape: 'erreur', message: 'Le dossier n’a pas pu être préparé : réessaie.' } });
    }
  }

  const analysePrete = () => (etat.lire().analyse?.etape === 'pret' ? etat.lire().analyse : null);

  async function partagerDossier() {
    const a = analysePrete();
    if (!a || !dossier?.peutPartager(a.fichier)) return { ok: false, message: 'Le partage n’est pas disponible sur cet appareil : télécharge le dossier.' };
    try { await dossier.partager(a.fichier, a.nom); return { ok: true, message: 'Dossier partagé.' }; }
    catch (e) { return e?.name === 'AbortError' ? { ok: false, message: 'Partage annulé.' } : { ok: false, message: 'Le partage a échoué : télécharge le dossier.' }; }
  }

  async function telechargerDossier() {
    const a = analysePrete();
    if (!a || !downloads) return { ok: false, message: 'Le téléchargement n’est pas disponible dans cette vue.' };
    try { await downloads.save({ filename: a.nom, data: a.fichier }); return { ok: true, message: 'Dossier téléchargé.' }; }
    catch { return { ok: false, message: 'Le téléchargement a échoué : réessaie.' }; }
  }

  async function copierMessage() {
    try { await dossier.copier(MESSAGE_A_COLLER); return { ok: true, message: 'Message copié.' }; }
    catch { return { ok: false, message: MESSAGE_A_COLLER }; }
  }

  async function noterAssistant(nom) {
    const a = analysePrete();
    if (!a || !['claude', 'chatgpt'].includes(nom)) return;
    const doc = await depot.lireAnalyse(a.code);
    if (doc) await depot.enregistrerAnalyse(a.code, { ...doc, assistant: nom });
  }

  async function enregistrerRetour(texte) {
    const lu = lireRetour(texte);
    if (!lu.ok) return lu;
    let analyse;
    try { analyse = await depot.lireAnalyse(lu.dossier); }
    catch { return { ok: false, raison: 'Le studio n’a pas pu lire le dossier : réessaie dans un instant.' }; }
    if (!analyse) return { ok: false, raison: 'Ce retour ne correspond à aucun dossier produit par le studio.' };
    const { profil } = etat.lire();
    const v = validerRetour(lu, analyse);
    const ecartees = [];
    const appliquees = [];
    for (const item of v.valides) {
      const actuelle = trouver(item.id) ?? (supprimeesPendantSession.has(item.id) ? null : await depot.lireFiche(item.id));
      if (!actuelle) { ecartees.push({ ref: item.ref, raison: 'fiche supprimée depuis le dossier' }); continue; }
      if (empreinte(actuelle) !== item.empreinte) { ecartees.push({ ref: item.ref, raison: 'fiche modifiée depuis le dossier : refais une analyse' }); continue; }
      const verification = verifierRegles(actuelle, profil.regles_studio);
      const duDossier = analyse.fiches.find(f => f.ref === item.ref);
      const examen = {
        ...construireExamen({ visuel: duDossier.visuel, raison_visuel: duDossier.raison_visuel, version_profil: analyse.version_profil ?? profil.version ?? null, sections_profil: analyse.sections_profil ?? [], contenus_semaine: analyse.fiches.length - 1, verification }),
        source: 'dossier', assistant: analyse.assistant ?? 'inconnu',
      };
      const score = composerScore({ fiche: actuelle, verification, jugement: item.jugement, versionProfil: profil.version, maintenant: horloge(), examen });
      const g = verrouillerSiRouge(appliquerEvaluation(actuelle, {
        score, variantes: item.jugement.captions,
        suggestions: { accroches: item.jugement.accroches, hashtags: item.jugement.hashtags },
        recommandations: item.jugement.recommandations,
      }, horloge()));
      remplacer(g);
      await ecrireMaintenant(g);
      if (enregistreur.enEchec().includes(g.id)) {
        return { ok: false, raison: `L’enregistrement a été interrompu après ${appliquees.length} fiche${appliquees.length > 1 ? 's' : ''} sur ${v.valides.length} : réessaie, les fiches déjà notées seront simplement réécrites.` };
      }
      appliquees.push(item.id);
    }
    const toutes = [...v.ecartees, ...ecartees].sort((a, b) => a.ref.localeCompare(b.ref));
    const resultat = { ok: true, appliquees: appliquees.length, ecartees: toutes, avisRecu: !!v.periode };
    try {
      await depot.enregistrerAnalyse(lu.dossier, { ...analyse, retour: { recu_le: horloge(), ...(v.periode ?? { avis: '', points_forts: [], risques: [], ordre_conseille: [] }), appliquees, ecartees: toutes } });
    } catch {
      return { ok: false, raison: 'Les fiches sont notées, mais l’avis d’ensemble n’a pas pu être enregistré : réessaie.' };
    }
    if (etat.lire().analyse?.etape === 'pret') etat.modifier({ analyse: { ...etat.lire().analyse, retour: resultat } });
    return resultat;
  }
```

Points à respecter :
- L'empreinte se compare après avoir vidé les écritures en attente de la fiche : si `empreinte` de la fiche en mémoire diffère de celle du dossier, c'est bien une modification de l'utilisatrice. Une fiche réappliquée (second collage du même retour) a la même empreinte : `appliquerEvaluation` ne touche pas aux champs de l'empreinte.
- Une fiche notée une seconde fois est simplement réécrite : pas de doublon.
- Le tri des fiches écartées dans le test « écarte une fiche modifiée ou supprimée » est par référence ; ajuste le tri si l'ordre du test l'exige, sans changer les raisons.
- Ajoute aux actions renvoyées : `ouvrirAnalyse, fermerAnalyse: () => etat.modifier({ analyse: null }), partagerDossier, telechargerDossier, copierMessage, noterAssistant, enregistrerRetour`.

- [ ] **Step 5: App.** Dans `src/interface/app.js` :
  - `const dossier = (await claude.use('dossier')) ?? null;` ; passe `dossier` à `creerControleur` ; ajoute `dossier: !!dossier` aux capacités de `creerRendu` ;
  - ajoute `analyse: null, analyses: []` à l'état initial ;
  - à côté des autres écoutes permanentes : `depot.ecouterAnalyses(analyses => recu({ analyses }), err => etat.modifier({ erreur: messageErreurBase(err) }));`.
  - Vérifie que `tests/interface/app.test.js` et `tests/interface/assemblage-socle.test.js` restent verts (la fausse base et le faux Supabase doivent accepter l'écoute d'une collection vide).

- [ ] **Step 6: Run the tests**

Run: `npx vitest run tests/logique tests/donnees tests/interface`, puis `npm test`.
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src tests
git commit -m "Dossier d'analyse : collection analyses, préparation et application du retour

Co-Authored-By: <modèle auteur>"
```

---

### Task 4 : fabrication du fichier dans le navigateur

**Files:**
- Create: `src/dossier/cartes.js`, `src/dossier/pdf.js`, `src/dossier/fabrique.js`, `src/socle/dossier-navigateur.js`
- Modify: `scripts/build.mjs`, `src/socle/socle.js`, `src/interface/main.js`, `package.json`
- Test: `tests/dossier/pdf.test.js`, `tests/dossier/cartes.test.js`, `tests/socle/dossier-navigateur.test.js`, `tests/socle/socle.test.js`, `tests/build.test.js`

**Interfaces:**
- Consumes : la forme de `contenuDossier` (Task 1) ; la capacité `dossier` attendue par le contrôleur (Task 3).
- Produces :
  - `dimensionsCarte({ largeurs, hauteurs, bordMax = 1568, bandeau = 130 })` → `{ largeur, hauteur, echelle, cases: [{ x, y, largeur, hauteur }] }` (pure, testée).
  - `preparerCartes(demandes, chargerVisuel, outils?)` → `Map<ref, { ok, carte? }>`.
  - `assemblerPdf(contenu, cartes, { jsPDF })` → `Blob`.
  - `public/dossier.js` : module ES qui exporte `preparerCartes` et `assemblerPdf`.
  - `construireDossier()` dans `scripts/build.mjs` → texte du module.
  - `creerDossierNavigateur({ charger, navigator, File })` → `{ fabrique, peutPartager, partager, copier }`.
  - `creerSocle` sert la capacité `dossier` à partir de `extras.dossier`.

- [ ] **Step 1: Install the dependency**

Run: `npm install jspdf`

Vérifie dans `node_modules/jspdf` : l'export (`import { jsPDF } from 'jspdf'`), `addImage(données, 'JPEG', x, y, largeur, hauteur)` avec un `Uint8Array` ou une data URL, `splitTextToSize(texte, largeur)`, `addPage()`, `output('blob')` et `output('arraybuffer')`, `getNumberOfPages()`. Note fichier et lignes dans le rapport. Si une de ces fonctions a un autre nom, adapte le code sans changer le comportement.

- [ ] **Step 2: Write the failing tests.**

`tests/dossier/cartes.test.js` :

```js
import { describe, it, expect } from 'vitest';
import { dimensionsCarte } from '../../src/dossier/cartes.js';

describe('dimensionsCarte', () => {
  it('pose une image sous le bandeau, bord long à 1568 au plus', () => {
    const d = dimensionsCarte({ largeurs: [3584], hauteurs: [2016] });
    expect(d.largeur).toBe(1568);
    expect(d.cases[0]).toMatchObject({ x: 0, largeur: 1568 });
    expect(d.cases[0].y).toBe(d.bandeau);
    expect(Math.max(d.largeur, d.hauteur)).toBeLessThanOrEqual(1568);
  });
  it('garde une image verticale entière', () => {
    const d = dimensionsCarte({ largeurs: [1080], hauteurs: [1920] });
    expect(d.hauteur).toBeLessThanOrEqual(1568);
    expect(d.cases[0].hauteur + d.bandeau).toBe(d.hauteur);
    expect(d.cases[0].largeur / d.cases[0].hauteur).toBeCloseTo(1080 / 1920, 2);
  });
  it('aligne trois images de vidéo côte à côte', () => {
    const d = dimensionsCarte({ largeurs: [1080, 1080, 1080], hauteurs: [1920, 1920, 1920] });
    expect(d.cases).toHaveLength(3);
    expect(d.cases[1].x).toBeGreaterThan(d.cases[0].x + d.cases[0].largeur - 1);
    expect(d.largeur).toBeLessThanOrEqual(1568);
    expect(d.largeur).toBeGreaterThanOrEqual(600);
  });
});
```

`tests/dossier/pdf.test.js` :

```js
import { describe, it, expect } from 'vitest';
import { jsPDF } from 'jspdf';
import { assemblerPdf } from '../../src/dossier/pdf.js';

// Plus petit JPEG valide (1 × 1 pixel).
const JPEG = Uint8Array.from(atob('/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAMCAgICAgMCAgIDAwMDBAYEBAQEBAgGBgUGCQgKCgkICQkKDA8MCgsOCwkJDRENDg8QEBEQCgwSExIQEw8QEBD/yQALCAABAAEBAREA/8wABgAQEAX/2gAIAQEAAD8A0s8g/9k='), c => c.charCodeAt(0));
const contenu = n => ({
  titre: "Dossier d'analyse : semaine du 5 au 11 octobre 2026",
  intro: 'Dossier D-abc123. Introduction.',
  strategie: [{ titre: 'ton et voix', lignes: Array.from({ length: 120 }, (_, i) => `- ligne ${i} avec des accents éèàç et un texte assez long pour devoir passer à la ligne suivante sans déborder de la page`) }],
  sectionsProfil: ['ton_et_voix'],
  regles: ['Semaine 2026-W41 :', '- Reels : 1/4 (rouge)'],
  fiches: Array.from({ length: n }, (_, i) => ({ ref: `F0${i + 1}`, etiquette: `F0${i + 1} · lun. 05/10 · Reel`, lignes: [`<fiche id="F0${i + 1}">`, 'accroche : Test [U+1F525]', '</fiche>'] })),
  consigne: ['Consigne.', '{', '  "dossier": "D-abc123"', '}'],
});

describe('assemblerPdf', () => {
  it('produit un PDF avec la stratégie, une page par fiche et la consigne', async () => {
    const cartes = new Map([['F01', { ok: true, carte: new Blob([JPEG], { type: 'image/jpeg' }), largeur: 1, hauteur: 1 }], ['F02', { ok: false }]]);
    const blob = await assemblerPdf(contenu(2), cartes, { jsPDF });
    expect(blob.type).toBe('application/pdf');
    const octets = new Uint8Array(await blob.arrayBuffer());
    expect(String.fromCharCode(...octets.slice(0, 5))).toBe('%PDF-');
    const texte = new TextDecoder('latin1').decode(octets);
    expect((texte.match(/\/Type\s*\/Page[^s]/g) ?? []).length).toBeGreaterThanOrEqual(5);
    expect(texte).toContain('/Subtype /Image');
  });
  it('ne lève pas sur un texte vide ou une carte illisible', async () => {
    const cartes = new Map([['F01', { ok: true, carte: new Blob(['pas une image'], { type: 'image/jpeg' }), largeur: 10, hauteur: 10 }]]);
    const vide = { ...contenu(1), strategie: [], regles: [] };
    await expect(assemblerPdf(vide, cartes, { jsPDF })).resolves.toBeInstanceOf(Blob);
  });
});
```

Si le JPEG minimal ci-dessus est refusé par jsPDF, remplace-le par un autre JPEG valide de quelques centaines d'octets écrit en base64 dans le test (génère-le toi-même ; aucune image réelle).

`tests/socle/dossier-navigateur.test.js` :

```js
import { describe, it, expect, vi } from 'vitest';
import { creerDossierNavigateur } from '../../src/socle/dossier-navigateur.js';

const pdf = new Blob(['%PDF'], { type: 'application/pdf' });
class FauxFichier extends Blob { constructor(parts, nom, options) { super(parts, options); this.name = nom; } }

describe('creerDossierNavigateur', () => {
  it('charge la fabrique une seule fois', async () => {
    const charger = vi.fn(async () => ({ preparerCartes: () => {}, assemblerPdf: () => {} }));
    const d = creerDossierNavigateur({ charger, navigator: {}, File: FauxFichier });
    const a = await d.fabrique();
    expect(await d.fabrique()).toBe(a);
    expect(charger).toHaveBeenCalledTimes(1);
  });
  it('partage un fichier quand l’appareil le permet', async () => {
    const navigator = { canShare: vi.fn(({ files }) => files.length === 1), share: vi.fn(async () => {}) };
    const d = creerDossierNavigateur({ charger: vi.fn(), navigator, File: FauxFichier });
    expect(d.peutPartager(pdf)).toBe(true);
    await d.partager(pdf, 'analyse-2026-W41.pdf');
    const { files } = navigator.share.mock.calls[0][0];
    expect(files[0].name).toBe('analyse-2026-W41.pdf');
    expect(files[0].type).toBe('application/pdf');
    expect(Object.keys(navigator.share.mock.calls[0][0])).toEqual(['files']);
  });
  it('dit non sans partage de fichiers', () => {
    expect(creerDossierNavigateur({ charger: vi.fn(), navigator: {}, File: FauxFichier }).peutPartager(pdf)).toBe(false);
    const refuse = { canShare: () => false, share: vi.fn() };
    expect(creerDossierNavigateur({ charger: vi.fn(), navigator: refuse, File: FauxFichier }).peutPartager(pdf)).toBe(false);
    const leve = { canShare: () => { throw new Error('x'); }, share: vi.fn() };
    expect(creerDossierNavigateur({ charger: vi.fn(), navigator: leve, File: FauxFichier }).peutPartager(pdf)).toBe(false);
  });
  it('copie un texte, ou rejette sans presse-papiers', async () => {
    const navigator = { clipboard: { writeText: vi.fn(async () => {}) } };
    await creerDossierNavigateur({ charger: vi.fn(), navigator, File: FauxFichier }).copier('Bonjour');
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('Bonjour');
    await expect(creerDossierNavigateur({ charger: vi.fn(), navigator: {}, File: FauxFichier }).copier('x')).rejects.toThrow();
  });
});
```

Dans `tests/socle/socle.test.js`, ajoute au test des capacités : `use('dossier')` rend `extras.dossier` quand il est fourni, et `null` sinon.

Dans `tests/build.test.js` :

```js
import { construireDossier } from '../scripts/build.mjs';

describe('construireDossier', () => {
  it('produit un module séparé qui porte la bibliothèque PDF', async () => {
    const js = await construireDossier();
    expect(js).toContain('preparerCartes');
    expect(js).toContain('assemblerPdf');
    expect(js.length).toBeGreaterThan(100000);
  }, 30000);
  it('laisse la page principale sans la bibliothèque PDF', async () => {
    const html = await construire({ SUPABASE_URL: 'https://projet.test', SUPABASE_ANON_KEY: 'cle-publique' });
    expect(html).not.toContain('jsPDF');
    expect(html).toContain('/dossier.js');
  }, 30000);
});
```

- [ ] **Step 3: Run to see them fail**

Run: `npx vitest run tests/dossier tests/socle/dossier-navigateur.test.js tests/socle/socle.test.js tests/build.test.js`
Expected: FAIL.

- [ ] **Step 4: Implement** `src/dossier/cartes.js`

```js
const BORD = 1568;
const BANDEAU = 130;
const ECART = 12;
const DELAI_VIDEO_MS = 8000;

export function dimensionsCarte({ largeurs, hauteurs, bordMax = BORD, bandeau = BANDEAU }) {
  const n = largeurs.length;
  const hauteurCible = n === 1 ? Math.min(hauteurs[0], bordMax - bandeau) : 760;
  let cases = largeurs.map((l, i) => ({ largeur: Math.max(1, Math.round(l * hauteurCible / hauteurs[i])), hauteur: Math.round(hauteurCible) }));
  let total = cases.reduce((t, c) => t + c.largeur, 0) + ECART * (n - 1);
  if (total > bordMax) {
    const r = (bordMax - ECART * (n - 1)) / (total - ECART * (n - 1));
    cases = cases.map(c => ({ largeur: Math.max(1, Math.floor(c.largeur * r)), hauteur: Math.max(1, Math.floor(c.hauteur * r)) }));
    total = cases.reduce((t, c) => t + c.largeur, 0) + ECART * (n - 1);
  }
  const largeur = Math.max(total, Math.min(600, bordMax));
  const hauteurImages = Math.max(...cases.map(c => c.hauteur));
  let x = 0;
  const posees = cases.map(c => { const p = { x, y: bandeau, ...c }; x += c.largeur + ECART; return p; });
  return { largeur, hauteur: bandeau + hauteurImages, bandeau, cases: posees };
}

async function imageDepuisBlob(blob) {
  // « from-image » applique l'orientation enregistrée par l'appareil (photo de téléphone).
  return createImageBitmap(blob, { imageOrientation: 'from-image' });
}

function imagesDepuisVideo(blob, doc, nombre = 3) {
  return new Promise((resoudre, rejeter) => {
    const video = doc.createElement('video');
    const url = URL.createObjectURL(blob);
    const images = [];
    const fin = (ok, valeur) => { clearTimeout(minuteur); URL.revokeObjectURL(url); video.removeAttribute('src'); (ok ? resoudre : rejeter)(valeur); };
    const minuteur = setTimeout(() => (images.length ? fin(true, images) : fin(false, new Error('délai'))), DELAI_VIDEO_MS);
    video.muted = true; video.playsInline = true; video.preload = 'auto';
    video.onerror = () => fin(false, new Error('vidéo illisible'));
    video.onloadedmetadata = () => {
      const duree = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 0;
      const instants = Array.from({ length: nombre }, (_, i) => (duree ? Math.min(duree - 0.05, (duree * (i + 0.5)) / nombre) : 0)).filter((t, i, xs) => i === 0 || t !== xs[i - 1]);
      let i = 0;
      video.onseeked = async () => {
        try {
          const toile = doc.createElement('canvas');
          toile.width = video.videoWidth; toile.height = video.videoHeight;
          toile.getContext('2d').drawImage(video, 0, 0);
          images.push(toile);
        } catch { /* image ignorée */ }
        i += 1;
        if (i < instants.length) video.currentTime = instants[i];
        else if (images.length) fin(true, images);
        else fin(false, new Error('aucune image'));
      };
      video.currentTime = instants[0];
    };
    video.src = url;
  });
}

function dessiner(doc, etiquette, sources) {
  const d = dimensionsCarte({ largeurs: sources.map(s => s.width), hauteurs: sources.map(s => s.height) });
  const toile = doc.createElement('canvas');
  toile.width = d.largeur; toile.height = d.hauteur;
  const c = toile.getContext('2d');
  c.fillStyle = '#ffffff'; c.fillRect(0, 0, d.largeur, d.hauteur);
  c.fillStyle = '#111111'; c.fillRect(0, 0, d.largeur, d.bandeau);
  c.fillStyle = '#ffffff'; c.textBaseline = 'middle';
  const [ref, ...reste] = etiquette.split(' · ');
  c.font = 'bold 78px Arial, Helvetica, sans-serif';
  c.fillText(ref, 28, d.bandeau / 2);
  const decalage = 28 + c.measureText(ref).width + 40;
  c.font = '38px Arial, Helvetica, sans-serif';
  c.fillText(reste.join(' · '), decalage, d.bandeau / 2 + 4, Math.max(50, d.largeur - decalage - 20));
  d.cases.forEach((k, i) => c.drawImage(sources[i], k.x, k.y, k.largeur, k.hauteur));
  return new Promise((resoudre, rejeter) => toile.toBlob(b => (b ? resoudre({ carte: b, largeur: d.largeur, hauteur: d.hauteur }) : rejeter(new Error('carte'))), 'image/jpeg', 0.85));
}

export async function preparerCartes(demandes, chargerVisuel, { document: doc = globalThis.document } = {}) {
  const cartes = new Map();
  for (const d of demandes) {
    try {
      const blob = await chargerVisuel(d.visuel);
      const sources = d.type === 'video' ? await imagesDepuisVideo(blob, doc) : [await imageDepuisBlob(blob)];
      cartes.set(d.ref, { ok: true, ...(await dessiner(doc, d.etiquette, sources)) });
    } catch {
      cartes.set(d.ref, { ok: false });
    }
  }
  return cartes;
}
```

Les fonctions qui touchent le canvas et la vidéo ne sont pas testées en automatique (happy-dom ne les reproduit pas) : elles sont vérifiées à la main en Task 6. Garde-les courtes et sans logique métier.

- [ ] **Step 5: Implement** `src/dossier/pdf.js`

```js
const MARGE = 16;
const LARGEUR = 210;
const HAUTEUR = 297;
const UTILE = LARGEUR - 2 * MARGE;

export async function assemblerPdf(contenu, cartes, { jsPDF }) {
  const pdf = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
  let y = MARGE;
  const saut = () => { pdf.addPage(); y = MARGE; };
  const place = h => { if (y + h > HAUTEUR - MARGE) saut(); };
  const ecrire = (texte, { taille = 9.5, gras = false, police = 'helvetica', interligne = 1.32 } = {}) => {
    pdf.setFont(police, gras ? 'bold' : 'normal');
    pdf.setFontSize(taille);
    const pas = taille * 0.3528 * interligne;
    for (const ligne of pdf.splitTextToSize(String(texte ?? '') || ' ', UTILE)) {
      place(pas);
      pdf.text(ligne, MARGE, y + pas * 0.8);
      y += pas;
    }
  };
  const espace = h => { y += h; };

  ecrire(contenu.titre, { taille: 15, gras: true });
  espace(2);
  ecrire(contenu.intro);
  espace(4);
  if (contenu.strategie.length) ecrire('Stratégie', { taille: 13, gras: true });
  for (const section of contenu.strategie) {
    espace(2);
    ecrire(section.titre, { taille: 11, gras: true });
    for (const ligne of section.lignes) ecrire(ligne);
  }
  if (contenu.regles.length) {
    espace(4);
    ecrire('Règles de la période', { taille: 13, gras: true });
    for (const ligne of contenu.regles) ecrire(ligne);
  }
  for (const fiche of contenu.fiches) {
    saut();
    ecrire(`Fiche ${fiche.ref}`, { taille: 13, gras: true });
    espace(2);
    const carte = cartes.get(fiche.ref);
    if (carte?.ok) {
      try {
        const octets = new Uint8Array(await carte.carte.arrayBuffer());
        const ratio = carte.hauteur / carte.largeur;
        let l = UTILE;
        let h = l * ratio;
        if (h > 150) { h = 150; l = h / ratio; }
        pdf.addImage(octets, 'JPEG', MARGE, y, l, h);
        y += h + 4;
      } catch {
        ecrire('(visuel illisible)');
      }
    }
    for (const ligne of fiche.lignes) ecrire(ligne);
  }
  saut();
  ecrire('Consigne', { taille: 13, gras: true });
  espace(2);
  for (const ligne of contenu.consigne) ecrire(ligne, { taille: 8.5, police: 'courier', interligne: 1.25 });
  return pdf.output('blob');
}
```

- [ ] **Step 6: Implement** `src/dossier/fabrique.js`

```js
import { jsPDF } from 'jspdf';
import { preparerCartes } from './cartes.js';
import { assemblerPdf as assembler } from './pdf.js';

export { preparerCartes };
export const assemblerPdf = (contenu, cartes) => assembler(contenu, cartes, { jsPDF });
```

- [ ] **Step 7: Implement** `src/socle/dossier-navigateur.js`

```js
export function creerDossierNavigateur({ charger, navigator: nav, File: Fichier }) {
  let fabrique = null;
  const enFichier = (blob, nom) => new Fichier([blob], nom, { type: blob.type });
  return {
    fabrique: () => (fabrique ??= charger()),
    peutPartager(blob) {
      try { return typeof nav?.share === 'function' && typeof nav?.canShare === 'function' && nav.canShare({ files: [enFichier(blob, 'dossier.pdf')] }) === true; }
      catch { return false; }
    },
    partager: (blob, nom) => nav.share({ files: [enFichier(blob, nom)] }),
    async copier(texte) {
      if (typeof nav?.clipboard?.writeText !== 'function') throw new Error('presse-papiers indisponible');
      await nav.clipboard.writeText(texte);
    },
  };
}
```

`fabrique` doit rendre le même objet aux appels suivants (le test compare l'identité) : garde la promesse en mémoire et rends sa valeur, ou rends la même promesse si le test l'accepte.

- [ ] **Step 8: Build, socle et page.**

`scripts/build.mjs` :
- dans le `build` de la page, ajoute `external: ['/dossier.js']` ;
- ajoute :

```js
export async function construireDossier() {
  const resultat = await build({
    entryPoints: [path.join(racine, 'src/dossier/fabrique.js')],
    bundle: true, format: 'esm', write: false, minify: true, target: 'es2020',
  });
  return resultat.outputFiles[0].text;
}
```

- la branche d'exécution directe écrit aussi `public/dossier.js` et affiche sa taille (`public/dossier.js (N Ko)`).

`src/socle/socle.js` : ajoute `dossier: extras.dossier ?? null` aux capacités.

`src/interface/main.js` : importe `creerDossierNavigateur` et ajoute aux `extras` :

```js
dossier: creerDossierNavigateur({ charger: () => import('/dossier.js'), navigator: window.navigator, File: window.File }),
```

Vérifie dans la page construite que l'appel reste un `import("/dossier.js")` dynamique (esbuild ne doit ni l'incorporer ni le transformer).

- [ ] **Step 9: Run the tests and the build**

Run: `npm test`, puis `SUPABASE_URL=https://projet.test SUPABASE_ANON_KEY=cle npm run build`.
Expected: PASS. Deux fichiers dans `public/` : `index.html` (taille proche de l'actuelle, 341 Ko) et `dossier.js`. Note les deux tailles dans le rapport.

- [ ] **Step 10: Commit**

```bash
git add src scripts/build.mjs package.json package-lock.json tests
git commit -m "Dossier d'analyse : cartes, PDF et partage dans le navigateur

Co-Authored-By: <modèle auteur>"
```

---

### Task 5 : interface

**Files:**
- Create: `src/interface/panneau-analyse.js`
- Modify: `src/interface/rendu.js`, `src/interface/vue-semaine.js`, `src/interface/vue-mois.js`, `src/interface/panneau-fiche.js`, `src/interface/styles.css`
- Test: `tests/interface/panneau-analyse.test.js`, `tests/interface/vue-semaine.test.js`, `tests/interface/vue-mois-jour.test.js`, `tests/interface/panneau-fiche.test.js`

**Interfaces:**
- Consumes : actions et état de la Task 3 (`ouvrirAnalyse`, `fermerAnalyse`, `partagerDossier`, `telechargerDossier`, `copierMessage`, `noterAssistant`, `enregistrerRetour` ; `etat.analyse`, `etat.analyses`) ; `nomAssistant` (Task 3) ; `periodeAffichee` (Task 1) ; `capacites.dossier`.
- Produces :
  - `panneauAnalyse(analyse, actions, capacites)` → élément.
  - `sectionAvis(analyses, periode, fiches)` → élément ou `null`.
  - Les vues Semaine et Mois reçoivent un troisième argument `capacites` et affichent le bouton quand `capacites.dossier` est vrai.

- [ ] **Step 1: Write the failing tests.**

`tests/interface/panneau-analyse.test.js` :

```js
// @vitest-environment happy-dom
import { describe, it, expect, vi } from 'vitest';
import { panneauAnalyse, sectionAvis } from '../../src/interface/panneau-analyse.js';

const actions = (plus = {}) => ({
  fermerAnalyse: vi.fn(), partagerDossier: vi.fn(async () => ({ ok: true, message: 'Dossier partagé.' })),
  telechargerDossier: vi.fn(async () => ({ ok: true, message: 'Dossier téléchargé.' })),
  copierMessage: vi.fn(async () => ({ ok: true, message: 'Message copié.' })), noterAssistant: vi.fn(),
  enregistrerRetour: vi.fn(async () => ({ ok: true, appliquees: 4, ecartees: [{ ref: 'F03', raison: 'fiche modifiée depuis le dossier : refais une analyse' }], avisRecu: true })),
  ...plus,
});
const pret = { etape: 'pret', code: 'D-abc123', periode: { type: 'semaine', cle: '2026-W41', libelle: 'semaine du 5 au 11 octobre 2026' }, nombre: 5, sansVisuel: ['F02'], fichier: new Blob(['%PDF'], { type: 'application/pdf' }), nom: 'analyse-2026-W41.pdf', retour: null };
const bouton = (el, texte) => [...el.querySelectorAll('button')].find(b => b.textContent === texte);

describe('panneauAnalyse', () => {
  it('annonce la préparation, puis une erreur', () => {
    expect(panneauAnalyse({ etape: 'preparation' }, actions(), {}).textContent).toContain('Préparation du dossier…');
    const e = panneauAnalyse({ etape: 'erreur', message: 'Aucune fiche à analyser sur cette période.' }, actions(), {});
    expect(e.querySelector('[role="alert"]').textContent).toBe('Aucune fiche à analyser sur cette période.');
  });
  it('présente le dossier prêt et ses étapes', () => {
    const el = panneauAnalyse(pret, actions(), { partage: true });
    expect(el.querySelector('h2').textContent).toBe('Analyse par Claude ou ChatGPT');
    expect(el.textContent).toContain('5 fiches, semaine du 5 au 11 octobre 2026.');
    expect(el.textContent).toContain('Sans visuel dans le dossier : F02.');
    expect(bouton(el, 'Partager le dossier')).toBeTruthy();
    expect(bouton(el, 'Télécharger le dossier')).toBeTruthy();
    expect(bouton(el, 'Copier le message')).toBeTruthy();
    const liens = [...el.querySelectorAll('a')].map(a => [a.textContent, a.getAttribute('href'), a.getAttribute('target'), a.getAttribute('rel')]);
    expect(liens).toEqual([['Ouvrir Claude', 'https://claude.ai/new', '_blank', 'noopener noreferrer'], ['Ouvrir ChatGPT', 'https://chatgpt.com/', '_blank', 'noopener noreferrer']]);
    expect(el.textContent).not.toContain('null');
  });
  it('masque le partage quand l’appareil ne le permet pas', () => {
    expect(bouton(panneauAnalyse(pret, actions(), { partage: false }), 'Partager le dossier')).toBeUndefined();
  });
  it('affiche le résultat de chaque action', async () => {
    const a = actions({ copierMessage: vi.fn(async () => ({ ok: false, message: 'Voici le dossier d’analyse de mes contenus.' })) });
    const el = panneauAnalyse(pret, a, { partage: true });
    bouton(el, 'Partager le dossier').click();
    await vi.waitFor(() => expect(el.textContent).toContain('Dossier partagé.'));
    bouton(el, 'Copier le message').click();
    await vi.waitFor(() => expect(el.querySelector('textarea.message-a-copier')?.value).toBe('Voici le dossier d’analyse de mes contenus.'));
  });
  it('note l’assistant ouvert', () => {
    const a = actions();
    const el = panneauAnalyse(pret, a, {});
    [...el.querySelectorAll('a')][1].dispatchEvent(new Event('click', { bubbles: true }));
    expect(a.noterAssistant).toHaveBeenCalledWith('chatgpt');
  });
  it('enregistre le retour collé et dit ce qui a été fait', async () => {
    const a = actions();
    const el = panneauAnalyse(pret, a, {});
    el.querySelector('textarea.retour').value = 'réponse collée';
    const b = bouton(el, 'Enregistrer le retour');
    b.click();
    expect(b.disabled).toBe(true);
    await vi.waitFor(() => expect(el.textContent).toContain('4 fiches mises à jour.'));
    expect(a.enregistrerRetour).toHaveBeenCalledWith('réponse collée');
    expect(el.textContent).toContain('F03 : fiche modifiée depuis le dossier : refais une analyse');
    expect(b.disabled).toBe(false);
  });
  it('affiche le refus sans vider la zone', async () => {
    const a = actions({ enregistrerRetour: vi.fn(async () => ({ ok: false, raison: 'Ce retour ne correspond à aucun dossier produit par le studio.' })) });
    const el = panneauAnalyse(pret, a, {});
    el.querySelector('textarea.retour').value = 'x';
    bouton(el, 'Enregistrer le retour').click();
    await vi.waitFor(() => expect(el.querySelector('[role="alert"]').textContent).toContain('aucun dossier'));
    expect(el.querySelector('textarea.retour').value).toBe('x');
  });
  it('accorde le singulier et signale un avis d’ensemble manquant', async () => {
    const a = actions({ enregistrerRetour: vi.fn(async () => ({ ok: true, appliquees: 1, ecartees: [], avisRecu: false })) });
    const el = panneauAnalyse(pret, a, {});
    el.querySelector('textarea.retour').value = 'x';
    bouton(el, 'Enregistrer le retour').click();
    await vi.waitFor(() => expect(el.textContent).toContain('1 fiche mise à jour.'));
    expect(el.textContent).toContain('L’avis d’ensemble manquait dans la réponse.');
  });
  it('se ferme', () => {
    const a = actions();
    bouton(panneauAnalyse(pret, a, {}), 'Fermer').click();
    expect(a.fermerAnalyse).toHaveBeenCalled();
  });
});

describe('sectionAvis', () => {
  const periode = { type: 'semaine', cle: '2026-W41' };
  const fiches = [{ id: 'a', accroche: 'Première' }, { id: 'b', accroche: '' }];
  const doc = (id, recu_le, plus = {}) => ({ id, periode, assistant: 'chatgpt', fiches: [{ ref: 'F01', id: 'a' }, { ref: 'F02', id: 'b' }, { ref: 'F03', id: 'z' }], retour: { recu_le, avis: `Avis ${id}`, points_forts: ['fort'], risques: ['risque'], ordre_conseille: ['F02', 'F01', 'F03'], ...plus } });
  it('montre le retour le plus récent de la période', () => {
    const el = sectionAvis([doc('D-1', '2026-10-05T10:00:00.000Z'), doc('D-2', '2026-10-06T10:00:00.000Z'), { id: 'D-3', periode, fiches: [] }, { ...doc('D-4', '2026-10-07T10:00:00.000Z'), periode: { type: 'semaine', cle: '2026-W42' } }], periode, fiches);
    expect(el.querySelector('summary').textContent).toBe('Avis sur la semaine');
    expect(el.textContent).toContain('Avis D-2');
    expect(el.textContent).toContain('ChatGPT');
    expect([...el.querySelectorAll('ol li')].map(li => li.textContent)).toEqual(['F02 · sans accroche', 'F01 · Première', 'F03']);
    expect(el.textContent).toContain('fort');
    expect(el.textContent).toContain('risque');
  });
  it('ne montre rien sans retour, ni pour un avis vide', () => {
    expect(sectionAvis([], periode, fiches)).toBeNull();
    expect(sectionAvis([{ id: 'D-1', periode, fiches: [] }], periode, fiches)).toBeNull();
    expect(sectionAvis([doc('D-1', '2026-10-05T10:00:00.000Z', { avis: '' })], periode, fiches)).toBeNull();
    expect(sectionAvis([doc('D-1', '2026-10-05T10:00:00.000Z')], { type: 'mois', cle: '2026-10' }, fiches)).toBeNull();
  });
  it('s’intitule selon la période', () => {
    const mois = { type: 'mois', cle: '2026-10' };
    expect(sectionAvis([{ ...doc('D-1', '2026-10-05T10:00:00.000Z'), periode: mois }], mois, fiches).querySelector('summary').textContent).toBe('Avis sur le mois');
  });
});
```

Dans `tests/interface/vue-semaine.test.js` (réutilise les aides du fichier pour l'état et les actions) :

```js
describe('analyse par dossier', () => {
  it('propose le bouton quand la capacité existe', () => {
    const a = { ...actions(), ouvrirAnalyse: vi.fn() };
    const el = vueSemaine(etat(), a, { dossier: true });
    const b = [...el.querySelectorAll('button')].find(x => x.textContent === 'Analyser la semaine');
    b.click();
    expect(a.ouvrirAnalyse).toHaveBeenCalled();
    expect([...vueSemaine(etat(), a, {}).querySelectorAll('button')].some(x => x.textContent === 'Analyser la semaine')).toBe(false);
    expect([...vueSemaine(etat(), a).querySelectorAll('button')].some(x => x.textContent === 'Analyser la semaine')).toBe(false);
  });
});
```

Dans `tests/interface/vue-mois-jour.test.js`, le même test pour `vueMois` avec le libellé « Analyser le mois ».

Dans `tests/interface/panneau-fiche.test.js` :

```js
describe('score venu d’un dossier', () => {
  it('nomme l’assistant dans le titre et la section', () => {
    const score = { total: 61, criteres: [], conformite: { etat: 'vert', causes: [] }, alertes: [], version_profil: 1, evalue_le: '2026-10-01T08:00:00.000Z', empreinte: 'x', examen: { visuel: 'joint', raison_visuel: null, version_profil: 1, sections_profil: [], contenus_semaine: 4, alertes_calculees: 0, blocages_calcules: 0, source: 'dossier', assistant: 'chatgpt' } };
    const p = panneauFiche(fiche({ score }), fictif, actionsFactices(), { assets: false });
    expect([...p.querySelectorAll('h3')].some(h => h.textContent === 'Avis de ChatGPT : 61/100')).toBe(true);
    expect(p.querySelector('details.examen summary').textContent).toBe('Ce que l’assistant a examiné');
    expect(p.querySelector('details.examen li').textContent).toBe('Analyse par dossier (ChatGPT).');
  });
});
```

Les tests existants de ce fichier (« Avis de Claude », « Ce que Claude a examiné ») restent verts sans modification.

- [ ] **Step 2: Run to see them fail**

Run: `npx vitest run tests/interface`
Expected: FAIL.

- [ ] **Step 3: Implement** `src/interface/panneau-analyse.js`

```js
import { h } from './h.js';
import { nomAssistant } from '../logique/score.js';

const s = n => (n > 1 ? 's' : '');

export function panneauAnalyse(analyse, actions, capacites = {}) {
  const fermer = h('button', { type: 'button', class: 'bouton-secondaire', onclick: () => actions.fermerAnalyse() }, 'Fermer');
  const titre = h('h2', {}, 'Analyse par Claude ou ChatGPT');
  if (analyse.etape === 'preparation') {
    return h('section', { class: 'panneau-analyse' }, titre, h('p', { class: 'aide', role: 'status' }, 'Préparation du dossier…'), fermer);
  }
  if (analyse.etape === 'erreur') {
    return h('section', { class: 'panneau-analyse' }, titre, h('p', { class: 'erreur', role: 'alert' }, analyse.message), fermer);
  }
  const etat = h('p', { class: 'aide', role: 'status' });
  const zoneMessage = h('div', {});
  const agir = action => async () => {
    const r = await action();
    etat.textContent = r.ok ? r.message : '';
    if (!r.ok && action === actions.copierMessage) {
      zoneMessage.replaceChildren(h('p', { class: 'aide' }, 'Copie ce message à la main :'), h('textarea', { class: 'message-a-copier', readonly: true, rows: 3 }, r.message));
    } else if (!r.ok) etat.textContent = r.message;
  };
  const lien = (libelle, href, nom) => h('a', { href, target: '_blank', rel: 'noopener noreferrer', class: 'bouton-secondaire', onclick: () => actions.noterAssistant(nom) }, libelle);

  const retour = h('textarea', { class: 'retour', rows: 6, placeholder: 'Colle ici toute la réponse de l’assistant' });
  const resultat = h('div', { class: 'resultat-retour' });
  const enregistrer = h('button', {
    type: 'button', class: 'bouton-principal',
    onclick: async () => {
      enregistrer.disabled = true;
      resultat.replaceChildren(h('p', { class: 'aide', role: 'status' }, 'Enregistrement…'));
      let r;
      try { r = await actions.enregistrerRetour(retour.value); }
      catch { r = { ok: false, raison: 'L’enregistrement a échoué : réessaie.' }; }
      enregistrer.disabled = false;
      if (!r.ok) { resultat.replaceChildren(h('p', { class: 'erreur', role: 'alert' }, r.raison)); return; }
      resultat.replaceChildren(
        h('p', { role: 'status' }, `${r.appliquees} fiche${s(r.appliquees)} mise${s(r.appliquees)} à jour.`),
        r.avisRecu ? null : h('p', { class: 'aide' }, 'L’avis d’ensemble manquait dans la réponse.'),
        r.ecartees.length ? h('ul', { class: 'ecartees' }, r.ecartees.map(e => h('li', {}, `${e.ref} : ${e.raison}`))) : null,
      );
    },
  }, 'Enregistrer le retour');

  return h('section', { class: 'panneau-analyse' },
    titre,
    h('p', {}, `${analyse.nombre} fiche${s(analyse.nombre)}, ${analyse.periode.libelle}.`),
    analyse.sansVisuel.length ? h('p', { class: 'aide' }, `Sans visuel dans le dossier : ${analyse.sansVisuel.join(', ')}.`) : null,
    h('h3', {}, '1. Donne le dossier à ton assistant'),
    h('div', { class: 'rangee' },
      capacites.partage ? h('button', { type: 'button', class: 'bouton-principal', onclick: agir(actions.partagerDossier) }, 'Partager le dossier') : null,
      h('button', { type: 'button', class: capacites.partage ? 'bouton-secondaire' : 'bouton-principal', onclick: agir(actions.telechargerDossier) }, 'Télécharger le dossier'),
      h('button', { type: 'button', class: 'bouton-secondaire', onclick: agir(actions.copierMessage) }, 'Copier le message')),
    h('div', { class: 'rangee' }, lien('Ouvrir Claude', 'https://claude.ai/new', 'claude'), lien('Ouvrir ChatGPT', 'https://chatgpt.com/', 'chatgpt')),
    etat, zoneMessage,
    h('p', { class: 'aide' }, 'Dans le chat : joins le dossier, colle le message, envoie. Tu peux discuter de l’analyse avant de revenir ici.'),
    h('h3', {}, '2. Colle sa réponse'),
    retour, enregistrer, resultat,
    fermer);
}

export function sectionAvis(analyses, periode, fiches) {
  const dernier = (analyses ?? [])
    .filter(a => a.periode?.type === periode.type && a.periode?.cle === periode.cle && a.retour?.avis)
    .sort((x, y) => y.retour.recu_le.localeCompare(x.retour.recu_le))[0];
  if (!dernier) return null;
  const r = dernier.retour;
  const parRef = new Map(dernier.fiches.map(f => [f.ref, fiches.find(x => x.id === f.id)]));
  const libelle = ref => { const f = parRef.get(ref); return f ? `${ref} · ${f.accroche || 'sans accroche'}` : ref; };
  const date = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long' }).format(new Date(r.recu_le));
  const liste = (titre, xs) => (xs.length ? [h('h4', {}, titre), h('ul', {}, xs.map(x => h('li', {}, x)))] : null);
  return h('details', { class: 'avis-periode' },
    h('summary', {}, periode.type === 'mois' ? 'Avis sur le mois' : 'Avis sur la semaine'),
    h('p', { class: 'aide' }, `Avis de ${nomAssistant({ source: 'dossier', assistant: dernier.assistant })}, reçu le ${date}. Avis d’expert, pas une prédiction de performance.`),
    h('p', {}, r.avis),
    liste('Points forts', r.points_forts), liste('Risques', r.risques),
    r.ordre_conseille.length ? [h('h4', {}, 'Ordre conseillé'), h('ol', {}, r.ordre_conseille.map(ref => h('li', {}, libelle(ref))))] : null);
}
```

- [ ] **Step 4: Vues, panneau de fiche et rendu.**

`src/interface/vue-semaine.js` : signature `vueSemaine(e, actions, capacites = {})` (garde la déstructuration actuelle et ajoute `analyses`). En tête de la `div.semaine`, avant le bandeau :

```js
    capacites.dossier ? h('div', { class: 'rangee analyse-periode' }, h('button', { type: 'button', class: 'bouton-secondaire', onclick: () => actions.ouvrirAnalyse() }, 'Analyser la semaine')) : null,
    sectionAvis(analyses, periodeAffichee('semaine', ancre, r.fuseau), fiches),
```

`src/interface/vue-mois.js` : même principe avec `vueMois(e, actions, capacites = {})`, « Analyser le mois » et `periodeAffichee('mois', ancre, fz)`.

`src/interface/panneau-fiche.js` : remplace les deux libellés par

```js
      h('h3', {}, s ? `Avis de ${nomAssistant(s.examen)} : ${s.total}/100` : 'Avis de Claude'),
```

et

```js
h('summary', {}, s.examen?.source === 'dossier' ? 'Ce que l’assistant a examiné' : 'Ce que Claude a examiné'),
```

`nomAssistant` rend « l’assistant » pour un assistant inconnu : le titre devient alors « Avis de l’assistant : 61/100 ».

`src/interface/rendu.js` :
- `contenuVue` passe `capacites` à `vueSemaine` et `vueMois` ;
- nouvelle zone `zoneAnalyse = h('div', { class: 'zone-analyse' })`, ajoutée à la racine après `zoneErreur` ;
- dans `rendre`, quand `memo.analyse !== e.analyse` : `zoneAnalyse.replaceChildren(e.analyse ? panneauAnalyse(e.analyse, actions, { partage: e.analyse.etape === 'pret' && actions.peutPartagerDossier?.() }) : '')` ;
- ajoute `memo.analyses !== e.analyses` à la condition de reconstruction des vues Semaine et Mois, et `analyse`, `analyses` au `memo` ;
- le panneau ne doit pas être reconstruit quand seul `analyse.retour` change (le texte collé serait perdu) : compare `memo.analyse?.code` et `memo.analyse?.etape` plutôt que l'identité de l'objet.

Dans `src/interface/controleur.js`, ajoute l'action `peutPartagerDossier: () => { const a = analysePrete(); return !!a && !!dossier?.peutPartager(a.fichier); }` et un test d'une ligne dans le `describe('analyse par dossier')` de la Task 3 (`expect(actions.peutPartagerDossier()).toBe(true)` après `ouvrirAnalyse`, `false` avec `partage: false`).

Ajoute dans `tests/interface/app.test.js` ou `assemblage-socle.test.js` un test : avec une capacité `dossier` factice, un clic sur « Analyser la semaine » affiche le panneau ; un changement de `analyse.retour` ne recrée pas la zone de texte (l'élément `textarea.retour` reste le même nœud).

- [ ] **Step 5: Styles.** À la fin de `src/interface/styles.css` :

```css
.zone-analyse:empty { display: none; }
.panneau-analyse { max-width: 720px; margin: 12px auto; padding: 16px; border: 1px solid var(--bord); border-radius: 10px; background: var(--surface); display: grid; gap: 10px; }
.panneau-analyse textarea { width: 100%; min-width: 0; font: inherit; }
.rangee { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
.analyse-periode { margin-bottom: 8px; }
.avis-periode { margin: 8px 0; padding: 8px 12px; border: 1px solid var(--bord); border-radius: 10px; }
.avis-periode h4 { margin: 8px 0 4px; }
.ecartees { margin: 0; padding-left: 18px; }
```

Vérifie les noms réels des variables de couleur du fichier (`--bord`, `--surface` ou leurs équivalents) et utilise ceux qui existent.

- [ ] **Step 6: Run the tests and the build**

Run: `npm test`, puis `SUPABASE_URL=https://projet.test SUPABASE_ANON_KEY=cle npm run build`.
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src tests
git commit -m "Dossier d'analyse : panneau, boutons Semaine et Mois, avis de la période

Co-Authored-By: <modèle auteur>"
```

---

### Task 6 : mise en ligne et essai réel

Cette tâche est faite par le contrôleur avec Jean. Le déploiement est lancé par Jean.

- [ ] **Step 1:** `npm test`, build avec des valeurs factices, vérification qu'aucune trace réelle n'est dans le diff, push de la branche.
- [ ] **Step 2: Jean** déploie la prévisualisation (`vercel deploy --yes` depuis le dépôt).
- [ ] **Step 3: Essai sur ordinateur**, par Jean : « Analyser la semaine », téléchargement du PDF, lecture du PDF (carte de la vraie fiche redressée, texte lisible, consigne), envoi à Claude puis à ChatGPT, collage du retour, vérification de la fiche (score, recommandations, « Ce que l'assistant a examiné ») et de « Avis sur la semaine ».
- [ ] **Step 4: Essai sur iPhone**, par Jean : bouton « Partager le dossier » (Claude et ChatGPT apparaissent-ils dans la feuille de partage ?), sinon téléchargement puis ajout dans l'application ; une fiche avec une vidéo (la carte porte-t-elle des images ?).
- [ ] **Step 5:** Corriger ce que les essais révèlent (rounds de correction, mêmes règles que les autres tâches).
- [ ] **Step 6:** Mettre à jour la marche à suivre (`docs/mise-en-service-vercel-supabase.md`, section sur l'évaluation : l'analyse par dossier ne demande aucune clé), le README, la passation et la fiche technique JSON.
