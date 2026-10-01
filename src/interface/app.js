import { h } from './h.js';
import { creerEtat } from './etat.js';
import { creerControleur, plageDeVue, fusionnerInstantane } from './controleur.js';
import { creerRendu } from './rendu.js';
import { creerDepot } from '../donnees/depot.js';
import { creerEnregistreur } from '../donnees/enregistreur.js';
import { cleSemaineIso, debutSemaine } from '../logique/dates.js';

const MESSAGE_BASE_INDISPONIBLE = 'La base du studio ne répond pas. Recharge la page dans un instant.';

function messageErreurBase(e) {
  if (e?.code === 'revoked') return 'Ta session a expiré : recharge la page pour te reconnecter.';
  if (e?.code === 'quota_exceeded') return 'La base du studio est pleine : supprime d’anciennes fiches avant d’en créer d’autres.';
  return MESSAGE_BASE_INDISPONIBLE;
}

export async function demarrer(racine, claude, { horloge = () => new Date().toISOString(), delaiEnregistrement = 600 } = {}) {
  racine.replaceChildren(h('p', { class: 'aide' }, 'Chargement du studio…'));
  const db = (await claude?.use?.('db')) ?? null;
  if (!db) {
    racine.replaceChildren(h('div', { class: 'indisponible' },
      h('h1', {}, 'Studio Contenu'),
      h('p', {}, 'Le studio n’a pas pu ouvrir sa base. Recharge la page dans un instant.')));
    return null;
  }
  const assets = (await claude.use('assets')) ?? null;
  const sample = (await claude.use('sample')) ?? null;
  const veille = (await claude.use('veille')) ?? null;
  const downloads = (await claude.use('downloads')) ?? null;
  const connexion = (await claude.use('connexion')) ?? null;
  const depot = creerDepot(db);
  const etat = creerEtat({ profil: undefined, fiches: [], vue: 'semaine', ancre: horloge(), ficheOuverte: null, erreur: null, sauvegarde: 'ok', reference: [], resultatReference: null, verificationReference: null, bulletin: undefined, configVeille: null, stats: undefined, relevesCompte: undefined, fichesRecentes: [] });
  const enregistreur = creerEnregistreur(
    async fiche => {
      etat.modifier({ sauvegarde: 'en_cours' });
      await depot.enregistrerFiche(fiche);
      const enErreur = enregistreur.enEchec().some(id => id !== fiche.id);
      etat.modifier({ sauvegarde: enErreur ? 'erreur' : 'ok' });
    },
    delaiEnregistrement,
    e => {
      etat.modifier({ sauvegarde: enregistreur.enEchec().length > 0 ? 'erreur' : 'ok' });
      if (e?.code === 'quota_exceeded' || e?.code === 'revoked') etat.modifier({ erreur: messageErreurBase(e) });
    },
  );
  const actions = creerControleur({ etat, depot, enregistreur, assets, horloge, sample, downloads, connexion, veille, ...(typeof assets?.telecharger === 'function' ? { chargerImage: id => assets.telecharger(id) } : {}) });
  const rendre = creerRendu(racine, actions, { assets: !!assets, sample: !!sample, downloads: !!downloads, connexion: !!connexion, veille: !!veille }, horloge);

  let arreterFiches = null;
  let plageCourante = '';
  let arreterBulletin = null;
  let cleBulletinCourante = '';
  let derniereVersionVerifiee = null;
  let statsDemarrees = false;
  // Un instantané qui arrive après une erreur de base efface le bandeau « base indisponible », mais pas un autre message non lu.
  const recu = champs => etat.modifier(etat.lire().erreur === MESSAGE_BASE_INDISPONIBLE ? { ...champs, erreur: null } : champs);
  // Une erreur de base garde l'état précédent affiché ; seule une session révoquée le vide (et un état encore en chargement est débloqué).
  const echec = (err, champ, vide) => etat.modifier({ erreur: messageErreurBase(err), ...(err?.code === 'revoked' || etat.lire()[champ] === undefined ? { [champ]: vide } : {}) });
  etat.abonner(e => {
    if (e.profil && e.profil.version !== derniereVersionVerifiee) {
      derniereVersionVerifiee = e.profil.version;
      actions.reverifierFiches();
    }
    if (e.profil) {
      if (!statsDemarrees) {
        statsDemarrees = true;
        const maintenant = Date.parse(horloge());
        const jours = n => new Date(maintenant - n * 86400000).toISOString();
        depot.ecouterStats(jours(84), stats => recu({ stats }), err => echec(err, 'stats', []));
        depot.ecouterRelevesCompte(relevesCompte => recu({ relevesCompte }), err => echec(err, 'relevesCompte', []));
        depot.ecouterFiches(jours(14), new Date(maintenant + 86400000).toISOString(), fichesRecentes => recu({ fichesRecentes }), err => etat.modifier({ erreur: messageErreurBase(err) }));
      }
      const fz = e.profil.regles_studio.fuseau;
      const [debut, fin] = plageDeVue(e.vue, e.ancre, fz);
      if (`${debut}|${fin}` !== plageCourante) {
        plageCourante = `${debut}|${fin}`;
        arreterFiches?.();
        arreterFiches = depot.ecouterFiches(debut, fin,
          recues => {
            recu({ fiches: fusionnerInstantane(recues, etat.lire().fiches, enregistreur.estEnAttente) });
            actions.reverifierFiches();
          },
          err => etat.modifier({ erreur: messageErreurBase(err) }));
      }
      const cle = cleSemaineIso(debutSemaine(e.ancre, fz), fz);
      if (cle !== cleBulletinCourante) {
        cleBulletinCourante = cle;
        arreterBulletin?.();
        etat.modifier({ bulletin: undefined });
        arreterBulletin = depot.ecouterBulletin(cle, bulletin => recu({ bulletin }), err => echec(err, 'bulletin', null));
      }
    }
    rendre(etat.lire());
  });

  depot.ecouterProfil(
    profil => recu({ profil, vue: profil ? etat.lire().vue : 'profil' }),
    err => etat.modifier({ erreur: messageErreurBase(err) }),
  );
  depot.ecouterReference(reference => recu({ reference }), err => etat.modifier({ erreur: messageErreurBase(err) }));
  depot.ecouterResultatReference(resultatReference => recu({ resultatReference }), err => etat.modifier({ erreur: messageErreurBase(err) }));
  depot.ecouterConfigVeille(configVeille => recu({ configVeille }), err => etat.modifier({ erreur: messageErreurBase(err) }));
  if (typeof window !== 'undefined') window.addEventListener('pagehide', () => { enregistreur.viderTout(); });
  if (typeof document !== 'undefined') {
    const bloquerDepotFichier = e => { if (e.dataTransfer?.types?.includes?.('Files')) e.preventDefault(); };
    document.addEventListener('dragover', bloquerDepotFichier);
    document.addEventListener('drop', bloquerDepotFichier);
  }
  rendre(etat.lire());
  return { etat, actions };
}
