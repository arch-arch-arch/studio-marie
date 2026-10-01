import { validerProfil } from '../logique/profil.js';
import { RELEVES, idReleve } from '../logique/indicateurs.js';

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

    async lireFiche(id) {
      const doc = await db.doc(`fiches/${id}`).get();
      return doc.exists ? { id, ...doc.data() } : null;
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

    ecouterBulletin(cle, rappel, erreur) {
      return db.doc(`bulletins/${cle}`).onSnapshot(s => rappel(s.exists ? s.data() : null), erreur);
    },

    ecouterConfigVeille(rappel, erreur) {
      return db.doc('config/veille').onSnapshot(s => rappel(s.exists ? s.data() : null), erreur);
    },

    async lireRelevesFiche(ficheId) {
      const lus = await Promise.all(RELEVES.map(r => db.doc(`stats_contenu/${idReleve(ficheId, r)}`).get()));
      return lus.filter(s => s.exists).map(s => ({ id: s.id, ...s.data() }));
    },

    async enregistrerReleveContenu(doc) {
      const { id, ...corps } = doc;
      await db.doc(`stats_contenu/${id}`).set(corps);
    },

    ecouterStats(depuisIso, rappel, erreur) {
      return db.collection('stats_contenu').where('date_publication', '>=', depuisIso)
        .onSnapshot(snap => rappel(snap.docs.map(d => ({ id: d.id, ...d.data() }))), erreur);
    },

    async enregistrerReleveCompte(doc) {
      const { id, ...corps } = doc;
      await db.doc(`releves_compte/${id}`).set(corps);
    },

    ecouterRelevesCompte(rappel, erreur) {
      return db.collection('releves_compte').onSnapshot(snap => rappel(snap.docs.map(d => ({ id: d.id, ...d.data() }))), erreur);
    },

    async lireCollection(nom) {
      const snap = await db.collection(nom).get();
      return snap.docs.map(d => ({ id: d.id, data: d.data() }));
    },

    async ecrireDocument(collection, id, data) {
      await db.doc(`${collection}/${id}`).set(data);
    },
  };
}
