import {
  nouvelId, nouvelleFiche, modifierFiche as appliquer, peutPasserA, changerStatut as appliquerStatut, deplacerFiche as deplacer,
} from '../logique/fiche.js';
import { ajouterJours, ajouterMois, debutJour, debutSemaine, semainesDuMois } from '../logique/dates.js';

const MESSAGES_TELEVERSEMENT = {
  too_large: 'Fichier trop lourd (20 Mo au maximum).',
  unsupported_type: 'Ce type de fichier n’est pas accepté.',
  rate_limited: 'Trop d’envois d’un coup : réessaie dans un instant.',
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

export function creerControleur({ etat, depot, enregistreur, assets, horloge, idAleatoire = nouvelId }) {
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

  return {
    ouvrirFiche: id => etat.modifier({ ficheOuverte: id, erreur: null }),
    fermerPanneau,
    modifierFiche,

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
      const verification = peutPasserA(f, cible);
      if (!verification.ok) {
        etat.modifier({ erreur: verification.raison });
        return verification;
      }
      const g = appliquerStatut(f, cible, horloge());
      remplacer(g);
      etat.modifier({ erreur: null });
      await ecrireMaintenant(g);
      return verification;
    },

    async supprimerFiche(id) {
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
