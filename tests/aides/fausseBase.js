export function creerFausseBase() {
  const docs = new Map();
  const ecouteurs = new Set();
  const notifier = () => { for (const e of [...ecouteurs]) e(); };
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
      async set(corps) { base.ecritures.push(chemin); docs.set(chemin, structuredClone(corps)); notifier(); },
      async delete() { base.ecritures.push(`suppression:${chemin}`); docs.delete(chemin); notifier(); },
      onSnapshot(suivant) { const e = () => suivant(instantane(chemin)); ecouteurs.add(e); e(); return () => ecouteurs.delete(e); },
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
      onSnapshot(suivant) { const e = () => suivant(resultat()); ecouteurs.add(e); e(); return () => ecouteurs.delete(e); },
      doc: id => base.doc(`${collection}/${id}`),
    };
  }

  return base;
}
