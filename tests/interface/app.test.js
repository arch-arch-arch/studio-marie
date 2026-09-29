// @vitest-environment happy-dom
import { describe, it, expect, vi } from 'vitest';
import fictif from '../../exemples/profil-fictif.json';
import { creerFausseBase } from '../aides/fausseBase.js';
import { demarrer } from '../../src/interface/app.js';
import { creerRendu } from '../../src/interface/rendu.js';
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
    expect(racine.textContent).toContain('La base du studio n’est pas accessible depuis cette vue.');
  });

  it('affiche aussi le message quand window.claude est absent', async () => {
    const racine = document.createElement('div');
    await demarrer(racine, undefined, { horloge });
    expect(racine.textContent).toContain('pas accessible');
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
    expect(racine.textContent).toContain('L’accès au studio a été retiré pour cette vue.');
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

  it('ne reconstruit pas la vue Semaine quand seules les statistiques changent', async () => {
    const db = creerFausseBase();
    const racine = document.createElement('div');
    const app = await demarrer(racine, { use: async nom => (nom === 'db' ? db : null) }, { horloge });
    await app.actions.importerProfil(JSON.stringify(fictif));
    await vi.waitFor(() => expect(app.etat.lire().vue).toBe('semaine'));
    const avant = racine.querySelector('.vue > *');
    app.etat.modifier({ stats: [{ id: 'x_7j', fiche: 'x', releve: '7j', vues: 1, nouveaux_abonnes: 1, partages_envois: 1, date_publication: T, format: 'reel', accroche: 'x', score_total: 1 }] });
    expect(racine.querySelector('.vue > *')).toBe(avant);
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
});
