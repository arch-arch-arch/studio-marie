// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import { creerFauxSupabase } from '../aides/fauxSupabase.js';
import { creerConnexion } from '../../src/socle/connexion.js';
import { creerSocle } from '../../src/socle/socle.js';

describe('creerSocle', () => {
  it('sert les capacités de base et laisse l’évaluation et la veille éteintes', async () => {
    const client = creerFauxSupabase();
    const socle = creerSocle({ client, connexion: creerConnexion(client, { origine: 'https://studio.test' }), document, capacitesServeur: { evaluation: false, veille: false } });
    for (const nom of ['db', 'assets', 'downloads', 'connexion']) expect(await socle.use(nom)).not.toBeNull();
    expect(typeof (await socle.use('db')).doc).toBe('function');
    expect(typeof (await socle.use('assets')).telecharger).toBe('function');
    expect(await socle.use('sample')).toBeNull();
    expect(await socle.use('veille')).toBeNull();
    expect(await socle.use('inconnu')).toBeNull();
  });
});
