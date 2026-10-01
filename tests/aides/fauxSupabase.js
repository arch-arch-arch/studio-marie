export function creerFauxSupabase({ utilisateur = { id: 'u1', email: 'a@exemple.test' }, invites = null } = {}) {
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
    rpc: async (nom, args) => { if (panne) return reponsePanne(); appelsRpc.push({ nom, args }); return { data: null, error: null }; },
    storage: {
      from: espace => ({
        upload: async (chemin, fichier) => {
          if (panne) return reponsePanne();
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
    _delaiLecture: ms => { delaiLecture = ms; },
    _canal: statut => { for (const f of [...statutsCanaux]) f(statut); },
    _session: s => { session = s; for (const e of [...ecoutesAuth]) e(s ? 'SIGNED_IN' : 'SIGNED_OUT', s); },
    get _lecturesSimultaneesMax() { return compteurs.simultaneesMax; },
    get _lectures() { return compteurs.lectures; },
  };
  return client;
}
