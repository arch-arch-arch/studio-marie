// @vitest-environment happy-dom
import { describe, it, expect, vi } from 'vitest';
import fictif from '../../exemples/profil-fictif.json';
import { creerFausseBase } from '../aides/fausseBase.js';
import { demarrer } from '../../src/interface/app.js';
import { creerRendu } from '../../src/interface/rendu.js';
import { construireExport } from '../../src/logique/sauvegarde.js';
import { nouvelleFiche, appliquerEvaluation, changerStatut, empreinte } from '../../src/logique/fiche.js';

const horloge = () => '2026-09-28T08:00:00.000Z';
const T = horloge();

function ficheValideDirecte({ id, date_heure, caption }) {
  const base = nouvelleFiche({ id, format: 'reel', date_heure, pilier: 'socio', maintenant: T });
  const f = {
    ...base, visuel: 'a1', visuel_type: 'image', accroche: 'Une accroche correcte',
    caption, hashtags: ['nuit', 'socio', 'humour'],
  };
  const score = { total: 80, criteres: [], conformite: { etat: 'vert', causes: [] }, empreinte: empreinte(f) };
  const evaluee = appliquerEvaluation(f, {
    score, variantes: [], suggestions: { accroches: [], hashtags: [] }, recommandations: ['R1', 'R2', 'R3'],
  }, T);
  return changerStatut(evaluee, 'valide', T);
}

describe('demarrer', () => {
  it('affiche un message clair quand la base est indisponible', async () => {
    const racine = document.createElement('div');
    expect(await demarrer(racine, { use: async () => null }, { horloge })).toBeNull();
    expect(racine.textContent).toContain('Le studio n’a pas pu ouvrir sa base. Recharge la page dans un instant.');
    expect(racine.textContent).not.toContain('claude.ai');
  });

  it('affiche aussi le message quand window.claude est absent', async () => {
    const racine = document.createElement('div');
    await demarrer(racine, undefined, { horloge });
    expect(racine.textContent).toContain('pas pu ouvrir sa base');
  });

  it('affiche le message de session expirée pour une erreur revoked', async () => {
    const reelle = creerFausseBase();
    const db = {
      ...reelle,
      doc(chemin) {
        if (chemin === 'profil/courant') return { ...reelle.doc(chemin), onSnapshot: (suivant, erreur) => { erreur({ code: 'revoked' }); return () => {}; } };
        return reelle.doc(chemin);
      },
    };
    const racine = document.createElement('div');
    await demarrer(racine, { use: async nom => (nom === 'db' ? db : null) }, { horloge });
    expect(racine.textContent).toContain('Ta session a expiré : recharge la page pour te reconnecter.');
  });

  function baseAvecStatsPilotables() {
    const reelle = creerFausseBase();
    const ecoutes = { stats: null, bulletin: null };
    const db = {
      ...reelle,
      collection(nom) {
        const c = reelle.collection(nom);
        if (nom !== 'stats_contenu') return c;
        return { ...c, where: (...a) => { const w = c.where(...a); return { ...w, onSnapshot: (s, e) => { ecoutes.stats = { s, e }; return w.onSnapshot(s, e); } }; } };
      },
      doc(chemin) {
        const d = reelle.doc(chemin);
        if (!chemin.startsWith('bulletins/')) return d;
        return { ...d, onSnapshot: (s, e) => { ecoutes.bulletin = { s, e }; return d.onSnapshot(s, e); } };
      },
    };
    return { db, ecoutes };
  }
  const instantaneStats = () => ({ docs: [{ id: 'x_48h', data: () => ({ fiche: 'x', releve: '48h' }) }] });
  const instantaneBulletin = () => ({ exists: true, data: () => ({ semaine: '2026-W40' }) });

  it('garde stats et bulletin affichés quand une erreur unavailable arrive, puis efface le bandeau au prochain instantané', async () => {
    const { db, ecoutes } = baseAvecStatsPilotables();
    const racine = document.createElement('div');
    const app = await demarrer(racine, { use: async nom => (nom === 'db' ? db : null) }, { horloge });
    await app.actions.importerProfil(JSON.stringify(fictif));
    await vi.waitFor(() => expect(ecoutes.stats && ecoutes.bulletin).toBeTruthy());
    ecoutes.stats.s(instantaneStats());
    ecoutes.bulletin.s(instantaneBulletin());
    expect(app.etat.lire().stats).toHaveLength(1);
    ecoutes.stats.e({ code: 'unavailable' });
    ecoutes.bulletin.e({ code: 'unavailable' });
    expect(app.etat.lire().erreur).toBe('La base du studio ne répond pas. Recharge la page dans un instant.');
    expect(app.etat.lire().stats).toHaveLength(1);
    expect(app.etat.lire().bulletin).toEqual({ semaine: '2026-W40' });
    expect(racine.textContent).toContain('La base du studio ne répond pas.');
    ecoutes.stats.s(instantaneStats());
    expect(app.etat.lire().erreur).toBeNull();
    expect(racine.textContent).not.toContain('La base du studio ne répond pas.');
  });

  it('vide encore stats et bulletin sur une erreur revoked', async () => {
    const { db, ecoutes } = baseAvecStatsPilotables();
    const racine = document.createElement('div');
    const app = await demarrer(racine, { use: async nom => (nom === 'db' ? db : null) }, { horloge });
    await app.actions.importerProfil(JSON.stringify(fictif));
    await vi.waitFor(() => expect(ecoutes.stats && ecoutes.bulletin).toBeTruthy());
    ecoutes.stats.s(instantaneStats());
    ecoutes.bulletin.s(instantaneBulletin());
    ecoutes.stats.e({ code: 'revoked' });
    ecoutes.bulletin.e({ code: 'revoked' });
    expect(app.etat.lire().stats).toEqual([]);
    expect(app.etat.lire().bulletin).toBeNull();
    expect(app.etat.lire().erreur).toBe('Ta session a expiré : recharge la page pour te reconnecter.');
    ecoutes.stats.s(instantaneStats());
    expect(app.etat.lire().erreur).toBe('Ta session a expiré : recharge la page pour te reconnecter.');
  });

  it('n’efface pas un autre message d’erreur quand un instantané arrive', async () => {
    const { db, ecoutes } = baseAvecStatsPilotables();
    const racine = document.createElement('div');
    const app = await demarrer(racine, { use: async nom => (nom === 'db' ? db : null) }, { horloge });
    await app.actions.importerProfil(JSON.stringify(fictif));
    await vi.waitFor(() => expect(ecoutes.stats).toBeTruthy());
    app.etat.modifier({ erreur: 'Un autre message pas encore lu.' });
    ecoutes.stats.s(instantaneStats());
    expect(app.etat.lire().erreur).toBe('Un autre message pas encore lu.');
  });

  it('ouvre l’onglet Profil tant qu’aucun profil n’est importé, puis la semaine', async () => {
    const db = creerFausseBase();
    const racine = document.createElement('div');
    const app = await demarrer(racine, { use: async nom => (nom === 'db' ? db : null) }, { horloge });
    expect(app.etat.lire().vue).toBe('profil');
    expect(racine.querySelector('#profil-json')).not.toBeNull();
    await app.actions.importerProfil(JSON.stringify(fictif));
    expect(app.etat.lire().vue).toBe('semaine');
    expect(racine.querySelector('.barre .titre').textContent).toBe('Studio');
  });

  it('affiche l’erreur de base même avant le premier instantané du profil', async () => {
    const reelle = creerFausseBase();
    const db = {
      ...reelle,
      doc(chemin) {
        if (chemin === 'profil/courant') {
          return { ...reelle.doc(chemin), onSnapshot: (suivant, erreur) => { erreur({ code: 'revoked' }); return () => {}; } };
        }
        return reelle.doc(chemin);
      },
    };
    const racine = document.createElement('div');
    await demarrer(racine, { use: async nom => (nom === 'db' ? db : null) }, { horloge });
    expect(racine.textContent).toContain('Ta session a expiré : recharge la page pour te reconnecter.');
    expect(racine.textContent).not.toContain('Chargement du studio…');
  });

  it('affiche un message clair et l’indicateur en échec quand la base est pleine', async () => {
    const reelle = creerFausseBase();
    let appel = 0;
    const db = {
      ...reelle,
      doc(chemin) {
        const d = reelle.doc(chemin);
        if (!chemin.startsWith('fiches/')) return d;
        return {
          ...d,
          async set(corps) {
            appel += 1;
            if (appel === 2) throw { code: 'quota_exceeded' };
            return d.set(corps);
          },
        };
      },
    };
    const racine = document.createElement('div');
    const app = await demarrer(racine, { use: async nom => (nom === 'db' ? db : null) }, { horloge });
    await app.actions.importerProfil(JSON.stringify(fictif));
    const f = await app.actions.creerFiche({ format: 'reel', date_heure: '2026-09-28T10:00:00.000Z' });
    app.actions.modifierFiche(f.id, { accroche: 'x' });
    await app.actions.fermerPanneau();
    expect(racine.textContent).toContain('La base du studio est pleine');
    expect(racine.querySelector('.sauvegarde').className).toContain('sauvegarde-erreur');
    await new Promise(r => setTimeout(r, 650)); // laisse la nouvelle tentative automatique se terminer proprement
  });

  it('empêche un fichier lâché hors de la zone prévue de quitter la page', async () => {
    const db = creerFausseBase();
    const racine = document.createElement('div');
    await demarrer(racine, { use: async nom => (nom === 'db' ? db : null) }, { horloge });
    const evt = new Event('drop', { cancelable: true });
    Object.defineProperty(evt, 'dataTransfer', { value: { types: ['Files'] } });
    document.dispatchEvent(evt);
    expect(evt.defaultPrevented).toBe(true);
  });

  it('transmet la capacité sample au contrôleur', async () => {
    const db = creerFausseBase();
    const sample = Object.assign(async () => ({}), { json: vi.fn(async () => ({})), limits: async () => ({}) });
    const racine = document.createElement('div');
    const app = await demarrer(racine, { use: async nom => (nom === 'db' ? db : nom === 'sample' ? sample : null) }, { horloge });
    await app.actions.importerProfil(JSON.stringify(fictif));
    await app.actions.creerFiche({ format: 'reel', date_heure: '2026-09-28T10:00:00.000Z' });
    await app.actions.evaluerFiche(app.etat.lire().ficheOuverte);
    expect(sample.json).toHaveBeenCalledTimes(1);
  });

  it('réimporter le profil repasse en brouillon les fiches validées que les nouvelles règles bloquent', async () => {
    const REPONSE = {
      notes: { accroche: 8, voix: 7, mecanique: 6 },
      phrases: { accroche: 'A.', voix: 'V.', mecanique: 'M.' },
      conformite: { etat: 'vert', causes: [] },
      captions: [{ role: 'engagement', texte: 'Variante A' }, { role: 'deadpan', texte: 'Variante B' }],
      accroches: ['Acc 1', 'Acc 2'],
      hashtags: ['nuit', 'socio'],
      recommandations: ['R1', 'R2', 'R3'],
    };
    const db = creerFausseBase();
    const sample = Object.assign(vi.fn(), { limits: async () => ({}), json: vi.fn(async () => REPONSE) });
    const racine = document.createElement('div');
    const app = await demarrer(racine, { use: async nom => (nom === 'db' ? db : nom === 'sample' ? sample : null) }, { horloge });
    await app.actions.importerProfil(JSON.stringify(fictif));
    const f = await app.actions.creerFiche({ format: 'reel', date_heure: '2026-09-28T10:00:00.000Z' });
    app.actions.modifierFiche(f.id, {
      accroche: 'Tu relis ce message.', caption: 'Une ligne. Dis-moi en commentaire.',
      hashtags: ['nuit', 'socio', 'humour'], visuel: 'a1', visuel_type: 'image',
    });
    await app.actions.fermerPanneau();
    await app.actions.evaluerFiche(f.id);
    expect(await app.actions.changerStatut(f.id, 'valide')).toEqual({ ok: true });

    const bloque = { ...fictif, regles_studio: { ...fictif.regles_studio, mots_a_eviter: [...fictif.regles_studio.mots_a_eviter, 'ligne'] } };
    await app.actions.importerProfil(JSON.stringify(bloque));

    expect(app.etat.lire().fiches.find(x => x.id === f.id).statut).toBe('brouillon');
    await vi.waitFor(() => expect(app.etat.lire().erreur).toBe('1 fiche(s) repassée(s) en Brouillon : le profil actuel les bloque.'));
  });

  it('rétrograde une fiche déjà bloquée par le profil dès le premier instantané de fiches, au démarrage', async () => {
    const db = creerFausseBase();
    const bloquant = { ...fictif, regles_studio: { ...fictif.regles_studio, mots_a_eviter: [...fictif.regles_studio.mots_a_eviter, 'ligne'] } };
    await db.doc('profil/courant').set({ ...bloquant, version: 1, importe_le: T });
    const f = ficheValideDirecte({ id: 'f-bloquee', date_heure: '2026-09-28T10:00:00.000Z', caption: 'Une ligne. Dis-moi en commentaire.' });
    const { id, ...corps } = f;
    await db.doc(`fiches/${id}`).set(corps);

    const racine = document.createElement('div');
    const app = await demarrer(racine, { use: async nom => (nom === 'db' ? db : null) }, { horloge });

    await vi.waitFor(() => expect(app.etat.lire().fiches.find(x => x.id === 'f-bloquee')?.statut).toBe('brouillon'));
    await vi.waitFor(() => expect(db._docs.get('fiches/f-bloquee')?.statut).toBe('brouillon'));
  });

  it('rétrograde une fiche bloquée qui arrive par navigation, après un réimport de profil pendant qu’elle n’était pas chargée', async () => {
    const db = creerFausseBase();
    const racine = document.createElement('div');
    const app = await demarrer(racine, { use: async nom => (nom === 'db' ? db : null) }, { horloge });
    await app.actions.importerProfil(JSON.stringify(fictif));

    const f = ficheValideDirecte({ id: 'f-loin', date_heure: '2026-10-05T10:00:00.000Z', caption: 'Une ligne. Dis-moi en commentaire.' });
    const { id, ...corps } = f;
    await db.doc(`fiches/${id}`).set(corps);

    const bloque = { ...fictif, regles_studio: { ...fictif.regles_studio, mots_a_eviter: [...fictif.regles_studio.mots_a_eviter, 'ligne'] } };
    await app.actions.importerProfil(JSON.stringify(bloque));
    expect(app.etat.lire().fiches.some(x => x.id === 'f-loin')).toBe(false);

    await app.actions.naviguer(1);
    await vi.waitFor(() => expect(app.etat.lire().fiches.find(x => x.id === 'f-loin')?.statut).toBe('brouillon'));
    await vi.waitFor(() => expect(db._docs.get('fiches/f-loin')?.statut).toBe('brouillon'));
  });

  it('ne réécrit pas une fiche déjà rétrogradée à chaque nouvel instantané de fiches', async () => {
    const db = creerFausseBase();
    const bloquant = { ...fictif, regles_studio: { ...fictif.regles_studio, mots_a_eviter: [...fictif.regles_studio.mots_a_eviter, 'ligne'] } };
    await db.doc('profil/courant').set({ ...bloquant, version: 1, importe_le: T });
    const f = ficheValideDirecte({ id: 'f-stable', date_heure: '2026-09-28T10:00:00.000Z', caption: 'Une ligne. Dis-moi en commentaire.' });
    const { id, ...corps } = f;
    await db.doc(`fiches/${id}`).set(corps);

    const racine = document.createElement('div');
    await demarrer(racine, { use: async nom => (nom === 'db' ? db : null) }, { horloge });
    await vi.waitFor(() => expect(db._docs.get('fiches/f-stable')?.statut).toBe('brouillon'));
    const ecrituresApres = db.ecritures.filter(e => e === 'fiches/f-stable').length;

    for (let i = 0; i < 3; i++) {
      await db.doc(`fiches/autre-${i}`).set({ date_heure: '2026-09-28T11:00:00.000Z', format: 'reel', statut: 'idee' });
    }
    await new Promise(r => setTimeout(r, 20));

    expect(db.ecritures.filter(e => e === 'fiches/f-stable').length).toBe(ecrituresApres);
  });

  it('propose « Évaluer » dans la fiche quand la capacité sample existe', async () => {
    const db = creerFausseBase();
    const sample = Object.assign(async () => ({}), { json: async () => ({}), limits: async () => ({}) });
    const racine = document.createElement('div');
    const app = await demarrer(racine, { use: async nom => (nom === 'db' ? db : nom === 'sample' ? sample : null) }, { horloge });
    await app.actions.importerProfil(JSON.stringify(fictif));
    await app.actions.creerFiche({ format: 'reel', date_heure: '2026-09-28T10:00:00.000Z' });
    expect([...racine.querySelectorAll('button')].some(b => b.textContent === 'Évaluer')).toBe(true);
  });

  it('affiche le bulletin de la semaine dans l’onglet Bulletin', async () => {
    const db = creerFausseBase();
    const racine = document.createElement('div');
    const app = await demarrer(racine, { use: async nom => (nom === 'db' ? db : null) }, { horloge });
    await app.actions.importerProfil(JSON.stringify(fictif));
    await db.doc('bulletins/2026-W40').set({ semaine: '2026-W40', genere_le: horloge(), statut: 'complet', sources_indisponibles: false, retrospective: { type: 'rappel', texte: 'Rappel.' }, tendances: [], ecartees: [], alertes: [], idees: [], hors_creneau: [], controle: [] });
    await app.actions.changerVue('bulletin');
    expect(racine.textContent).toContain('Semaine 2026-W40');
  });

  it('débloque l’onglet Bulletin (au lieu de rester sur « Chargement… ») quand l’écoute du bulletin échoue', async () => {
    const reelle = creerFausseBase();
    const db = {
      ...reelle,
      doc(chemin) {
        if (chemin.startsWith('bulletins/')) {
          return { ...reelle.doc(chemin), onSnapshot: (suivant, erreur) => { erreur({ code: 'revoked' }); return () => {}; } };
        }
        return reelle.doc(chemin);
      },
    };
    const racine = document.createElement('div');
    const app = await demarrer(racine, { use: async nom => (nom === 'db' ? db : null) }, { horloge });
    await app.actions.importerProfil(JSON.stringify(fictif));
    expect(app.etat.lire().bulletin).toBeNull();
  });

  it('affiche le tableau de bord avec les relevés de la base', async () => {
    const db = creerFausseBase();
    await db.doc('profil/courant').set({ ...fictif, version: 1 });
    await db.doc('stats_contenu/a_7j').set({ fiche: 'a', releve: '7j', vues: 1000, nouveaux_abonnes: 5, partages_envois: 12, date_publication: '2026-09-15T10:00:00.000Z', format: 'reel', pilier: 'socio', accroche: 'Accroche fictive', score_total: 70 });
    const racine = document.createElement('div');
    const app = await demarrer(racine, { use: async nom => (nom === 'db' ? db : null) }, { horloge });
    await app.actions.changerVue('tableau');
    await vi.waitFor(() => expect(racine.textContent).toContain('Accroche fictive'));
    expect(racine.textContent).toContain('Relevé du compte');
  });

  it('garde le formulaire du relevé du compte intact lors de son propre enregistrement', async () => {
    const db = creerFausseBase();
    await db.doc('profil/courant').set({ ...fictif, version: 1 });
    await db.doc('stats_contenu/a_7j').set({ fiche: 'a', releve: '7j', vues: 1000, nouveaux_abonnes: 5, partages_envois: 12, date_publication: '2026-09-15T10:00:00.000Z', format: 'reel', pilier: 'socio', accroche: 'Accroche fictive', score_total: 70 });
    const racine = document.createElement('div');
    const app = await demarrer(racine, { use: async nom => (nom === 'db' ? db : null) }, { horloge });
    await app.actions.changerVue('tableau');
    await vi.waitFor(() => expect(racine.textContent).toContain('Accroche fictive'));

    const select = racine.querySelector('select[name="semaine"]');
    const semaineDerniere = select.options[1].value;
    select.value = semaineDerniere;
    select.dispatchEvent(new Event('change', { bubbles: true }));
    racine.querySelector('input[name="abonnes"]').value = '1234';
    racine.querySelector('form.releve-compte').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));

    await vi.waitFor(() => expect(db.ecritures.some(e => e.startsWith('releves_compte/'))).toBe(true));
    await vi.waitFor(() => expect(racine.textContent).toContain('Relevé du compte enregistré.'));
    // Requête le select à nouveau dans le DOM (et non la référence capturée avant l'écriture) : prouve
    // que le formulaire n'a pas été reconstruit, pas seulement que l'ancienne référence garde sa valeur.
    expect(racine.querySelector('select[name="semaine"]').value).toBe(semaineDerniere);
    expect(racine.textContent).toContain('Dernier relevé');
  });

  it('ne reconstruit pas la vue Semaine quand seuls les relevés du compte changent', async () => {
    const db = creerFausseBase();
    const racine = document.createElement('div');
    const app = await demarrer(racine, { use: async nom => (nom === 'db' ? db : null) }, { horloge });
    await app.actions.importerProfil(JSON.stringify(fictif));
    await vi.waitFor(() => expect(app.etat.lire().vue).toBe('semaine'));
    const avant = racine.querySelector('.vue > *');
    app.etat.modifier({ relevesCompte: [{ id: '2026-W40', semaine: '2026-W40', debut: '2026-09-27T22:00:00.000Z', abonnes: 10 }] });
    expect(racine.querySelector('.vue > *')).toBe(avant);
  });

  it('reconstruit la vue Semaine quand les relevés de contenu changent', async () => {
    const db = creerFausseBase();
    const racine = document.createElement('div');
    const app = await demarrer(racine, { use: async nom => (nom === 'db' ? db : null) }, { horloge });
    await app.actions.importerProfil(JSON.stringify(fictif));
    await vi.waitFor(() => expect(app.etat.lire().vue).toBe('semaine'));
    const avant = racine.querySelector('.vue > *');
    app.etat.modifier({ stats: [{ id: 'x_48h', fiche: 'x', releve: '48h', vues: 1, nouveaux_abonnes: 0, partages_envois: 0, date_publication: T }] });
    expect(racine.querySelector('.vue > *')).not.toBe(avant);
  });

  it('quitte l’état de chargement du tableau de bord quand stats et relevesCompte arrivent après l’ouverture de l’onglet', () => {
    const racine = document.createElement('div');
    const actions = { enregistrerReleveCompte: vi.fn(async () => ({ ok: true, erreurs: [] })), allerAFiche: vi.fn() };
    const rendre = creerRendu(racine, actions, {}, () => T);
    const base = {
      profil: fictif, fiches: [], vue: 'tableau', ancre: T, ficheOuverte: null, erreur: null, sauvegarde: 'ok',
      reference: [], resultatReference: null, verificationReference: null, bulletin: undefined, configVeille: null,
      stats: undefined, relevesCompte: undefined, fichesRecentes: [],
    };
    // Ouverture de l'onglet avant l'arrivée des instantanés (cas réel : ecouterStats/ecouterRelevesCompte sont asynchrones).
    rendre(base);
    expect(racine.textContent).toContain('Chargement du tableau de bord…');

    // Les instantanés arrivent ensuite, dans des rendus séparés (comme le ferait etat.abonner dans app.js).
    rendre({ ...base, stats: [] });
    rendre({ ...base, stats: [], relevesCompte: [] });

    expect(racine.textContent).not.toContain('Chargement du tableau de bord…');
    expect(racine.querySelectorAll('figcaption').length).toBe(6);
    expect(racine.querySelector('form.releve-compte')).not.toBeNull();
  });

  it('garde l’état de la relance de la veille quand la vue est reconstruite', async () => {
    const db = creerFausseBase();
    const racine = document.createElement('div');
    let fin;
    const relancer = vi.fn(() => new Promise(r => { fin = r; }));
    const app = await demarrer(racine, { use: async nom => (nom === 'db' ? db : nom === 'veille' ? { relancer } : null) }, { horloge });
    await app.actions.importerProfil(JSON.stringify(fictif));
    await vi.waitFor(() => expect(app.etat.lire().vue).toBe('semaine'));
    await app.actions.changerVue('bulletin');
    const bouton = () => [...racine.querySelectorAll('button')].find(b => b.textContent === 'Relancer la veille');
    await vi.waitFor(() => expect(bouton()).toBeTruthy());
    bouton().click();
    await vi.waitFor(() => expect(bouton().disabled).toBe(true));
    const avant = bouton();
    app.etat.modifier({ configVeille: { url_routine: 'https://exemple.test/r' } });
    expect(bouton()).not.toBe(avant);
    expect(bouton().disabled).toBe(true);
    expect(racine.textContent).toContain('Veille en cours : cela peut prendre quelques minutes.');
    fin({ ok: true, message: 'Bulletin fait.' });
    await vi.waitFor(() => expect(racine.textContent).toContain('Bulletin fait.'));
    expect(bouton().disabled).toBe(false);
  });

  it('passe downloads au contrôleur quand la capacité est disponible', async () => {
    const db = creerFausseBase();
    const save = vi.fn(async () => ({ status: 'saved' }));
    const racine = document.createElement('div');
    const app = await demarrer(racine, { use: async nom => (nom === 'db' ? db : nom === 'downloads' ? { save } : null) }, { horloge });
    expect(await app.actions.exporterDonnees()).toEqual({ ok: true, message: 'Export enregistré.' });
    await vi.waitFor(() => expect(racine.querySelector('.section-sauvegarde button')?.textContent).toBe('Exporter les données'));
  });

  it('garde le message de restauration malgré la reconstruction de la vue Profil', async () => {
    const db = creerFausseBase();
    const racine = document.createElement('div');
    const app = await demarrer(racine, { use: async nom => (nom === 'db' ? db : null) }, { horloge });
    await app.actions.importerProfil(JSON.stringify(fictif));
    await app.actions.changerVue('profil');
    const fiche = nouvelleFiche({ id: 'f-restauree', format: 'reel', date_heure: '2026-09-28T10:00:00.000Z', pilier: 'socio', maintenant: T });
    const exp = construireExport({
      profil: [{ id: 'courant', data: { ...fictif, version: 7 } }],
      fiches: [{ id: fiche.id, data: fiche }],
    }, T);
    const input = racine.querySelector('.section-sauvegarde input[type="file"]');
    Object.defineProperty(input, 'files', { configurable: true, value: [{ text: async () => JSON.stringify(exp) }] });
    input.dispatchEvent(new Event('change'));
    await vi.waitFor(() => expect([...racine.querySelectorAll('.section-sauvegarde button')].map(b => b.textContent)).toContain('Restaurer sans sauvegarde'));
    [...racine.querySelectorAll('.section-sauvegarde button')].find(b => b.textContent === 'Restaurer sans sauvegarde').click();
    await vi.waitFor(() => expect(racine.querySelector('.section-sauvegarde').textContent).toContain('Restauration terminée : 2 document(s) restauré(s).'));
  });
});

describe('panneau d’analyse par dossier dans le rendu', () => {
  const base = {
    profil: fictif, fiches: [], vue: 'semaine', ancre: T, ficheOuverte: null, erreur: null, sauvegarde: 'ok',
    reference: [], resultatReference: null, verificationReference: null, bulletin: null, configVeille: null,
    stats: [], relevesCompte: [], fichesRecentes: [], analyse: null, analyses: [],
  };
  const periode = { type: 'semaine', cle: '2026-W40', libelle: 'semaine du 28 septembre au 4 octobre 2026' };
  const pret = { etape: 'pret', code: 'D-aaa111', periode, nombre: 2, sansVisuel: [], fichier: new Blob(['%PDF']), nom: 'analyse-2026-W40.pdf', retour: null };
  const actionsRendu = () => ({
    changerVue: vi.fn(), naviguer: vi.fn(), allerAujourdhui: vi.fn(), ouvrirFiche: vi.fn(), creerFiche: vi.fn(), deplacerFiche: vi.fn(),
    ouvrirAnalyse: vi.fn(), fermerAnalyse: vi.fn(), partagerDossier: vi.fn(), telechargerDossier: vi.fn(), copierMessage: vi.fn(),
    noterAssistant: vi.fn(), enregistrerRetour: vi.fn(async () => ({ ok: true, appliquees: 2, ecartees: [], avisRecu: true })), peutPartagerDossier: () => true,
  });
  const monter = (racine = document.createElement('div')) => {
    const actions = actionsRendu();
    return { racine, actions, rendre: creerRendu(racine, actions, { dossier: true }, () => T) };
  };
  const boutonAnalyse = (racine, texte = 'Analyser la semaine') => [...racine.querySelectorAll('button')].find(b => b.textContent === texte);

  it('affiche le panneau avec l’action de partage selon l’appareil', () => {
    const { racine, rendre } = monter();
    rendre({ ...base, analyse: pret });
    expect(racine.querySelector('.zone-analyse h2').textContent).toBe('Analyse par Claude ou ChatGPT');
    expect([...racine.querySelectorAll('.zone-analyse button')].some(b => b.textContent === 'Partager le dossier')).toBe(true);
    rendre({ ...base, analyse: null });
    expect(racine.querySelector('.zone-analyse').childElementCount).toBe(0);
  });

  it('garde la zone de texte et son contenu quand seul le retour change', () => {
    const { racine, rendre } = monter();
    rendre({ ...base, analyse: pret });
    const zone = racine.querySelector('textarea.retour');
    zone.value = 'réponse collée';
    rendre({ ...base, analyse: { ...pret, retour: { ok: true, appliquees: 2, ecartees: [], avisRecu: true } } });
    expect(racine.querySelector('textarea.retour')).toBe(zone);
    expect(zone.value).toBe('réponse collée');
  });

  it('garde la zone de texte quand les fiches ou les analyses changent', () => {
    const { racine, rendre } = monter();
    rendre({ ...base, analyse: pret });
    const zone = racine.querySelector('textarea.retour');
    zone.value = 'brouillon';
    rendre({ ...base, analyse: pret, fiches: [nouvelleFiche({ id: 'z', format: 'reel', date_heure: '2026-09-29T10:00:00.000Z', pilier: 'socio', maintenant: T })] });
    expect(racine.querySelector('textarea.retour')).toBe(zone);
    rendre({ ...base, analyse: pret, analyses: [{ id: 'D-aaa111', periode, fiches: [] }] });
    expect(racine.querySelector('textarea.retour')).toBe(zone);
    expect(zone.value).toBe('brouillon');
  });

  it('reconstruit le panneau quand le code ou l’étape change', () => {
    const { racine, rendre } = monter();
    rendre({ ...base, analyse: pret });
    const zone = racine.querySelector('textarea.retour');
    rendre({ ...base, analyse: { ...pret, code: 'D-bbb222' } });
    expect(racine.querySelector('textarea.retour')).not.toBe(zone);
    rendre({ ...base, analyse: { etape: 'preparation' } });
    expect(racine.querySelector('textarea.retour')).toBeNull();
    expect(racine.textContent).toContain('Préparation du dossier…');
  });

  it('met à jour le message d’erreur quand il change', () => {
    const { racine, rendre } = monter();
    rendre({ ...base, analyse: { etape: 'erreur', message: 'Premier.' } });
    rendre({ ...base, analyse: { etape: 'erreur', message: 'Second.' } });
    expect(racine.querySelector('.zone-analyse [role="alert"]').textContent).toBe('Second.');
  });

  it('désactive les boutons Semaine et Mois tant qu’un panneau d’analyse est ouvert', () => {
    const { racine, rendre } = monter();
    rendre({ ...base });
    expect(boutonAnalyse(racine).disabled).toBe(false);
    rendre({ ...base, analyse: { etape: 'preparation' } });
    expect(boutonAnalyse(racine).disabled).toBe(true);
    rendre({ ...base, vue: 'mois', analyse: { etape: 'preparation' } });
    expect(boutonAnalyse(racine, 'Analyser le mois').disabled).toBe(true);
    rendre({ ...base, vue: 'mois', analyse: pret });
    expect(boutonAnalyse(racine, 'Analyser le mois').disabled).toBe(true);
    expect(boutonAnalyse(racine, 'Coller un retour').disabled).toBe(true);
    rendre({ ...base, vue: 'mois', analyse: null });
    expect(boutonAnalyse(racine, 'Analyser le mois').disabled).toBe(false);
    expect(boutonAnalyse(racine, 'Coller un retour').disabled).toBe(false);
  });

  it('propose l’analyse seulement en Semaine et en Mois, et garde le panneau en changeant de vue', () => {
    const { racine, rendre } = monter();
    rendre({ ...base, analyse: pret });
    const zone = racine.querySelector('textarea.retour');
    expect(boutonAnalyse(racine)).toBeTruthy();
    rendre({ ...base, vue: 'jour', analyse: pret });
    expect([...racine.querySelectorAll('.vue button')].some(b => /Analyser/.test(b.textContent))).toBe(false);
    expect(racine.querySelector('textarea.retour')).toBe(zone);
    rendre({ ...base, vue: 'mois', analyse: pret });
    expect(boutonAnalyse(racine, 'Analyser le mois')).toBeTruthy();
    expect(racine.querySelector('textarea.retour')).toBe(zone);
  });

  it('affiche l’avis de la période et le met à jour quand les analyses changent', () => {
    const { racine, rendre } = monter();
    rendre({ ...base });
    expect(racine.querySelector('.avis-periode')).toBeNull();
    const analyses = [{ id: 'D-1', periode, assistant: 'claude', fiches: [], retour: { recu_le: '2026-09-29T10:00:00.000Z', avis: 'Semaine solide', points_forts: [], risques: [], ordre_conseille: [] } }];
    rendre({ ...base, analyses });
    expect(racine.querySelector('.avis-periode').textContent).toContain('Semaine solide');
  });

  it('place le focus sur le panneau à l’ouverture et le rend au bouton à la fermeture', () => {
    const racine = document.createElement('div');
    document.body.append(racine);
    const defile = vi.fn();
    const { rendre } = monter(racine);
    rendre({ ...base });
    const original = HTMLElement.prototype.scrollIntoView;
    HTMLElement.prototype.scrollIntoView = defile;
    try {
      rendre({ ...base, analyse: { etape: 'preparation' } });
      expect(document.activeElement).toBe(racine.querySelector('.zone-analyse h2'));
      expect(defile).toHaveBeenCalled();
      rendre({ ...base, analyse: null });
      expect(document.activeElement).toBe(boutonAnalyse(racine));
    } finally {
      if (original) HTMLElement.prototype.scrollIntoView = original; else delete HTMLElement.prototype.scrollIntoView;
      racine.remove();
    }
  });

  it('ne plante pas sans scrollIntoView, ni sans bouton à retrouver à la fermeture', () => {
    const racine = document.createElement('div');
    document.body.append(racine);
    const { rendre } = monter(racine);
    const original = HTMLElement.prototype.scrollIntoView;
    delete HTMLElement.prototype.scrollIntoView;
    try {
      rendre({ ...base, vue: 'jour' });
      rendre({ ...base, vue: 'jour', analyse: pret });
      expect(() => rendre({ ...base, vue: 'jour', analyse: null })).not.toThrow();
    } finally {
      if (original) HTMLElement.prototype.scrollIntoView = original;
      racine.remove();
    }
  });

  it('assemblé : un clic sur « Analyser la semaine » ouvre le panneau, le retour garde la zone', async () => {
    const db = creerFausseBase();
    const dossier = {
      fabrique: async () => ({ preparerCartes: async () => new Map(), assemblerPdf: async () => new Blob(['%PDF'], { type: 'application/pdf' }) }),
      peutPartager: () => true, partager: vi.fn(), copier: vi.fn(),
    };
    const racine = document.createElement('div');
    const app = await demarrer(racine, { use: async nom => (nom === 'db' ? db : nom === 'dossier' ? dossier : null) }, { horloge });
    await app.actions.importerProfil(JSON.stringify(fictif));
    await vi.waitFor(() => expect(app.etat.lire().vue).toBe('semaine'));
    const f = await app.actions.creerFiche({ format: 'reel', date_heure: '2026-09-29T10:00:00.000Z' });
    app.actions.modifierFiche(f.id, { accroche: 'Une accroche', caption: 'Un texte' });
    await vi.waitFor(() => expect(boutonAnalyse(racine)).toBeTruthy());
    boutonAnalyse(racine).click();
    await vi.waitFor(() => expect(racine.querySelector('textarea.retour')).toBeTruthy());
    expect(app.etat.lire().ficheOuverte).toBeNull();
    const zone = racine.querySelector('textarea.retour');
    zone.value = 'texte en cours';
    app.etat.modifier({ analyse: { ...app.etat.lire().analyse, retour: { ok: true, appliquees: 1, ecartees: [], avisRecu: true } } });
    app.etat.modifier({ fiches: [...app.etat.lire().fiches] });
    expect(racine.querySelector('textarea.retour')).toBe(zone);
    expect(zone.value).toBe('texte en cours');
    expect(boutonAnalyse(racine).disabled).toBe(true);
  });
});

describe('analyse par dossier : correctifs du premier round', () => {
  const periode = { type: 'semaine', cle: '2026-W40', libelle: 'semaine du 28 septembre au 4 octobre 2026' };
  const base = {
    profil: fictif, fiches: [], vue: 'semaine', ancre: T, ficheOuverte: null, erreur: null, sauvegarde: 'ok',
    reference: [], resultatReference: null, verificationReference: null, bulletin: null, configVeille: null,
    stats: [], relevesCompte: [], fichesRecentes: [], analyse: null, analyses: [],
  };
  const pret = { etape: 'pret', code: 'D-aaa111', periode, nombre: 2, sansVisuel: [], fichier: new Blob(['%PDF']), nom: 'analyse-2026-W40.pdf', retour: null };
  const avisDe = cle => ({ id: `D-${cle}`, periode: { type: 'semaine', cle }, assistant: 'claude', fiches: [], retour: { recu_le: '2026-09-29T10:00:00.000Z', avis: `Avis ${cle}`, points_forts: [], risques: [], ordre_conseille: [] } });
  const monter = (racine = document.createElement('div')) => {
    const actions = {
      changerVue: vi.fn(), naviguer: vi.fn(), allerAujourdhui: vi.fn(), ouvrirFiche: vi.fn(), creerFiche: vi.fn(), deplacerFiche: vi.fn(),
      ouvrirAnalyse: vi.fn(), ouvrirRetour: vi.fn(), fermerAnalyse: vi.fn(), partagerDossier: vi.fn(), telechargerDossier: vi.fn(), copierMessage: vi.fn(),
      noterAssistant: vi.fn(), enregistrerRetour: vi.fn(), peutPartagerDossier: () => true,
    };
    return { racine, actions, rendre: creerRendu(racine, actions, { dossier: true }, () => T) };
  };

  it('garde l’avis de la période ouvert quand la vue est reconstruite, pas celui d’une autre semaine', () => {
    const { racine, rendre } = monter();
    const analyses = [avisDe('2026-W40'), avisDe('2026-W41')];
    rendre({ ...base, analyses });
    const avis = racine.querySelector('details.avis-periode');
    avis.open = true;
    avis.dispatchEvent(new Event('toggle'));
    rendre({ ...base, analyses, fiches: [nouvelleFiche({ id: 'z', format: 'reel', date_heure: '2026-09-29T10:00:00.000Z', pilier: 'socio', maintenant: T })] });
    const apres = racine.querySelector('details.avis-periode');
    expect(apres).not.toBe(avis);
    expect(apres.open).toBe(true);
    rendre({ ...base, analyses, ancre: '2026-10-07T10:00:00.000Z' });
    expect(racine.querySelector('details.avis-periode').textContent).toContain('Avis 2026-W41');
    expect(racine.querySelector('details.avis-periode').open).toBe(false);
  });

  it('garde le texte collé quand la sauvegarde ou l’erreur changent', () => {
    const { racine, rendre } = monter();
    rendre({ ...base, analyse: pret });
    const zone = racine.querySelector('textarea.retour');
    zone.value = 'à garder';
    rendre({ ...base, analyse: pret, sauvegarde: 'en_cours' });
    rendre({ ...base, analyse: pret, sauvegarde: 'erreur', erreur: 'Un souci passager.' });
    expect(racine.querySelector('textarea.retour')).toBe(zone);
    expect(zone.value).toBe('à garder');
  });

  it('pose le focus seulement à l’ouverture, jamais sur un champ de saisie', () => {
    const racine = document.createElement('div');
    document.body.append(racine);
    const { rendre } = monter(racine);
    try {
      rendre({ ...base });
      rendre({ ...base, analyse: { etape: 'preparation' } });
      expect(document.activeElement).toBe(racine.querySelector('.zone-analyse h2'));
      document.body.focus();
      rendre({ ...base, analyse: pret });
      expect(document.activeElement).not.toBe(racine.querySelector('.zone-analyse h2'));
      rendre({ ...base, analyse: null });
      const champ = document.createElement('textarea');
      document.body.append(champ);
      champ.focus();
      rendre({ ...base, analyse: pret });
      expect(document.activeElement).toBe(champ);
      champ.remove();
    } finally { racine.remove(); }
  });

  it('assemblé : « Coller un retour » ouvre la zone, un retour au dossier connu met les fiches à jour', async () => {
    const db = creerFausseBase();
    const dossier = {
      fabrique: async () => ({ preparerCartes: async () => new Map(), assemblerPdf: async () => new Blob(['%PDF'], { type: 'application/pdf' }) }),
      peutPartager: () => true, partager: vi.fn(), copier: vi.fn(),
    };
    const racine = document.createElement('div');
    const app = await demarrer(racine, { use: async nom => (nom === 'db' ? db : nom === 'dossier' ? dossier : null) }, { horloge });
    await app.actions.importerProfil(JSON.stringify(fictif));
    await vi.waitFor(() => expect(app.etat.lire().vue).toBe('semaine'));
    const f = await app.actions.creerFiche({ format: 'reel', date_heure: '2026-09-29T10:00:00.000Z' });
    app.actions.modifierFiche(f.id, { accroche: 'Une accroche', caption: 'Un texte' });
    const bouton = texte => [...racine.querySelectorAll('button')].find(b => b.textContent === texte);
    await vi.waitFor(() => expect(bouton('Analyser la semaine')).toBeTruthy());
    bouton('Analyser la semaine').click();
    await vi.waitFor(() => expect(app.etat.lire().analyse?.etape).toBe('pret'));
    const { code } = app.etat.lire().analyse;
    app.actions.fermerAnalyse();
    await vi.waitFor(() => expect(racine.querySelector('.zone-analyse').childElementCount).toBe(0));
    bouton('Coller un retour').click();
    await vi.waitFor(() => expect(racine.querySelector('.zone-analyse textarea.retour')).toBeTruthy());
    expect(app.etat.lire().analyse).toEqual({ etape: 'retour' });
    const reponse = '```json\n' + JSON.stringify({
      dossier: code,
      fiches: [{
        id: 'F01', notes: { accroche: 7, voix: 8, mecanique: 6 }, phrases: { accroche: 'a', voix: 'b', mecanique: 'c' },
        conformite: { etat: 'vert', causes: [] }, captions: [{ role: 'engagement', texte: 'A ?' }, { role: 'deadpan', texte: 'B.' }],
        accroches: ['Une', 'Deux'], hashtags: ['nuit'],
        recommandations: [{ texte: 'r1', pourquoi: 'p1' }, { texte: 'r2', pourquoi: 'p2' }, { texte: 'r3', pourquoi: 'p3' }],
      }],
      periode: { avis: 'Semaine correcte.', points_forts: ['x'], risques: ['y'], ordre_conseille: ['F01'] },
    }) + '\n```';
    racine.querySelector('textarea.retour').value = reponse;
    bouton('Enregistrer le retour').click();
    await vi.waitFor(() => expect(racine.querySelector('.zone-analyse').textContent).toContain('1 fiche mise à jour.'));
    expect(app.etat.lire().fiches.find(x => x.id === f.id).score.examen.source).toBe('dossier');
  });
});
