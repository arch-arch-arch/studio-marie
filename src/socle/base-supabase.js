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
