export function creerEtat(initial) {
  let etat = initial;
  const abonnes = new Set();
  return {
    lire: () => etat,
    modifier(changements) {
      etat = { ...etat, ...changements };
      for (const abonne of [...abonnes]) abonne(etat);
    },
    abonner(fn) {
      abonnes.add(fn);
      return () => abonnes.delete(fn);
    },
  };
}
