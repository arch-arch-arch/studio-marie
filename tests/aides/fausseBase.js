export function creerFausseBase() {
  const docs = new Map();
  const ecouteurs = new Map(); // racine (premier segment du chemin) -> Set de callbacks
  const racineDe = chemin => chemin.split('/')[0];
  const notifier = racine => { for (const e of [...(ecouteurs.get(racine) ?? [])]) e(); };
  const ecouter = (racine, e) => {
    if (!ecouteurs.has(racine)) ecouteurs.set(racine, new Set());
    ecouteurs.get(racine).add(e);
    e();
    return () => ecouteurs.get(racine)?.delete(e);
  };
  const instantane = chemin => ({
    id: chemin.split('/').pop(),
    exists: docs.has(chemin),
    data: () => (docs.has(chemin) ? structuredClone(docs.get(chemin)) : undefined),
    metadata: { fromCache: false, hasPendingWrites: false },
  });

  const base = {
    ecritures: [],
    _docs: docs,
    doc: chemin => ({
      id: chemin.split('/').pop(),
      path: chemin,
      async get() { return instantane(chemin); },
      async set(corps) { base.ecritures.push(chemin); docs.set(chemin, structuredClone(corps)); notifier(racineDe(chemin)); },
      async delete() { base.ecritures.push(`suppression:${chemin}`); docs.delete(chemin); notifier(racineDe(chemin)); },
      onSnapshot(suivant) { return ecouter(racineDe(chemin), () => suivant(instantane(chemin))); },
    }),
    collection: chemin => requete(chemin, []),
  };

  function requete(collection, filtres) {
    const profondeur = collection.split('/').length + 1;
    const executer = () => [...docs.keys()]
      .filter(c => c.startsWith(`${collection}/`) && c.split('/').length === profondeur)
      .sort()
      .map(instantane)
      .filter(s => filtres.every(([champ, op, v]) => {
        const x = s.data()[champ];
        return op === '>=' ? x >= v : op === '<' ? x < v : op === '==' ? x === v : false;
      }));
    const resultat = () => { const d = executer(); return { docs: d, size: d.length, empty: d.length === 0 }; };
    return {
      where: (champ, op, v) => requete(collection, [...filtres, [champ, op, v]]),
      async get() { return resultat(); },
      onSnapshot(suivant) { return ecouter(racineDe(collection), () => suivant(resultat())); },
      doc: id => base.doc(`${collection}/${id}`),
    };
  }

  return base;
}
