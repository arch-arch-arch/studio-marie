import { h } from './h.js';
import { creerEtat } from './etat.js';
import { creerControleur, plageDeVue, fusionnerInstantane } from './controleur.js';
import { creerRendu } from './rendu.js';
import { creerDepot } from '../donnees/depot.js';
import { creerEnregistreur } from '../donnees/enregistreur.js';
import { cleSemaineIso, debutSemaine } from '../logique/dates.js';

function messageErreurBase(e) {
  if (e?.code === 'revoked') return 'L’accès au studio a été retiré pour cette vue.';
  if (e?.code === 'quota_exceeded') return 'La base du studio est pleine : supprime d’anciennes fiches avant d’en créer d’autres.';
  return 'La base du studio ne répond pas. Recharge la page dans un instant.';
}

export async function demarrer(racine, claude, { horloge = () => new Date().toISOString(), delaiEnregistrement = 600 } = {}) {
  racine.replaceChildren(h('p', { class: 'aide' }, 'Chargement du studio…'));
  const db = (await claude?.use?.('db')) ?? null;
  if (!db) {
    racine.replaceChildren(h('div', { class: 'indisponible' },
      h('h1', {}, 'Studio Contenu'),
      h('p', {}, 'La base du studio n’est pas accessible depuis cette vue. Ouvre le studio sur claude.ai avec un compte qui y a accès.')));
    return null;
  }
  const assets = (await claude.use('assets')) ?? null;
  const sample = (await claude.use('sample')) ?? null;
  const downloads = (await claude.use('downloads')) ?? null;
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
  const actions = creerControleur({ etat, depot, enregistreur, assets, horloge, sample, downloads });
  const rendre = creerRendu(racine, actions, { assets: !!assets, sample: !!sample, downloads: !!downloads }, horloge);

  let arreterFiches = null;
  let plageCourante = '';
  let arreterBulletin = null;
  let cleBulletinCourante = '';
  let derniereVersionVerifiee = null;
  let statsDemarrees = false;
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
        depot.ecouterStats(jours(84), stats => etat.modifier({ stats }), err => etat.modifier({ erreur: messageErreurBase(err), stats: [] }));
        depot.ecouterRelevesCompte(relevesCompte => etat.modifier({ relevesCompte }), err => etat.modifier({ erreur: messageErreurBase(err), relevesCompte: [] }));
        depot.ecouterFiches(jours(14), new Date(maintenant + 86400000).toISOString(), fichesRecentes => etat.modifier({ fichesRecentes }), err => etat.modifier({ erreur: messageErreurBase(err) }));
      }
      const fz = e.profil.regles_studio.fuseau;
      const [debut, fin] = plageDeVue(e.vue, e.ancre, fz);
      if (`${debut}|${fin}` !== plageCourante) {
        plageCourante = `${debut}|${fin}`;
        arreterFiches?.();
        arreterFiches = depot.ecouterFiches(debut, fin,
          recues => {
            etat.modifier({ fiches: fusionnerInstantane(recues, etat.lire().fiches, enregistreur.estEnAttente) });
            actions.reverifierFiches();
          },
          err => etat.modifier({ erreur: messageErreurBase(err) }));
      }
      const cle = cleSemaineIso(debutSemaine(e.ancre, fz), fz);
      if (cle !== cleBulletinCourante) {
        cleBulletinCourante = cle;
        arreterBulletin?.();
        etat.modifier({ bulletin: undefined });
        arreterBulletin = depot.ecouterBulletin(cle, bulletin => etat.modifier({ bulletin }), err => etat.modifier({ erreur: messageErreurBase(err), bulletin: null }));
      }
    }
    rendre(etat.lire());
  });

  depot.ecouterProfil(
    profil => etat.modifier({ profil, vue: profil ? etat.lire().vue : 'profil' }),
    err => etat.modifier({ erreur: messageErreurBase(err) }),
  );
  depot.ecouterReference(reference => etat.modifier({ reference }), err => etat.modifier({ erreur: messageErreurBase(err) }));
  depot.ecouterResultatReference(resultatReference => etat.modifier({ resultatReference }), err => etat.modifier({ erreur: messageErreurBase(err) }));
  depot.ecouterConfigVeille(configVeille => etat.modifier({ configVeille }), err => etat.modifier({ erreur: messageErreurBase(err) }));
  if (typeof window !== 'undefined') window.addEventListener('pagehide', () => { enregistreur.viderTout(); });
  if (typeof document !== 'undefined') {
    const bloquerDepotFichier = e => { if (e.dataTransfer?.types?.includes?.('Files')) e.preventDefault(); };
    document.addEventListener('dragover', bloquerDepotFichier);
    document.addEventListener('drop', bloquerDepotFichier);
  }
  rendre(etat.lire());
  return { etat, actions };
}
