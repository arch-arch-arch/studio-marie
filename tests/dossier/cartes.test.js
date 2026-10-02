import { describe, it, expect, vi } from 'vitest';
import { dimensionsCarte, preparerCartes, imageDepuisBlob, imagesDepuisVideo } from '../../src/dossier/cartes.js';

describe('dimensionsCarte', () => {
  it('pose une image sous le bandeau, bord long à 1568 au plus', () => {
    const d = dimensionsCarte({ largeurs: [3584], hauteurs: [2016] });
    expect(d.largeur).toBe(1568);
    expect(d.cases[0]).toMatchObject({ x: 0, largeur: 1568 });
    expect(d.cases[0].y).toBe(d.bandeau);
    expect(Math.max(d.largeur, d.hauteur)).toBeLessThanOrEqual(1568);
  });
  it('garde une image verticale entière', () => {
    const d = dimensionsCarte({ largeurs: [1080], hauteurs: [1920] });
    expect(d.hauteur).toBeLessThanOrEqual(1568);
    expect(d.cases[0].hauteur + d.bandeau).toBe(d.hauteur);
    expect(d.cases[0].largeur / d.cases[0].hauteur).toBeCloseTo(1080 / 1920, 2);
  });
  it('aligne trois images de vidéo côte à côte', () => {
    const d = dimensionsCarte({ largeurs: [1080, 1080, 1080], hauteurs: [1920, 1920, 1920] });
    expect(d.cases).toHaveLength(3);
    expect(d.cases[1].x).toBeGreaterThan(d.cases[0].x + d.cases[0].largeur - 1);
    expect(d.largeur).toBeLessThanOrEqual(1568);
    expect(d.largeur).toBeGreaterThanOrEqual(600);
  });
  it.each([
    ['très large', [5000], [500]],
    ['très haute', [500], [5000]],
    ['trois images de vidéo horizontales', [1920, 1920, 1920], [1080, 1080, 1080]],
    ['minuscule', [1], [1]],
  ])('ne dépasse jamais 1568 sur son bord long : %s', (_, largeurs, hauteurs) => {
    const d = dimensionsCarte({ largeurs, hauteurs });
    expect(Math.max(d.largeur, d.hauteur)).toBeLessThanOrEqual(1568);
    for (const c of d.cases) {
      expect(c.x + c.largeur).toBeLessThanOrEqual(d.largeur);
      expect(c.y + c.hauteur).toBeLessThanOrEqual(d.hauteur);
      expect(c.largeur).toBeGreaterThanOrEqual(1);
    }
    expect(d.echelle).toBeGreaterThan(0);
    expect(d.echelle).toBeLessThanOrEqual(1);
  });
});

const demande = ref => ({ ref, etiquette: `${ref} · lun.`, visuel: `v-${ref}`, type: null });

describe('preparerCartes avec des outils injectés', () => {
  const dessiner = vi.fn(async (etiquette, sources) => ({ carte: new Blob(['x']), largeur: 10, hauteur: 10, n: sources.length }));
  it('traite les fiches dans l’ordre et continue après un échec', async () => {
    const ordre = [];
    const charger = async id => { ordre.push(id); if (id === 'v-F02') throw new Error('absent'); return new Blob([id]); };
    const versImage = vi.fn(async () => ({ width: 1, height: 1 }));
    const cartes = await preparerCartes([demande('F01'), demande('F02'), demande('F03')], charger, { versImage, versImagesVideo: vi.fn(), dessiner });
    expect(ordre).toEqual(['v-F01', 'v-F02', 'v-F03']);
    expect([...cartes.keys()]).toEqual(['F01', 'F02', 'F03']);
    expect(cartes.get('F01').ok).toBe(true);
    expect(cartes.get('F02')).toEqual({ ok: false });
    expect(cartes.get('F03').ok).toBe(true);
  });
  it('donne ok:false quand le chargement dépasse le délai, sans bloquer la suite', async () => {
    const charger = id => (id === 'v-F01' ? new Promise(() => {}) : Promise.resolve(new Blob(['x'])));
    const cartes = await preparerCartes([demande('F01'), demande('F02')], charger, { versImage: async () => ({ width: 1, height: 1 }), dessiner, delaiChargementMs: 20 });
    expect(cartes.get('F01')).toEqual({ ok: false });
    expect(cartes.get('F02').ok).toBe(true);
  });
  it('utilise 8 secondes par défaut', async () => {
    vi.useFakeTimers();
    try {
      const p = preparerCartes([demande('F01')], () => new Promise(() => {}), { dessiner });
      let fini = false;
      p.then(() => { fini = true; });
      await vi.advanceTimersByTimeAsync(7999);
      expect(fini).toBe(false);
      await vi.advanceTimersByTimeAsync(2);
      expect((await p).get('F01')).toEqual({ ok: false });
    } finally { vi.useRealTimers(); }
  });
  it('lit une vidéo avec versImagesVideo et une photo avec versImage', async () => {
    const versImage = vi.fn(async () => ({ width: 1, height: 1 }));
    const versImagesVideo = vi.fn(async () => [{ width: 1, height: 1 }, { width: 1, height: 1 }]);
    const cartes = await preparerCartes([{ ...demande('F01'), type: 'video' }, demande('F02')], async () => new Blob(['x']), { versImage, versImagesVideo, dessiner });
    expect(versImagesVideo).toHaveBeenCalledTimes(1);
    expect(versImage).toHaveBeenCalledTimes(1);
    expect(cartes.get('F01').n).toBe(2);
    expect(cartes.get('F02').n).toBe(1);
  });
  it('donne ok:false quand la lecture de la vidéo ou le dessin échoue', async () => {
    const cartes = await preparerCartes([{ ...demande('F01'), type: 'video' }, demande('F02')], async () => new Blob(['x']), {
      versImage: async () => ({ width: 1, height: 1 }), versImagesVideo: async () => { throw new Error('vidéo'); }, dessiner: async () => { throw new Error('toile'); },
    });
    expect(cartes.get('F01')).toEqual({ ok: false });
    expect(cartes.get('F02')).toEqual({ ok: false });
  });
  it('libère les images de la carte', async () => {
    const close = vi.fn();
    await preparerCartes([demande('F01')], async () => new Blob(['x']), { versImage: async () => ({ width: 1, height: 1, close }), dessiner });
    expect(close).toHaveBeenCalledTimes(1);
  });
});

describe('libération de la mémoire par preparerCartes', () => {
  const demande2 = (ref, type = null) => ({ ref, etiquette: `${ref} · lun.`, visuel: `v-${ref}`, type });
  it('libère les sources après un dessin réussi (close pour un bitmap, taille nulle pour un canvas)', async () => {
    const bitmap = { width: 8, height: 8, close: vi.fn() };
    const toile = { width: 400, height: 300 };
    const dessiner = async () => ({ carte: new Blob(['x']), largeur: 1, hauteur: 1 });
    await preparerCartes([demande2('F01'), demande2('F02', 'video')], async () => new Blob(['x']), {
      versImage: async () => bitmap, versImagesVideo: async () => [toile], dessiner,
    });
    expect(bitmap.close).toHaveBeenCalledTimes(1);
    expect(toile).toMatchObject({ width: 0, height: 0 });
  });
  it('libère les sources même quand le dessin échoue', async () => {
    const bitmap = { width: 8, height: 8, close: vi.fn() };
    const toiles = [{ width: 400, height: 300 }, { width: 400, height: 300 }];
    const dessiner = async () => { throw new Error('toile'); };
    const cartes = await preparerCartes([demande2('F01'), demande2('F02', 'video')], async () => new Blob(['x']), {
      versImage: async () => bitmap, versImagesVideo: async () => toiles, dessiner,
    });
    expect(cartes.get('F01')).toEqual({ ok: false });
    expect(cartes.get('F02')).toEqual({ ok: false });
    expect(bitmap.close).toHaveBeenCalledTimes(1);
    for (const t of toiles) expect(t).toMatchObject({ width: 0, height: 0 });
  });
  it('libère une image qui arrive après le délai de décodage', async () => {
    const bitmap = { width: 8, height: 8, close: vi.fn() };
    const dessiner = vi.fn();
    const cartes = await preparerCartes([demande2('F01')], async () => new Blob(['x']), {
      versImage: () => new Promise(ok => setTimeout(() => ok(bitmap), 60)), dessiner, delaiImageMs: 10,
    });
    expect(cartes.get('F01')).toEqual({ ok: false });
    expect(dessiner).not.toHaveBeenCalled();
    await new Promise(ok => setTimeout(ok, 100));
    expect(bitmap.close).toHaveBeenCalledTimes(1);
  });
});

describe('délai de décodage d’une photo', () => {
  it('donne ok:false sans bloquer la suite quand versImage ne rend jamais la main', async () => {
    const dessiner = async () => ({ carte: new Blob(['x']), largeur: 1, hauteur: 1 });
    let appels = 0;
    const versImage = () => (appels++ === 0 ? new Promise(() => {}) : Promise.resolve({ width: 1, height: 1 }));
    const cartes = await preparerCartes([demande('F01'), demande('F02')], async () => new Blob(['x']), { versImage, dessiner, delaiImageMs: 20 });
    expect(cartes.get('F01')).toEqual({ ok: false });
    expect(cartes.get('F02').ok).toBe(true);
  });
  it('utilise 8 secondes par défaut', async () => {
    vi.useFakeTimers();
    try {
      const p = preparerCartes([demande('F01')], async () => new Blob(['x']), { versImage: () => new Promise(() => {}), dessiner: vi.fn() });
      let fini = false;
      p.then(() => { fini = true; });
      await vi.advanceTimersByTimeAsync(7999);
      expect(fini).toBe(false);
      await vi.advanceTimersByTimeAsync(2);
      expect((await p).get('F01')).toEqual({ ok: false });
    } finally { vi.useRealTimers(); }
  });
});

describe('imageDepuisBlob', () => {
  const blob = new Blob(['x']);
  const fauxURL = () => ({ createObjectURL: vi.fn(() => 'blob:x'), revokeObjectURL: vi.fn() });
  class ImageOk { set src(v) { setTimeout(() => { this.width = 4; this.height = 5; this.onload(); }, 0); } }
  class ImageKo { set src(v) { setTimeout(() => this.onerror(new Error('x')), 0); } }

  it('demande l’orientation enregistrée dans l’image', async () => {
    const image = { width: 3, height: 2 };
    const createImageBitmap = vi.fn(async () => image);
    expect(await imageDepuisBlob(blob, { createImageBitmap })).toBe(image);
    expect(createImageBitmap).toHaveBeenCalledWith(blob, { imageOrientation: 'from-image' });
  });
  it('réduit une grande photo à la taille de sa case et libère l’original', async () => {
    const original = { width: 4000, height: 3000, close: vi.fn() };
    const reduite = { width: 1568, height: 1176 };
    const createImageBitmap = vi.fn(async src => (src === blob ? original : reduite));
    expect(await imageDepuisBlob(blob, { createImageBitmap })).toBe(reduite);
    expect(createImageBitmap).toHaveBeenNthCalledWith(1, blob, { imageOrientation: 'from-image' });
    expect(createImageBitmap).toHaveBeenNthCalledWith(2, original, expect.objectContaining({ resizeWidth: 1568, resizeHeight: 1176 }));
    expect(original.close).toHaveBeenCalledTimes(1);
  });
  it('garde l’original quand la réduction est refusée', async () => {
    const original = { width: 4000, height: 3000, close: vi.fn() };
    const createImageBitmap = vi.fn(async src => { if (src === blob) return original; throw new Error('option refusée'); });
    expect(await imageDepuisBlob(blob, { createImageBitmap })).toBe(original);
    expect(original.close).not.toHaveBeenCalled();
  });
  it('se replie sur un élément Image sans createImageBitmap, puis révoque l’URL', async () => {
    const URL = fauxURL();
    const image = await imageDepuisBlob(blob, { createImageBitmap: null, Image: ImageOk, URL });
    expect(image).toMatchObject({ width: 4, height: 5 });
    expect(URL.createObjectURL).toHaveBeenCalledWith(blob);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:x');
  });
  it('se replie sur un élément Image quand createImageBitmap lève', async () => {
    const URL = fauxURL();
    const createImageBitmap = vi.fn(async () => { throw new Error('non'); });
    const image = await imageDepuisBlob(blob, { createImageBitmap, Image: ImageOk, URL });
    expect(image.width).toBe(4);
    expect(URL.revokeObjectURL).toHaveBeenCalledTimes(1);
  });
  it('révoque l’URL et lève quand l’image est illisible', async () => {
    const URL = fauxURL();
    await expect(imageDepuisBlob(blob, { createImageBitmap: null, Image: ImageKo, URL })).rejects.toThrow();
    expect(URL.revokeObjectURL).toHaveBeenCalledTimes(1);
  });
});

describe('imagesDepuisVideo', () => {
  function fausseVideo({ frameCallback = true, playRejette = false } = {}) {
    const journal = [];
    const v = {
      journal, duration: 6, videoWidth: 1080, videoHeight: 1920, readyState: 0, delaiSeek: 0,
      removeAttribute(n) { journal.push(`remove ${n}`); },
      load() { journal.push('load'); },
      play() {
        journal.push('play');
        if (playRejette) return Promise.reject(new Error('refus'));
        setTimeout(() => { v.readyState = 2; journal.push('image'); if (frameCallback) v._frame?.(); else v.onloadeddata?.(); }, 0);
        return Promise.resolve();
      },
      pause() { journal.push('pause'); },
      set src(x) { setTimeout(() => v.onloadedmetadata?.(), 0); },
      set currentTime(t) { journal.push(`seek ${t}`); setTimeout(() => v.onseeked?.(), v.delaiSeek); },
    };
    if (frameCallback) v.requestVideoFrameCallback = f => { v._frame = f; };
    return v;
  }
  const document = (video, toiles = []) => ({
    createElement: nom => {
      if (nom === 'video') return video;
      const toile = { width: 0, height: 0, getContext: () => ({ drawImage: () => {} }) };
      toiles.push(toile);
      return toile;
    },
  });
  const faux = () => ({ createObjectURL: () => 'blob:v', revokeObjectURL: vi.fn() });

  it.each([[true], [false]])('lance la lecture muette, attend la première image, met en pause puis parcourt trois instants (requestVideoFrameCallback : %s)', async frameCallback => {
    const video = fausseVideo({ frameCallback });
    const u = faux();
    const images = await imagesDepuisVideo(new Blob(['v']), document(video), { URL: u });
    expect(images).toHaveLength(3);
    expect(video.muted).toBe(true);
    expect(video.playsInline).toBe(true);
    expect(video.journal.slice(0, 3)).toEqual(['play', 'image', 'pause']);
    // La couverture est la première image livrée (aucun retour à 0), puis le tiers et les deux tiers de la durée.
    expect(video.journal.slice(3, 5)).toEqual(['seek 2', 'seek 4']);
    expect(video.journal).not.toContain('seek 0');
    expect(u.revokeObjectURL).toHaveBeenCalledWith('blob:v');
  });
  it('échoue quand la lecture est refusée', async () => {
    const u = faux();
    await expect(imagesDepuisVideo(new Blob(['v']), document(fausseVideo({ playRejette: true })), { URL: u })).rejects.toThrow();
    expect(u.revokeObjectURL).toHaveBeenCalledTimes(1);
  });
  it('échoue quand la première image n’arrive jamais', async () => {
    const video = fausseVideo();
    video.play = () => Promise.resolve();
    await expect(imagesDepuisVideo(new Blob(['v']), document(video), { URL: faux(), delaiMs: 30 })).rejects.toThrow();
  });
  it('dessine les images directement à 760 px de haut au plus, proportions gardées', async () => {
    const toiles = [];
    const images = await imagesDepuisVideo(new Blob(['v']), document(fausseVideo(), toiles), { URL: faux() });
    expect(toiles).toHaveLength(3);
    expect(images).toEqual(toiles);
    for (const t of toiles) {
      expect(t.height).toBe(760);
      expect(t.width).toBe(Math.round(1080 * 760 / 1920));
    }
  });
  it('garde une petite vidéo à sa taille', async () => {
    const video = fausseVideo();
    video.videoWidth = 320; video.videoHeight = 240;
    const toiles = [];
    await imagesDepuisVideo(new Blob(['v']), document(video, toiles), { URL: faux() });
    expect(toiles.every(t => t.width === 320 && t.height === 240)).toBe(true);
  });
  it('nettoie la vidéo : pause, retrait de la source, load, URL révoquée une seule fois', async () => {
    const video = fausseVideo();
    const u = faux();
    await imagesDepuisVideo(new Blob(['v']), document(video), { URL: u });
    expect(video.journal.slice(-3)).toEqual(['pause', 'remove src', 'load']);
    expect(u.revokeObjectURL).toHaveBeenCalledTimes(1);
  });
  it('ne prend que la couverture quand la durée est inconnue', async () => {
    const video = fausseVideo();
    video.duration = NaN;
    const images = await imagesDepuisVideo(new Blob(['v']), document(video), { URL: faux() });
    expect(images).toHaveLength(1);
    expect(video.journal.filter(j => j.startsWith('seek'))).toEqual([]);
  });
  it('n’ajoute aucune image après l’expiration du délai', async () => {
    const video = fausseVideo();
    // La couverture arrive vite ; le déplacement suivant dépasse le délai de la vidéo.
    Object.defineProperty(video, 'currentTime', { set(t) { setTimeout(() => video.onseeked?.(), t === 0 ? 0 : 150); } });
    const toiles = [];
    const u = faux();
    const images = await imagesDepuisVideo(new Blob(['v']), document(video, toiles), { URL: u, delaiMs: 60 });
    const auRendu = images.length;
    expect(auRendu).toBe(1);
    await new Promise(ok => setTimeout(ok, 300));
    expect(images).toHaveLength(auRendu);
    expect(toiles).toHaveLength(auRendu);
    expect(u.revokeObjectURL).toHaveBeenCalledTimes(1);
  });
  it('échoue sur une erreur de vidéo', async () => {
    const video = fausseVideo();
    Object.defineProperty(video, 'src', { set() { setTimeout(() => video.onerror?.(), 0); } });
    await expect(imagesDepuisVideo(new Blob(['v']), document(video), { URL: faux() })).rejects.toThrow();
  });
});

describe('passe finale E : délai de chargement, couverture, toBlob', () => {
  it('laisse 30 secondes à une vidéo et 8 secondes à une image', async () => {
    vi.useFakeTimers();
    try {
      const dessiner = vi.fn();
      const video = preparerCartes([{ ...demande('F01'), type: 'video' }], () => new Promise(() => {}), { dessiner });
      let fini = false;
      video.then(() => { fini = true; });
      await vi.advanceTimersByTimeAsync(29999);
      expect(fini).toBe(false);
      await vi.advanceTimersByTimeAsync(2);
      expect((await video).get('F01')).toEqual({ ok: false });
      const image = preparerCartes([demande('F02')], () => new Promise(() => {}), { dessiner });
      let finie = false;
      image.then(() => { finie = true; });
      await vi.advanceTimersByTimeAsync(8001);
      expect(finie).toBe(true);
    } finally { vi.useRealTimers(); }
  });
  it('rend les délais injectables', async () => {
    const dessiner = vi.fn();
    const cartes = await preparerCartes([{ ...demande('F01'), type: 'video' }, demande('F02')], () => new Promise(() => {}), { dessiner, delaiChargementMs: 10, delaiChargementVideoMs: 20 });
    expect(cartes.get('F01')).toEqual({ ok: false });
    expect(cartes.get('F02')).toEqual({ ok: false });
  });

  it('prend la couverture même quand aucun seeked n’arrive pour l’instant 0', async () => {
    const journal = [];
    const video = {
      journal, duration: 6, videoWidth: 1080, videoHeight: 1920, readyState: 0,
      requestVideoFrameCallback(f) { video._frame = f; },
      removeAttribute() {}, load() {}, pause() {},
      play() { setTimeout(() => { video.readyState = 2; video._frame?.(); }, 0); return Promise.resolve(); },
      set src(x) { setTimeout(() => video.onloadedmetadata?.(), 0); },
      set currentTime(t) { journal.push(t); if (t !== 0) setTimeout(() => video.onseeked?.(), 0); },
    };
    const toiles = [];
    const doc = { createElement: nom => { if (nom === 'video') return video; const t = { width: 0, height: 0, getContext: () => ({ drawImage: () => {} }) }; toiles.push(t); return t; } };
    const images = await imagesDepuisVideo(new Blob(['v']), doc, { URL: { createObjectURL: () => 'blob:v', revokeObjectURL: vi.fn() }, delaiMs: 2000 });
    expect(images).toHaveLength(3);
    expect(journal).toEqual([2, 4]);
  });

  describe('toBlob', () => {
    const contexte = () => ({ fillRect() {}, fillText() {}, drawImage() {}, measureText: () => ({ width: 10 }) });
    const monterToile = toBlob => {
      const toile = { width: 0, height: 0, getContext: contexte, toBlob };
      return { toile, document: { createElement: () => toile } };
    };
    const lancer = (toBlob, extra = {}) => {
      const { toile, document } = monterToile(toBlob);
      return preparerCartes([demande('F01')], async () => new Blob(['x']), { document, versImage: async () => ({ width: 10, height: 10 }), ...extra }).then(c => ({ c, toile }));
    };
    it('donne ok:false et libère la toile quand toBlob lève de façon synchrone', async () => {
      const { c, toile } = await lancer(() => { throw new Error('toBlob'); });
      expect(c.get('F01')).toEqual({ ok: false });
      expect(toile).toMatchObject({ width: 0, height: 0 });
    });
    it('donne ok:false et libère la toile quand toBlob ne rappelle jamais', async () => {
      const { c, toile } = await lancer(() => {}, { delaiBlobMs: 20 });
      expect(c.get('F01')).toEqual({ ok: false });
      expect(toile).toMatchObject({ width: 0, height: 0 });
    });
    it('attend 8 secondes par défaut', async () => {
      vi.useFakeTimers();
      try {
        const { toile, document } = monterToile(() => {});
        const p = preparerCartes([demande('F01')], async () => new Blob(['x']), { document, versImage: async () => ({ width: 10, height: 10 }) });
        let fini = false;
        p.then(() => { fini = true; });
        await vi.advanceTimersByTimeAsync(7999);
        expect(fini).toBe(false);
        await vi.advanceTimersByTimeAsync(2);
        expect((await p).get('F01')).toEqual({ ok: false });
        expect(toile.width).toBe(0);
      } finally { vi.useRealTimers(); }
    });
    it('rend la carte quand toBlob rappelle', async () => {
      const { c } = await lancer(cb => cb(new Blob(['j'], { type: 'image/jpeg' })));
      expect(c.get('F01').ok).toBe(true);
    });
  });
});
