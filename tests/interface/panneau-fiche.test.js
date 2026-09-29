// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import fictif from '../../exemples/profil-fictif.json';
import { nouvelleFiche, empreinte } from '../../src/logique/fiche.js';
import { panneauFiche } from '../../src/interface/panneau-fiche.js';

const fiche = (extra = {}) => ({ ...nouvelleFiche({ id: 'f1', format: 'reel', date_heure: '2026-09-28T10:00:00.000Z', pilier: 'socio', maintenant: 'x' }), ...extra });
const actionsFactices = () => ({
  modifierFiche: vi.fn(), fermerPanneau: vi.fn(), supprimerFiche: vi.fn(),
  changerStatut: vi.fn(async () => ({ ok: false, raison: 'Ajoute un visuel avant de valider.' })),
  televerserVisuel: vi.fn(async () => ({ ok: true, id: 'as1', type: 'image' })),
  evaluationDisponible: vi.fn(() => true),
});
const saisir = (el, valeur, evenement = 'input') => { el.value = valeur; el.dispatchEvent(new Event(evenement, { bubbles: true })); };
const bouton = (racine, texte) => [...racine.querySelectorAll('button')].find(b => b.textContent === texte);

beforeEach(() => {
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: vi.fn(async () => {}) } });
});

describe('panneauFiche', () => {
  it('transmet chaque saisie', () => {
    const actions = actionsFactices();
    const p = panneauFiche(fiche(), fictif, actions, { assets: true });
    saisir(p.querySelector('textarea[name="accroche"]'), 'Nouvelle accroche');
    expect(actions.modifierFiche).toHaveBeenCalledWith('f1', { accroche: 'Nouvelle accroche' });
    saisir(p.querySelector('input[name="hashtags"]'), '#nuit socio', 'change');
    expect(actions.modifierFiche).toHaveBeenCalledWith('f1', { hashtags: ['nuit', 'socio'] });
  });

  it('borne la longueur du géotag', () => {
    const p = panneauFiche(fiche(), fictif, actionsFactices(), { assets: true });
    expect(p.querySelector('input[name="geotag"]').maxLength).toBe(200);
  });

  it('convertit la date et l’heure locales en UTC', () => {
    const actions = actionsFactices();
    const p = panneauFiche(fiche(), fictif, actions, { assets: true });
    saisir(p.querySelector('input[type="time"]'), '18:30', 'change');
    expect(actions.modifierFiche).toHaveBeenCalledWith('f1', { date_heure: '2026-09-28T16:30:00.000Z' });
  });

  it('n’affiche « Mène à la porte » que pour une story', () => {
    const actions = actionsFactices();
    const p = panneauFiche(fiche(), fictif, actions, { assets: true });
    expect(p.textContent).not.toContain('Mène à la porte');
    saisir(p.querySelector('select[name="format"]'), 'story', 'change');
    expect(p.textContent).toContain('Mène à la porte');
  });

  it('affiche la raison d’un changement de statut refusé', async () => {
    const actions = actionsFactices();
    const p = panneauFiche(fiche(), fictif, actions, { assets: true });
    bouton(p, 'Validé').click();
    await vi.waitFor(() => expect(p.querySelector('.panneau-message').textContent).toBe('Ajoute un visuel avant de valider.'));
    expect(actions.changerStatut).toHaveBeenCalledWith('f1', 'valide');
  });

  it('copie la caption et les hashtags', async () => {
    const p = panneauFiche(fiche({ caption: 'Bonsoir.', hashtags: ['nuit'] }), fictif, actionsFactices(), { assets: true });
    bouton(p, 'Copier la caption et les hashtags').click();
    await vi.waitFor(() => expect(navigator.clipboard.writeText).toHaveBeenCalledWith('Bonsoir.\n\n#nuit'));
  });

  it('demande confirmation avant de supprimer', () => {
    const actions = actionsFactices();
    const p = panneauFiche(fiche(), fictif, actions, { assets: true });
    bouton(p, 'Supprimer la fiche').click();
    expect(actions.supprimerFiche).not.toHaveBeenCalled();
    bouton(p, 'Oui, supprimer').click();
    expect(actions.supprimerFiche).toHaveBeenCalledWith('f1');
  });

  it('explique l’absence de téléversement', () => {
    const p = panneauFiche(fiche(), fictif, actionsFactices(), { assets: false });
    expect(p.textContent).toContain('Le téléversement de visuels n’est pas disponible dans cette vue.');
    expect(p.querySelector('input[type="file"]')).toBeNull();
  });

  it('refuse un fichier qui n’est ni image ni vidéo', async () => {
    const actions = actionsFactices();
    const p = panneauFiche(fiche(), fictif, actions, { assets: true });
    const zone = p.querySelector('.zone-visuel');
    const evt = new Event('drop', { bubbles: true, cancelable: true });
    Object.defineProperty(evt, 'dataTransfer', { value: { files: [{ type: 'application/pdf' }] } });
    zone.dispatchEvent(evt);
    await vi.waitFor(() => expect(p.querySelector('.panneau-message').textContent).toBe('Choisis une image ou une vidéo.'));
    expect(actions.televerserVisuel).not.toHaveBeenCalled();
  });

  it('rétrograde l’affichage en Brouillon quand le téléversement d’un visuel change le statut en base', async () => {
    const f = fiche({ statut: 'valide' });
    const actions = actionsFactices();
    actions.televerserVisuel = vi.fn(async () => ({ ok: true, id: 'as2', type: 'image', statut: 'brouillon' }));
    const p = panneauFiche(f, fictif, actions, { assets: true });
    const entree = p.querySelector('input[type="file"]');
    Object.defineProperty(entree, 'files', { value: [{ type: 'image/png' }] });
    entree.dispatchEvent(new Event('change', { bubbles: true }));
    await vi.waitFor(() => {
      const brouillonBouton = bouton(p, 'Brouillon');
      expect(brouillonBouton.getAttribute('aria-pressed')).toBe('true');
    });
    expect(p.querySelector('.panneau-message').textContent).toBe('La fiche est repassée en Brouillon : réévalue-la.');
  });

  it('rétrograde l’affichage en Brouillon quand modifierFiche renvoie un nouveau statut, sans perdre le focus de la caption', () => {
    const f = fiche({ statut: 'valide' });
    const actions = actionsFactices();
    actions.modifierFiche = vi.fn(() => ({ ...fiche(), statut: 'brouillon' }));
    const p = panneauFiche(f, fictif, actions, { assets: true });
    const caption = p.querySelector('textarea[name="caption"]');
    saisir(caption, 'Nouvelle caption');
    const brouillonBouton = bouton(p, 'Brouillon');
    expect(brouillonBouton.getAttribute('aria-pressed')).toBe('true');
    expect(p.querySelector('.panneau-message').textContent).toBe('La fiche est repassée en Brouillon : réévalue-la.');
    expect(p.querySelector('textarea[name="caption"]')).toBe(caption);
  });
});

describe('évaluation dans le panneau', () => {
  const evaluee = () => {
    const f = fiche({ caption: 'Base.', visuel: 'a1' });
    return {
      ...f,
      score: {
        total: 72,
        criteres: [
          { cle: 'accroche', nom: 'Accroche et diffusion', points: 30, max: 40, phrase: 'Nette.' },
          { cle: 'voix', nom: 'Voix et esthétique', points: 22, max: 30, phrase: 'Juste.' },
          { cle: 'mecanique', nom: 'Mécanique de la caption', points: 20, max: 30, phrase: 'Correcte.' },
        ],
        conformite: { etat: 'vert', causes: [] }, alertes: ['Hors des créneaux recommandés du profil.'], empreinte: empreinte(f),
      },
      variantes: [{ role: 'engagement', texte: 'Variante A' }, { role: 'deadpan', texte: 'Variante B' }],
      suggestions: { accroches: ['Acc 1', 'Acc 2'], hashtags: ['nuit', 'socio'] },
      recommandations: ['R1', 'R2', 'R3'],
    };
  };

  it('masque « Évaluer » sans la capacité sample', () => {
    const p = panneauFiche(fiche(), fictif, actionsFactices(), { assets: true, sample: false });
    expect(bouton(p, 'Évaluer')).toBeUndefined();
  });

  it('masque « Évaluer » si l’évaluation a été mémorisée comme indisponible', () => {
    const actions = { ...actionsFactices(), evaluationDisponible: vi.fn(() => false) };
    const p = panneauFiche(fiche(), fictif, actions, { assets: true, sample: true });
    expect(bouton(p, 'Évaluer')).toBeUndefined();
  });

  it('lance l’évaluation, permet de l’arrêter, puis affiche le score', async () => {
    let signalRecu;
    let resoudre;
    const actions = { ...actionsFactices(), evaluerFiche: vi.fn((id, { signal }) => { signalRecu = signal; return new Promise(r => { resoudre = r; }); }) };
    const p = panneauFiche(fiche(), fictif, actions, { assets: true, sample: true });
    bouton(p, 'Évaluer').click();
    expect(actions.evaluerFiche).toHaveBeenCalledWith('f1', expect.objectContaining({ signal: expect.any(AbortSignal) }));
    expect(bouton(p, 'Évaluation…').disabled).toBe(true);
    bouton(p, 'Arrêter').click();
    expect(signalRecu.aborted).toBe(true);
    resoudre({ ok: true, fiche: evaluee() });
    await vi.waitFor(() => expect(p.textContent).toContain('Score : 72/100'));
    expect(p.textContent).toContain('Accroche et diffusion : 30/40. Nette.');
    expect(p.textContent).toContain('Hors des créneaux recommandés du profil.');
    expect(p.textContent).toContain('R3');
    expect(bouton(p, 'Réévaluer')).toBeDefined();
  });

  it('affiche la raison d’un échec et garde le bouton', async () => {
    const actions = { ...actionsFactices(), evaluerFiche: vi.fn(async () => ({ ok: false, raison: 'Trop de demandes à Claude pour le moment : réessaie un peu plus tard.' })) };
    const p = panneauFiche(fiche(), fictif, actions, { assets: true, sample: true });
    bouton(p, 'Évaluer').click();
    await vi.waitFor(() => expect(p.querySelector('.panneau-message').textContent).toBe('Trop de demandes à Claude pour le moment : réessaie un peu plus tard.'));
    expect(bouton(p, 'Évaluer')).toBeDefined();
  });

  it('retire le bouton quand l’évaluation est indisponible', async () => {
    const actions = { ...actionsFactices(), evaluerFiche: vi.fn(async () => ({ ok: false, raison: 'Indisponible.', indisponible: true })) };
    const p = panneauFiche(fiche(), fictif, actions, { assets: true, sample: true });
    bouton(p, 'Évaluer').click();
    await vi.waitFor(() => expect(p.querySelector('.panneau-message').textContent).toBe('Indisponible.'));
    expect(bouton(p, 'Évaluer')).toBeUndefined();
  });

  it('un arrêt affiche « Évaluation arrêtée. »', async () => {
    const actions = { ...actionsFactices(), evaluerFiche: vi.fn(async () => ({ ok: false, annule: true })) };
    const p = panneauFiche(fiche(), fictif, actions, { assets: true, sample: true });
    bouton(p, 'Évaluer').click();
    await vi.waitFor(() => expect(p.querySelector('.panneau-message').textContent).toBe('Évaluation arrêtée.'));
  });

  it('montre une conformité bloquante avec ses causes', () => {
    const f = evaluee();
    const rouge = { ...f, score: { ...f.score, total: 40, conformite: { etat: 'rouge', causes: ['mot à éviter « mindset »'] } } };
    const p = panneauFiche(rouge, fictif, actionsFactices(), { assets: true, sample: true });
    expect(p.textContent).toContain('Conformité : bloquante. mot à éviter « mindset »');
  });

  it('« Utiliser » applique une caption, une accroche ou les hashtags proposés', () => {
    const actions = actionsFactices();
    const p = panneauFiche(evaluee(), fictif, actions, { assets: true, sample: true });
    const utiliser = [...p.querySelectorAll('.suggestion button')];
    utiliser[0].click();
    expect(actions.modifierFiche).toHaveBeenCalledWith('f1', { caption: 'Variante A' });
    expect(p.querySelector('textarea[name="caption"]').value).toBe('Variante A');
    bouton(p, 'Utiliser ces hashtags').click();
    expect(actions.modifierFiche).toHaveBeenCalledWith('f1', { hashtags: ['nuit', 'socio'] });
    const accroche = [...p.querySelectorAll('.suggestion')].find(li => li.textContent.includes('Acc 2')).querySelector('button');
    accroche.click();
    expect(actions.modifierFiche).toHaveBeenCalledWith('f1', { accroche: 'Acc 2' });
  });

  it('affiche « repassée en Brouillon » quand l’évaluation fait perdre la validation', async () => {
    const f = fiche({ statut: 'valide' });
    const actions = { ...actionsFactices(), evaluerFiche: vi.fn(async () => ({ ok: true, fiche: { ...evaluee(), statut: 'brouillon' } })) };
    const p = panneauFiche(f, fictif, actions, { assets: true, sample: true });
    bouton(p, 'Évaluer').click();
    await vi.waitFor(() => {
      const brouillonBouton = bouton(p, 'Brouillon');
      expect(brouillonBouton.getAttribute('aria-pressed')).toBe('true');
    });
    expect(p.querySelector('.panneau-message').textContent).toBe('La fiche est repassée en Brouillon : réévalue-la.');
  });

  it('« Utiliser » affiche « repassée en Brouillon » quand modifierFiche renvoie un nouveau statut', () => {
    const f = { ...evaluee(), statut: 'valide' };
    const actions = { ...actionsFactices(), modifierFiche: vi.fn(() => ({ ...f, statut: 'brouillon' })) };
    const p = panneauFiche(f, fictif, actions, { assets: true, sample: true });
    const utiliserCaption = [...p.querySelectorAll('.suggestion button')][0];
    utiliserCaption.click();
    const brouillonBouton = bouton(p, 'Brouillon');
    expect(brouillonBouton.getAttribute('aria-pressed')).toBe('true');
    expect(p.querySelector('.panneau-message').textContent).toBe('La fiche est repassée en Brouillon : réévalue-la.');
  });

  it('« Utiliser » garde le même nœud de caption, mis à jour et focus', () => {
    const actions = actionsFactices();
    const p = panneauFiche(evaluee(), fictif, actions, { assets: true, sample: true });
    document.body.appendChild(p);
    const caption = p.querySelector('textarea[name="caption"]');
    const utiliserCaption = [...p.querySelectorAll('.suggestion button')][0];
    utiliserCaption.click();
    expect(p.querySelector('textarea[name="caption"]')).toBe(caption);
    expect(caption.value).toBe('Variante A');
    expect(document.activeElement).toBe(caption);
    document.body.removeChild(p);
  });

  it('affiche un message d’échec et remet « Évaluer » quand evaluerFiche rejette', async () => {
    const actions = { ...actionsFactices(), evaluerFiche: vi.fn(async () => { throw new Error('réseau coupé'); }) };
    const p = panneauFiche(fiche(), fictif, actions, { assets: true, sample: true });
    bouton(p, 'Évaluer').click();
    await vi.waitFor(() => expect(p.querySelector('.panneau-message').textContent).toBe('L’évaluation a échoué : réessaie. Rien n’a été modifié.'));
    expect(bouton(p, 'Évaluer')).toBeDefined();
  });

  it('ignore un second clic sur « Évaluer » pendant une évaluation en cours', () => {
    const actions = { ...actionsFactices(), evaluerFiche: vi.fn(() => new Promise(() => {})) };
    const p = panneauFiche(fiche(), fictif, actions, { assets: true, sample: true });
    bouton(p, 'Évaluer').click();
    bouton(p, 'Évaluation…').click();
    expect(actions.evaluerFiche).toHaveBeenCalledTimes(1);
  });

  it('affiche un titre « Alertes » avant la liste des alertes', () => {
    const p = panneauFiche(evaluee(), fictif, actionsFactices(), { assets: true, sample: true });
    const titres = [...p.querySelectorAll('h4')].map(el => el.textContent);
    expect(titres).toContain('Alertes');
  });
});

describe('section Statistiques', () => {
  const actionsStats = (releves = []) => ({
    ...actionsFactices(),
    maintenant: () => '2026-09-23T10:00:00.000Z',
    lireRelevesFiche: vi.fn(async () => ({ ok: true, releves })),
    enregistrerReleveContenu: vi.fn(async (id, releve, saisie) => ({ ok: true, erreurs: [], releve: { id: `${id}_${releve}`, fiche: id, releve, vues: Number(saisie.vues), nouveaux_abonnes: Number(saisie.nouveaux_abonnes), partages_envois: Number(saisie.partages_envois) } })),
  });
  const publiee = () => fiche({ statut: 'publie', date_heure: '2026-09-20T10:00:00.000Z' });

  it('n’apparaît pas avant la publication', () => {
    const p = panneauFiche(fiche(), fictif, actionsStats(), { assets: true });
    expect(p.querySelector('.stats-fiche')).toBeNull();
  });

  it('signale le relevé à 48 h en retard', async () => {
    const p = panneauFiche(publiee(), fictif, actionsStats(), { assets: true });
    await vi.waitFor(() => expect(p.querySelector('.etiquette-retard')?.textContent).toBe('Stats à saisir'));
    expect(p.querySelector('.stats-fiche').textContent).toContain('Relevé à 48 h');
    expect(p.querySelector('.stats-fiche').textContent).toContain('Relevé à 7 jours');
    expect(p.querySelector('input[name="48h-clics_porte"]')).toBeNull();
  });

  it('enregistre un relevé et affiche le taux', async () => {
    const actions = actionsStats();
    const p = panneauFiche(publiee(), fictif, actions, { assets: true });
    await vi.waitFor(() => expect(p.querySelector('input[name="48h-vues"]')).not.toBeNull());
    saisir(p.querySelector('input[name="48h-vues"]'), '1000');
    saisir(p.querySelector('input[name="48h-nouveaux_abonnes"]'), '4');
    saisir(p.querySelector('input[name="48h-partages_envois"]'), '9');
    p.querySelector('form.releve').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await vi.waitFor(() => expect(p.querySelector('.stats-fiche').textContent).toContain('0,4 % d’abonnés par vue'));
    expect(actions.enregistrerReleveContenu).toHaveBeenCalledWith('f1', '48h', expect.objectContaining({ vues: '1000', nouveaux_abonnes: '4', partages_envois: '9' }));
    expect(p.querySelector('.etiquette-retard')).toBeNull();
  });

  it('affiche les erreurs de saisie', async () => {
    const actions = actionsStats();
    actions.enregistrerReleveContenu = vi.fn(async () => ({ ok: false, erreurs: ['Vues : valeur requise.'] }));
    const p = panneauFiche(publiee(), fictif, actions, { assets: true });
    await vi.waitFor(() => expect(p.querySelector('form.releve')).not.toBeNull());
    p.querySelector('form.releve').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await vi.waitFor(() => expect(p.querySelector('form.releve').textContent).toContain('Vues : valeur requise.'));
  });

  it('propose les clics sur la porte pour une story', async () => {
    const p = panneauFiche({ ...publiee(), format: 'story' }, fictif, actionsStats(), { assets: true });
    await vi.waitFor(() => expect(p.querySelector('input[name="48h-clics_porte"]')).not.toBeNull());
  });
});
