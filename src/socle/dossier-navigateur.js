export function creerDossierNavigateur({ charger, navigator: nav, File: Fichier }) {
  let chargement = null;
  let fabrique = null;
  const enFichier = (blob, nom) => new Fichier([blob], nom, { type: blob.type });
  return {
    // Même objet à chaque appel ; un échec de chargement n'est pas mémorisé.
    async fabrique() {
      if (fabrique) return fabrique;
      chargement ??= Promise.resolve().then(charger).then(
        f => { fabrique = f; return f; },
        e => { chargement = null; throw e; },
      );
      return chargement;
    },
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
