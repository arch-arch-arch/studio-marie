# Plan 7 : migration vers Vercel et Supabase : plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Le studio tourne hors des Artifacts : la page est servie par Vercel, la base, la connexion et le stockage sont chez Supabase, avec les mêmes fonctionnalités. L'évaluation et la veille sont construites, mais éteintes tant que la clé Anthropic n'est pas configurée.

**Architecture:**
- On garde `src/logique`, `src/interface` et `src/donnees/depot.js`. `app.js` reçoit toujours un objet `{ use(nom) }`. `main.js` le fabrique à partir d'adaptateurs (`src/socle/`) qui ont la même forme que les capacités d'Artifact.
- Le serveur se compose de fonctions Vercel, dans `api/`. Elles s'appuient sur `serveur/`, dont la logique est testable grâce à des dépendances injectées.
- La base est une table unique, `documents(collection, id, data)`. L'export et la restauration du plan 6 servent de migration.

**Tech Stack:** JavaScript (modules ES), Vitest + happy-dom, esbuild, `@supabase/supabase-js` v2, `@anthropic-ai/sdk`, fonctions Vercel (Node), SQL Postgres (Supabase).

**Spec:** `docs/superpowers/specs/2026-10-01-plan-7-vercel-supabase-design.md`. Branche `plan-7-vercel-supabase`, partie de `main` (plans 1 à 6 fusionnés).

## Global Constraints

- **Aucun secret et aucune donnée réelle dans git.** Les variables d'environnement sont `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `CRON_SECRET`, `ANTHROPIC_API_KEY` et `MODELE_CLAUDE`. `.env*` est ignoré par git, sauf `.env.example`, qui ne contient que les noms.
- **Mêmes fonctionnalités.** Les 474 tests existants restent verts. Les interfaces de `depot.js`, du contrôleur et des vues ne changent pas, sauf mention explicite.
- **Table unique** `documents (collection text, id text, data jsonb, maj_le timestamptz)`, clé primaire `(collection, id)`. RLS : tout est réservé au rôle `authenticated`.
- **Claude** : SDK officiel `@anthropic-ai/sdk`. Le modèle est `process.env.MODELE_CLAUDE || 'claude-opus-4-8'`. Ne pas passer de paramètres `thinking`, `temperature`, `top_p` ou `top_k`. Recherche web : `{ type: 'web_search_20260209', name: 'web_search' }`.
- **Sans `ANTHROPIC_API_KEY`**, l'évaluation et la veille répondent `not_granted` et n'écrivent rien. La page masque « Évaluer » et « Relancer la veille ».
- **Langue** : interface en français, au tutoiement, sans emoji, avec l'apostrophe typographique `’`.
- **`Element.replaceChildren` natif** n'aplatit pas les tableaux et affiche `null` en texte. Lui passer seulement des nœuds, dépliés et filtrés. `h()` aplatit et ignore `null` et `false`.
- **Commits** : chaque commit se termine par une ligne `Co-Authored-By:` qui nomme le modèle auteur.

## Écarts assumés et précisions

- **Build.** La page devient un document HTML complet, `public/index.html`. Le build Artifact (`dist/studio.html`) disparaît. Les Artifacts publiés restent en archive, dans leur dernière version.
- **Écoutes de la base.** Avec Supabase, `onSnapshot` fait sa première lecture de façon asynchrone. `app.js` le gère déjà : il affiche un état de chargement.
- **Veille.** Les épingles `if_version` deviennent `si_maj_le`. Une idée à remplacer n'est supprimée que si son `maj_le` n'a pas changé depuis la lecture.
- **`config/veille`.** Ce document n'est plus utilisé par le bouton. S'il existe encore et que la veille serveur est éteinte, l'ancien lien n'est pas affiché : la page dit que la veille n'est pas configurée.
- **Taille des images envoyées à Claude.** 3 Mo au plus. C'est la limite du corps de requête des fonctions Vercel, une fois l'image encodée.

## Review Focus

1. **Session expirée ou accès refusé pendant l'utilisation.** Le message est clair, la page revient à la connexion, et aucune écriture n'est perdue en silence. *(Tasks 1 et 4)*
2. **Rafale d'écritures** (restauration de centaines de documents). Les écoutes ne relisent pas la base une fois par document. *(Task 1)*
3. **Appel direct des fonctions `api/` sans session, ou avec un jeton invalide.** Réponse 401, rien n'est fait. *(Tasks 5 et 6)*
4. **Réponse de Claude malformée, refus, ou délai dépassé pendant la veille.** Rien n'est écrit. *(Tasks 5 et 6)*
5. **Fichier d'export contenant un profil invalide ou des visuels absents pendant la migration.** Le script s'arrête avant d'écrire et dit pourquoi. *(Task 7)*

---

## Structure des fichiers

```
tests/aides/fauxSupabase.js        faux client Supabase : base, realtime, stockage, auth (Task 1)
src/socle/base-supabase.js         adaptateur « db » (Task 1)
supabase/schema.sql                table, RLS, realtime, stockage, fonction appliquer_veille (Task 2)
.env.example, docs/mise-en-service-vercel-supabase.md (Task 2)
src/socle/visuels-supabase.js      adaptateur « assets » (Task 3)
src/socle/telechargement.js        adaptateur « downloads » (Task 3)
src/socle/connexion.js             session, lien magique, déconnexion (Task 4)
src/interface/vue-connexion.js     écran de connexion (Task 4)
src/interface/main.js              assemblage du socle (Task 4)
scripts/build.mjs, vercel.json, package.json   page complète public/index.html (Task 4)
serveur/session.js, serveur/claude.js   session Supabase et appels Claude (Task 5)
api/capacites.js, api/evaluer.js   fonctions Vercel (Task 5)
src/socle/evaluation-api.js        adaptateur « sample » (Task 5)
src/logique/veille.js              + plageVeille, doitTourner (Task 6)
src/claude/veille-consignes.js     consignes de la veille pour l'API (Task 6)
serveur/veille.js, api/veille.js   veille serveur (Task 6)
src/socle/veille-api.js            relance depuis la page (Task 6)
scripts/migrer.mjs                 restauration d'un export et des visuels dans Supabase (Task 7)
```

---

### Task 1 : adaptateur de base Supabase et faux client

**Files:**
- Create: `tests/aides/fauxSupabase.js`, `src/socle/base-supabase.js`
- Test: `tests/socle/base-supabase.test.js`
- Modify: `package.json` (dépendance `@supabase/supabase-js`)

**Interfaces:**
- Produces :
  - `creerFauxSupabase(options)` : un faux client utilisable par toutes les tâches suivantes. Sa forme :
    - `from('documents')` → requête chaînable et « thenable » : `select`, `eq`, `gte`, `lt`, `order`, `range`, `maybeSingle`, `upsert`, `delete` ;
    - `channel(nom).on('postgres_changes', filtre, rappel).subscribe()` et `removeChannel(canal)` ;
    - `storage.from(espace)` : `upload`, `createSignedUrl`, `download`, `list` ;
    - `auth` : `getSession`, `getUser`, `signInWithOtp`, `signOut`, `onAuthStateChange` ;
    - `rpc(nom, args)` ;
    - aides de test : `_lignes` (Map), `_fichiers` (Map), `_panne(erreur | null)`, `_session(session | null)`, `_lectures` (compteur de requêtes de lecture), `_rpc` (liste des appels).
  - `creerBaseSupabase(client)` : même interface que la capacité `db` utilisée par `src/donnees/depot.js`.
    - `doc(chemin)` : `{ id, path, get(), set(corps), delete(), onSnapshot(suivant, erreur) }` ;
    - `collection(nom)` : `{ where(champ, op, v), get(), onSnapshot(suivant, erreur), doc(id) }` ;
    - un instantané de document vaut `{ id, exists, data() }` ;
    - un instantané de requête vaut `{ docs, size, empty }`.

- [ ] **Step 1: Install the dependency**

Run: `npm install @supabase/supabase-js@^2`
Expected: `package.json` a une section `dependencies` avec `@supabase/supabase-js`.

- [ ] **Step 2: Write the fake client** : `tests/aides/fauxSupabase.js`

```js
export function creerFauxSupabase({ utilisateur = { id: 'u1', email: 'a@exemple.test' }, invites = null } = {}) {
  const lignes = new Map(); // `${collection}/${id}` -> { collection, id, data, maj_le }
  const fichiers = new Map(); // `${espace}/${chemin}` -> Blob
  const ecoutes = new Set();
  const ecoutesAuth = new Set();
  const appelsRpc = [];
  let session = utilisateur ? { access_token: 'jeton-test', user: utilisateur } : null;
  let panne = null;
  const compteurs = { lectures: 0 };
  const emettre = (eventType, ancien, nouveau) => { for (const e of [...ecoutes]) e({ eventType, old: ancien ?? {}, new: nouveau ?? {} }); };
  const valeur = (l, col) => (col.startsWith('data->>') ? l.data?.[col.slice(7)] : l[col]);

  function requete(table) {
    const filtres = [];
    let mode = 'select';
    let charge = null;
    let plage = null;
    let unique = false;
    async function executer() {
      if (panne) return { data: null, error: panne };
      if (table !== 'documents') return { data: null, error: { message: `table inconnue : ${table}` } };
      const cible = [...lignes.values()].filter(l => filtres.every(([col, op, v]) => {
        const x = valeur(l, col);
        return op === 'eq' ? x === v : op === 'gte' ? x >= v : op === 'lt' ? x < v : false;
      }));
      if (mode === 'upsert') {
        for (const l of [].concat(charge)) {
          const k = `${l.collection}/${l.id}`;
          const ancien = lignes.get(k);
          const n = structuredClone(l);
          lignes.set(k, n);
          emettre(ancien ? 'UPDATE' : 'INSERT', ancien, n);
        }
        return { data: null, error: null };
      }
      if (mode === 'delete') {
        for (const l of cible) {
          lignes.delete(`${l.collection}/${l.id}`);
          emettre('DELETE', { collection: l.collection, id: l.id }, null);
        }
        return { data: null, error: null };
      }
      compteurs.lectures += 1;
      let res = cible.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)).map(l => ({ id: l.id, data: structuredClone(l.data) }));
      if (plage) res = res.slice(plage[0], plage[1] + 1);
      return { data: unique ? (res[0] ?? null) : res, error: null };
    }
    const q = {
      select: () => q,
      order: () => q,
      eq: (c, v) => { filtres.push([c, 'eq', v]); return q; },
      gte: (c, v) => { filtres.push([c, 'gte', v]); return q; },
      lt: (c, v) => { filtres.push([c, 'lt', v]); return q; },
      range: (a, b) => { plage = [a, b]; return q; },
      maybeSingle: () => { unique = true; return q; },
      upsert: l => { mode = 'upsert'; charge = l; return q; },
      delete: () => { mode = 'delete'; return q; },
      then: (ok, ko) => executer().then(ok, ko),
    };
    return q;
  }

  const client = {
    from: requete,
    channel: () => {
      let rappel = null;
      const canal = {
        on: (_type, _filtre, fn) => { rappel = fn; return canal; },
        subscribe: () => { if (rappel) ecoutes.add(rappel); return canal; },
        _rappel: () => rappel,
      };
      return canal;
    },
    removeChannel: async canal => { ecoutes.delete(canal._rappel()); },
    rpc: async (nom, args) => { if (panne) return { data: null, error: panne }; appelsRpc.push({ nom, args }); return { data: null, error: null }; },
    storage: {
      from: espace => ({
        upload: async (chemin, fichier) => {
          if (panne) return { data: null, error: panne };
          fichiers.set(`${espace}/${chemin}`, fichier);
          return { data: { path: chemin }, error: null };
        },
        createSignedUrl: async chemin => (fichiers.has(`${espace}/${chemin}`)
          ? { data: { signedUrl: `https://stockage.test/${espace}/${chemin}?jeton=1` }, error: null }
          : { data: null, error: { message: 'Object not found', statusCode: '404' } }),
        download: async chemin => (fichiers.has(`${espace}/${chemin}`)
          ? { data: fichiers.get(`${espace}/${chemin}`), error: null }
          : { data: null, error: { message: 'Object not found', statusCode: '404' } }),
        list: async () => ({ data: [...fichiers.keys()].filter(k => k.startsWith(`${espace}/`)).map(k => ({ name: k.slice(espace.length + 1) })), error: null }),
      }),
    },
    auth: {
      getSession: async () => ({ data: { session }, error: null }),
      getUser: async jeton => (session && jeton === session.access_token
        ? { data: { user: session.user }, error: null }
        : { data: { user: null }, error: { message: 'invalid JWT', status: 401 } }),
      signInWithOtp: async ({ email }) => (invites && !invites.includes(email)
        ? { data: null, error: { message: 'Signups not allowed for otp', status: 422, code: 'otp_disabled' } }
        : { data: {}, error: null }),
      signOut: async () => { session = null; for (const e of [...ecoutesAuth]) e('SIGNED_OUT', null); return { error: null }; },
      onAuthStateChange: fn => { ecoutesAuth.add(fn); return { data: { subscription: { unsubscribe: () => ecoutesAuth.delete(fn) } } }; },
    },
    _lignes: lignes,
    _fichiers: fichiers,
    _rpc: appelsRpc,
    _panne: p => { panne = p; },
    _session: s => { session = s; for (const e of [...ecoutesAuth]) e(s ? 'SIGNED_IN' : 'SIGNED_OUT', s); },
    get _lectures() { return compteurs.lectures; },
  };
  return client;
}
```

- [ ] **Step 3: Write the failing tests** : `tests/socle/base-supabase.test.js`

```js
import { describe, it, expect, vi } from 'vitest';
import { creerFauxSupabase } from '../aides/fauxSupabase.js';
import { creerBaseSupabase } from '../../src/socle/base-supabase.js';
import { creerDepot } from '../../src/donnees/depot.js';

const attendre = (ms = 80) => new Promise(r => setTimeout(r, ms));

describe('creerBaseSupabase', () => {
  it('écrit, lit et supprime un document', async () => {
    const client = creerFauxSupabase();
    const db = creerBaseSupabase(client);
    await db.doc('fiches/a').set({ accroche: 'x' });
    expect(client._lignes.get('fiches/a')).toMatchObject({ collection: 'fiches', id: 'a', data: { accroche: 'x' } });
    const s = await db.doc('fiches/a').get();
    expect([s.id, s.exists, s.data()]).toEqual(['a', true, { accroche: 'x' }]);
    await db.doc('fiches/a').delete();
    const apres = await db.doc('fiches/a').get();
    expect([apres.exists, apres.data()]).toEqual([false, undefined]);
  });

  it('filtre une collection avec where', async () => {
    const client = creerFauxSupabase();
    const db = creerBaseSupabase(client);
    await db.doc('fiches/a').set({ date_heure: '2026-09-28T10:00:00.000Z' });
    await db.doc('fiches/b').set({ date_heure: '2026-10-06T10:00:00.000Z' });
    await db.doc('bulletins/x').set({ date_heure: '2026-09-29T10:00:00.000Z' });
    const snap = await db.collection('fiches').where('date_heure', '>=', '2026-09-27T22:00:00.000Z').where('date_heure', '<', '2026-10-04T22:00:00.000Z').get();
    expect(snap.docs.map(d => [d.id, d.data()])).toEqual([['a', { date_heure: '2026-09-28T10:00:00.000Z' }]]);
    expect([snap.size, snap.empty]).toEqual([1, false]);
    const egal = await db.collection('fiches').where('date_heure', '==', '2026-10-06T10:00:00.000Z').get();
    expect(egal.docs.map(d => d.id)).toEqual(['b']);
  });

  it('pagine au-delà de 1000 documents', async () => {
    const client = creerFauxSupabase();
    const db = creerBaseSupabase(client);
    for (let i = 0; i < 1205; i += 1) client._lignes.set(`fiches/f${String(i).padStart(4, '0')}`, { collection: 'fiches', id: `f${String(i).padStart(4, '0')}`, data: {} });
    expect((await db.collection('fiches').get()).size).toBe(1205);
  });

  it('onSnapshot livre l’état initial puis les changements de sa collection', async () => {
    const client = creerFauxSupabase();
    const db = creerBaseSupabase(client);
    const recus = [];
    const stop = db.collection('fiches').onSnapshot(s => recus.push(s.docs.map(d => d.id)), () => {});
    await attendre();
    expect(recus).toEqual([[]]);
    await db.doc('fiches/a').set({ x: 1 });
    await db.doc('bulletins/b').set({ x: 1 });
    await attendre();
    expect(recus.at(-1)).toEqual(['a']);
    expect(recus).toHaveLength(2);
    stop();
    await db.doc('fiches/c').set({ x: 1 });
    await attendre();
    expect(recus).toHaveLength(2);
  });

  it('onSnapshot d’un document suit ses écritures et sa suppression', async () => {
    const client = creerFauxSupabase();
    const db = creerBaseSupabase(client);
    const recus = [];
    db.doc('profil/courant').onSnapshot(s => recus.push(s.exists ? s.data() : null), () => {});
    await attendre();
    await db.doc('profil/courant').set({ version: 1 });
    await attendre();
    await db.doc('profil/courant').delete();
    await attendre();
    expect(recus).toEqual([null, { version: 1 }, null]);
  });

  it('regroupe une rafale d’écritures en une seule relecture', async () => {
    const client = creerFauxSupabase();
    const db = creerBaseSupabase(client);
    const recus = [];
    db.collection('fiches').onSnapshot(s => recus.push(s.size), () => {});
    await attendre();
    const avant = client._lectures;
    for (let i = 0; i < 50; i += 1) await db.doc(`fiches/f${i}`).set({ i });
    await attendre(150);
    expect(recus.at(-1)).toBe(50);
    expect(client._lectures - avant).toBeLessThanOrEqual(3);
  });

  it('signale une session expirée avec le code revoked', async () => {
    const client = creerFauxSupabase();
    const db = creerBaseSupabase(client);
    client._panne({ message: 'JWT expired', code: 'PGRST301', status: 401 });
    await expect(db.doc('fiches/a').set({})).rejects.toMatchObject({ code: 'revoked' });
    const erreurs = [];
    db.collection('fiches').onSnapshot(() => {}, e => erreurs.push(e.code));
    await attendre();
    expect(erreurs).toEqual(['revoked']);
    client._panne({ message: 'boom', code: 'XX000', status: 500 });
    await expect(db.doc('fiches/a').get()).rejects.toMatchObject({ code: 'XX000' });
  });

  it('fait fonctionner le dépôt existant', async () => {
    const client = creerFauxSupabase();
    const depot = creerDepot(creerBaseSupabase(client));
    await depot.enregistrerFiche({ id: 'a', date_heure: '2026-09-28T10:00:00.000Z', format: 'reel' });
    expect(await depot.lireFiche('a')).toEqual({ id: 'a', date_heure: '2026-09-28T10:00:00.000Z', format: 'reel' });
    expect(await depot.lireCollection('fiches')).toEqual([{ id: 'a', data: { date_heure: '2026-09-28T10:00:00.000Z', format: 'reel' } }]);
    const recues = vi.fn();
    depot.ecouterFiches('2026-09-27T22:00:00.000Z', '2026-10-04T22:00:00.000Z', recues, () => {});
    await attendre();
    expect(recues.mock.calls.at(-1)[0]).toEqual([{ id: 'a', date_heure: '2026-09-28T10:00:00.000Z', format: 'reel' }]);
  });
});
```

- [ ] **Step 4: Run to see it fail**

Run: `npx vitest run tests/socle/base-supabase.test.js`
Expected: FAIL (module `src/socle/base-supabase.js` absent).

- [ ] **Step 5: Implement** `src/socle/base-supabase.js`

```js
const TABLE = 'documents';
const PAGE = 1000;
const DELAI_RELECTURE = 40;
const OPERATEURS = { '>=': 'gte', '<': 'lt', '==': 'eq' };
const CODES_REVOQUES = new Set(['PGRST301', 'PGRST302', '42501']);

function erreurBase(error) {
  const revoque = error?.status === 401 || error?.status === 403 || CODES_REVOQUES.has(error?.code);
  return Object.assign(new Error(error?.message ?? 'Erreur de la base.'), { code: revoque ? 'revoked' : (error?.code ?? 'unavailable') });
}

export function creerBaseSupabase(client) {
  const abonnes = new Map(); // collection -> Set de relectures
  let canal = null;

  function ouvrirCanal() {
    if (canal) return;
    canal = client.channel('documents').on('postgres_changes', { event: '*', schema: 'public', table: TABLE }, charge => {
      const collection = charge.new?.collection ?? charge.old?.collection;
      for (const relire of [...(abonnes.get(collection) ?? [])]) relire();
    }).subscribe();
  }

  function ecouter(collection, lire, suivant, erreur) {
    let actif = true;
    let minuteur = null;
    const livrer = () => lire().then(v => { if (actif) suivant(v); }, e => { if (actif) erreur?.(e); });
    const relire = () => {
      if (minuteur) return;
      minuteur = setTimeout(() => { minuteur = null; if (actif) livrer(); }, DELAI_RELECTURE);
    };
    if (!abonnes.has(collection)) abonnes.set(collection, new Set());
    abonnes.get(collection).add(relire);
    ouvrirCanal();
    livrer();
    return () => {
      actif = false;
      if (minuteur) clearTimeout(minuteur);
      abonnes.get(collection)?.delete(relire);
    };
  }

  const instantane = (id, ligne) => ({ id, exists: !!ligne, data: () => (ligne ? ligne.data : undefined) });

  function doc(chemin) {
    const coupe = chemin.indexOf('/');
    const collection = chemin.slice(0, coupe);
    const id = chemin.slice(coupe + 1);
    const lire = async () => {
      const { data, error } = await client.from(TABLE).select('id,data').eq('collection', collection).eq('id', id).maybeSingle();
      if (error) throw erreurBase(error);
      return instantane(id, data);
    };
    return {
      id,
      path: chemin,
      get: lire,
      async set(corps) {
        const { error } = await client.from(TABLE).upsert({ collection, id, data: corps, maj_le: new Date().toISOString() });
        if (error) throw erreurBase(error);
      },
      async delete() {
        const { error } = await client.from(TABLE).delete().eq('collection', collection).eq('id', id);
        if (error) throw erreurBase(error);
      },
      onSnapshot: (suivant, erreur) => ecouter(collection, lire, suivant, erreur),
    };
  }

  function requete(collection, filtres) {
    const lire = async () => {
      const lignes = [];
      for (let debut = 0; ; debut += PAGE) {
        let q = client.from(TABLE).select('id,data').eq('collection', collection);
        for (const [champ, op, v] of filtres) q = q[OPERATEURS[op]](`data->>${champ}`, v);
        const { data, error } = await q.order('id').range(debut, debut + PAGE - 1);
        if (error) throw erreurBase(error);
        lignes.push(...data);
        if (data.length < PAGE) break;
      }
      const docs = lignes.map(l => instantane(l.id, l));
      return { docs, size: docs.length, empty: docs.length === 0 };
    };
    return {
      where(champ, op, v) {
        if (!OPERATEURS[op]) throw new Error(`Opérateur non pris en charge : ${op}`);
        return requete(collection, [...filtres, [champ, op, v]]);
      },
      get: lire,
      onSnapshot: (suivant, erreur) => ecouter(collection, lire, suivant, erreur),
      doc: id => doc(`${collection}/${id}`),
    };
  }

  return { doc, collection: nom => requete(nom, []) };
}
```

- [ ] **Step 6: Run the tests**

Run: `npx vitest run tests/socle/base-supabase.test.js`, puis `npm test`.
Expected: PASS. Les 474 tests existants restent verts.

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json tests/aides/fauxSupabase.js src/socle/base-supabase.js tests/socle/base-supabase.test.js
git commit -m "Socle : base Supabase avec la même interface que la base d'Artifact

Co-Authored-By: <modèle auteur>"
```

---

### Task 2 : schéma SQL, variables d'environnement et marche à suivre

**Files:**
- Create: `supabase/schema.sql`, `.env.example`, `docs/mise-en-service-vercel-supabase.md`
- Modify: `.gitignore`
- Test: `tests/supabase-schema.test.js`

**Interfaces:**
- Produces :
  - la table `documents` ;
  - l'espace de stockage `visuels` ;
  - la fonction `appliquer_veille(ecritures jsonb)`. Chaque élément de `ecritures` vaut :
    - `{ op: 'delete', collection, doc_id, si_maj_le? }` ;
    - ou `{ op: 'set', collection, doc_id, data }`.

- [ ] **Step 1: Write the failing test** : `tests/supabase-schema.test.js`

```js
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const sql = readFileSync(new URL('../supabase/schema.sql', import.meta.url), 'utf8');
const exemple = readFileSync(new URL('../.env.example', import.meta.url), 'utf8');
const ignore = readFileSync(new URL('../.gitignore', import.meta.url), 'utf8');

describe('schéma Supabase', () => {
  it('crée la table, ses index et active la sécurité par ligne', () => {
    for (const attendu of [
      'create table if not exists documents', 'primary key (collection, id)', "(data->>'date_heure')", "(data->>'date_publication')",
      'alter table documents enable row level security', 'to authenticated', 'alter publication supabase_realtime add table documents',
    ]) expect(sql).toContain(attendu);
    expect(sql).not.toMatch(/to anon\b/);
  });
  it('crée le stockage privé des visuels', () => {
    expect(sql).toContain("'visuels'");
    expect(sql).toMatch(/public\s*,?[^;]*false|false\s*,\s*20971520/);
    expect(sql).toContain('storage.objects');
  });
  it('réserve appliquer_veille au rôle de service', () => {
    expect(sql).toContain('create or replace function appliquer_veille(ecritures jsonb)');
    expect(sql).toContain('revoke all on function appliquer_veille(jsonb) from public, anon, authenticated');
    expect(sql).toContain('grant execute on function appliquer_veille(jsonb) to service_role');
    expect(sql).toContain("data->>'maj_le' = e->>'si_maj_le'");
  });
});

describe('secrets', () => {
  it('liste les variables sans valeur et ignore les fichiers .env', () => {
    for (const nom of ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY', 'CRON_SECRET', 'ANTHROPIC_API_KEY', 'MODELE_CLAUDE']) {
      expect(exemple).toMatch(new RegExp(`^${nom}=$`, 'm'));
    }
    expect(ignore).toContain('.env');
    expect(ignore).toContain('!.env.example');
  });
});
```

- [ ] **Step 2: Run to see it fail**

Run: `npx vitest run tests/supabase-schema.test.js`
Expected: FAIL (fichiers absents).

- [ ] **Step 3: Write** `supabase/schema.sql`

```sql
-- Studio Contenu : schéma Supabase. À exécuter une fois dans l'éditeur SQL de chaque projet (test et réel).

create table if not exists documents (
  collection text not null,
  id text not null,
  data jsonb not null,
  maj_le timestamptz not null default now(),
  primary key (collection, id)
);
create index if not exists documents_date_heure on documents (collection, (data->>'date_heure'));
create index if not exists documents_date_publication on documents (collection, (data->>'date_publication'));

alter table documents enable row level security;
drop policy if exists "documents : membres connectés" on documents;
create policy "documents : membres connectés" on documents
  for all to authenticated using (true) with check (true);

do $$ begin
  alter publication supabase_realtime add table documents;
exception when duplicate_object then null; end $$;

-- Stockage privé des visuels (20 Mo au plus par fichier).
insert into storage.buckets (id, name, public, file_size_limit)
values ('visuels', 'visuels', false, 20971520)
on conflict (id) do update set public = false, file_size_limit = 20971520;

drop policy if exists "visuels : membres connectés" on storage.objects;
create policy "visuels : membres connectés" on storage.objects
  for all to authenticated using (bucket_id = 'visuels') with check (bucket_id = 'visuels');

-- Écritures de la veille, en une seule transaction. Réservée à la clé de service.
create or replace function appliquer_veille(ecritures jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare e jsonb;
begin
  for e in select * from jsonb_array_elements(ecritures) loop
    if e->>'op' = 'delete' then
      delete from documents
      where collection = e->>'collection' and id = e->>'doc_id'
        and (e->>'si_maj_le' is null or data->>'maj_le' = e->>'si_maj_le');
    elsif e->>'op' = 'set' then
      insert into documents (collection, id, data, maj_le)
      values (e->>'collection', e->>'doc_id', e->'data', now())
      on conflict (collection, id) do update set data = excluded.data, maj_le = now();
    else
      raise exception 'Opération inconnue : %', e->>'op';
    end if;
  end loop;
end $$;
revoke all on function appliquer_veille(jsonb) from public, anon, authenticated;
grant execute on function appliquer_veille(jsonb) to service_role;
```

- [ ] **Step 4: Write** `.env.example`

```
# Copie ce fichier en .env.local et remplis-le. Ne commite jamais .env.local.
SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
CRON_SECRET=
ANTHROPIC_API_KEY=
MODELE_CLAUDE=
```

In `.gitignore`, in the secrets block, add the line `!.env.example` right after `.env.*`.

- [ ] **Step 5: Write** `docs/mise-en-service-vercel-supabase.md`. Sections, in French, in this order:
  1. **Ce qu'il te faut** : un compte Supabase, un compte Vercel relié au dépôt GitHub, 20 minutes.
  2. **Supabase, deux fois** (un projet « studio-test », un projet « studio-reel »). Pour chacun :
     - créer le projet ;
     - ouvrir l'éditeur SQL, y coller le contenu de `supabase/schema.sql`, exécuter ;
     - dans Authentication → Sign In / Providers, désactiver « Allow new users to sign up » ;
     - dans Authentication → Users, « Invite user » pour chaque adresse autorisée ;
     - dans Authentication → URL Configuration, mettre l'adresse du site Vercel dans « Site URL » et « Redirect URLs » ;
     - relever dans Settings → API l'URL du projet, la clé `anon` et la clé `service_role`.
  3. **Vercel** :
     - importer le dépôt ;
     - laisser la commande de build et le dossier de sortie tels que les définit `vercel.json` ;
     - dans Settings → Environment Variables, saisir le tableau des variables de la spec §8, en indiquant pour chacune l'environnement (Production : projet réel ; Preview : projet de test), que `SUPABASE_SERVICE_ROLE_KEY`, `CRON_SECRET` et `ANTHROPIC_API_KEY` sont secrètes, et que `CRON_SECRET` est une longue chaîne aléatoire que Jean choisit.
  4. **En local** : copier `.env.example` en `.env.local`, y mettre les valeurs du projet de **test**. Ce fichier sert seulement au script de migration et n'est jamais commité.
  5. **Allumer l'évaluation et la veille plus tard** : créer une clé sur console.anthropic.com, l'ajouter comme `ANTHROPIC_API_KEY` dans Vercel, puis redéployer.
  6. **En cas de problème** :
     - lien magique non reçu → vérifier les indésirables et l'invitation ;
     - « Cette adresse n’a pas accès au studio. » → inviter l'adresse ;
     - page blanche → vérifier les deux variables publiques.

  The document contains no real value, URL or address.

- [ ] **Step 6: Run the tests**

Run: `npx vitest run tests/supabase-schema.test.js`, puis `npm test`.
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add supabase/schema.sql .env.example .gitignore docs/mise-en-service-vercel-supabase.md tests/supabase-schema.test.js
git commit -m "Supabase : schéma, sécurité par ligne, stockage et marche à suivre

Co-Authored-By: <modèle auteur>"
```

---

### Task 3 : visuels et téléchargement

**Files:**
- Create: `src/socle/visuels-supabase.js`, `src/socle/telechargement.js`
- Modify: `src/interface/controleur.js`, `src/interface/panneau-fiche.js`, `src/interface/app.js`
- Test: `tests/socle/visuels-supabase.test.js`, `tests/socle/telechargement.test.js`, `tests/interface/panneau-fiche.test.js`, `tests/interface/controleur.test.js`

**Interfaces:**
- Consumes : `creerFauxSupabase` (Task 1).
- Produces :
  - `creerVisuelsSupabase(client, { idAleatoire })` → `{ upload(fichier), url(id), telecharger(id) }`.
    - `upload` renvoie `{ id }` ou rejette `{ code }` avec `too_large`, `unsupported_type` ou `rate_limited`.
    - `url` renvoie un lien signé.
    - `telecharger` renvoie un Blob.
  - `creerTelechargement(document)` → `{ save({ filename, data }) }`, qui renvoie `{ status: 'saved' }`.
  - action du contrôleur `urlVisuel(id)` → `Promise<string>` :
    - `assets.url(id)` s'il existe ;
    - sinon `/_blob/<id>`.
  - `app.js` : quand `assets.telecharger` existe, il sert de `chargerImage` au contrôleur.

- [ ] **Step 1: Write the failing tests.**

`tests/socle/visuels-supabase.test.js` :

```js
import { describe, it, expect } from 'vitest';
import { creerFauxSupabase } from '../aides/fauxSupabase.js';
import { creerVisuelsSupabase } from '../../src/socle/visuels-supabase.js';

const fichier = (type, taille = 10, nom = 'photo.png') => Object.assign(new Blob([new Uint8Array(taille)], { type }), { name: nom });

describe('creerVisuelsSupabase', () => {
  it('téléverse, signe et télécharge', async () => {
    const client = creerFauxSupabase();
    const visuels = creerVisuelsSupabase(client, { idAleatoire: () => 'abc' });
    const { id } = await visuels.upload(fichier('image/png'));
    expect(id).toBe('abc.png');
    expect(client._fichiers.has('visuels/abc.png')).toBe(true);
    expect(await visuels.url(id)).toBe('https://stockage.test/visuels/abc.png?jeton=1');
    expect((await visuels.telecharger(id)).type).toBe('image/png');
  });
  it('donne une extension selon le type quand le nom n’en a pas', async () => {
    const visuels = creerVisuelsSupabase(creerFauxSupabase(), { idAleatoire: () => 'v1' });
    expect((await visuels.upload(fichier('video/mp4', 10, 'clip'))).id).toBe('v1.mp4');
    expect((await visuels.upload(fichier('image/jpeg', 10, 'a.JPG'))).id).toBe('v1.jpg');
  });
  it('refuse les types et tailles non acceptés avant tout envoi', async () => {
    const client = creerFauxSupabase();
    const visuels = creerVisuelsSupabase(client, { idAleatoire: () => 'x' });
    await expect(visuels.upload(fichier('application/pdf'))).rejects.toMatchObject({ code: 'unsupported_type' });
    await expect(visuels.upload(fichier('image/png', 20 * 1024 * 1024 + 1))).rejects.toMatchObject({ code: 'too_large' });
    expect(client._fichiers.size).toBe(0);
  });
  it('traduit les erreurs du stockage', async () => {
    const client = creerFauxSupabase();
    const visuels = creerVisuelsSupabase(client, { idAleatoire: () => 'x' });
    client._panne({ message: 'Payload too large', statusCode: '413' });
    await expect(visuels.upload(fichier('image/png'))).rejects.toMatchObject({ code: 'too_large' });
    client._panne({ message: 'Too many requests', statusCode: '429' });
    await expect(visuels.upload(fichier('image/png'))).rejects.toMatchObject({ code: 'rate_limited' });
    client._panne(null);
    await expect(visuels.url('absent.png')).rejects.toMatchObject({ code: 'not_found' });
  });
});
```

`tests/socle/telechargement.test.js` :

```js
// @vitest-environment happy-dom
import { describe, it, expect, vi } from 'vitest';
import { creerTelechargement } from '../../src/socle/telechargement.js';

describe('creerTelechargement', () => {
  it('déclenche le téléchargement d’un fichier', async () => {
    const creer = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:test');
    const revoquer = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    const clics = [];
    const origine = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function () { clics.push([this.download, this.href]); };
    const r = await creerTelechargement(document).save({ filename: 'studio-contenu-2026-10-01.json', data: '{"a":1}' });
    HTMLAnchorElement.prototype.click = origine;
    expect(r).toEqual({ status: 'saved' });
    expect(clics).toEqual([['studio-contenu-2026-10-01.json', 'blob:test']]);
    expect(creer).toHaveBeenCalledTimes(1);
    expect(revoquer).toHaveBeenCalledWith('blob:test');
    expect(document.querySelector('a[download]')).toBeNull();
  });
  it('refuse un contenu vide', async () => {
    await expect(creerTelechargement(document).save({ filename: 'x.json', data: '' })).rejects.toMatchObject({ code: 'bad_request' });
  });
});
```

In `tests/interface/controleur.test.js` (helper `monter({ assets })` exists) :

```js
describe('urlVisuel', () => {
  it('utilise le lien signé du stockage, sinon le chemin d’Artifact', async () => {
    const avec = monter({ assets: { upload: vi.fn(), url: vi.fn(async id => `https://stockage.test/${id}`) } });
    expect(await avec.actions.urlVisuel('a.png')).toBe('https://stockage.test/a.png');
    const sans = monter({ assets: { upload: vi.fn() } });
    expect(await sans.actions.urlVisuel('a1')).toBe('/_blob/a1');
  });
});
```

In `tests/interface/panneau-fiche.test.js` :

```js
describe('visuel signé', () => {
  it('affiche le visuel avec le lien fourni par le contrôleur', async () => {
    const actions = { ...actionsFactices(), urlVisuel: vi.fn(async id => `https://stockage.test/${id}?jeton=1`) };
    const p = panneauFiche(fiche({ visuel: 'a.png', visuel_type: 'image' }), fictif, actions, { assets: true });
    await vi.waitFor(() => expect(p.querySelector('img.apercu')?.getAttribute('src')).toBe('https://stockage.test/a.png?jeton=1'));
  });
  it('garde le chemin d’Artifact sans cette action', () => {
    const p = panneauFiche(fiche({ visuel: 'a1', visuel_type: 'image' }), fictif, actionsFactices(), { assets: true });
    expect(p.querySelector('img.apercu').getAttribute('src')).toBe('/_blob/a1');
  });
  it('signale un visuel introuvable', async () => {
    const actions = { ...actionsFactices(), urlVisuel: vi.fn(async () => { throw new Error('x'); }) };
    const p = panneauFiche(fiche({ visuel: 'a.png', visuel_type: 'image' }), fictif, actions, { assets: true });
    await vi.waitFor(() => expect(p.querySelector('.zone-visuel').textContent).toContain('Visuel introuvable.'));
  });
});
```

- [ ] **Step 2: Run to see them fail**

Run: `npx vitest run tests/socle tests/interface/controleur.test.js tests/interface/panneau-fiche.test.js`
Expected: FAIL.

- [ ] **Step 3: Implement** `src/socle/visuels-supabase.js`

```js
const ESPACE = 'visuels';
const TAILLE_MAX = 20 * 1024 * 1024;
const EXTENSIONS = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif', 'video/mp4': 'mp4', 'video/quicktime': 'mov', 'video/webm': 'webm' };
const erreur = (code, message) => Object.assign(new Error(message ?? code), { code });
const idParDefaut = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

function traduire(e) {
  const statut = String(e?.statusCode ?? e?.status ?? '');
  if (statut === '413') return erreur('too_large', e.message);
  if (statut === '429') return erreur('rate_limited', e.message);
  if (statut === '404') return erreur('not_found', e.message);
  if (statut === '415') return erreur('unsupported_type', e.message);
  return erreur('unavailable', e?.message);
}

export function creerVisuelsSupabase(client, { idAleatoire = idParDefaut } = {}) {
  const espace = () => client.storage.from(ESPACE);
  return {
    async upload(fichier) {
      const extension = EXTENSIONS[fichier.type];
      if (!extension) throw erreur('unsupported_type');
      if (fichier.size > TAILLE_MAX) throw erreur('too_large');
      const id = `${idAleatoire()}.${extension}`;
      const { error } = await espace().upload(id, fichier, { contentType: fichier.type, upsert: false });
      if (error) throw traduire(error);
      return { id };
    },
    async url(id) {
      const { data, error } = await espace().createSignedUrl(id, 3600);
      if (error) throw traduire(error);
      return data.signedUrl;
    },
    async telecharger(id) {
      const { data, error } = await espace().download(id);
      if (error) throw traduire(error);
      return data;
    },
  };
}
```

- [ ] **Step 4: Implement** `src/socle/telechargement.js`

```js
export function creerTelechargement(doc) {
  return {
    async save({ filename, data }) {
      if (typeof filename !== 'string' || !filename || data == null || data === '') {
        throw Object.assign(new Error('Fichier vide ou sans nom.'), { code: 'bad_request' });
      }
      const blob = data instanceof Blob ? data : new Blob([data], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const lien = doc.createElement('a');
      lien.href = url;
      lien.download = filename;
      doc.body.append(lien);
      lien.click();
      lien.remove();
      URL.revokeObjectURL(url);
      return { status: 'saved' };
    },
  };
}
```

- [ ] **Step 5: Wire the controller and the app.**
  - `src/interface/controleur.js` : add to the returned actions `urlVisuel: async id => (typeof assets?.url === 'function' ? assets.url(id) : \`/_blob/${id}\`),`.
  - `src/interface/app.js` : in the call to `creerControleur({ … })`, add `...(typeof assets?.telecharger === 'function' ? { chargerImage: id => assets.telecharger(id) } : {}),`.

- [ ] **Step 6: Wire the panel.** In `src/interface/panneau-fiche.js`, replace the body of `sectionVisuel` up to the `return` with:

```js
    if (!capacites.assets) return h('p', { class: 'aide' }, 'Le téléversement de visuels n’est pas disponible dans cette vue.');
    let apercu = null;
    let avis = null;
    if (brouillon.visuel) {
      apercu = brouillon.visuel_type === 'video'
        ? h('video', { class: 'apercu', controls: true })
        : h('img', { class: 'apercu', alt: 'Visuel de la fiche' });
      if (typeof actions.urlVisuel === 'function') {
        avis = h('p', { class: 'aide', role: 'status' });
        actions.urlVisuel(brouillon.visuel).then(
          url => { apercu.setAttribute('src', url); },
          () => { avis.textContent = 'Visuel introuvable.'; },
        );
      } else {
        apercu.setAttribute('src', `/_blob/${brouillon.visuel}`);
      }
    }
```

    then add `avis,` right after `apercu,` in the children of the `div.zone-visuel`. `h()` ignores `null`.

- [ ] **Step 7: Run the tests**

Run: `npx vitest run tests/socle tests/interface`, puis `npm test`.
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/socle/visuels-supabase.js src/socle/telechargement.js src/interface/controleur.js src/interface/app.js src/interface/panneau-fiche.js tests
git commit -m "Socle : visuels dans le stockage Supabase et téléchargement par le navigateur

Co-Authored-By: <modèle auteur>"
```

---

### Task 4 : connexion, assemblage et page Vercel

**Files:**
- Create: `src/socle/connexion.js`, `src/interface/vue-connexion.js`, `src/socle/socle.js`, `vercel.json`
- Modify: `src/interface/main.js`, `src/interface/page.html`, `scripts/build.mjs`, `package.json`, `src/interface/app.js`, `src/interface/controleur.js`, `src/interface/vue-profil.js`, `src/interface/styles.css`, `.gitignore`
- Test: `tests/socle/connexion.test.js`, `tests/interface/vue-connexion.test.js`, `tests/socle/socle.test.js`, `tests/build.test.js`, `tests/interface/reference.test.js`

**Interfaces:**
- Consumes : `creerBaseSupabase`, `creerVisuelsSupabase`, `creerTelechargement`, `creerFauxSupabase`.
- Produces :
  - `creerConnexion(client, { origine })` → `{ session(), demanderLien(email), deconnecter(), surChangement(fn), jeton() }`.
    - `demanderLien` renvoie `{ ok: true }` ou `{ ok: false, raison }`.
  - `vueConnexion(connexion)` → un élément.
  - `creerSocle({ client, connexion, document, capacitesServeur, fetch })` → `{ use(nom) }`.
    - Il sert `db`, `assets`, `downloads` et `connexion`.
    - `sample` et `veille` valent `null` dans cette tâche. Les tâches 5 et 6 les ajoutent via `capacitesServeur`.
  - `construire(env)` (build) → un document HTML complet.
  - action du contrôleur `seDeconnecter()`.
  - `capacites.connexion` (booléen).

- [ ] **Step 1: Write the failing tests.**

`tests/socle/connexion.test.js` :

```js
import { describe, it, expect, vi } from 'vitest';
import { creerFauxSupabase } from '../aides/fauxSupabase.js';
import { creerConnexion } from '../../src/socle/connexion.js';

describe('creerConnexion', () => {
  it('lit la session et le jeton', async () => {
    const c = creerConnexion(creerFauxSupabase(), { origine: 'https://studio.test' });
    expect((await c.session()).user.email).toBe('a@exemple.test');
    expect(await c.jeton()).toBe('jeton-test');
    const sans = creerConnexion(creerFauxSupabase({ utilisateur: null }), { origine: 'https://studio.test' });
    expect(await sans.session()).toBeNull();
    expect(await sans.jeton()).toBeNull();
  });
  it('envoie un lien magique sans créer de compte', async () => {
    const client = creerFauxSupabase({ utilisateur: null, invites: ['a@exemple.test'] });
    const espion = vi.spyOn(client.auth, 'signInWithOtp');
    const c = creerConnexion(client, { origine: 'https://studio.test' });
    expect(await c.demanderLien('  A@Exemple.test ')).toEqual({ ok: true });
    expect(espion).toHaveBeenCalledWith({ email: 'a@exemple.test', options: { shouldCreateUser: false, emailRedirectTo: 'https://studio.test' } });
  });
  it('refuse une adresse non invitée ou mal formée', async () => {
    const c = creerConnexion(creerFauxSupabase({ utilisateur: null, invites: ['a@exemple.test'] }), { origine: 'https://studio.test' });
    expect(await c.demanderLien('autre@exemple.test')).toEqual({ ok: false, raison: 'Cette adresse n’a pas accès au studio.' });
    expect(await c.demanderLien('pas-une-adresse')).toEqual({ ok: false, raison: 'Saisis une adresse e-mail valide.' });
  });
  it('prévient des changements de session et déconnecte', async () => {
    const client = creerFauxSupabase();
    const c = creerConnexion(client, { origine: 'https://studio.test' });
    const vus = [];
    c.surChangement(s => vus.push(s ? 'connecte' : 'deconnecte'));
    await c.deconnecter();
    expect(vus).toEqual(['deconnecte']);
    expect(await c.session()).toBeNull();
  });
});
```

`tests/interface/vue-connexion.test.js` :

```js
// @vitest-environment happy-dom
import { describe, it, expect, vi } from 'vitest';
import { vueConnexion } from '../../src/interface/vue-connexion.js';

const envoyer = (v, email) => {
  v.querySelector('input[type="email"]').value = email;
  v.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
};

describe('vueConnexion', () => {
  it('demande le lien et confirme l’envoi', async () => {
    const connexion = { demanderLien: vi.fn(async () => ({ ok: true })) };
    const v = vueConnexion(connexion);
    expect(v.querySelector('button[type="submit"]').textContent).toBe('Recevoir le lien de connexion');
    envoyer(v, 'a@exemple.test');
    await vi.waitFor(() => expect(v.textContent).toContain('Lien envoyé : ouvre ta boîte mail.'));
    expect(connexion.demanderLien).toHaveBeenCalledWith('a@exemple.test');
  });
  it('affiche le refus et laisse réessayer', async () => {
    const connexion = { demanderLien: vi.fn(async () => ({ ok: false, raison: 'Cette adresse n’a pas accès au studio.' })) };
    const v = vueConnexion(connexion);
    envoyer(v, 'x@exemple.test');
    await vi.waitFor(() => expect(v.textContent).toContain('Cette adresse n’a pas accès au studio.'));
    expect(v.querySelector('button[type="submit"]').disabled).toBe(false);
    expect(v.textContent).not.toContain('null');
  });
});
```

`tests/socle/socle.test.js` :

```js
// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import { creerFauxSupabase } from '../aides/fauxSupabase.js';
import { creerConnexion } from '../../src/socle/connexion.js';
import { creerSocle } from '../../src/socle/socle.js';

describe('creerSocle', () => {
  it('sert les capacités de base et laisse l’évaluation et la veille éteintes', async () => {
    const client = creerFauxSupabase();
    const socle = creerSocle({ client, connexion: creerConnexion(client, { origine: 'https://studio.test' }), document, capacitesServeur: { evaluation: false, veille: false } });
    for (const nom of ['db', 'assets', 'downloads', 'connexion']) expect(await socle.use(nom)).not.toBeNull();
    expect(typeof (await socle.use('db')).doc).toBe('function');
    expect(typeof (await socle.use('assets')).telecharger).toBe('function');
    expect(await socle.use('sample')).toBeNull();
    expect(await socle.use('veille')).toBeNull();
    expect(await socle.use('inconnu')).toBeNull();
  });
});
```

Replace `tests/build.test.js` with:

```js
import { describe, it, expect } from 'vitest';
import { construire } from '../scripts/build.mjs';

describe('construire', () => {
  it('produit un document complet avec la configuration publique', async () => {
    const html = await construire({ SUPABASE_URL: 'https://projet.test', SUPABASE_ANON_KEY: 'cle-publique' });
    expect(html.startsWith('<!doctype html>')).toBe(true);
    expect(html).toContain('<html lang="fr">');
    expect(html).toContain('<meta name="viewport"');
    expect(html).toContain('<title>Studio Contenu</title>');
    expect(html).toContain('<div id="app"></div>');
    expect(html).not.toContain('/*SCRIPT*/');
    expect(html).not.toContain('/*STYLES*/');
    expect(html).toContain('--fond');
    expect(html).toContain('https://projet.test');
    expect(html).toContain('cle-publique');
  });
  it('échoue clairement sans configuration', async () => {
    await expect(construire({})).rejects.toThrow('SUPABASE_URL et SUPABASE_ANON_KEY sont requis pour construire la page.');
  });
  it('n’embarque aucune clé secrète', async () => {
    const html = await construire({ SUPABASE_URL: 'https://projet.test', SUPABASE_ANON_KEY: 'cle-publique', SUPABASE_SERVICE_ROLE_KEY: 'SECRET-SERVICE', ANTHROPIC_API_KEY: 'SECRET-CLAUDE', CRON_SECRET: 'SECRET-CRON' });
    for (const secret of ['SECRET-SERVICE', 'SECRET-CLAUDE', 'SECRET-CRON']) expect(html).not.toContain(secret);
  });
});
```

In the test file of `vueProfil` (`tests/interface/reference.test.js`) :

```js
describe('déconnexion', () => {
  it('propose de se déconnecter quand la connexion existe', async () => {
    const actions = { importerProfil: vi.fn(), seDeconnecter: vi.fn(async () => {}) };
    const v = vueProfil({ profil: fictif }, actions, { connexion: true });
    [...v.querySelectorAll('button')].find(b => b.textContent === 'Se déconnecter').click();
    expect(actions.seDeconnecter).toHaveBeenCalled();
    const sans = vueProfil({ profil: fictif }, actions, {});
    expect([...sans.querySelectorAll('button')].some(b => b.textContent === 'Se déconnecter')).toBe(false);
  });
});
```

- [ ] **Step 2: Run to see them fail**

Run: `npx vitest run tests/socle tests/interface/vue-connexion.test.js tests/build.test.js tests/interface/reference.test.js`
Expected: FAIL.

- [ ] **Step 3: Implement** `src/socle/connexion.js`

```js
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function creerConnexion(client, { origine }) {
  const session = async () => (await client.auth.getSession()).data.session ?? null;
  return {
    session,
    jeton: async () => (await session())?.access_token ?? null,
    async demanderLien(saisie) {
      const email = String(saisie ?? '').trim().toLowerCase();
      if (!EMAIL.test(email)) return { ok: false, raison: 'Saisis une adresse e-mail valide.' };
      const { error } = await client.auth.signInWithOtp({ email, options: { shouldCreateUser: false, emailRedirectTo: origine } });
      if (!error) return { ok: true };
      if (error.status === 429) return { ok: false, raison: 'Trop de demandes : réessaie dans une minute.' };
      if (error.status === 422 || error.status === 400 || /signups? not allowed/i.test(error.message ?? '')) return { ok: false, raison: 'Cette adresse n’a pas accès au studio.' };
      return { ok: false, raison: 'Le lien n’a pas pu être envoyé : réessaie dans un instant.' };
    },
    deconnecter: async () => { await client.auth.signOut(); },
    surChangement(fn) {
      const { data } = client.auth.onAuthStateChange((_evenement, s) => fn(s ?? null));
      return () => data.subscription.unsubscribe();
    },
  };
}
```

- [ ] **Step 4: Implement** `src/interface/vue-connexion.js`

```js
import { h } from './h.js';

export function vueConnexion(connexion) {
  const email = h('input', { type: 'email', name: 'email', required: true, autocomplete: 'email', placeholder: 'ton@adresse.fr' });
  const bouton = h('button', { type: 'submit', class: 'bouton-principal' }, 'Recevoir le lien de connexion');
  const message = h('p', { class: 'aide', role: 'status' });
  return h('div', { class: 'connexion' },
    h('h1', {}, 'Studio Contenu'),
    h('form', {
      onsubmit: async e => {
        e.preventDefault();
        bouton.disabled = true;
        message.textContent = 'Envoi du lien…';
        const r = await connexion.demanderLien(email.value);
        bouton.disabled = false;
        message.textContent = r.ok ? 'Lien envoyé : ouvre ta boîte mail.' : r.raison;
      },
    },
    h('label', { class: 'champ' }, h('span', { class: 'champ-libelle' }, 'Adresse e-mail'), email),
    bouton,
    message));
}
```

- [ ] **Step 5: Implement** `src/socle/socle.js`

```js
import { creerBaseSupabase } from './base-supabase.js';
import { creerVisuelsSupabase } from './visuels-supabase.js';
import { creerTelechargement } from './telechargement.js';

export function creerSocle({ client, connexion, document: doc, capacitesServeur = {}, extras = {} }) {
  const capacites = {
    db: creerBaseSupabase(client),
    assets: creerVisuelsSupabase(client),
    downloads: creerTelechargement(doc),
    connexion,
    sample: capacitesServeur.evaluation ? (extras.sample ?? null) : null,
    veille: capacitesServeur.veille ? (extras.veille ?? null) : null,
  };
  return { use: async nom => capacites[nom] ?? null };
}
```

- [ ] **Step 6: Controller, app and profile view.**
  - `src/interface/controleur.js` : add the parameter `connexion = null` to `creerControleur`, then the action `seDeconnecter: async () => { await enregistreur.viderTout(); await connexion?.deconnecter(); },`.
  - `src/interface/app.js` :
    - after the line that fetches `downloads`, add `const connexion = (await claude.use('connexion')) ?? null;` ;
    - pass `connexion` to `creerControleur` ;
    - add `connexion: !!connexion` to the capabilities object passed to `creerRendu` ;
    - replace the unavailable-base message with `'La base du studio ne répond pas. Recharge la page dans un instant.'`.
  - `src/interface/vue-profil.js` : in `vueProfil`, before the Sauvegarde section, add:

```js
  if (capacites.connexion) {
    enfants.push(h('section', { class: 'compte' },
      h('button', { type: 'button', class: 'bouton-secondaire', onclick: () => actions.seDeconnecter() }, 'Se déconnecter')));
  }
```

- [ ] **Step 7: Page and build.**
  - Replace `src/interface/page.html` with:

```html
<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>Studio Contenu</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Figtree:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500&display=swap">
<style>/*STYLES*/</style>
</head>
<body>
<div id="app"></div>
<script>/*SCRIPT*/</script>
</body>
</html>
```

  - In `scripts/build.mjs` :
    - `construire(env = process.env)` throws `new Error('SUPABASE_URL et SUPABASE_ANON_KEY sont requis pour construire la page.')` when one of the two is missing ;
    - pass to esbuild `define: { __SUPABASE_URL__: JSON.stringify(env.SUPABASE_URL), __SUPABASE_ANON_KEY__: JSON.stringify(env.SUPABASE_ANON_KEY) }` ;
    - the direct-run branch writes `public/index.html` and prints `public/index.html (N Ko)`.
  - `package.json` : keep `"build": "node scripts/build.mjs"`.
  - `.gitignore` : replace the line `dist/` with `public/` and keep `.studio.local.json`.
  - Create `vercel.json` :

```json
{
  "buildCommand": "npm run build",
  "outputDirectory": "public",
  "framework": null
}
```

- [ ] **Step 8: Implement** `src/interface/main.js`

```js
/* global __SUPABASE_URL__, __SUPABASE_ANON_KEY__ */
import { createClient } from '@supabase/supabase-js';
import { demarrer } from './app.js';
import { vueConnexion } from './vue-connexion.js';
import { creerConnexion } from '../socle/connexion.js';
import { creerSocle } from '../socle/socle.js';

const racine = document.getElementById('app');
const client = createClient(__SUPABASE_URL__, __SUPABASE_ANON_KEY__);
const connexion = creerConnexion(client, { origine: window.location.origin });

async function capacitesServeur() {
  try {
    const reponse = await fetch('/api/capacites', { headers: { Authorization: `Bearer ${await connexion.jeton()}` } });
    return reponse.ok ? await reponse.json() : {};
  } catch {
    return {};
  }
}

async function ouvrir() {
  if (!(await connexion.session())) {
    racine.replaceChildren(vueConnexion(connexion));
    return;
  }
  const socle = creerSocle({ client, connexion, document, capacitesServeur: await capacitesServeur() });
  await demarrer(racine, socle);
}

let connecte = null;
connexion.surChangement(session => {
  const maintenant = !!session;
  if (connecte !== null && connecte !== maintenant) window.location.reload();
  connecte = maintenant;
});
connexion.session().then(s => { connecte = !!s; return ouvrir(); });
```

- [ ] **Step 9: Styles.** At the end of `src/interface/styles.css` :

```css
.connexion { max-width: 360px; margin: 12vh auto 0; padding: 0 16px; display: grid; gap: 16px; }
.connexion form { display: grid; gap: 12px; }
.compte { display: grid; justify-items: start; }
```

- [ ] **Step 10: Run the tests and the build**

Run: `npm test`, puis `SUPABASE_URL=https://projet.test SUPABASE_ANON_KEY=cle npm run build`.
Expected: PASS. La sortie est `public/index.html (… Ko)`.

- [ ] **Step 11: Commit**

```bash
git add src scripts/build.mjs vercel.json package.json .gitignore tests
git commit -m "Connexion par lien magique, assemblage du socle et page pour Vercel

Co-Authored-By: <modèle auteur>"
```

---

### Task 5 : évaluation par Claude côté serveur

**Files:**
- Create: `serveur/session.js`, `serveur/claude.js`, `serveur/evaluer.js`, `api/capacites.js`, `api/evaluer.js`, `src/socle/evaluation-api.js`
- Modify: `src/interface/main.js`, `package.json` (dépendance `@anthropic-ai/sdk`)
- Test: `tests/serveur/session.test.js`, `tests/serveur/claude.test.js`, `tests/serveur/evaluer.test.js`, `tests/socle/evaluation-api.test.js`

**Interfaces:**
- Consumes : `creerFauxSupabase` ; `creerSocle({ …, extras: { sample } })` (Task 4).
- Produces :
  - `verifierSession(supabase, enTeteAutorisation)` → `{ ok: true, utilisateur }` ou `{ ok: false }`.
  - `MODELE`, `cleConfiguree(env)`, `extraireJson(texte)`, `texteDe(message)`, `codeErreur(e)` et `evaluer(client, { prompt, image })` → un objet JSON.
  - `traiterCapacites({ env, autorisation, supabase })` et `traiterEvaluation({ env, autorisation, corps, supabase, claude })` → `{ statut, corps }`.
  - `creerEvaluationApi({ fetch, jeton })` → `{ json(prompt, { signal, images }), limits() }`, dont les erreurs sont des `{ code }`.

- [ ] **Step 1: Install the SDK**

Run: `npm install @anthropic-ai/sdk`

- [ ] **Step 2: Write the failing tests.**

`tests/serveur/session.test.js` :

```js
import { describe, it, expect } from 'vitest';
import { creerFauxSupabase } from '../aides/fauxSupabase.js';
import { verifierSession } from '../../serveur/session.js';

describe('verifierSession', () => {
  it('accepte un jeton valide et refuse le reste', async () => {
    const supabase = creerFauxSupabase();
    expect(await verifierSession(supabase, 'Bearer jeton-test')).toEqual({ ok: true, utilisateur: { id: 'u1', email: 'a@exemple.test' } });
    for (const entete of [undefined, '', 'Bearer ', 'Bearer faux', 'jeton-test', 'Basic jeton-test']) {
      expect(await verifierSession(supabase, entete)).toEqual({ ok: false });
    }
  });
});
```

`tests/serveur/claude.test.js` :

```js
import { describe, it, expect, vi } from 'vitest';
import Anthropic from '@anthropic-ai/sdk';
import { MODELE, cleConfiguree, extraireJson, codeErreur, evaluer } from '../../serveur/claude.js';

const message = (texte, stop_reason = 'end_turn') => ({ stop_reason, content: [{ type: 'text', text: texte }] });

describe('claude', () => {
  it('lit la clé et le modèle', () => {
    expect(cleConfiguree({ ANTHROPIC_API_KEY: 'x' })).toBe(true);
    expect(cleConfiguree({})).toBe(false);
    expect(cleConfiguree({ ANTHROPIC_API_KEY: '  ' })).toBe(false);
    expect(typeof MODELE).toBe('string');
  });
  it('extrait le JSON d’un texte, même entouré', () => {
    expect(extraireJson('Voici :\n```json\n{"a":1}\n```')).toEqual({ a: 1 });
    expect(() => extraireJson('rien')).toThrow();
    try { extraireJson('{mal'); } catch (e) { expect(e.code).toBe('invalid_json'); }
  });
  it('envoie le prompt et l’image, et renvoie le JSON', async () => {
    const client = { messages: { create: vi.fn(async () => message('{"notes":{"accroche":7}}')) } };
    const r = await evaluer(client, { prompt: 'Évalue.', image: { media_type: 'image/png', data: 'QUJD' } });
    expect(r).toEqual({ notes: { accroche: 7 } });
    const appel = client.messages.create.mock.calls[0][0];
    expect(appel.model).toBe(MODELE);
    expect(appel.messages[0].content).toEqual([
      { type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'QUJD' } },
      { type: 'text', text: 'Évalue.' },
    ]);
    for (const interdit of ['thinking', 'temperature', 'top_p', 'top_k']) expect(appel).not.toHaveProperty(interdit);
  });
  it('signale un refus et une réponse illisible', async () => {
    await expect(evaluer({ messages: { create: async () => ({ stop_reason: 'refusal', content: [] }) } }, { prompt: 'x' })).rejects.toMatchObject({ code: 'refused' });
    await expect(evaluer({ messages: { create: async () => message('pas du json') } }, { prompt: 'x' })).rejects.toMatchObject({ code: 'invalid_json' });
  });
  it('traduit les erreurs de l’API', () => {
    const api = statut => new Anthropic.APIError(statut, { type: 'error' }, 'erreur', new Headers());
    expect(codeErreur(api(429))).toBe('rate_limited');
    expect(codeErreur(api(401))).toBe('not_granted');
    expect(codeErreur(api(403))).toBe('not_granted');
    expect(codeErreur(api(413))).toBe('prompt_too_large');
    expect(codeErreur(api(400))).toBe('invalid_request');
    expect(codeErreur(api(529))).toBe('unavailable');
    expect(codeErreur({ code: 'refused' })).toBe('refused');
    expect(codeErreur(new Error('x'))).toBe('unavailable');
  });
});
```

If the constructor `new Anthropic.APIError(status, error, message, headers)` has a different signature in the installed version, adapt the `api` helper of the test with the documented way of building an error with a `status`. Do not change the assertions. Report it.

`tests/serveur/evaluer.test.js` :

```js
import { describe, it, expect, vi } from 'vitest';
import { creerFauxSupabase } from '../aides/fauxSupabase.js';
import { traiterCapacites, traiterEvaluation } from '../../serveur/evaluer.js';

const OK = 'Bearer jeton-test';
const claude = reponse => ({ messages: { create: vi.fn(async () => ({ stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify(reponse) }] })) } });

describe('traiterCapacites', () => {
  it('exige une session et reflète la présence de la clé', async () => {
    const supabase = creerFauxSupabase();
    expect((await traiterCapacites({ env: {}, autorisation: undefined, supabase })).statut).toBe(401);
    expect(await traiterCapacites({ env: {}, autorisation: OK, supabase })).toEqual({ statut: 200, corps: { evaluation: false, veille: false } });
    expect(await traiterCapacites({ env: { ANTHROPIC_API_KEY: 'x' }, autorisation: OK, supabase })).toEqual({ statut: 200, corps: { evaluation: true, veille: true } });
  });
});

describe('traiterEvaluation', () => {
  const base = { env: { ANTHROPIC_API_KEY: 'x' }, autorisation: OK, corps: { prompt: 'Évalue.' } };
  it('refuse sans session, sans appeler Claude', async () => {
    const c = claude({});
    const r = await traiterEvaluation({ ...base, autorisation: 'Bearer faux', supabase: creerFauxSupabase(), claude: c });
    expect(r).toEqual({ statut: 401, corps: { code: 'session_expired' } });
    expect(c.messages.create).not.toHaveBeenCalled();
  });
  it('répond not_granted sans clé', async () => {
    const c = claude({});
    expect(await traiterEvaluation({ ...base, env: {}, supabase: creerFauxSupabase(), claude: c })).toEqual({ statut: 403, corps: { code: 'not_granted' } });
    expect(c.messages.create).not.toHaveBeenCalled();
  });
  it('valide le corps de la requête', async () => {
    const supabase = creerFauxSupabase();
    for (const corps of [null, {}, { prompt: '' }, { prompt: 3 }, { prompt: 'x', image: { media_type: 'application/pdf', data: 'QQ==' } }, { prompt: 'x', image: { media_type: 'image/png' } }]) {
      expect(await traiterEvaluation({ ...base, corps, supabase, claude: claude({}) })).toEqual({ statut: 400, corps: { code: 'invalid_request' } });
    }
    expect(await traiterEvaluation({ ...base, corps: { prompt: 'x'.repeat(70000) }, supabase, claude: claude({}) })).toEqual({ statut: 413, corps: { code: 'prompt_too_large' } });
  });
  it('renvoie la réponse de Claude', async () => {
    const r = await traiterEvaluation({ ...base, supabase: creerFauxSupabase(), claude: claude({ notes: { accroche: 8 } }) });
    expect(r).toEqual({ statut: 200, corps: { reponse: { notes: { accroche: 8 } } } });
  });
  it('traduit les échecs de Claude', async () => {
    const refus = { messages: { create: async () => ({ stop_reason: 'refusal', content: [] }) } };
    expect(await traiterEvaluation({ ...base, supabase: creerFauxSupabase(), claude: refus })).toEqual({ statut: 502, corps: { code: 'refused' } });
    const illisible = { messages: { create: async () => ({ stop_reason: 'end_turn', content: [{ type: 'text', text: 'non' }] }) } };
    expect(await traiterEvaluation({ ...base, supabase: creerFauxSupabase(), claude: illisible })).toEqual({ statut: 502, corps: { code: 'invalid_json' } });
  });
});
```

`tests/socle/evaluation-api.test.js` :

```js
import { describe, it, expect, vi } from 'vitest';
import { creerEvaluationApi } from '../../src/socle/evaluation-api.js';

const reponse = (statut, corps) => ({ ok: statut >= 200 && statut < 300, status: statut, json: async () => corps });

describe('creerEvaluationApi', () => {
  it('annonce ses limites', async () => {
    const limites = await creerEvaluationApi({ fetch: vi.fn(), jeton: async () => 'j' }).limits();
    expect(limites).toEqual({ maxPromptBytes: 65536, images: { maxCount: 1, maxInputBytes: 3000000, mediaTypes: ['image/png', 'image/jpeg', 'image/webp', 'image/gif'] } });
  });
  it('envoie le prompt, le jeton et l’image en base64', async () => {
    const fetchFaux = vi.fn(async () => reponse(200, { reponse: { notes: {} } }));
    const api = creerEvaluationApi({ fetch: fetchFaux, jeton: async () => 'jeton-test' });
    const r = await api.json('Évalue.', { images: new Blob(['ABC'], { type: 'image/png' }) });
    expect(r).toEqual({ notes: {} });
    const [url, options] = fetchFaux.mock.calls[0];
    expect(url).toBe('/api/evaluer');
    expect(options.method).toBe('POST');
    expect(options.headers.Authorization).toBe('Bearer jeton-test');
    expect(JSON.parse(options.body)).toEqual({ prompt: 'Évalue.', image: { media_type: 'image/png', data: 'QUJD' } });
  });
  it('transmet le code d’erreur du serveur', async () => {
    const api = creerEvaluationApi({ fetch: async () => reponse(403, { code: 'not_granted' }), jeton: async () => 'j' });
    await expect(api.json('x')).rejects.toMatchObject({ code: 'not_granted' });
    const sans = creerEvaluationApi({ fetch: async () => reponse(500, {}), jeton: async () => 'j' });
    await expect(sans.json('x')).rejects.toMatchObject({ code: 'unavailable' });
  });
  it('signale l’annulation et la session perdue', async () => {
    const annule = creerEvaluationApi({ fetch: async () => { throw Object.assign(new Error('x'), { name: 'AbortError' }); }, jeton: async () => 'j' });
    await expect(annule.json('x')).rejects.toMatchObject({ code: 'cancelled' });
    const sansJeton = creerEvaluationApi({ fetch: vi.fn(), jeton: async () => null });
    await expect(sansJeton.json('x')).rejects.toMatchObject({ code: 'session_expired' });
  });
});
```

- [ ] **Step 3: Run to see them fail**

Run: `npx vitest run tests/serveur tests/socle/evaluation-api.test.js`
Expected: FAIL.

- [ ] **Step 4: Implement** `serveur/session.js`

```js
export async function verifierSession(supabase, enTete) {
  const jeton = typeof enTete === 'string' && enTete.startsWith('Bearer ') ? enTete.slice(7).trim() : '';
  if (!jeton) return { ok: false };
  const { data, error } = await supabase.auth.getUser(jeton);
  if (error || !data?.user) return { ok: false };
  return { ok: true, utilisateur: data.user };
}
```

- [ ] **Step 5: Implement** `serveur/claude.js`

```js
import Anthropic from '@anthropic-ai/sdk';

export const MODELE = process.env.MODELE_CLAUDE || 'claude-opus-4-8';
export const cleConfiguree = env => typeof env.ANTHROPIC_API_KEY === 'string' && env.ANTHROPIC_API_KEY.trim().length > 0;
export const creerClient = () => new Anthropic();
export const texteDe = message => (message.content ?? []).filter(b => b.type === 'text').map(b => b.text).join('');
const erreur = code => Object.assign(new Error(code), { code });

export function extraireJson(texte) {
  const debut = texte.indexOf('{');
  const fin = texte.lastIndexOf('}');
  if (debut < 0 || fin <= debut) throw erreur('invalid_json');
  try {
    return JSON.parse(texte.slice(debut, fin + 1));
  } catch {
    throw erreur('invalid_json');
  }
}

export function codeErreur(e) {
  if (typeof e?.code === 'string' && !(e instanceof Anthropic.APIError)) return e.code;
  if (e instanceof Anthropic.APIError) {
    if (e.status === 429) return 'rate_limited';
    if (e.status === 401 || e.status === 403) return 'not_granted';
    if (e.status === 413) return 'prompt_too_large';
    if (e.status === 400) return 'invalid_request';
  }
  return 'unavailable';
}

export async function evaluer(client, { prompt, image }) {
  const content = [
    ...(image ? [{ type: 'image', source: { type: 'base64', media_type: image.media_type, data: image.data } }] : []),
    { type: 'text', text: prompt },
  ];
  const message = await client.messages.create({ model: MODELE, max_tokens: 8000, messages: [{ role: 'user', content }] });
  if (message.stop_reason === 'refusal') throw erreur('refused');
  return extraireJson(texteDe(message));
}
```

- [ ] **Step 6: Implement** `serveur/evaluer.js`

```js
import { verifierSession } from './session.js';
import { cleConfiguree, codeErreur, evaluer } from './claude.js';

const TYPES_IMAGE = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);
const PROMPT_MAX = 65536;
const octets = t => new TextEncoder().encode(t).length;
const reponse = (statut, corps) => ({ statut, corps });

export async function traiterCapacites({ env, autorisation, supabase }) {
  if (!(await verifierSession(supabase, autorisation)).ok) return reponse(401, { code: 'session_expired' });
  const actif = cleConfiguree(env);
  return reponse(200, { evaluation: actif, veille: actif });
}

export async function traiterEvaluation({ env, autorisation, corps, supabase, claude }) {
  if (!(await verifierSession(supabase, autorisation)).ok) return reponse(401, { code: 'session_expired' });
  if (!cleConfiguree(env)) return reponse(403, { code: 'not_granted' });
  const { prompt, image } = corps ?? {};
  const imageValide = image == null || (TYPES_IMAGE.has(image.media_type) && typeof image.data === 'string' && image.data.length > 0);
  if (typeof prompt !== 'string' || !prompt.trim() || !imageValide) return reponse(400, { code: 'invalid_request' });
  if (octets(prompt) > PROMPT_MAX) return reponse(413, { code: 'prompt_too_large' });
  try {
    return reponse(200, { reponse: await evaluer(claude, { prompt, image: image ?? null }) });
  } catch (e) {
    const code = codeErreur(e);
    return reponse(code === 'rate_limited' ? 429 : 502, { code });
  }
}
```

- [ ] **Step 7: Implement the Vercel functions.**

`api/capacites.js` :

```js
import { createClient } from '@supabase/supabase-js';
import { traiterCapacites } from '../serveur/evaluer.js';

export default async function handler(req, res) {
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
  const r = await traiterCapacites({ env: process.env, autorisation: req.headers.authorization, supabase });
  res.status(r.statut).json(r.corps);
}
```

`api/evaluer.js` :

```js
import { createClient } from '@supabase/supabase-js';
import { traiterEvaluation } from '../serveur/evaluer.js';
import { creerClient, cleConfiguree } from '../serveur/claude.js';

export const config = { maxDuration: 120 };

export default async function handler(req, res) {
  if (req.method !== 'POST') { res.status(405).json({ code: 'invalid_request' }); return; }
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
  const claude = cleConfiguree(process.env) ? creerClient() : null;
  const r = await traiterEvaluation({ env: process.env, autorisation: req.headers.authorization, corps: req.body, supabase, claude });
  res.status(r.statut).json(r.corps);
}
```

- [ ] **Step 8: Implement** `src/socle/evaluation-api.js`

```js
const LIMITES = { maxPromptBytes: 65536, images: { maxCount: 1, maxInputBytes: 3000000, mediaTypes: ['image/png', 'image/jpeg', 'image/webp', 'image/gif'] } };
const erreur = code => Object.assign(new Error(code), { code });

async function enBase64(blob) {
  const octets = new Uint8Array(await blob.arrayBuffer());
  let binaire = '';
  for (let i = 0; i < octets.length; i += 0x8000) binaire += String.fromCharCode(...octets.subarray(i, i + 0x8000));
  return btoa(binaire);
}

export function creerEvaluationApi({ fetch: requeter, jeton }) {
  return {
    limits: async () => structuredClone(LIMITES),
    async json(prompt, { signal, images } = {}) {
      const acces = await jeton();
      if (!acces) throw erreur('session_expired');
      const image = images ? { media_type: images.type, data: await enBase64(images) } : undefined;
      let reponse;
      try {
        reponse = await requeter('/api/evaluer', {
          method: 'POST', signal,
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${acces}` },
          body: JSON.stringify({ prompt, image }),
        });
      } catch (e) {
        throw erreur(e?.name === 'AbortError' ? 'cancelled' : 'unavailable');
      }
      const corps = await reponse.json().catch(() => ({}));
      if (!reponse.ok) throw erreur(corps?.code ?? 'unavailable');
      return corps.reponse;
    },
  };
}
```

- [ ] **Step 9: Wire `main.js`.** Import `creerEvaluationApi`. In `ouvrir()`, pass to `creerSocle` `extras: { sample: creerEvaluationApi({ fetch: window.fetch.bind(window), jeton: connexion.jeton }) }`.

- [ ] **Step 10: Run the tests**

Run: `npx vitest run tests/serveur tests/socle`, puis `npm test`.
Expected: PASS.

- [ ] **Step 11: Commit**

```bash
git add serveur api src/socle/evaluation-api.js src/interface/main.js package.json package-lock.json tests
git commit -m "Évaluation par Claude côté serveur, éteinte sans clé

Co-Authored-By: <modèle auteur>"
```

---

### Task 6 : veille côté serveur

**Files:**
- Create: `src/claude/veille-consignes.js`, `serveur/veille.js`, `api/veille.js`, `src/socle/veille-api.js`
- Modify: `src/logique/veille.js`, `scripts/veille.mjs`, `src/interface/controleur.js`, `src/interface/app.js`, `src/interface/rendu.js`, `src/interface/vue-bulletin.js`, `src/interface/main.js`, `vercel.json`
- Test: `tests/logique/veille.test.js`, `tests/claude/veille-api-consignes.test.js`, `tests/serveur/veille.test.js`, `tests/socle/veille-api.test.js`, `tests/interface/vue-bulletin.test.js`, `tests/interface/controleur.test.js`

**Interfaces:**
- Consumes :
  - `verifierSession`, `cleConfiguree`, `MODELE`, `extraireJson`, `texteDe`, `codeErreur` (Task 5) ;
  - `construireVeille` (existant) ;
  - `creerFauxSupabase` (`rpc`, `_rpc`) ;
  - la fonction SQL `appliquer_veille` (Task 2).
- Produces :
  - `plageVeille(regles, maintenant)` → `{ semaine, debut, fin, lecture_debut, lecture_fin }`.
  - `doitTourner(regles, maintenant, { forcer })` → booléen.
  - `construireConsignesVeille({ profil, fiches, stats, relevesCompte, plage, maintenant })` → `{ systeme, message }`.
  - `lancerVeille({ supabase, claude, maintenant, forcer, idAleatoire })` → `{ ok, lance, resume }` ou `{ ok: false, code, erreurs? }`.
  - `traiterVeille({ methode, autorisation, env, supabaseSession, supabaseService, claude, maintenant })` → `{ statut, corps }`.
  - `creerVeilleApi({ fetch, jeton })` → `{ relancer() }`, qui renvoie `{ ok, message }` ou `{ ok: false, raison }`.
  - action du contrôleur `relancerVeille()`.
  - `capacites.veille` (booléen).

- [ ] **Step 1: Write the failing logic tests.** In `tests/logique/veille.test.js`, add `plageVeille, doitTourner` to the import, then:

```js
describe('plageVeille et doitTourner', () => {
  const NY = { ...R, fuseau: 'America/New_York' };
  it('vise la semaine de maintenant + 1 jour', () => {
    expect(plageVeille(NY, '2026-10-05T00:00:00.000Z')).toEqual({
      semaine: '2026-W41', debut: '2026-10-05T04:00:00.000Z', fin: '2026-10-12T04:00:00.000Z',
      lecture_debut: '2026-09-21T04:00:00.000Z', lecture_fin: '2026-11-09T05:00:00.000Z',
    });
  });
  it('ne tourne qu’une fois le dimanche à 20 h locale, sauf si on force', () => {
    expect(doitTourner(NY, '2026-10-05T00:00:00.000Z')).toBe(true);
    expect(doitTourner(NY, '2026-10-05T01:00:00.000Z')).toBe(false);
    expect(doitTourner(NY, '2026-11-09T00:00:00.000Z')).toBe(false);
    expect(doitTourner(NY, '2026-11-09T01:00:00.000Z')).toBe(true);
    expect(doitTourner(NY, '2026-10-05T01:00:00.000Z', { forcer: true })).toBe(true);
    expect(doitTourner(NY, '2026-10-07T15:00:00.000Z')).toBe(true);
  });
});
```

The existing tests of `tests/scripts/veille.test.js` must stay green without change: the script delegates to these two functions.

- [ ] **Step 2: Write the other failing tests.**

`tests/claude/veille-api-consignes.test.js` :

```js
import { describe, it, expect } from 'vitest';
import fictif from '../../exemples/profil-fictif.json';
import { construireConsignesVeille } from '../../src/claude/veille-consignes.js';

describe('construireConsignesVeille', () => {
  const plage = { semaine: '2026-W41', debut: '2026-10-04T22:00:00.000Z', fin: '2026-10-11T22:00:00.000Z' };
  const c = construireConsignesVeille({
    profil: { ...fictif, version: 2 },
    fiches: [{ id: 'f1', format: 'reel', pilier: 'nuit', accroche: 'Déjà prévue', date_heure: '2026-10-06T10:00:00.000Z', statut: 'brouillon' }],
    stats: [{ fiche: 'a', releve: '7j', vues: 1000, nouveaux_abonnes: 4, partages_envois: 9, accroche: 'Ancien succès', format: 'reel' }],
    relevesCompte: [], plage, maintenant: '2026-10-04T18:00:00.000Z',
  });
  it('rappelle les règles et le format de sortie', () => {
    for (const attendu of ['Pas de scraping d’Instagram', 'sources_indisponibles', 'son_a_verifier', 'proposition_profil', '"jugement"', '"recommandations":[{"texte":"…","pourquoi":"…"}', '3 à 5', 'uniquement avec un objet JSON']) {
      expect(c.systeme).toContain(attendu);
    }
  });
  it('fournit le contexte du studio', () => {
    for (const attendu of ['2026-W41', 'Déjà prévue', 'Ancien succès', '"regles_studio"']) expect(c.message).toContain(attendu);
  });
});
```

`tests/serveur/veille.test.js` :

```js
import { describe, it, expect, vi } from 'vitest';
import fictif from '../../exemples/profil-fictif.json';
import entree from '../../exemples/entree-veille-fictive.json';
import { creerFauxSupabase } from '../aides/fauxSupabase.js';
import { lancerVeille, traiterVeille } from '../../serveur/veille.js';

const DIMANCHE_20H = '2026-10-04T18:00:00.000Z'; // dimanche 20 h à Paris
const message = (texte, stop_reason = 'end_turn') => ({ stop_reason, content: [{ type: 'text', text: texte }] });
const claudeQui = (...reponses) => {
  const finalMessage = vi.fn();
  for (const r of reponses) finalMessage.mockResolvedValueOnce(r);
  return { messages: { stream: vi.fn(() => ({ finalMessage })) }, _final: finalMessage };
};
function base() {
  const supabase = creerFauxSupabase();
  supabase._lignes.set('profil/courant', { collection: 'profil', id: 'courant', data: { ...fictif, version: 1 } });
  return supabase;
}
let n = 0;
const idAleatoire = () => `v${n++}`;

describe('lancerVeille', () => {
  it('construit le bulletin et applique les écritures en une fois', async () => {
    const supabase = base();
    const claude = claudeQui(message(JSON.stringify(entree)));
    const r = await lancerVeille({ supabase, claude, maintenant: DIMANCHE_20H, forcer: false, idAleatoire });
    expect(r.ok).toBe(true);
    expect(r.resume).toMatch(/^Bulletin 2026-W41 : \d idée\(s\)/);
    expect(supabase._rpc).toHaveLength(1);
    expect(supabase._rpc[0].nom).toBe('appliquer_veille');
    const ecritures = supabase._rpc[0].args.ecritures;
    expect(ecritures.at(-1)).toMatchObject({ op: 'set', collection: 'bulletins', doc_id: '2026-W41' });
    const appel = claude.messages.stream.mock.calls[0][0];
    expect(appel.tools).toEqual([{ type: 'web_search_20260209', name: 'web_search' }]);
    for (const interdit of ['thinking', 'temperature']) expect(appel).not.toHaveProperty(interdit);
  });

  it('ne tourne pas hors horaire sans forcer, et tourne si on force', async () => {
    const supabase = base();
    const hors = await lancerVeille({ supabase, claude: claudeQui(), maintenant: '2026-10-04T19:10:00.000Z', forcer: false, idAleatoire });
    expect(hors).toEqual({ ok: true, lance: false, resume: 'Veille déjà faite ou hors horaire.' });
    const force = await lancerVeille({ supabase, claude: claudeQui(message(JSON.stringify(entree))), maintenant: '2026-10-04T19:10:00.000Z', forcer: true, idAleatoire });
    expect(force.lance).toBe(true);
  });

  it('épingle les suppressions sur maj_le', async () => {
    const supabase = base();
    const claude1 = claudeQui(message(JSON.stringify(entree)));
    await lancerVeille({ supabase, claude: claude1, maintenant: DIMANCHE_20H, forcer: false, idAleatoire });
    for (const e of supabase._rpc[0].args.ecritures.filter(x => x.op === 'set')) supabase._lignes.set(`${e.collection}/${e.doc_id}`, { collection: e.collection, id: e.doc_id, data: e.data });
    await lancerVeille({ supabase, claude: claudeQui(message(JSON.stringify(entree))), maintenant: DIMANCHE_20H, forcer: true, idAleatoire });
    const suppressions = supabase._rpc[1].args.ecritures.filter(x => x.op === 'delete');
    expect(suppressions.length).toBeGreaterThan(0);
    for (const s of suppressions) expect(s.si_maj_le).toBe(supabase._lignes.get(`fiches/${s.doc_id}`).data.maj_le);
  });

  it('poursuit une réponse en pause, puis réessaie une fois une entrée invalide', async () => {
    const supabase = base();
    const claude = claudeQui(message('', 'pause_turn'), message(JSON.stringify({ ...entree, idees: [] })), message(JSON.stringify(entree)));
    const r = await lancerVeille({ supabase, claude, maintenant: DIMANCHE_20H, forcer: false, idAleatoire });
    expect(r.ok).toBe(true);
    expect(claude.messages.stream).toHaveBeenCalledTimes(3);
  });

  it('n’écrit rien si Claude refuse, répond mal deux fois, ou s’il n’y a pas de profil', async () => {
    const refus = base();
    expect(await lancerVeille({ supabase: refus, claude: claudeQui({ stop_reason: 'refusal', content: [] }), maintenant: DIMANCHE_20H, forcer: false, idAleatoire })).toMatchObject({ ok: false, code: 'refused' });
    const invalide = base();
    const mauvais = message(JSON.stringify({ ...entree, idees: [] }));
    const r = await lancerVeille({ supabase: invalide, claude: claudeQui(mauvais, mauvais), maintenant: DIMANCHE_20H, forcer: false, idAleatoire });
    expect(r).toMatchObject({ ok: false, code: 'invalid_json' });
    expect(r.erreurs.length).toBeGreaterThan(0);
    const vide = creerFauxSupabase();
    expect(await lancerVeille({ supabase: vide, claude: claudeQui(), maintenant: DIMANCHE_20H, forcer: false, idAleatoire })).toMatchObject({ ok: false, code: 'profil_absent' });
    for (const s of [refus, invalide, vide]) expect(s._rpc).toEqual([]);
  });
});

describe('traiterVeille', () => {
  const env = { ANTHROPIC_API_KEY: 'x', CRON_SECRET: 'secret-cron' };
  const deps = extra => ({ env, supabaseSession: creerFauxSupabase(), supabaseService: base(), claude: claudeQui(message(JSON.stringify(entree))), maintenant: DIMANCHE_20H, idAleatoire, ...extra });
  it('la tâche planifiée exige le secret', async () => {
    expect((await traiterVeille({ methode: 'GET', autorisation: 'Bearer faux', ...deps() })).statut).toBe(401);
    expect((await traiterVeille({ methode: 'GET', autorisation: undefined, ...deps({ env: { ANTHROPIC_API_KEY: 'x' } }) })).statut).toBe(401);
    const ok = await traiterVeille({ methode: 'GET', autorisation: 'Bearer secret-cron', ...deps() });
    expect(ok.statut).toBe(200);
    expect(ok.corps.lance).toBe(true);
  });
  it('la relance exige une session et force l’exécution', async () => {
    expect((await traiterVeille({ methode: 'POST', autorisation: 'Bearer faux', ...deps() })).statut).toBe(401);
    const r = await traiterVeille({ methode: 'POST', autorisation: 'Bearer jeton-test', ...deps({ maintenant: '2026-10-07T10:00:00.000Z' }) });
    expect(r.statut).toBe(200);
    expect(r.corps.lance).toBe(true);
  });
  it('répond not_granted sans clé, et 405 pour une autre méthode', async () => {
    const sans = deps({ env: { CRON_SECRET: 'secret-cron' } });
    expect(await traiterVeille({ methode: 'POST', autorisation: 'Bearer jeton-test', ...sans })).toEqual({ statut: 403, corps: { code: 'not_granted' } });
    expect(sans.supabaseService._rpc).toEqual([]);
    expect((await traiterVeille({ methode: 'PUT', autorisation: 'Bearer jeton-test', ...deps() })).statut).toBe(405);
  });
});
```

`tests/socle/veille-api.test.js` :

```js
import { describe, it, expect, vi } from 'vitest';
import { creerVeilleApi } from '../../src/socle/veille-api.js';

const reponse = (statut, corps) => ({ ok: statut >= 200 && statut < 300, status: statut, json: async () => corps });

describe('creerVeilleApi', () => {
  it('relance la veille avec le jeton', async () => {
    const fetchFaux = vi.fn(async () => reponse(200, { ok: true, lance: true, resume: 'Bulletin 2026-W41 : 4 idée(s), 0 remplacée(s), statut complet.' }));
    const r = await creerVeilleApi({ fetch: fetchFaux, jeton: async () => 'jeton-test' }).relancer();
    expect(r).toEqual({ ok: true, message: 'Bulletin 2026-W41 : 4 idée(s), 0 remplacée(s), statut complet.' });
    expect(fetchFaux.mock.calls[0]).toEqual(['/api/veille', { method: 'POST', headers: { Authorization: 'Bearer jeton-test' } }]);
  });
  it('explique les échecs', async () => {
    const api = code => creerVeilleApi({ fetch: async () => reponse(502, { code }), jeton: async () => 'j' });
    expect(await api('not_granted').relancer()).toEqual({ ok: false, raison: 'La veille n’est pas encore configurée.' });
    expect(await api('rate_limited').relancer()).toEqual({ ok: false, raison: 'Trop de demandes à Claude pour le moment : réessaie un peu plus tard.' });
    expect(await api('autre').relancer()).toEqual({ ok: false, raison: 'La veille a échoué : réessaie dans quelques minutes. Rien n’a été modifié.' });
    const coupe = creerVeilleApi({ fetch: async () => { throw new Error('x'); }, jeton: async () => 'j' });
    expect((await coupe.relancer()).ok).toBe(false);
  });
});
```

In `tests/interface/vue-bulletin.test.js` (uses `etat()`, `actions()`, `bulletin()`). `vueBulletin` now takes a third argument, `capacites` :

```js
describe('relance depuis le site', () => {
  it('propose le bouton quand la veille serveur est active, et affiche le résultat', async () => {
    const a = { ...actions(), relancerVeille: vi.fn(async () => ({ ok: true, message: 'Bulletin 2026-W40 : 4 idée(s), 0 remplacée(s), statut complet.' })) };
    const el = vueBulletin(etat({ bulletin: null }), a, { veille: true });
    const bouton = [...el.querySelectorAll('button')].find(b => b.textContent === 'Relancer la veille');
    bouton.click();
    expect(bouton.disabled).toBe(true);
    expect(el.textContent).toContain('Veille en cours : cela peut prendre quelques minutes.');
    await vi.waitFor(() => expect(el.textContent).toContain('Bulletin 2026-W40 : 4 idée(s)'));
    expect(bouton.disabled).toBe(false);
  });
  it('dit que la veille n’est pas configurée quand elle est éteinte', () => {
    const el = vueBulletin(etat({ bulletin: null, configVeille: null }), actions(), { veille: false });
    expect(el.textContent).toContain('La veille n’est pas encore configurée.');
    expect([...el.querySelectorAll('button')].some(b => b.textContent === 'Relancer la veille')).toBe(false);
  });
});
```

Existing tests of this file that call `vueBulletin(etat(...), actions())` without a third argument must stay green. Without the `veille` capability, the old behaviour (link `url_routine`) is kept.

In `tests/interface/controleur.test.js` :

```js
describe('relancerVeille', () => {
  it('délègue à la capacité veille, ou dit qu’elle manque', async () => {
    const db = creerFausseBase();
    const depot = creerDepot(db);
    const enregistreur = creerEnregistreur(f => depot.enregistrerFiche(f), 600);
    const etat = creerEtat({ profil: { ...fictif, version: 1 }, fiches: [], vue: 'bulletin', ancre: T, ficheOuverte: null, erreur: null, sauvegarde: 'ok' });
    const veille = { relancer: vi.fn(async () => ({ ok: true, message: 'Fait.' })) };
    const avec = creerControleur({ etat, depot, enregistreur, assets: null, horloge: () => T, veille });
    expect(await avec.relancerVeille()).toEqual({ ok: true, message: 'Fait.' });
    expect(await monter().actions.relancerVeille()).toEqual({ ok: false, raison: 'La veille n’est pas encore configurée.' });
  });
});
```

- [ ] **Step 3: Run to see them fail**

Run: `npx vitest run tests/logique/veille.test.js tests/claude tests/serveur/veille.test.js tests/socle/veille-api.test.js tests/interface/vue-bulletin.test.js tests/interface/controleur.test.js`
Expected: FAIL.

- [ ] **Step 4: Move the schedule logic.** In `src/logique/veille.js`, add (with `partiesLocales` imported from `./dates.js`) :

```js
const FENETRE_DEBUT = 18 * 60 + 30;
const FENETRE_FIN = 21 * 60 + 29;

export function plageVeille(regles, maintenant) {
  const fz = regles.fuseau;
  const debut = debutSemaine(ajouterJours(maintenant, 1, fz), fz);
  const fin = ajouterJours(debut, 7, fz);
  return { semaine: cleSemaineIso(debut, fz), debut, fin, lecture_debut: ajouterJours(debut, -14, fz), lecture_fin: ajouterJours(fin, 28, fz) };
}

export function doitTourner(regles, maintenant, { forcer = false } = {}) {
  if (forcer) return true;
  const local = partiesLocales(maintenant, regles.fuseau);
  const minutes = local.heure * 60 + local.minute;
  const fenetre = local.jourSemaine === 7 && minutes >= FENETRE_DEBUT && minutes <= FENETRE_FIN;
  return !(fenetre && local.heure !== 20);
}
```

In `scripts/veille.mjs`, replace the local computations of the `plage` and `doit-tourner` commands with calls to these two functions (`JSON.stringify(plageVeille(profil.regles_studio, quand))` and `doitTourner(profil.regles_studio, quand, { forcer: !!o.forcer }) ? 'oui' : 'non'`). Remove the constants that have become useless.

- [ ] **Step 5: Implement** `src/claude/veille-consignes.js`

```js
import { extraireProfilDetaille } from './evaluation.js';

const SYSTEME = [
  'Tu prépares la veille hebdomadaire d’un compte Instagram : tendances de la semaine et 3 à 5 idées de contenus, dans la voix du profil de marque fourni.',
  '',
  'Règles :',
  '- Pas de scraping d’Instagram. Utilise la recherche web pour : les annonces d’Instagram aux créateurs (algorithme, règlement, formats), les rapports publics de tendances (sons, formats de Reels, memes) et les tendances de la niche du profil, sur les 14 derniers jours.',
  '- Passe chaque tendance au filtre de la marque (voix, esthétique, conformité SFW, mots à éviter) : elle est adaptée, avec la façon de l’adapter, ou écartée, avec la raison. Garde 3 à 5 tendances.',
  '- Un son tendance porte son_a_verifier à true.',
  '- Si la recherche ne donne rien d’exploitable, mets sources_indisponibles à true, laisse tendances vide et propose quand même des idées à partir du profil et des performances passées.',
  '- Un changement de règle Instagram devient une alerte. Si le profil devrait évoluer, décris-le dans proposition_profil : tu ne modifies jamais le profil.',
  '- Rédige 3 à 5 idées : format, pilier (une clé de regles_studio.piliers), role_caption (engagement, cta ou deadpan), cta, accroche, caption et hashtags. Respecte la cadence, la part d’appels à l’action et la rotation des rôles, en tenant compte des contenus déjà prévus. Ne repropose pas une idée proche d’un contenu déjà prévu.',
  '- Appuie-toi sur les performances passées : reprends les mécaniques des meilleurs contenus, évite celles des pires.',
  '- Évalue chaque idée comme une éditrice exigeante, dans "jugement" : une phrase par critère, exactement 2 captions de rôles différents, 2 ou 3 accroches, hashtags sans #, exactement 3 recommandations, chacune avec un pourquoi court.',
  '- Tout en français.',
  '',
  'Réponds uniquement avec un objet JSON de cette forme, sans texte autour :',
  '{"sources_indisponibles":false,"tendances":[{"titre":"…","source":"URL ou nom","date":"AAAA-MM-JJ","pourquoi":"…","adaptation":"…","duree_vie":"…","son_a_verifier":false}],"ecartees":[{"titre":"…","raison":"…"}],"alertes":[{"texte":"…","proposition_profil":null}],"idees":[{"format":"reel","pilier":"…","role_caption":"engagement","cta":false,"format_valide":"","accroche":"…","caption":"…","hashtags":["…"],"tendance":null,"jugement":{"notes":{"accroche":7,"voix":8,"mecanique":6},"phrases":{"accroche":"…","voix":"…","mecanique":"…"},"conformite":{"etat":"vert","causes":[]},"captions":[{"role":"engagement","texte":"…"},{"role":"deadpan","texte":"…"}],"accroches":["…","…"],"hashtags":["mot"],"recommandations":[{"texte":"…","pourquoi":"…"},{"texte":"…","pourquoi":"…"},{"texte":"…","pourquoi":"…"}]}}]}',
].join('\n');

export function construireConsignesVeille({ profil, fiches, stats, relevesCompte, plage, maintenant }) {
  const prevus = fiches.slice(0, 60).map(f => ({ format: f.format, pilier: f.pilier, role_caption: f.role_caption ?? null, cta: !!f.cta, statut: f.statut, date_heure: f.date_heure, accroche: (f.accroche ?? '').slice(0, 160) }));
  const releves = stats.slice(0, 40).map(s => ({ format: s.format, accroche: (s.accroche ?? '').slice(0, 160), releve: s.releve, vues: s.vues, nouveaux_abonnes: s.nouveaux_abonnes, partages_envois: s.partages_envois }));
  const message = [
    `Nous sommes le ${maintenant}. Semaine visée : ${plage.semaine}, du ${plage.debut} au ${plage.fin} (UTC).`,
    '',
    '## Profil de marque (JSON)',
    extraireProfilDetaille(profil).texte,
    '',
    '## Contenus déjà prévus ou récents (JSON)',
    JSON.stringify(prevus),
    '',
    '## Relevés de statistiques des deux dernières semaines (JSON)',
    JSON.stringify(releves),
    '',
    '## Relevés du compte (JSON)',
    JSON.stringify(relevesCompte.slice(-4)),
  ].join('\n');
  return { systeme: SYSTEME, message };
}
```

- [ ] **Step 6: Implement** `serveur/veille.js`

```js
import { construireVeille, plageVeille, doitTourner } from '../src/logique/veille.js';
import { construireConsignesVeille } from '../src/claude/veille-consignes.js';
import { nouvelId } from '../src/logique/fiche.js';
import { verifierSession } from './session.js';
import { cleConfiguree, codeErreur, extraireJson, texteDe, MODELE } from './claude.js';

const TABLE = 'documents';
const PAUSES_MAX = 4;
const echec = (code, extra = {}) => ({ ok: false, code, ...extra });

async function lire(supabase, collection, filtres = []) {
  let q = supabase.from(TABLE).select('id,data').eq('collection', collection);
  for (const [champ, op, v] of filtres) q = q[op](`data->>${champ}`, v);
  const { data, error } = await q.order('id').range(0, 999);
  if (error) throw Object.assign(new Error(error.message), { code: 'unavailable' });
  return data.map(l => ({ id: l.id, ...l.data }));
}

async function demander(claude, systeme, messages) {
  let historique = messages;
  for (let i = 0; i <= PAUSES_MAX; i += 1) {
    const reponse = await claude.messages.stream({
      model: MODELE, max_tokens: 16000, system: systeme,
      tools: [{ type: 'web_search_20260209', name: 'web_search' }],
      messages: historique,
    }).finalMessage();
    if (reponse.stop_reason === 'refusal') throw Object.assign(new Error('refus'), { code: 'refused' });
    if (reponse.stop_reason !== 'pause_turn') return reponse;
    historique = [...historique, { role: 'assistant', content: reponse.content }];
  }
  throw Object.assign(new Error('trop de pauses'), { code: 'unavailable' });
}

export async function lancerVeille({ supabase, claude, maintenant, forcer = false, idAleatoire = nouvelId }) {
  try {
    const profil = (await lire(supabase, 'profil')).find(p => p.id === 'courant');
    if (!profil?.regles_studio) return echec('profil_absent');
    const regles = profil.regles_studio;
    if (!doitTourner(regles, maintenant, { forcer })) return { ok: true, lance: false, resume: 'Veille déjà faite ou hors horaire.' };
    const plage = plageVeille(regles, maintenant);
    const fiches = await lire(supabase, 'fiches', [['date_heure', 'gte', plage.lecture_debut], ['date_heure', 'lt', plage.lecture_fin]]);
    const stats = await lire(supabase, 'stats_contenu', [['date_publication', 'gte', plage.lecture_debut], ['date_publication', 'lt', plage.debut]]);
    const relevesCompte = await lire(supabase, 'releves_compte', [['debut', 'gte', plage.lecture_debut], ['debut', 'lt', plage.debut]]);
    const { systeme, message } = construireConsignesVeille({ profil, fiches, stats, relevesCompte, plage, maintenant });

    let messages = [{ role: 'user', content: message }];
    let resultat = null;
    for (let essai = 0; essai < 2; essai += 1) {
      const reponse = await demander(claude, systeme, messages);
      let entree;
      try { entree = extraireJson(texteDe(reponse)); } catch { entree = null; }
      resultat = entree
        ? construireVeille({ profil, fiches, entree, maintenant, idAleatoire, stats, relevesCompte })
        : { ok: false, erreurs: ['La réponse n’était pas un objet JSON.'] };
      if (resultat.ok) break;
      messages = [...messages, { role: 'assistant', content: reponse.content },
        { role: 'user', content: `Ta réponse n’est pas valide. Corrige ces points et renvoie uniquement l’objet JSON complet :\n${resultat.erreurs.join('\n')}` }];
    }
    if (!resultat.ok) return echec('invalid_json', { erreurs: resultat.erreurs });

    const majLe = new Map(fiches.map(f => [f.id, f.maj_le]));
    const ecritures = resultat.ecritures.map(e => (e.op === 'delete' && e.collection === 'fiches' ? { ...e, si_maj_le: majLe.get(e.doc_id) ?? null } : e));
    const { error } = await supabase.rpc('appliquer_veille', { ecritures });
    if (error) return echec('unavailable');
    const remplacees = ecritures.filter(e => e.op === 'delete').length;
    return { ok: true, lance: true, resume: `Bulletin ${resultat.cle} : ${resultat.fichesCreees.length} idée(s), ${remplacees} remplacée(s), statut ${resultat.bulletin.statut}.` };
  } catch (e) {
    return echec(codeErreur(e));
  }
}

export async function traiterVeille({ methode, autorisation, env, supabaseSession, supabaseService, claude, maintenant, idAleatoire }) {
  if (methode !== 'GET' && methode !== 'POST') return { statut: 405, corps: { code: 'invalid_request' } };
  if (methode === 'GET') {
    if (!env.CRON_SECRET || autorisation !== `Bearer ${env.CRON_SECRET}`) return { statut: 401, corps: { code: 'session_expired' } };
  } else if (!(await verifierSession(supabaseSession, autorisation)).ok) {
    return { statut: 401, corps: { code: 'session_expired' } };
  }
  if (!cleConfiguree(env)) return { statut: 403, corps: { code: 'not_granted' } };
  const r = await lancerVeille({ supabase: supabaseService, claude, maintenant, forcer: methode === 'POST', idAleatoire });
  return r.ok ? { statut: 200, corps: r } : { statut: r.code === 'rate_limited' ? 429 : 502, corps: r };
}
```

- [ ] **Step 7: Implement** `api/veille.js`

```js
import { createClient } from '@supabase/supabase-js';
import { traiterVeille } from '../serveur/veille.js';
import { creerClient, cleConfiguree } from '../serveur/claude.js';

export const config = { maxDuration: 300 };

export default async function handler(req, res) {
  const r = await traiterVeille({
    methode: req.method,
    autorisation: req.headers.authorization,
    env: process.env,
    supabaseSession: createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY),
    supabaseService: createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } }),
    claude: cleConfiguree(process.env) ? creerClient() : null,
    maintenant: new Date().toISOString(),
  });
  res.status(r.statut).json(r.corps);
}
```

Add the scheduled tasks to `vercel.json` :

```json
  "crons": [
    { "path": "/api/veille", "schedule": "0 0 * * 1" },
    { "path": "/api/veille", "schedule": "0 1 * * 1" }
  ]
```

- [ ] **Step 8: Implement** `src/socle/veille-api.js`

```js
const RAISONS = {
  not_granted: 'La veille n’est pas encore configurée.',
  rate_limited: 'Trop de demandes à Claude pour le moment : réessaie un peu plus tard.',
  session_expired: 'Ta session a expiré : reconnecte-toi, puis réessaie.',
  profil_absent: 'Importe d’abord le profil de marque.',
};
const ECHEC = 'La veille a échoué : réessaie dans quelques minutes. Rien n’a été modifié.';

export function creerVeilleApi({ fetch: requeter, jeton }) {
  return {
    async relancer() {
      try {
        const reponse = await requeter('/api/veille', { method: 'POST', headers: { Authorization: `Bearer ${await jeton()}` } });
        const corps = await reponse.json().catch(() => ({}));
        if (reponse.ok && corps.ok) return { ok: true, message: corps.resume };
        return { ok: false, raison: RAISONS[corps?.code] ?? ECHEC };
      } catch {
        return { ok: false, raison: ECHEC };
      }
    },
  };
}
```

- [ ] **Step 9: Wire the page.**
  - `src/interface/controleur.js` : add the parameter `veille = null`, then the action:

```js
    relancerVeille: async () => (veille ? veille.relancer() : { ok: false, raison: 'La veille n’est pas encore configurée.' }),
```

  - `src/interface/app.js` :
    - `const veille = (await claude.use('veille')) ?? null;` ;
    - pass it to `creerControleur` ;
    - add `veille: !!veille` to the capabilities passed to `creerRendu`.
  - `src/interface/rendu.js` : in `contenuVue`, call `vueBulletin(e, actions, capacites)`.
  - `src/interface/vue-bulletin.js` : change the signature to `vueBulletin({ profil, fiches, bulletin, configVeille }, actions, capacites = {})` and replace `lienRelance(configVeille)` with `relance(configVeille, actions, capacites)` at its two call sites. Add:

```js
function relance(config, actions, capacites) {
  if (capacites.veille === true) {
    const message = h('p', { class: 'aide', role: 'status' });
    const bouton = h('button', {
      type: 'button', class: 'bouton-secondaire',
      onclick: async () => {
        bouton.disabled = true;
        message.textContent = 'Veille en cours : cela peut prendre quelques minutes.';
        const r = await actions.relancerVeille();
        bouton.disabled = false;
        message.textContent = r.ok ? r.message : r.raison;
      },
    }, 'Relancer la veille');
    return h('div', { class: 'relance' }, bouton, message);
  }
  if (capacites.veille === false) return h('p', { class: 'aide' }, 'La veille n’est pas encore configurée.');
  return lienRelance(config);
}
```

  - `src/interface/main.js` : import `creerVeilleApi` and add `veille: creerVeilleApi({ fetch: window.fetch.bind(window), jeton: connexion.jeton })` to the `extras` passed to `creerSocle`.

- [ ] **Step 10: Run the tests**

Run: `npm test`, puis `SUPABASE_URL=https://projet.test SUPABASE_ANON_KEY=cle npm run build`.
Expected: PASS.

- [ ] **Step 11: Commit**

```bash
git add src serveur api scripts/veille.mjs vercel.json tests
git commit -m "Veille côté serveur : tâche planifiée Vercel, API Claude avec recherche web, relance depuis le site

Co-Authored-By: <modèle auteur>"
```

---

### Task 7 : script de migration

**Files:**
- Create: `scripts/migrer.mjs`
- Test: `tests/scripts/migrer.test.js`

**Interfaces:**
- Consumes : `validerExport`, `COLLECTIONS_EXPORT` (plan 6) ; le client Supabase (clé de service).
- Produces : `migrer({ exportJson, visuels, supabase, journal })` → `{ ok, documents, visuels }` ou `{ ok: false, erreurs }`.
  - `visuels` est une liste de `{ id, type, contenu }`.
  - En ligne de commande : `node --env-file=.env.local scripts/migrer.mjs --export <fichier.json> [--visuels <dossier>]`.

- [ ] **Step 1: Write the failing tests** : `tests/scripts/migrer.test.js`

```js
import { describe, it, expect } from 'vitest';
import fictif from '../../exemples/profil-fictif.json';
import { creerFauxSupabase } from '../aides/fauxSupabase.js';
import { construireExport, COLLECTIONS_EXPORT } from '../../src/logique/sauvegarde.js';
import { migrer } from '../../scripts/migrer.mjs';

const vide = () => Object.fromEntries(COLLECTIONS_EXPORT.map(c => [c, []]));
const exportAvec = docs => construireExport({ ...vide(), ...docs }, '2026-10-01T08:00:00.000Z');
const visuel = id => ({ id, type: 'image/png', contenu: new Blob(['x'], { type: 'image/png' }) });

describe('migrer', () => {
  it('écrit les documents et les visuels sous leurs identifiants d’origine', async () => {
    const supabase = creerFauxSupabase();
    const r = await migrer({
      exportJson: exportAvec({ profil: [{ id: 'courant', data: { ...fictif, version: 2 } }], fiches: [{ id: 'f1', data: { visuel: 'a1', accroche: 'x' } }, { id: 'f2', data: { visuel: null } }] }),
      visuels: [visuel('a1')], supabase, journal: () => {},
    });
    expect(r).toEqual({ ok: true, documents: 3, visuels: 1 });
    expect(supabase._lignes.get('fiches/f1').data).toEqual({ visuel: 'a1', accroche: 'x' });
    expect(supabase._lignes.get('profil/courant').data.version).toBe(2);
    expect(supabase._fichiers.has('visuels/a1')).toBe(true);
  });
  it('s’arrête avant d’écrire si l’export est invalide', async () => {
    const supabase = creerFauxSupabase();
    const r = await migrer({ exportJson: exportAvec({ profil: [{ id: 'courant', data: {} }] }), visuels: [], supabase, journal: () => {} });
    expect(r.ok).toBe(false);
    expect(r.erreurs[0]).toMatch(/^profil\/courant : /);
    expect(supabase._lignes.size).toBe(0);
  });
  it('s’arrête avant d’écrire si un visuel référencé manque', async () => {
    const supabase = creerFauxSupabase();
    const r = await migrer({ exportJson: exportAvec({ fiches: [{ id: 'f1', data: { visuel: 'a1' } }, { id: 'f2', data: { visuel: 'a2' } }] }), visuels: [visuel('a1')], supabase, journal: () => {} });
    expect(r).toEqual({ ok: false, erreurs: ['Visuel manquant : a2 (fiche f2).'] });
    expect(supabase._lignes.size).toBe(0);
    expect(supabase._fichiers.size).toBe(0);
  });
  it('signale une écriture en échec', async () => {
    const supabase = creerFauxSupabase();
    supabase._panne({ message: 'boom', status: 500 });
    const r = await migrer({ exportJson: exportAvec({ fiches: [{ id: 'f1', data: {} }] }), visuels: [], supabase, journal: () => {} });
    expect(r.ok).toBe(false);
    expect(r.erreurs[0]).toContain('boom');
  });
});
```

- [ ] **Step 2: Run to see it fail**

Run: `npx vitest run tests/scripts/migrer.test.js`
Expected: FAIL.

- [ ] **Step 3: Implement** `scripts/migrer.mjs`

```js
import { readFileSync, readdirSync, realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { validerExport, COLLECTIONS_EXPORT } from '../src/logique/sauvegarde.js';

const TYPES = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif', mp4: 'video/mp4', mov: 'video/quicktime', webm: 'video/webm' };
const LOT = 200;

export async function migrer({ exportJson, visuels, supabase, journal = console.log }) {
  const v = validerExport(exportJson);
  if (!v.ok) return { ok: false, erreurs: v.erreurs };
  const disponibles = new Set(visuels.map(x => x.id));
  const manquants = v.collections.fiches
    .filter(f => f.data.visuel && !disponibles.has(f.data.visuel))
    .map(f => `Visuel manquant : ${f.data.visuel} (fiche ${f.id}).`);
  if (manquants.length) return { ok: false, erreurs: manquants };

  for (const x of visuels) {
    const { error } = await supabase.storage.from('visuels').upload(x.id, x.contenu, { contentType: x.type, upsert: true });
    if (error) return { ok: false, erreurs: [`Visuel ${x.id} : ${error.message}`] };
  }
  let documents = 0;
  for (const c of COLLECTIONS_EXPORT) {
    const lignes = v.collections[c].map(d => ({ collection: c, id: d.id, data: d.data, maj_le: new Date().toISOString() }));
    for (let i = 0; i < lignes.length; i += LOT) {
      const { error } = await supabase.from('documents').upsert(lignes.slice(i, i + LOT));
      if (error) return { ok: false, erreurs: [`${c} : ${error.message}`] };
      documents += Math.min(LOT, lignes.length - i);
    }
    if (lignes.length) journal(`${c} : ${lignes.length}`);
  }
  return { ok: true, documents, visuels: visuels.length };
}

function lanceDirectement() {
  try {
    return Boolean(process.argv[1]) && realpathSync(process.argv[1]).toLowerCase() === realpathSync(fileURLToPath(import.meta.url)).toLowerCase();
  } catch {
    return false;
  }
}

if (lanceDirectement()) {
  const args = process.argv.slice(2);
  const option = nom => { const i = args.indexOf(`--${nom}`); return i >= 0 ? args[i + 1] : null; };
  const fichier = option('export');
  const dossier = option('visuels');
  if (!fichier || !process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error('Usage : node --env-file=.env.local scripts/migrer.mjs --export <fichier.json> [--visuels <dossier>]\nSUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY doivent être définies.');
    process.exit(1);
  }
  const { createClient } = await import('@supabase/supabase-js');
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  const visuels = dossier ? readdirSync(dossier).map(nom => {
    const extension = nom.split('.').pop().toLowerCase();
    const type = TYPES[extension] ?? 'application/octet-stream';
    return { id: nom, type, contenu: new Blob([readFileSync(path.join(dossier, nom))], { type }) };
  }) : [];
  const r = await migrer({ exportJson: JSON.parse(readFileSync(fichier, 'utf8')), visuels, supabase });
  if (!r.ok) { console.error(r.erreurs.join('\n')); process.exit(1); }
  console.log(`Migration terminée : ${r.documents} document(s), ${r.visuels} visuel(s).`);
}
```

The file name in the visuals folder is the `visuel` identifier stored in the fiches. The controller prepares this folder in Task 8.

- [ ] **Step 4: Run the tests**

Run: `npx vitest run tests/scripts/migrer.test.js`, puis `npm test`.
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/migrer.mjs tests/scripts/migrer.test.js
git commit -m "Migration : script qui restaure un export et ses visuels dans Supabase

Co-Authored-By: <modèle auteur>"
```

---

### Task 8 : mise en service et bascule

Cette tâche est faite par le contrôleur avec Jean. Elle touche des comptes et des données réelles. Chaque étape qui écrit hors du dépôt attend l'accord de Jean.

- [ ] **Step 1:** `npm test`, puis build avec des valeurs factices. Push de la branche.
- [ ] **Step 2: Jean** suit `docs/mise-en-service-vercel-supabase.md` :
  - il crée les deux projets Supabase ;
  - il exécute `supabase/schema.sql` dans chacun ;
  - il crée le projet Vercel, saisit les variables et invite les adresses ;
  - il crée `.env.local` avec les valeurs du projet de **test**.
- [ ] **Step 3: Exporter le studio de test.**
  - Lire chaque collection de l'Artifact de test avec `ArtifactData` (`list`, avec `out_dir` dans un dossier `data/`, ignoré par git).
  - Assembler un fichier d'export au format du plan 6.
  - Récupérer les visuels référencés (outil `Artifact`, lecture par identifiant d'asset) dans `data/visuels-test/`, chacun nommé par son identifiant.
- [ ] **Step 4: Migrer le projet de test** : `node --env-file=.env.local scripts/migrer.mjs --export data/export-test.json --visuels data/visuels-test`. Vérifier le décompte affiché.
- [ ] **Step 5: Vérification par Jean** sur le déploiement de prévisualisation :
  - connexion par lien magique ;
  - calendrier, fiche, visuel, relevé, tableau de bord ;
  - export puis restauration ;
  - bouton « Évaluer » absent ;
  - onglet Bulletin avec « La veille n’est pas encore configurée. ».
- [ ] **Step 6: Migrer le studio réel**, après accord de Jean. Refaire les étapes 3 et 4 avec l'Artifact réel et un `.env.local` pointant sur le projet réel. Les fichiers réels restent dans `data/` et ne sont jamais commités.
- [ ] **Step 7: Bascule**, après vérification de Jean et de la créatrice :
  - désactiver la routine cloud de veille du studio réel ;
  - mettre à jour le README, le fichier de passation et la fiche technique JSON ;
  - fusionner dans `main` : la production Vercel suit `main`.
- [ ] **Step 8:** Dire à Jean ce qui reste éteint (évaluation, veille) et comment l'allumer avec la clé Anthropic.
