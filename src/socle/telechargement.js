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
      // Safari peut produire un fichier vide si l'URL est révoquée dans le même tour que le clic.
      setTimeout(() => URL.revokeObjectURL(url), 10000);
      return { status: 'saved' };
    },
  };
}
