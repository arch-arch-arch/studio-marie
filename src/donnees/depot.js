import { validerProfil } from '../logique/profil.js';

export function creerDepot(db) {
  return {
    ecouterFiches(debutIso, finIso, rappel, erreur) {
      return db.collection('fiches')
        .where('date_heure', '>=', debutIso)
        .where('date_heure', '<', finIso)
        .onSnapshot(snap => rappel(snap.docs.map(d => ({ id: d.id, ...d.data() }))), erreur);
    },

    async enregistrerFiche(fiche) {
      const { id, ...corps } = fiche;
      await db.doc(`fiches/${id}`).set(corps);
    },

    async supprimerFiche(id) {
      await db.doc(`fiches/${id}`).delete();
    },

    ecouterProfil(rappel, erreur) {
      return db.doc('profil/courant').onSnapshot(s => rappel(s.exists ? s.data() : null), erreur);
    },

    async importerProfil(profil, maintenant) {
      const verification = validerProfil(profil);
      if (!verification.ok) return verification;
      const actuel = await db.doc('profil/courant').get();
      const ancienne = actuel.exists ? actuel.data() : null;
      const version = (ancienne?.version ?? 0) + 1;
      if (ancienne) await db.doc(`profil_archives/v${ancienne.version ?? 0}`).set(ancienne);
      await db.doc('profil/courant').set({ ...profil, version, importe_le: maintenant });
      return { ok: true, erreurs: [], version };
    },

    ecouterReference(rappel, erreur) {
      return db.collection('reference').onSnapshot(snap => rappel(snap.docs.map(d => ({ id: d.id, ...d.data() }))), erreur);
    },

    async remplacerReference(items, anciens = []) {
      for (const ancien of anciens) {
        if (!items.some(i => i.id === ancien.id)) await db.doc(`reference/${ancien.id}`).delete();
      }
      for (const { id, ...corps } of items) await db.doc(`reference/${id}`).set(corps);
    },

    ecouterResultatReference(rappel, erreur) {
      return db.doc('reference_resultats/dernier').onSnapshot(s => rappel(s.exists ? s.data() : null), erreur);
    },

    async enregistrerResultatReference(bilan) {
      await db.doc('reference_resultats/dernier').set(bilan);
    },

    async effacerResultatReference() {
      await db.doc('reference_resultats/dernier').delete();
    },
  };
}
