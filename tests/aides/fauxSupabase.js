export function creerFauxSupabase({ utilisateur = { id: 'u1', email: 'a@exemple.test' }, invites = null, motsDePasse = {} } = {}) {
  const lignes = new Map(); // `${collection}/${id}` -> { collection, id, data, maj_le }
  const fichiers = new Map(); // `${espace}/${chemin}` -> Blob
  const ecoutes = new Set();
  const ecoutesAuth = new Set();
  const appelsRpc = [];
  let session = utilisateur ? { access_token: 'jeton-test', user: utilisateur } : null;
  let panne = null;
  let delaiLecture = 0;
  const statutsCanaux = new Set();
  const reponsePanne = () => ({ data: null, error: { message: panne.message, code: panne.code }, status: panne.status });
  // Forme réelle de StorageApiError (storage-js) : message, name, status numérique, statusCode en chaîne, code.
  const erreurStockage = (message, status, statusCode, code) => Object.assign(new Error(message), { __isStorageError: true, name: 'StorageApiError', status, statusCode, code });
  const echecStockage = () => {
    const statusCode = panne.statusCode ?? (panne.status != null ? String(panne.status) : panne.code);
    const status = panne.status ?? (Number.isFinite(Number(panne.statusCode)) ? Number(panne.statusCode) : 500);
    return { data: null, error: erreurStockage(panne.message, status, statusCode, panne.code) };
  };
  const introuvable = () => ({ data: null, error: erreurStockage('Object not found', 400, '404') });
  // Forme réelle de AuthApiError (auth-js, lib/errors.js l. 41-48) : message, name, status numérique, code en chaîne.
  const erreurAuth = (message, status, code) => Object.assign(new Error(message), { __isAuthError: true, name: 'AuthApiError', status, code });
  // Forme réelle de AuthRetryableFetchError (auth-js, errors.js l. 217-221 ; fetch.js l. 22-44) : sans code, statut 0 pour une panne réseau,
  // pour les statuts 500-504 et 520-530.
  const STATUTS_RETENTABLES = [500, 501, 502, 503, 504, 520, 521, 522, 523, 524, 525, 526, 527, 528, 529, 530];
  const erreurPanneAuth = () => {
    if (panne.status == null || STATUTS_RETENTABLES.includes(panne.status)) {
      return Object.assign(new Error(panne.message), { __isAuthError: true, name: 'AuthRetryableFetchError', status: panne.status ?? 0, code: undefined });
    }
    return erreurAuth(panne.message, panne.status, panne.code);
  };
  const compteurs = { lectures: 0, enCours: 0, simultaneesMax: 0 };
  const emettre = (eventType, ancien, nouveau) => { for (const e of [...ecoutes]) e({ eventType, old: ancien ?? {}, new: nouveau ?? {} }); };
  const valeur = (l, col) => (col.startsWith('data->>') ? l.data?.[col.slice(7)] : l[col]);

  function requete(table) {
    const filtres = [];
    let mode = 'select';
    let charge = null;
    let plage = null;
    let unique = false;
    async function executer() {
      if (panne) return reponsePanne();
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
      compteurs.enCours += 1;
      compteurs.simultaneesMax = Math.max(compteurs.simultaneesMax, compteurs.enCours);
      let res = cible.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)).map(l => ({ id: l.id, data: structuredClone(l.data) }));
      if (plage) res = res.slice(plage[0], plage[1] + 1);
      if (delaiLecture > 0) await new Promise(r => setTimeout(r, delaiLecture));
      compteurs.enCours -= 1;
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
      let statutCanal = null;
      const canal = {
        on: (_type, _filtre, fn) => { rappel = fn; return canal; },
        subscribe: statut => {
          if (rappel) ecoutes.add(rappel);
          if (statut) { statutCanal = statut; statutsCanaux.add(statut); queueMicrotask(() => statut('SUBSCRIBED')); }
          return canal;
        },
        _rappel: () => rappel,
        _statut: () => statutCanal,
      };
      return canal;
    },
    removeChannel: async canal => { ecoutes.delete(canal._rappel()); statutsCanaux.delete(canal._statut()); },
    // appliquer_veille (supabase/schema.sql) : transaction unique. 'verifier' compare data->>champ du document à la valeur attendue
    // (null : le document ne doit pas exister) ; en cas d'écart, erreur postgrest-js { message: 'veille_conflit', code: 'P0001' } et rien n'est écrit.
    // Un appel qui échoue n'est pas enregistré dans _rpc ; un appel réussi applique ses écritures à _lignes.
    rpc: async (nom, args) => {
      if (panne) return reponsePanne();
      if (nom !== 'appliquer_veille') { appelsRpc.push({ nom, args }); return { data: null, error: null }; }
      const copie = new Map(lignes);
      for (const e of args.ecritures) {
        const k = `${e.collection}/${e.doc_id}`;
        if (e.op === 'verifier') {
          if (e.champ !== 'genere_le') return { data: null, error: { message: `Champ de vérification inconnu : ${e.champ}`, code: 'P0001', details: null, hint: null }, status: 400 };
          const l = copie.get(k);
          if (e.valeur == null ? l !== undefined : l?.data?.genere_le !== e.valeur) return { data: null, error: { message: 'veille_conflit', code: 'P0001', details: null, hint: null }, status: 400 };
        } else if (e.op === 'set') {
          copie.set(k, { collection: e.collection, id: e.doc_id, data: structuredClone(e.data) });
        } else if (e.op === 'delete') {
          const l = copie.get(k);
          if (l && (e.si_maj_le == null || l.data?.maj_le === e.si_maj_le)) copie.delete(k);
        }
      }
      appelsRpc.push({ nom, args });
      lignes.clear();
      for (const [k, l] of copie) lignes.set(k, l);
      return { data: null, error: null };
    },
    storage: {
      from: espace => ({
        upload: async (chemin, fichier, options = {}) => {
          if (panne) return echecStockage();
          // Le service refuse un doublon sans upsert : HTTP 400, statusCode '409' dans le corps (storage-js ne le définit pas, il relaie le corps).
          if (fichiers.has(`${espace}/${chemin}`) && !options.upsert) return { data: null, error: erreurStockage('The resource already exists', 400, '409') };
          // storage-js ignore l'option contentType pour un Blob : c'est le type du Blob qui fait foi (index.mjs l. 598-634).
          // Sans Blob, l'option s'applique, avec 'text/plain;charset=UTF-8' par défaut.
          const type = fichier instanceof Blob ? fichier.type : (options.contentType ?? 'text/plain;charset=UTF-8');
          fichiers.set(`${espace}/${chemin}`, new Blob([fichier], { type }));
          return { data: { path: chemin }, error: null };
        },
        createSignedUrl: async chemin => (panne ? echecStockage() : fichiers.has(`${espace}/${chemin}`)
          ? { data: { signedUrl: `https://stockage.test/${espace}/${chemin}?jeton=1` }, error: null }
          : introuvable()),
        download: async chemin => (panne ? echecStockage() : fichiers.has(`${espace}/${chemin}`)
          ? { data: fichiers.get(`${espace}/${chemin}`), error: null }
          : introuvable()),
        list: async () => ({ data: [...fichiers.keys()].filter(k => k.startsWith(`${espace}/`)).map(k => ({ name: k.slice(espace.length + 1) })), error: null }),
      }),
    },
    auth: {
      getSession: async () => ({ data: { session }, error: null }),
      // Forme réelle (auth-js GoTrueClient.ts l. 3247-3290, types.ts l. 268-273) : { data: { user }, error: null } ou { data: { user: null }, error: AuthError }.
      getUser: async jeton => (session && jeton === session.access_token
        ? { data: { user: session.user }, error: null }
        : { data: { user: null }, error: erreurAuth('invalid JWT', 401, 'bad_jwt') }),
      signInWithOtp: async ({ email }) => (panne
        ? { data: { user: null, session: null }, error: erreurPanneAuth() }
        : invites && !invites.includes(email)
          ? { data: { user: null, session: null }, error: erreurAuth('Signups not allowed for otp', 422, 'otp_disabled') }
          : { data: { user: null, session: null }, error: null }),
      signInWithPassword: async ({ email, password }) => {
        if (panne) return { data: { user: null, session: null }, error: erreurPanneAuth() };
        if (!password || motsDePasse[email] !== password) return { data: { user: null, session: null }, error: erreurAuth('Invalid login credentials', 400, 'invalid_credentials') };
        session = { access_token: 'jeton-test', user: { id: 'u1', email } };
        for (const e of [...ecoutesAuth]) e('SIGNED_IN', session);
        return { data: { user: session.user, session }, error: null };
      },
      signOut: async () => { session = null; for (const e of [...ecoutesAuth]) e('SIGNED_OUT', null); return { error: null }; },
      // Comme GoTrueClient.js (l. 3645-3656) : INITIAL_SESSION arrive de façon asynchrone après l'abonnement.
      onAuthStateChange: fn => { ecoutesAuth.add(fn); Promise.resolve().then(() => { if (ecoutesAuth.has(fn)) fn('INITIAL_SESSION', session); }); return { data: { subscription: { unsubscribe: () => ecoutesAuth.delete(fn) } } }; },
    },
    _lignes: lignes,
    _fichiers: fichiers,
    _rpc: appelsRpc,
    _panne: p => { panne = p; },
    _delaiLecture: ms => { delaiLecture = ms; },
    _canal: statut => { for (const f of [...statutsCanaux]) f(statut); },
    _session: s => { session = s; for (const e of [...ecoutesAuth]) e(s ? 'SIGNED_IN' : 'SIGNED_OUT', s); },
    get _lecturesSimultaneesMax() { return compteurs.simultaneesMax; },
    get _lectures() { return compteurs.lectures; },
  };
  return client;
}
