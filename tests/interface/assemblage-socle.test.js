// @vitest-environment happy-dom
import { describe, it, expect, vi } from 'vitest';
import fictif from '../../exemples/profil-fictif.json';
import { creerFauxSupabase } from '../aides/fauxSupabase.js';
import { creerConnexion } from '../../src/socle/connexion.js';
import { creerSocle } from '../../src/socle/socle.js';
import { demarrer } from '../../src/interface/app.js';

const horloge = () => '2026-09-28T08:00:00.000Z';
const DELAI_ENREGISTREMENT = 20;
const DELAI_GRACE = 300;
const attendre = ms => new Promise(r => setTimeout(r, ms));
const BANDEAU = 'La base du studio ne répond pas.';

const REPONSE = {
  notes: { accroche: 8, voix: 7, mecanique: 6 },
  phrases: { accroche: 'A.', voix: 'V.', mecanique: 'M.' },
  conformite: { etat: 'vert', causes: [] },
  captions: [{ role: 'engagement', texte: 'Variante A' }, { role: 'deadpan', texte: 'Variante B' }],
  accroches: ['Acc 1', 'Acc 2'],
  hashtags: ['nuit', 'socio'],
  recommandations: ['R1', 'R2', 'R3'],
};

async function assembler({ sample = null, evaluation = false } = {}) {
  const client = creerFauxSupabase();
  const connexion = creerConnexion(client, { origine: 'https://studio.test' });
  const socle = creerSocle({ client, connexion, document, capacitesServeur: { evaluation, veille: false }, extras: { sample }, delaiGraceMs: DELAI_GRACE });
  const racine = document.createElement('div');
  const app = await demarrer(racine, socle, { horloge, delaiEnregistrement: DELAI_ENREGISTREMENT });
  return { client, racine, app };
}

describe('assemblage du socle Supabase et de l’interface', () => {
  it('enregistre une fiche, garde l’écran sur un décrochage bref du temps réel, signale une vraie coupure puis l’efface', async () => {
    const { client, racine, app } = await assembler();
    expect((await app.actions.importerProfil(JSON.stringify(fictif))).ok).toBe(true);
    expect(client._lignes.has('profil/courant')).toBe(true);
    await vi.waitFor(() => expect(app.etat.lire().profil).toBeTruthy());

    const f = await app.actions.creerFiche({ format: 'reel', date_heure: '2026-09-28T10:00:00.000Z' });
    app.actions.modifierFiche(f.id, { accroche: 'Accroche visible' });
    await app.actions.fermerPanneau();
    await vi.waitFor(() => expect(client._lignes.get(`fiches/${f.id}`)?.data.accroche).toBe('Accroche visible'));
    await vi.waitFor(() => expect(racine.textContent).toContain('Accroche visible'));

    // Décrochage bref : CHANNEL_ERROR puis SUBSCRIBED avant le délai de grâce.
    client._canal('CHANNEL_ERROR');
    await attendre(40);
    client._canal('SUBSCRIBED');
    await attendre(DELAI_GRACE + 150);
    expect(racine.textContent).not.toContain(BANDEAU);
    expect(app.etat.lire().erreur).toBeNull();
    expect(racine.textContent).toContain('Accroche visible');

    // Vraie coupure : pas de SUBSCRIBED dans le délai de grâce.
    client._canal('CHANNEL_ERROR');
    await vi.waitFor(() => expect(racine.textContent).toContain(BANDEAU), { timeout: DELAI_GRACE + 1000 });
    expect(racine.textContent).toContain('Accroche visible');

    // Retour du canal : le bandeau est effacé par le premier instantané.
    client._canal('SUBSCRIBED');
    await vi.waitFor(() => expect(racine.textContent).not.toContain(BANDEAU));
    expect(racine.textContent).toContain('Accroche visible');
  });

  it('envoie à l’évaluation le Blob téléchargé du stockage (chargerImage)', async () => {
    const sample = { limits: async () => ({ images: { mediaTypes: ['image/png'], maxInputBytes: 1000000 } }), json: vi.fn(async () => REPONSE) };
    const { client, app } = await assembler({ sample, evaluation: true });
    await app.actions.importerProfil(JSON.stringify(fictif));
    await vi.waitFor(() => expect(app.etat.lire().profil).toBeTruthy());
    const f = await app.actions.creerFiche({ format: 'reel', date_heure: '2026-09-28T10:00:00.000Z' });
    const televerse = await app.actions.televerserVisuel(f.id, new Blob([new Uint8Array([137, 80, 78, 71])], { type: 'image/png' }));
    expect(televerse.ok).toBe(true);
    expect(client._fichiers.has(`visuels/${televerse.id}`)).toBe(true);
    const resultat = await app.actions.evaluerFiche(f.id);
    expect(resultat.ok).toBe(true);
    expect(sample.json).toHaveBeenCalledTimes(1);
    const { images } = sample.json.mock.calls[0][1];
    expect(images).toBeInstanceOf(Blob);
    expect(images.type).toBe('image/png');
  });
});
