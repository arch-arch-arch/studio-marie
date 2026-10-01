import { describe, it, expect } from 'vitest';
import { creerFauxSupabase } from '../aides/fauxSupabase.js';
import { creerVisuelsSupabase } from '../../src/socle/visuels-supabase.js';

const fichier = (type, taille = 10, nom = 'photo.png') => Object.assign(new Blob([new Uint8Array(taille)], { type }), { name: nom });

describe('creerVisuelsSupabase', () => {
  it('téléverse, signe et télécharge', async () => {
    const client = creerFauxSupabase();
    const visuels = creerVisuelsSupabase(client, { idAleatoire: () => 'abc' });
    const { id } = await visuels.upload(fichier('image/png'));
    expect(id).toBe('abc.png');
    expect(client._fichiers.has('visuels/abc.png')).toBe(true);
    expect(await visuels.url(id)).toBe('https://stockage.test/visuels/abc.png?jeton=1');
    expect((await visuels.telecharger(id)).type).toBe('image/png');
  });
  it('garde le type du Blob et ignore l’option contentType, comme storage-js', async () => {
    const client = creerFauxSupabase();
    const bucket = client.storage.from('visuels');
    await bucket.upload('a.png', fichier('image/png'), { contentType: 'image/jpeg' });
    expect(client._fichiers.get('visuels/a.png').type).toBe('image/png');
    await bucket.upload('b.txt', new Uint8Array(3), { contentType: 'image/jpeg' });
    expect(client._fichiers.get('visuels/b.txt').type).toBe('image/jpeg');
    await bucket.upload('c.bin', new Uint8Array(3));
    expect(client._fichiers.get('visuels/c.bin').type).toBe('text/plain;charset=utf-8'); // un Blob met son type en minuscules
  });
  it('refuse d’écraser un fichier existant', async () => {
    const client = creerFauxSupabase();
    const visuels = creerVisuelsSupabase(client, { idAleatoire: () => 'dup' });
    await visuels.upload(fichier('image/png', 10));
    const premier = client._fichiers.get('visuels/dup.png');
    await expect(visuels.upload(fichier('image/png', 20))).rejects.toMatchObject({ code: 'unavailable' });
    expect(client._fichiers.get('visuels/dup.png')).toBe(premier);
  });
  it('distingue la session expirée (401, 403)', async () => {
    const client = creerFauxSupabase();
    const visuels = creerVisuelsSupabase(client, { idAleatoire: () => 'x' });
    for (const statusCode of ['401', '403']) {
      client._panne({ message: 'Unauthorized', statusCode });
      await expect(visuels.upload(fichier('image/png'))).rejects.toMatchObject({ code: 'revoked' });
      await expect(visuels.url('a.png')).rejects.toMatchObject({ code: 'revoked' });
    }
  });
  it('donne une extension selon le type quand le nom n’en a pas', async () => {
    const visuels = creerVisuelsSupabase(creerFauxSupabase(), { idAleatoire: () => 'v1' });
    expect((await visuels.upload(fichier('video/mp4', 10, 'clip'))).id).toBe('v1.mp4');
    expect((await visuels.upload(fichier('image/jpeg', 10, 'a.JPG'))).id).toBe('v1.jpg');
  });
  it('refuse les types et tailles non acceptés avant tout envoi', async () => {
    const client = creerFauxSupabase();
    const visuels = creerVisuelsSupabase(client, { idAleatoire: () => 'x' });
    await expect(visuels.upload(fichier('application/pdf'))).rejects.toMatchObject({ code: 'unsupported_type' });
    await expect(visuels.upload(fichier('image/png', 20 * 1024 * 1024 + 1))).rejects.toMatchObject({ code: 'too_large' });
    expect(client._fichiers.size).toBe(0);
  });
  it('traduit les erreurs du stockage', async () => {
    const client = creerFauxSupabase();
    const visuels = creerVisuelsSupabase(client, { idAleatoire: () => 'x' });
    client._panne({ message: 'Payload too large', statusCode: '413' });
    await expect(visuels.upload(fichier('image/png'))).rejects.toMatchObject({ code: 'too_large' });
    client._panne({ message: 'Too many requests', statusCode: '429' });
    await expect(visuels.upload(fichier('image/png'))).rejects.toMatchObject({ code: 'rate_limited' });
    client._panne(null);
    await expect(visuels.url('absent.png')).rejects.toMatchObject({ code: 'not_found' });
  });
});
