// @vitest-environment happy-dom
import { describe, it, expect, vi } from 'vitest';
import { panneauAnalyse, sectionAvis } from '../../src/interface/panneau-analyse.js';

const actions = (plus = {}) => ({
  fermerAnalyse: vi.fn(), partagerDossier: vi.fn(async () => ({ ok: true, message: 'Dossier partagé.' })),
  telechargerDossier: vi.fn(async () => ({ ok: true, message: 'Dossier téléchargé.' })),
  copierMessage: vi.fn(async () => ({ ok: true, message: 'Message copié.' })), noterAssistant: vi.fn(),
  enregistrerRetour: vi.fn(async () => ({ ok: true, appliquees: 4, ecartees: [{ ref: 'F03', raison: 'fiche modifiée depuis le dossier : refais une analyse' }], avisRecu: true })),
  ...plus,
});
const pret = { etape: 'pret', code: 'D-abc123', periode: { type: 'semaine', cle: '2026-W41', libelle: 'semaine du 5 au 11 octobre 2026' }, nombre: 5, sansVisuel: ['F02'], fichier: new Blob(['%PDF'], { type: 'application/pdf' }), nom: 'analyse-2026-W41.pdf', retour: null };
const bouton = (el, texte) => [...el.querySelectorAll('button')].find(b => b.textContent === texte);
const MO = 1024 * 1024;

describe('panneauAnalyse', () => {
  it('annonce la préparation, puis une erreur', () => {
    expect(panneauAnalyse({ etape: 'preparation' }, actions(), {}).textContent).toContain('Préparation du dossier…');
    const e = panneauAnalyse({ etape: 'erreur', message: 'Aucune fiche à analyser sur cette période.' }, actions(), {});
    expect(e.querySelector('[role="alert"]').textContent).toBe('Aucune fiche à analyser sur cette période.');
  });
  it('présente le dossier prêt et ses étapes', () => {
    const el = panneauAnalyse(pret, actions(), { partage: true });
    expect(el.querySelector('h2').textContent).toBe('Analyse par Claude ou ChatGPT');
    expect(el.textContent).toContain('5 fiches, semaine du 5 au 11 octobre 2026.');
    expect(el.textContent).toContain('Sans visuel dans le dossier : F02.');
    expect(bouton(el, 'Partager le dossier')).toBeTruthy();
    expect(bouton(el, 'Télécharger le dossier')).toBeTruthy();
    expect(bouton(el, 'Copier le message')).toBeTruthy();
    const liens = [...el.querySelectorAll('a')].map(a => [a.textContent, a.getAttribute('href'), a.getAttribute('target'), a.getAttribute('rel')]);
    expect(liens).toEqual([['Ouvrir Claude', 'https://claude.ai/new', '_blank', 'noopener noreferrer'], ['Ouvrir ChatGPT', 'https://chatgpt.com/', '_blank', 'noopener noreferrer']]);
    expect(el.textContent).not.toContain('null');
  });
  it('masque le partage quand l’appareil ne le permet pas', () => {
    expect(bouton(panneauAnalyse(pret, actions(), { partage: false }), 'Partager le dossier')).toBeUndefined();
  });
  it('affiche le résultat de chaque action', async () => {
    const a = actions({ copierMessage: vi.fn(async () => ({ ok: false, message: 'Voici le dossier d’analyse de mes contenus.' })) });
    const el = panneauAnalyse(pret, a, { partage: true });
    bouton(el, 'Partager le dossier').click();
    await vi.waitFor(() => expect(el.textContent).toContain('Dossier partagé.'));
    bouton(el, 'Copier le message').click();
    await vi.waitFor(() => expect(el.querySelector('textarea.message-a-copier')?.value).toBe('Voici le dossier d’analyse de mes contenus.'));
  });
  it('note l’assistant ouvert', () => {
    const a = actions();
    const el = panneauAnalyse(pret, a, {});
    [...el.querySelectorAll('a')][1].dispatchEvent(new Event('click', { bubbles: true }));
    expect(a.noterAssistant).toHaveBeenCalledWith('chatgpt');
  });
  it('enregistre le retour collé et dit ce qui a été fait', async () => {
    const a = actions();
    const el = panneauAnalyse(pret, a, {});
    el.querySelector('textarea.retour').value = 'réponse collée';
    const b = bouton(el, 'Enregistrer le retour');
    b.click();
    expect(b.disabled).toBe(true);
    await vi.waitFor(() => expect(el.textContent).toContain('4 fiches mises à jour.'));
    expect(a.enregistrerRetour).toHaveBeenCalledWith('réponse collée');
    expect(el.textContent).toContain('F03 : fiche modifiée depuis le dossier : refais une analyse');
    expect(b.disabled).toBe(false);
  });
  it('affiche le refus sans vider la zone', async () => {
    const a = actions({ enregistrerRetour: vi.fn(async () => ({ ok: false, raison: 'Ce retour ne correspond à aucun dossier produit par le studio.' })) });
    const el = panneauAnalyse(pret, a, {});
    el.querySelector('textarea.retour').value = 'x';
    bouton(el, 'Enregistrer le retour').click();
    await vi.waitFor(() => expect(el.querySelector('[role="alert"]').textContent).toContain('aucun dossier'));
    expect(el.querySelector('textarea.retour').value).toBe('x');
  });
  it('accorde le singulier et signale un avis d’ensemble manquant', async () => {
    const a = actions({ enregistrerRetour: vi.fn(async () => ({ ok: true, appliquees: 1, ecartees: [], avisRecu: false })) });
    const el = panneauAnalyse(pret, a, {});
    el.querySelector('textarea.retour').value = 'x';
    bouton(el, 'Enregistrer le retour').click();
    await vi.waitFor(() => expect(el.textContent).toContain('1 fiche mise à jour.'));
    expect(el.textContent).toContain('L’avis d’ensemble manquait dans la réponse.');
  });
  it('se ferme', () => {
    const a = actions();
    bouton(panneauAnalyse(pret, a, {}), 'Fermer').click();
    expect(a.fermerAnalyse).toHaveBeenCalled();
  });

  it('affiche le détail d’une entrée écartée', async () => {
    const a = actions({ enregistrerRetour: vi.fn(async () => ({ ok: true, appliquees: 1, avisRecu: true, ecartees: [{ ref: 'F02', raison: 'réponse incomplète', detail: 'recommandations manquantes' }, { ref: 'F03', raison: 'fiche publiée depuis le dossier' }] })) });
    const el = panneauAnalyse(pret, a, {});
    el.querySelector('textarea.retour').value = 'x';
    bouton(el, 'Enregistrer le retour').click();
    await vi.waitFor(() => expect(el.textContent).toContain('F02 : réponse incomplète (recommandations manquantes)'));
    expect([...el.querySelectorAll('.ecartees li')].map(li => li.textContent)).toEqual(['F02 : réponse incomplète (recommandations manquantes)', 'F03 : fiche publiée depuis le dossier']);
  });
  it('affiche l’interruption ou la session expirée sans vider la zone', async () => {
    const a = actions({ enregistrerRetour: vi.fn(async () => ({ ok: false, raison: 'Ta session a expiré : recharge la page pour te reconnecter.' })) });
    const el = panneauAnalyse(pret, a, {});
    el.querySelector('textarea.retour').value = 'long texte';
    bouton(el, 'Enregistrer le retour').click();
    await vi.waitFor(() => expect(el.querySelector('[role="alert"]').textContent).toContain('session a expiré'));
    expect(el.querySelector('textarea.retour').value).toBe('long texte');
  });
  it('rend un échec inattendu de l’action sans rester bloqué', async () => {
    const a = actions({ enregistrerRetour: vi.fn(async () => { throw new Error('boum'); }) });
    const el = panneauAnalyse(pret, a, {});
    el.querySelector('textarea.retour').value = 'x';
    const b = bouton(el, 'Enregistrer le retour');
    b.click();
    await vi.waitFor(() => expect(el.querySelector('[role="alert"]').textContent).toBe('L’enregistrement a échoué : réessaie.'));
    expect(b.disabled).toBe(false);
  });
  it('refuse une zone vide ou un collage trop long sans appeler l’action', () => {
    const a = actions();
    const el = panneauAnalyse(pret, a, {});
    const zone = el.querySelector('textarea.retour');
    bouton(el, 'Enregistrer le retour').click();
    expect(el.querySelector('[role="alert"]').textContent).toBe('Colle d’abord la réponse de l’assistant.');
    zone.value = '   \n ';
    bouton(el, 'Enregistrer le retour').click();
    expect(el.querySelector('[role="alert"]').textContent).toBe('Colle d’abord la réponse de l’assistant.');
    zone.value = 'x'.repeat(400001);
    bouton(el, 'Enregistrer le retour').click();
    expect(el.querySelector('[role="alert"]').textContent).toBe('Ce texte est trop long : copie seulement la réponse de l’assistant.');
    expect(a.enregistrerRetour).not.toHaveBeenCalled();
    zone.value = 'x'.repeat(400000);
    bouton(el, 'Enregistrer le retour').click();
    expect(a.enregistrerRetour).toHaveBeenCalledTimes(1);
  });
  it('signale un dossier lourd, sinon donne discrètement son poids', () => {
    const lourd = panneauAnalyse({ ...pret, fichier: { size: 26.4 * MO } }, actions(), {});
    expect(lourd.textContent).toContain('Dossier lourd (26 Mo) : l’assistant peut le refuser. Analyse une période plus courte si l’envoi échoue.');
    expect(lourd.textContent).not.toContain('Dossier prêt');
    const leger = panneauAnalyse({ ...pret, fichier: { size: 3.26 * MO } }, actions(), {});
    expect(leger.textContent).toContain('Dossier prêt (3,3 Mo).');
    expect(leger.textContent).not.toContain('Dossier lourd');
    expect(panneauAnalyse({ ...pret, fichier: { size: 25 * MO } }, actions(), {}).textContent).toContain('Dossier prêt (25,0 Mo).');
  });
  it('est accessible : titre focalisable, régions d’état présentes dès la construction, liens sans donnée', () => {
    const el = panneauAnalyse(pret, actions(), {});
    expect(el.querySelector('h2').getAttribute('tabindex')).toBe('-1');
    expect(el.querySelectorAll('[role="status"]').length).toBeGreaterThanOrEqual(2);
    expect(el.querySelectorAll('[role="alert"]')).toHaveLength(1);
    for (const a of el.querySelectorAll('a')) expect(a.getAttribute('href')).not.toMatch(/[?#]/);
    expect(panneauAnalyse({ etape: 'preparation' }, actions(), {}).querySelector('h2').getAttribute('tabindex')).toBe('-1');
  });
  it('garde l’annonce d’état dans la même région', async () => {
    const el = panneauAnalyse(pret, actions(), { partage: true });
    const region = el.querySelector('p.etat-action[role="status"]');
    bouton(el, 'Partager le dossier').click();
    await vi.waitFor(() => expect(region.textContent).toBe('Dossier partagé.'));
    expect(el.querySelector('p.etat-action')).toBe(region);
  });
});

describe('sectionAvis', () => {
  const periode = { type: 'semaine', cle: '2026-W41' };
  const fiches = [{ id: 'a', accroche: 'Première' }, { id: 'b', accroche: '' }];
  const doc = (id, recu_le, plus = {}) => ({ id, periode, assistant: 'chatgpt', fiches: [{ ref: 'F01', id: 'a' }, { ref: 'F02', id: 'b' }, { ref: 'F03', id: 'z' }], retour: { recu_le, avis: `Avis ${id}`, points_forts: ['fort'], risques: ['risque'], ordre_conseille: ['F02', 'F01', 'F03'], ...plus } });
  it('montre le retour le plus récent de la période', () => {
    const el = sectionAvis([doc('D-1', '2026-10-05T10:00:00.000Z'), doc('D-2', '2026-10-06T10:00:00.000Z'), { id: 'D-3', periode, fiches: [] }, { ...doc('D-4', '2026-10-07T10:00:00.000Z'), periode: { type: 'semaine', cle: '2026-W42' } }], periode, fiches);
    expect(el.querySelector('summary').textContent).toBe('Avis sur la semaine');
    expect(el.textContent).toContain('Avis D-2');
    expect(el.textContent).toContain('ChatGPT');
    expect([...el.querySelectorAll('ol li')].map(li => li.textContent)).toEqual(['F02 · sans accroche', 'F01 · Première', 'F03 · fiche absente de cette vue']);
    expect(el.textContent).toContain('fort');
    expect(el.textContent).toContain('risque');
  });
  it('ne montre rien sans retour, ni pour un avis vide', () => {
    expect(sectionAvis([], periode, fiches)).toBeNull();
    expect(sectionAvis([{ id: 'D-1', periode, fiches: [] }], periode, fiches)).toBeNull();
    expect(sectionAvis([doc('D-1', '2026-10-05T10:00:00.000Z', { avis: '' })], periode, fiches)).toBeNull();
    expect(sectionAvis([doc('D-1', '2026-10-05T10:00:00.000Z')], { type: 'mois', cle: '2026-10' }, fiches)).toBeNull();
  });
  it('s’intitule selon la période', () => {
    const mois = { type: 'mois', cle: '2026-10' };
    expect(sectionAvis([{ ...doc('D-1', '2026-10-05T10:00:00.000Z'), periode: mois }], mois, fiches).querySelector('summary').textContent).toBe('Avis sur le mois');
  });
  it('signale les fiches non notées lors du retour', () => {
    const ecartees = [{ ref: 'F03', raison: 'fiche supprimée depuis le dossier' }];
    const el = sectionAvis([doc('D-1', '2026-10-05T10:00:00.000Z', { ecartees })], periode, fiches);
    expect(el.textContent).toContain('1 fiche non notée lors de ce retour.');
    const deux = sectionAvis([doc('D-1', '2026-10-05T10:00:00.000Z', { ecartees: [...ecartees, ...ecartees] })], periode, fiches);
    expect(deux.textContent).toContain('2 fiches non notées lors de ce retour.');
    expect(sectionAvis([doc('D-1', '2026-10-05T10:00:00.000Z', { ecartees: [] })], periode, fiches).textContent).not.toContain('non notée');
    expect(sectionAvis([doc('D-1', '2026-10-05T10:00:00.000Z')], periode, fiches).textContent).not.toContain('non notée');
  });
});

describe('panneauAnalyse : coller un retour sans dossier prêt', () => {
  it('à l’étape retour : phrase, zone de collage, enregistrement, sans partage ni liens', async () => {
    const a = actions();
    const el = panneauAnalyse({ etape: 'retour' }, a, { partage: true });
    expect(el.querySelector('h2').textContent).toBe('Analyse par Claude ou ChatGPT');
    expect(el.textContent).toContain('Colle ici la réponse de ton assistant. Le studio retrouve le dossier grâce à son code.');
    expect(el.querySelector('textarea.retour')).toBeTruthy();
    expect(bouton(el, 'Fermer')).toBeTruthy();
    expect(el.querySelector('a')).toBeNull();
    for (const t of ['Partager le dossier', 'Télécharger le dossier', 'Copier le message']) expect(bouton(el, t)).toBeUndefined();
    el.querySelector('textarea.retour').value = 'réponse';
    bouton(el, 'Enregistrer le retour').click();
    await vi.waitFor(() => expect(el.textContent).toContain('4 fiches mises à jour.'));
    expect(a.enregistrerRetour).toHaveBeenCalledWith('réponse');
    expect(el.textContent).toContain('F03 : fiche modifiée depuis le dossier');
  });
  it('à l’étape erreur : le message, puis la même zone de collage', async () => {
    const a = actions();
    const el = panneauAnalyse({ etape: 'erreur', message: 'Aucune fiche à analyser sur cette période.' }, a, {});
    expect(el.querySelector('[role="alert"]').textContent).toBe('Aucune fiche à analyser sur cette période.');
    expect([...el.querySelectorAll('h3')].map(x => x.textContent)).toContain('Tu as déjà une réponse ?');
    el.querySelector('textarea.retour').value = 'x';
    bouton(el, 'Enregistrer le retour').click();
    await vi.waitFor(() => expect(a.enregistrerRetour).toHaveBeenCalledWith('x'));
    await vi.waitFor(() => expect(el.textContent).toContain('4 fiches mises à jour.'));
    el.querySelector('textarea.retour').value = '';
    bouton(el, 'Enregistrer le retour').click();
    expect(el.textContent).toContain('Colle d’abord la réponse de l’assistant.');
  });
  it('à l’étape prêt : précise qu’un retour précédent est accepté', () => {
    expect(panneauAnalyse(pret, actions(), {}).textContent).toContain('Le retour d’un dossier précédent est accepté aussi.');
  });
  it('accorde « 0 fiche mise à jour. »', async () => {
    const a = actions({ enregistrerRetour: vi.fn(async () => ({ ok: true, appliquees: 0, ecartees: [], avisRecu: true })) });
    const el = panneauAnalyse(pret, a, {});
    el.querySelector('textarea.retour').value = 'x';
    bouton(el, 'Enregistrer le retour').click();
    await vi.waitFor(() => expect(el.textContent).toContain('0 fiche mise à jour.'));
  });
  it('garde le message à copier à la main quand un partage réussit ensuite', async () => {
    const a = actions({ copierMessage: vi.fn(async () => ({ ok: false, message: 'Le message du dossier.' })) });
    const el = panneauAnalyse(pret, a, { partage: true });
    bouton(el, 'Copier le message').click();
    await vi.waitFor(() => expect(el.querySelector('textarea.message-a-copier')).toBeTruthy());
    bouton(el, 'Partager le dossier').click();
    await vi.waitFor(() => expect(el.querySelector('p.etat-action').textContent).toBe('Dossier partagé.'));
    bouton(el, 'Télécharger le dossier').click();
    await vi.waitFor(() => expect(el.querySelector('p.etat-action').textContent).toBe('Dossier téléchargé.'));
    expect(el.querySelector('textarea.message-a-copier').value).toBe('Le message du dossier.');
  });
});

describe('sectionAvis : date, fuseau, état ouvert', () => {
  const periode = { type: 'semaine', cle: '2026-W41' };
  const doc = (recu_le) => ({ id: 'D-1', periode, assistant: 'claude', fiches: [], retour: { recu_le, avis: 'Avis', points_forts: [], risques: [], ordre_conseille: [] } });
  it('omet la date reçue quand elle est invalide, sans lever', () => {
    const el = sectionAvis([doc('pas une date')], periode, []);
    expect(el.textContent).toContain('Avis de Claude.');
    expect(el.textContent).not.toContain('reçu le');
    expect(sectionAvis([doc(undefined)], periode, []).textContent).toContain('Avis');
  });
  it('formate la date dans le fuseau du profil', () => {
    const tard = '2026-10-05T23:30:00.000Z';
    expect(sectionAvis([doc(tard)], periode, [], 'Europe/Paris').textContent).toContain('reçu le 6 octobre');
    expect(sectionAvis([doc(tard)], periode, [], 'UTC').textContent).toContain('reçu le 5 octobre');
  });
  it('retrouve son état ouvert et le mémorise au basculement', () => {
    const ouverts = new Map();
    const el = sectionAvis([doc('2026-10-05T10:00:00.000Z')], periode, [], 'UTC', ouverts);
    expect(el.open).toBe(false);
    el.open = true;
    el.dispatchEvent(new Event('toggle'));
    expect(ouverts.get('semaine|2026-W41')).toBe(true);
    expect(sectionAvis([doc('2026-10-05T10:00:00.000Z')], periode, [], 'UTC', ouverts).open).toBe(true);
    expect(sectionAvis([{ ...doc('2026-10-05T10:00:00.000Z'), periode: { type: 'semaine', cle: '2026-W42' } }], { type: 'semaine', cle: '2026-W42' }, [], 'UTC', ouverts).open).toBe(false);
  });
});
