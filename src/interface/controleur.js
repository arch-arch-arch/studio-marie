import {
  nouvelId, nouvelleFiche, modifierFiche as appliquer, peutPasserA, changerStatut as appliquerStatut, deplacerFiche as deplacer,
  appliquerEvaluation, confirmerProgrammation as confirmerProg, confirmerPublication as confirmerPub, effacementsPour, empreinte,
} from '../logique/fiche.js';
import { ajouterJours, ajouterMois, debutJour, debutSemaine, semainesDuMois } from '../logique/dates.js';
import { verifierRegles } from '../logique/regles-score.js';
import { composerScore, construireExamen } from '../logique/score.js';
import { fichesDeLaSemaine } from '../logique/controle.js';
import { construireDemande, validerReponse, messageErreurSample, CODES_INDISPONIBLES } from '../claude/evaluation.js';
import { validerReference, ficheDeReference, verifierClassement } from '../logique/reference.js';
import { RELEVES, validerReleveContenu, validerReleveCompte, documentReleveContenu, documentReleveCompte } from '../logique/indicateurs.js';
import { periodeAffichee, choisirFiches, codeDossier, attribuerReferences, etatVisuel, contenuDossier, MESSAGE_A_COLLER } from '../logique/dossier.js';
import { lireRetour, validerRetour } from '../logique/retour-dossier.js';
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

export function creerControleur({ etat, depot, enregistreur, assets, horloge, idAleatoire = nouvelId, sample = null, chargerImage = chargerImageParDefaut, downloads = null, connexion = null, veille = null, dossier = null, aleatoire = Math.random, delaiAssistantMs = 10000 }) {
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

  const ANALYSE_INDISPONIBLE = 'L’analyse par dossier n’est pas disponible dans cette vue.';

  let generationAnalyse = 0;

  // Les opérations qui lisent puis écrivent un document analyses s'exécutent l'une après l'autre, par code de dossier.
  const files = new Map();
  function enFile(code, tache) {
    const precedente = files.get(code) ?? Promise.resolve();
    const suite = precedente.catch(() => {}).then(tache);
    files.set(code, suite);
    suite.catch(() => {}).then(() => { if (files.get(code) === suite) files.delete(code); });
    return suite;
  }

  function memeDossier(doc, periode, refs, versionProfil) {
    return doc && !doc.retour && doc.periode?.type === periode.type && doc.periode?.cle === periode.cle
      && (doc.version_profil ?? null) === versionProfil
      && Array.isArray(doc.fiches) && doc.fiches.length === refs.length
      && refs.every((r, k) => doc.fiches[k]?.ref === r.ref && doc.fiches[k]?.id === r.id && doc.fiches[k]?.empreinte === r.empreinte);
  }

  async function ouvrirAnalyse() {
    // Sans await : fermerAnalyse() appelée juste après doit toujours invalider la préparation qui démarre.
    fermerPanneau().catch(() => {});
    if (!dossier) { etat.modifier({ analyse: { etape: 'erreur', message: ANALYSE_INDISPONIBLE } }); return; }
    if (etat.lire().analyse?.etape === 'preparation') return;
    const jeton = ++generationAnalyse;
    const { profil, fiches, vue, ancre } = etat.lire();
    const periode = periodeAffichee(vue, ancre, profil.regles_studio.fuseau);
    const choix = choisirFiches(fiches, periode);
    if (!choix.ok) { etat.modifier({ analyse: { etape: 'erreur', message: choix.raison } }); return; }
    etat.modifier({ analyse: { etape: 'preparation' } });
    try {
      const refs = attribuerReferences(choix.fiches);
      const versionProfil = profil.version ?? null;
      let existant = null;
      const candidat = (etat.lire().analyses ?? []).find(d => memeDossier(d, periode, refs, versionProfil));
      if (candidat) {
        try {
          const frais = await depot.lireAnalyse(candidat.id);
          if (memeDossier(frais, periode, refs, versionProfil)) existant = { id: candidat.id, assistant: frais.assistant };
        } catch { existant = null; }
      }
      const code = existant ? existant.id : codeDossier(aleatoire);
      const fabrique = await dossier.fabrique();
      const provisoire = contenuDossier({ profil, entrees: choix.fiches.map((fiche, i) => ({ ref: refs[i].ref, fiche, etat: etatVisuel(fiche, null) })), periode, code, toutesLesFiches: fiches });
      const demandes = choix.fiches
        .map((fiche, i) => ({ ref: refs[i].ref, etiquette: provisoire.fiches[i].etiquette, visuel: fiche.visuel ?? null, type: fiche.visuel_type ?? null }))
        .filter(d => d.visuel);
      const cartes = await fabrique.preparerCartes(demandes, id => chargerImage(id));
      const entrees = choix.fiches.map((fiche, i) => ({ ref: refs[i].ref, fiche, etat: etatVisuel(fiche, cartes.get(refs[i].ref) ?? null) }));
      const contenu = contenuDossier({ profil, entrees, periode, code, toutesLesFiches: fiches });
      const fichier = await fabrique.assemblerPdf(contenu, cartes);
      if (jeton !== generationAnalyse) return;
      await enFile(code, async () => {
        if (jeton !== generationAnalyse) return;
        const actuel = existant ? await depot.lireAnalyse(code) : null;
        await depot.enregistrerAnalyse(code, {
          periode: { type: periode.type, cle: periode.cle, debut: periode.debut, fin: periode.fin },
          cree_le: horloge(),
          assistant: actuel?.assistant ?? existant?.assistant ?? 'inconnu',
          version_profil: versionProfil,
          sections_profil: contenu.sectionsProfil,
          fiches: entrees.map((e, i) => ({ ...refs[i], visuel: e.etat.visuel, raison_visuel: e.etat.raison_visuel })),
          ...(actuel?.retour ? { retour: actuel.retour } : {}),
        });
      });
      if (jeton !== generationAnalyse) return;
      etat.modifier({ analyse: {
        etape: 'pret', code, periode, nombre: entrees.length, fichier, nom: `analyse-${periode.cle}.pdf`, retour: null,
        sansVisuel: entrees.filter(e => e.etat.visuel === 'non_joint').map(e => e.ref),
      } });
    } catch {
      if (jeton === generationAnalyse) etat.modifier({ analyse: { etape: 'erreur', message: 'Le dossier n’a pas pu être préparé : réessaie.' } });
    }
  }

  // Retour collé sans dossier prêt (onglet rechargé) : enregistrerRetour retrouve le dossier par son code.
  function ouvrirRetour() {
    fermerPanneau().catch(() => {});
    generationAnalyse += 1;
    etat.modifier({ analyse: { etape: 'retour' } });
  }

  function fermerAnalyse() {
    generationAnalyse += 1;
    etat.modifier({ analyse: null });
  }

  const analysePrete = () => (etat.lire().analyse?.etape === 'pret' ? etat.lire().analyse : null);

  const peutPartagerDossier = () => { const a = analysePrete(); return !!a && !!dossier?.peutPartager(a.fichier); };

  async function partagerDossier() {
    const a = analysePrete();
    if (!a || !dossier?.peutPartager(a.fichier)) return { ok: false, message: 'Le partage n’est pas disponible sur cet appareil : télécharge le dossier.' };
    try { await dossier.partager(a.fichier, a.nom); return { ok: true, message: 'Dossier partagé.' }; }
    catch (e) { return e?.name === 'AbortError' ? { ok: false, message: 'Partage annulé.' } : { ok: false, message: 'Le partage a échoué : télécharge le dossier.' }; }
  }

  async function telechargerDossier() {
    const a = analysePrete();
    if (!a || !downloads) return { ok: false, message: 'Le téléchargement n’est pas disponible dans cette vue.' };
    try { await downloads.save({ filename: a.nom, data: a.fichier }); return { ok: true, message: 'Dossier téléchargé.' }; }
    catch { return { ok: false, message: 'Le téléchargement a échoué : réessaie.' }; }
  }

  async function copierMessage() {
    try { await dossier.copier(MESSAGE_A_COLLER); return { ok: true, message: 'Message copié.' }; }
    catch { return { ok: false, message: MESSAGE_A_COLLER }; }
  }

  async function noterAssistant(nom) {
    try {
      const a = analysePrete();
      if (!a || !['claude', 'chatgpt'].includes(nom)) return;
      await enFile(a.code, async () => {
        let abandonne = false;
        let minuterie;
        const limite = new Promise(resolve => { minuterie = setTimeout(() => { abandonne = true; resolve(); }, delaiAssistantMs); });
        const operation = (async () => {
          const doc = await depot.lireAnalyse(a.code);
          if (doc && !abandonne) await depot.enregistrerAnalyse(a.code, { ...doc, assistant: nom });
        })();
        operation.catch(() => {});
        try { await Promise.race([operation, limite]); } finally { clearTimeout(minuterie); }
      });
    } catch { /* l'assistant noté n'est qu'une indication : rien à signaler */ }
  }

  const SESSION_EXPIREE = { ok: false, raison: 'Ta session a expiré : recharge la page pour te reconnecter.' };
  const interruption = (n, m) => ({ ok: false, raison: `L’enregistrement a été interrompu après ${n} fiche${n > 1 ? 's' : ''} sur ${m} : réessaie, les fiches déjà notées seront simplement réécrites.` });
  const AVIS_VIDE = { avis: '', points_forts: [], risques: [], ordre_conseille: [] };

  function enregistrerRetour(texte) {
    const lu = lireRetour(texte);
    if (!lu.ok) return Promise.resolve(lu);
    return enFile(lu.dossier, () => appliquerRetour(lu));
  }

  async function appliquerRetour(lu) {
    let analyse;
    try { analyse = await depot.lireAnalyse(lu.dossier); }
    catch (e) { return e?.code === 'revoked' ? SESSION_EXPIREE : { ok: false, raison: 'Le studio n’a pas pu lire le dossier : réessaie dans un instant.' }; }
    if (!analyse) return { ok: false, raison: 'Ce retour ne correspond à aucun dossier produit par le studio.' };
    const { profil } = etat.lire();
    const v = validerRetour(lu, analyse);
    const ecartees = [];
    const aNoter = [];
    for (const item of v.valides) {
      let actuelle = trouver(item.id);
      if (!actuelle && !supprimeesPendantSession.has(item.id)) {
        await enregistreur.vider(item.id);
        if (enregistreur.estEnAttente(item.id) || enregistreur.enEchec().includes(item.id)) return interruption(0, v.valides.length);
        let relue;
        try { relue = await depot.lireFiche(item.id); }
        catch (e) { return e?.code === 'revoked' ? SESSION_EXPIREE : interruption(0, v.valides.length); }
        actuelle = trouver(item.id) ?? (supprimeesPendantSession.has(item.id) ? null : relue);
      }
      if (!actuelle) { ecartees.push({ ref: item.ref, raison: 'fiche supprimée depuis le dossier' }); continue; }
      if (actuelle.statut === 'publie') { ecartees.push({ ref: item.ref, raison: 'fiche publiée depuis le dossier' }); continue; }
      if (empreinte(actuelle) !== item.empreinte) { ecartees.push({ ref: item.ref, raison: 'fiche modifiée depuis le dossier : refais une analyse' }); continue; }
      aNoter.push({ item });
    }
    const appliquees = [];
    let ecarteesEnEcriture = 0;
    const ecarter = (item, raison) => { ecartees.push({ ref: item.ref, raison }); ecarteesEnEcriture += 1; };
    for (const { item } of aNoter) {
      // Une fiche sortie de l'état est relue en base (écritures en attente vidées d'abord) : jamais la capture du calcul.
      let relue = null;
      if (!trouver(item.id) && !supprimeesPendantSession.has(item.id)) {
        await enregistreur.vider(item.id);
        if (enregistreur.estEnAttente(item.id) || enregistreur.enEchec().includes(item.id)) return interruption(appliquees.length, aNoter.length - ecarteesEnEcriture);
        try { relue = await depot.lireFiche(item.id); }
        catch (e) { return e?.code === 'revoked' ? SESSION_EXPIREE : interruption(appliquees.length, aNoter.length - ecarteesEnEcriture); }
      }
      // Aucun await entre cette reprise de la fiche courante et remplacer(g) : rien ne peut s'intercaler.
      const actuelle = supprimeesPendantSession.has(item.id) ? null : (trouver(item.id) ?? relue);
      if (!actuelle) { ecarter(item, 'fiche supprimée depuis le dossier'); continue; }
      if (actuelle.statut === 'publie') { ecarter(item, 'fiche publiée depuis le dossier'); continue; }
      if (empreinte(actuelle) !== item.empreinte) { ecarter(item, 'fiche modifiée depuis le dossier : refais une analyse'); continue; }
      const verification = verifierRegles(actuelle, profil.regles_studio);
      const duDossier = analyse.fiches.find(f => f.ref === item.ref);
      const examen = {
        ...construireExamen({ visuel: duDossier.visuel, raison_visuel: duDossier.raison_visuel, version_profil: analyse.version_profil ?? profil.version ?? null, sections_profil: analyse.sections_profil ?? [], contenus_semaine: analyse.fiches.length - 1, verification }),
        source: 'dossier', assistant: analyse.assistant ?? 'inconnu',
      };
      const score = composerScore({ fiche: actuelle, verification, jugement: item.jugement, versionProfil: profil.version, maintenant: horloge(), examen });
      const g = verrouillerSiRouge(appliquerEvaluation(actuelle, {
        score, variantes: item.jugement.captions,
        suggestions: { accroches: item.jugement.accroches, hashtags: item.jugement.hashtags },
        recommandations: item.jugement.recommandations,
      }, horloge()));
      remplacer(g);
      await ecrireMaintenant(g);
      if (enregistreur.enEchec().includes(g.id)) return interruption(appliquees.length, aNoter.length - ecarteesEnEcriture);
      appliquees.push(item.id);
    }
    const toutes = [...v.ecartees, ...ecartees].sort((a, b) => a.ref.localeCompare(b.ref));
    const resultat = { ok: true, appliquees: appliquees.length, ecartees: toutes, avisRecu: !!v.periode };
    try {
      const frais = (await depot.lireAnalyse(lu.dossier)) ?? analyse;
      const avis = v.periode ?? (frais.retour?.avis ? {
        avis: frais.retour.avis, points_forts: frais.retour.points_forts ?? [], risques: frais.retour.risques ?? [], ordre_conseille: frais.retour.ordre_conseille ?? [],
      } : AVIS_VIDE);
      await depot.enregistrerAnalyse(lu.dossier, { ...frais, retour: { recu_le: horloge(), ...avis, appliquees, ecartees: toutes } });
    } catch (e) {
      if (e?.code === 'revoked') return SESSION_EXPIREE;
      return { ok: false, raison: 'Les fiches sont notées, mais l’avis d’ensemble n’a pas pu être enregistré : réessaie.' };
    }
    if (etat.lire().analyse?.etape === 'pret') etat.modifier({ analyse: { ...etat.lire().analyse, retour: resultat } });
    return resultat;
  }

  return {
    urlVisuel: async id => (typeof assets?.url === 'function' ? assets.url(id) : `/_blob/${id}`),
    ouvrirFiche: id => etat.modifier({ ficheOuverte: id, erreur: null }),
    fermerPanneau,
    modifierFiche,
    evaluerFiche,
    evaluationDisponible: () => !evaluationIndisponible,
    seDeconnecter: async () => {
      await enregistreur.viderTout();
      if (enregistreur.enEchec().length > 0) {
        etat.modifier({ erreur: 'Des modifications ne sont pas encore enregistrées : attends le retour de la connexion avant de te déconnecter.' });
        return;
      }
      await connexion?.deconnecter();
    },
    reverifierFiches,
    ouvrirAnalyse,
    ouvrirRetour,
    fermerAnalyse,
    partagerDossier,
    peutPartagerDossier,
    telechargerDossier,
    copierMessage,
    noterAssistant,
    enregistrerRetour,
    relancerVeille: async () => {
      if (!veille) return { ok: false, raison: 'La veille n’est pas encore configurée.' };
      if (etat.lire().veille?.enCours) return { ok: false, raison: 'Une veille est déjà en cours.' };
      etat.modifier({ veille: { enCours: true, message: 'Veille en cours : cela peut prendre quelques minutes.' } });
      let r;
      try {
        r = await veille.relancer();
      } catch {
        r = { ok: false, raison: 'La veille a échoué : réessaie dans quelques minutes. Rien n’a été modifié.' };
      }
      etat.modifier({ veille: { enCours: false, message: r.ok ? r.message : r.raison } });
      return r;
    },
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
