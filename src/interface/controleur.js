import {
  nouvelId, nouvelleFiche, modifierFiche as appliquer, peutPasserA, changerStatut as appliquerStatut, deplacerFiche as deplacer,
  appliquerEvaluation, confirmerProgrammation as confirmerProg, confirmerPublication as confirmerPub, effacementsPour,
} from '../logique/fiche.js';
import { ajouterJours, ajouterMois, debutJour, debutSemaine, semainesDuMois } from '../logique/dates.js';
import { verifierRegles } from '../logique/regles-score.js';
import { composerScore, construireExamen } from '../logique/score.js';
import { fichesDeLaSemaine } from '../logique/controle.js';
import { construireDemande, validerReponse, messageErreurSample, CODES_INDISPONIBLES } from '../claude/evaluation.js';
import { validerReference, ficheDeReference, verifierClassement } from '../logique/reference.js';
import { RELEVES, validerReleveContenu, validerReleveCompte, documentReleveContenu, documentReleveCompte } from '../logique/indicateurs.js';
import { COLLECTIONS_EXPORT, construireExport, validerExport, resumeRestauration, nomFichierExport } from '../logique/sauvegarde.js';

const MESSAGES_TELEVERSEMENT = {
  too_large: 'Fichier trop lourd (20 Mo au maximum).',
  unsupported_type: 'Ce type de fichier n’est pas accepté.',
  rate_limited: 'Trop d’envois d’un coup : réessaie dans un instant.',
  revoked: 'Ta session a expiré : reconnecte-toi puis réessaie.',
};

export function plageDeVue(vue, ancre, fuseau) {
  if (vue === 'mois') {
    const semaines = semainesDuMois(ancre, fuseau);
    return [semaines[0], ajouterJours(semaines[semaines.length - 1], 7, fuseau)];
  }
  if (vue === 'jour') {
    const d = debutJour(ancre, fuseau);
    return [d, ajouterJours(d, 1, fuseau)];
  }
  const d = debutSemaine(ancre, fuseau);
  return [d, ajouterJours(d, 7, fuseau)];
}

export function fusionnerInstantane(recues, locales, estEnAttente) {
  const parId = new Map(locales.map(f => [f.id, f]));
  const resultat = recues.map(f => (estEnAttente(f.id) && parId.has(f.id) ? parId.get(f.id) : f));
  const vues = new Set(resultat.map(f => f.id));
  for (const f of locales) if (!vues.has(f.id) && estEnAttente(f.id)) resultat.push(f);
  return resultat;
}

async function chargerImageParDefaut(id) {
  const reponse = await fetch(`/_blob/${id}`);
  if (!reponse.ok) throw new Error(`Visuel introuvable (${reponse.status})`);
  return reponse.blob();
}

const INDISPONIBLE = { ok: false, raison: 'L’évaluation par Claude n’est pas disponible dans cette vue.', indisponible: true };

export function creerControleur({ etat, depot, enregistreur, assets, horloge, idAleatoire = nouvelId, sample = null, chargerImage = chargerImageParDefaut, downloads = null, connexion = null }) {
  const trouver = id => etat.lire().fiches.find(f => f.id === id);
  const fuseau = () => etat.lire().profil.regles_studio.fuseau;
  const remplacer = f => etat.modifier({ fiches: etat.lire().fiches.map(x => (x.id === f.id ? f : x)) });
  const ecrireMaintenant = async f => { enregistreur.planifier(f); await enregistreur.vider(f.id); };

  async function fermerPanneau() {
    const id = etat.lire().ficheOuverte;
    etat.modifier({ ficheOuverte: null });
    if (id) await enregistreur.vider(id);
  }

  function modifierFiche(id, changements) {
    const f = trouver(id);
    if (!f) return null;
    let g;
    try {
      g = appliquer(f, changements, horloge());
    } catch (e) {
      etat.modifier({ erreur: e.message });
      return null;
    }
    remplacer(g);
    enregistreur.planifier(g);
    return g;
  }

  async function changerAncre(vue, ancre) {
    await fermerPanneau();
    etat.modifier({ vue, ancre });
  }

  const evaluationsEnCours = new Set();
  const supprimeesPendantSession = new Set();
  let evaluationIndisponible = false;

  async function evaluerContenu(fiche, { signal, fichesSemaine = [] } = {}) {
    if (!sample) { evaluationIndisponible = true; return INDISPONIBLE; }
    const { profil } = etat.lire();
    const verification = verifierRegles(fiche, profil.regles_studio);
    let images;
    let visuel = fiche.visuel ? 'non_joint' : 'aucun';
    let raisonVisuel = null;
    if (fiche.visuel && fiche.visuel_type === 'video') raisonVisuel = 'video';
    else if (fiche.visuel) {
      raisonVisuel = 'indisponible';
      if (fiche.visuel_type === 'image') {
        try {
          const limites = await sample.limits();
          if (limites?.images) {
            const blob = await chargerImage(fiche.visuel);
            const { mediaTypes, maxInputBytes } = limites.images;
            const typeOk = !mediaTypes || mediaTypes.includes(blob.type);
            const tailleOk = maxInputBytes == null || blob.size <= maxInputBytes;
            if (typeOk && tailleOk) images = blob;
            else raisonVisuel = !typeOk ? 'type' : 'taille';
          }
        } catch {
          images = undefined;
        }
      }
    }
    if (images) { visuel = 'joint'; raisonVisuel = null; }
    const demande = construireDemande({ fiche, profil, verification, fichesSemaine, avecImage: !!images });
    let brute;
    try {
      brute = await sample.json(demande.texte, images ? { signal, images } : { signal });
    } catch (e) {
      if (e?.code === 'cancelled') return { ok: false, annule: true };
      const indisponible = CODES_INDISPONIBLES.has(e?.code);
      if (indisponible) evaluationIndisponible = true;
      return { ok: false, raison: messageErreurSample(e), indisponible };
    }
    const reponse = validerReponse(brute);
    if (!reponse.ok) return { ok: false, raison: 'La réponse de Claude était incomplète : réessaie. Rien n’a été modifié.' };
    const examen = construireExamen({ visuel, raison_visuel: raisonVisuel, version_profil: profil.version ?? null, sections_profil: demande.sections_profil, contenus_semaine: demande.contenus_semaine, verification });
    const score = composerScore({ fiche, verification, jugement: reponse.jugement, versionProfil: profil.version, maintenant: horloge(), examen });
    return { ok: true, score, jugement: reponse.jugement };
  }

  function verrouillerSiRouge(g) {
    if (g.statut !== 'valide' && g.statut !== 'programme') return g;
    const { profil } = etat.lire();
    const { conformite } = verifierRegles(g, profil.regles_studio);
    return conformite.etat === 'rouge' ? { ...g, statut: 'brouillon', ...effacementsPour('brouillon') } : g;
  }

  async function evaluerFiche(id, { signal } = {}) {
    if (!sample) return INDISPONIBLE;
    if (evaluationsEnCours.has(id)) return { ok: false, raison: 'Une évaluation est déjà en cours pour cette fiche.' };
    const f = trouver(id);
    if (!f) return { ok: false, raison: 'Fiche introuvable.' };
    evaluationsEnCours.add(id);
    try {
      const { fiches, profil } = etat.lire();
      const fz = profil.regles_studio.fuseau;
      const semaine = fichesDeLaSemaine(fiches, debutSemaine(f.date_heure, fz), fz);
      const resultat = await evaluerContenu(f, { signal, fichesSemaine: semaine });
      if (!resultat.ok) return resultat;
      const changements = {
        score: resultat.score,
        variantes: resultat.jugement.captions,
        suggestions: { accroches: resultat.jugement.accroches, hashtags: resultat.jugement.hashtags },
        recommandations: resultat.jugement.recommandations,
      };
      const actuelle = trouver(id);
      if (actuelle) {
        if (supprimeesPendantSession.has(id)) return { ok: false, raison: 'La fiche a été supprimée pendant l’évaluation.' };
        const g = verrouillerSiRouge(appliquerEvaluation(actuelle, changements, horloge()));
        remplacer(g);
        await ecrireMaintenant(g);
        return { ok: true, fiche: g };
      }
      await enregistreur.vider(id);
      const relue = await depot.lireFiche(id);
      const revenue = trouver(id);
      if (revenue) {
        if (supprimeesPendantSession.has(id)) return { ok: false, raison: 'La fiche a été supprimée pendant l’évaluation.' };
        const g = verrouillerSiRouge(appliquerEvaluation(revenue, changements, horloge()));
        remplacer(g);
        await ecrireMaintenant(g);
        return { ok: true, fiche: g };
      }
      if (!relue || supprimeesPendantSession.has(id)) return { ok: false, raison: 'La fiche a été supprimée pendant l’évaluation.' };
      const g = verrouillerSiRouge(appliquerEvaluation(relue, changements, horloge()));
      if (supprimeesPendantSession.has(id)) return { ok: false, raison: 'La fiche a été supprimée pendant l’évaluation.' };
      enregistreur.planifier(g);
      await enregistreur.vider(g.id);
      return { ok: true, fiche: g };
    } finally {
      evaluationsEnCours.delete(id);
    }
  }

  async function reverifierFiches() {
    const { fiches, profil } = etat.lire();
    const aRetrograder = fiches.filter(f => (f.statut === 'valide' || f.statut === 'programme')
      && verifierRegles(f, profil.regles_studio).conformite.etat === 'rouge');
    for (const f of aRetrograder) {
      const g = appliquerStatut(f, 'brouillon', horloge());
      remplacer(g);
      await ecrireMaintenant(g);
    }
    if (aRetrograder.length) {
      etat.modifier({ erreur: `${aRetrograder.length} fiche(s) repassée(s) en Brouillon : le profil actuel les bloque.` });
    }
    return aRetrograder.length;
  }

  async function confirmer(id, dateIso, coche, appliquerConfirmation) {
    const f = trouver(id);
    if (!f) return { ok: false, raison: 'Fiche introuvable.' };
    const r = appliquerConfirmation(f, { date: dateIso, coche }, horloge());
    if (!r.ok) return r;
    const { conformite } = verifierRegles(r.fiche, etat.lire().profil.regles_studio);
    if (conformite.etat === 'rouge') return { ok: false, raison: `Conformité au rouge : ${conformite.causes.join(' ; ')}.` };
    remplacer(r.fiche);
    etat.modifier({ erreur: null });
    await ecrireMaintenant(r.fiche);
    return { ok: true, fiche: r.fiche };
  }

  let controleurReference = null;

  async function importerReference(texte) {
    if (controleurReference) return { ok: false, erreurs: ['Une vérification est en cours : attends la fin ou arrête-la avant d’importer.'] };
    let liste;
    try {
      liste = JSON.parse(texte);
    } catch (e) {
      return { ok: false, erreurs: [`Ce texte n’est pas du JSON valide : ${e.message}`] };
    }
    const verification = validerReference(liste);
    if (!verification.ok) return verification;
    try {
      await depot.remplacerReference(verification.items, etat.lire().reference ?? []);
    } catch {
      return { ok: false, erreurs: ['L’import a échoué : la base du studio ne répond pas. Réessaie dans un instant.'] };
    }
    try {
      await depot.effacerResultatReference();
    } catch {
      return { ok: true, erreurs: ['Jeu importé, mais l’ancien bilan n’a pas pu être effacé.'], nombre: verification.items.length };
    }
    return { ok: true, erreurs: [], nombre: verification.items.length };
  }

  async function verifierReference() {
    if (!sample) return INDISPONIBLE;
    const { profil, reference = [] } = etat.lire();
    if (!reference.length) return { ok: false, raison: 'Importe d’abord un jeu de référence.' };
    if (controleurReference) return { ok: false, raison: 'Une vérification est déjà en cours.' };
    controleurReference = new AbortController();
    const resultats = [];
    etat.modifier({ verificationReference: { fait: 0, total: reference.length }, erreur: null });
    try {
      try {
        for (const item of reference) {
          if (controleurReference.signal.aborted) return { ok: false, annule: true };
          const r = await evaluerContenu(ficheDeReference(item, profil.regles_studio), { signal: controleurReference.signal, fichesSemaine: [] });
          if (!r.ok) {
            if (r.annule) return { ok: false, annule: true };
            etat.modifier({ erreur: r.raison });
            return { ok: false, raison: r.raison };
          }
          resultats.push({ id: item.id, resultat: item.resultat, total: r.score.total, accroche: item.accroche });
          etat.modifier({ verificationReference: { fait: resultats.length, total: reference.length } });
        }
      } catch {
        const raison = 'La vérification a échoué : réessaie. Rien n’a été enregistré.';
        etat.modifier({ erreur: raison });
        return { ok: false, raison };
      }
      const bilan = { ...verifierClassement(resultats), resultats, version_profil: profil.version, verifie_le: horloge() };
      try {
        await depot.enregistrerResultatReference(bilan);
      } catch {
        etat.modifier({ erreur: 'Le bilan n’a pas pu être enregistré : réessaie dans un instant.' });
      }
      return { ok: true, bilan };
    } finally {
      controleurReference = null;
      etat.modifier({ verificationReference: null });
    }
  }

  const INDISPONIBLE_EXPORT = 'L’export n’est pas disponible dans cette vue.';

  const EN_COURS = 'Une opération de sauvegarde est déjà en cours : attends la fin.';
  let sauvegardeEnCours = false;

  async function exporterDonnees() {
    if (sauvegardeEnCours) return { ok: false, raison: EN_COURS };
    sauvegardeEnCours = true;
    try { return await exporterSansGarde(); } finally { sauvegardeEnCours = false; }
  }

  async function exporterSansGarde() {
    if (!downloads) return { ok: false, raison: INDISPONIBLE_EXPORT };
    let collections;
    try {
      collections = Object.fromEntries(await Promise.all(COLLECTIONS_EXPORT.map(async c => [c, await depot.lireCollection(c)])));
    } catch {
      return { ok: false, raison: 'L’export a échoué : réessaie dans un instant.' };
    }
    const maintenant = horloge();
    const exp = construireExport(collections, maintenant);
    try {
      await downloads.save({ filename: nomFichierExport(maintenant, etat.lire().profil?.regles_studio?.fuseau), data: JSON.stringify(exp, null, 2) });
    } catch (e) {
      if (e?.code === 'declined') return { ok: false, raison: 'Export annulé.' };
      if (e?.code === 'rate_limited') return { ok: false, raison: 'Une demande d’enregistrement est déjà ouverte : réessaie dans un instant.' };
      return { ok: false, raison: INDISPONIBLE_EXPORT };
    }
    return { ok: true, message: 'Export enregistré.' };
  }

  function analyserRestauration(texte) {
    let brut;
    try { brut = JSON.parse(texte); } catch { return { ok: false, erreurs: ['Ce fichier n’est pas du JSON valide.'] }; }
    const validation = validerExport(brut);
    if (!validation.ok) return { ok: false, erreurs: validation.erreurs };
    return { ok: true, resume: resumeRestauration(validation), validation };
  }

  async function restaurerDonnees(validation, options) {
    if (sauvegardeEnCours) return { ok: false, erreurs: [EN_COURS], restaures: 0 };
    sauvegardeEnCours = true;
    try { return await restaurerSansGarde(validation, options); } finally { sauvegardeEnCours = false; }
  }

  async function restaurerSansGarde(validation, { sauvegarder }) {
    await fermerPanneau();
    await enregistreur.viderTout();
    if (sauvegarder) {
      const s = await exporterSansGarde();
      if (!s.ok) return { ok: false, erreurs: [`Sauvegarde préalable impossible : ${s.raison} Rien n’a été restauré.`], restaures: 0 };
    }
    let restaures = 0;
    for (const c of COLLECTIONS_EXPORT) {
      for (const d of validation.collections[c]) {
        try {
          await depot.ecrireDocument(c, d.id, d.data);
        } catch {
          return { ok: false, restaures, erreurs: [`Restauration interrompue après ${restaures} document(s) sur ${validation.total} : réessaie, les documents déjà restaurés seront simplement réécrits.`] };
        }
        restaures += 1;
      }
    }
    return { ok: true, message: `Restauration terminée : ${restaures} document(s) restauré(s).`, restaures };
  }

  return {
    urlVisuel: async id => (typeof assets?.url === 'function' ? assets.url(id) : `/_blob/${id}`),
    ouvrirFiche: id => etat.modifier({ ficheOuverte: id, erreur: null }),
    fermerPanneau,
    modifierFiche,
    evaluerFiche,
    evaluationDisponible: () => !evaluationIndisponible,
    seDeconnecter: async () => { await enregistreur.viderTout(); await connexion?.deconnecter(); },
    reverifierFiches,
    importerReference,
    verifierReference,
    arreterReference: () => controleurReference?.abort(),
    exporterDonnees,
    analyserRestauration: async texte => analyserRestauration(texte),
    restaurerDonnees,
    confirmerProgrammation: (id, dateIso, coche) => confirmer(id, dateIso, coche, confirmerProg),
    confirmerPublication: (id, dateIso, coche) => confirmer(id, dateIso, coche, confirmerPub),

    async creerFiche({ format, date_heure }) {
      await fermerPanneau();
      const { profil, fiches } = etat.lire();
      const f = nouvelleFiche({ id: idAleatoire(), format, date_heure, pilier: profil.regles_studio.piliers[0].cle, maintenant: horloge() });
      etat.modifier({ fiches: [...fiches, f], ficheOuverte: f.id });
      await ecrireMaintenant(f);
      return f;
    },

    async deplacerFiche(id, jourIso) {
      const f = trouver(id);
      if (!f) return;
      const g = deplacer(f, jourIso, fuseau(), horloge());
      remplacer(g);
      await ecrireMaintenant(g);
    },

    async changerStatut(id, cible) {
      const f = trouver(id);
      if (!f) return { ok: false, raison: 'Fiche introuvable.' };
      if (cible === 'programme') return { ok: false, raison: 'Utilise « Confirmer la programmation » dans la fiche.' };
      if (cible === 'publie') return { ok: false, raison: 'Utilise « Confirmer la publication » dans la fiche.' };
      const verification = peutPasserA(f, cible);
      if (!verification.ok) {
        etat.modifier({ erreur: verification.raison });
        return verification;
      }
      if (cible === 'valide' || cible === 'programme' || cible === 'publie') {
        const { profil } = etat.lire();
        const { conformite } = verifierRegles(f, profil.regles_studio);
        if (conformite.etat === 'rouge') {
          const raison = `Conformité au rouge : ${conformite.causes.join(' ; ')}.`;
          etat.modifier({ erreur: raison });
          return { ok: false, raison };
        }
      }
      const g = appliquerStatut(f, cible, horloge());
      remplacer(g);
      etat.modifier({ erreur: null });
      await ecrireMaintenant(g);
      return verification;
    },

    async supprimerFiche(id) {
      supprimeesPendantSession.add(id);
      etat.modifier({ fiches: etat.lire().fiches.filter(f => f.id !== id), ficheOuverte: null });
      await enregistreur.annuler(id);
      try {
        await depot.supprimerFiche(id);
      } catch {
        etat.modifier({ erreur: 'La suppression a échoué : réessaie dans un instant.' });
      }
    },

    async televerserVisuel(id, fichier) {
      if (!assets) return { ok: false, raison: 'Le téléversement n’est pas disponible dans cette vue.' };
      try {
        const resultat = await assets.upload(fichier);
        const type = fichier.type?.startsWith('video/') ? 'video' : 'image';
        const g = modifierFiche(id, { visuel: resultat.id, visuel_type: type });
        if (g == null) return { ok: false, raison: 'La fiche n’existe plus : le visuel n’a pas été rattaché.' };
        return { ok: true, id: resultat.id, type, statut: g.statut };
      } catch (e) {
        return { ok: false, raison: MESSAGES_TELEVERSEMENT[e?.code] ?? `Échec du téléversement (${e?.code ?? 'erreur inconnue'}).` };
      }
    },

    changerVue: (vue, ancre) => changerAncre(vue, ancre ?? etat.lire().ancre),

    naviguer(delta) {
      const { vue, ancre } = etat.lire();
      const fz = fuseau();
      const suivante = vue === 'mois' ? ajouterMois(ancre, delta, fz) : vue === 'jour' ? ajouterJours(ancre, delta, fz) : ajouterJours(ancre, 7 * delta, fz);
      return changerAncre(vue, suivante);
    },

    allerAujourdhui: () => changerAncre(etat.lire().vue, horloge()),

    effacerErreur: () => etat.modifier({ erreur: null }),

    maintenant: () => horloge(),

    async lireRelevesFiche(id) {
      try {
        return { ok: true, releves: await depot.lireRelevesFiche(id) };
      } catch {
        return { ok: false, raison: 'Les relevés ne peuvent pas être lus pour le moment : réessaie dans un instant.' };
      }
    },

    async enregistrerReleveContenu(id, releve, saisie) {
      const f = trouver(id);
      if (!f) return { ok: false, erreurs: ['Fiche introuvable.'] };
      if (f.statut !== 'publie') return { ok: false, erreurs: ['Passe la fiche en « Publié » avant de saisir ses statistiques.'] };
      if (!RELEVES.includes(releve)) return { ok: false, erreurs: ['Relevé inconnu.'] };
      const v = validerReleveContenu(saisie);
      if (!v.ok) return v;
      const doc = documentReleveContenu(f, releve, v.valeurs, horloge());
      try {
        await depot.enregistrerReleveContenu(doc);
      } catch {
        return { ok: false, erreurs: ['L’enregistrement a échoué : réessaie dans un instant.'] };
      }
      return { ok: true, erreurs: [], releve: doc };
    },

    async enregistrerReleveCompte(debutSemaineIso, saisie) {
      const v = validerReleveCompte(saisie);
      if (!v.ok) return v;
      const doc = documentReleveCompte(debutSemaineIso, fuseau(), v.valeurs, horloge());
      try {
        await depot.enregistrerReleveCompte(doc);
      } catch {
        return { ok: false, erreurs: ['L’enregistrement a échoué : réessaie dans un instant.'] };
      }
      return { ok: true, erreurs: [], releve: doc };
    },

    async allerAFiche(id, dateHeure) {
      await changerAncre('semaine', dateHeure);
      etat.modifier({ ficheOuverte: id, erreur: null });
    },

    async importerProfil(texte) {
      let profil;
      try {
        profil = JSON.parse(texte);
      } catch (e) {
        return { ok: false, erreurs: [`Ce texte n’est pas du JSON valide : ${e.message}`] };
      }
      try {
        const resultat = await depot.importerProfil(profil, horloge());
        if (resultat.ok) etat.modifier({ vue: 'semaine' });
        return resultat;
      } catch {
        return { ok: false, erreurs: ['L’import a échoué : la base du studio ne répond pas. Réessaie dans un instant.'] };
      }
    },
  };
}
