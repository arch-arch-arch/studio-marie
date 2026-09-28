// Regroupe les modifications d'une fiche et garantit une seule écriture à la fois par fiche.
export function creerEnregistreur(enregistrer, delaiMs = 600, surErreur = () => {}) {
  const dernier = new Map();
  const minuteries = new Map();
  const chaines = new Map();
  const enVol = new Map();
  const generations = new Map();

  function lancer(id) {
    clearTimeout(minuteries.get(id));
    minuteries.delete(id);
    const precedente = chaines.get(id) ?? Promise.resolve();
    if (!dernier.has(id)) return precedente;
    const suivante = precedente.catch(() => {}).then(async () => {
      if (!dernier.has(id)) return;
      const generation = generations.get(id) ?? 0;
      const fiche = dernier.get(id);
      dernier.delete(id);
      enVol.set(id, (enVol.get(id) ?? 0) + 1);
      try {
        await enregistrer(fiche);
      } catch (e) {
        if ((generations.get(id) ?? 0) === generation && !dernier.has(id)) dernier.set(id, fiche);
        try {
          surErreur(e, fiche);
        } catch {
          /* ignoré : l'erreur d'origine est déjà traitée */
        }
      } finally {
        const reste = enVol.get(id) - 1;
        if (reste > 0) enVol.set(id, reste); else enVol.delete(id);
      }
    });
    chaines.set(id, suivante);
    return suivante;
  }

  return {
    planifier(fiche) {
      dernier.set(fiche.id, fiche);
      clearTimeout(minuteries.get(fiche.id));
      minuteries.set(fiche.id, setTimeout(() => lancer(fiche.id), delaiMs));
    },
    vider: id => lancer(id),
    viderTout: () => Promise.all([...new Set([...dernier.keys(), ...chaines.keys()])].map(lancer)),
    annuler(id) {
      clearTimeout(minuteries.get(id));
      minuteries.delete(id);
      dernier.delete(id);
      generations.set(id, (generations.get(id) ?? 0) + 1);
      return chaines.get(id) ?? Promise.resolve();
    },
    estEnAttente: id => dernier.has(id) || enVol.has(id),
  };
}
