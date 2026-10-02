const BORD = 1568;
const BANDEAU = 130;
const ECART = 12;
const DELAI_VIDEO_MS = 8000;
const DELAI_CHARGEMENT_MS = 8000;
const DELAI_CHARGEMENT_VIDEO_MS = 30000;
const DELAI_BLOB_MS = 8000;
const HAUTEUR_IMAGE_VIDEO = 760;

// Pose les images d'une carte (1 photo, ou 3 images de vidéo) sous un bandeau.
// Le bord long de la carte ne dépasse jamais `bordMax` (limite de lecture des assistants).
export function dimensionsCarte({ largeurs, hauteurs, bordMax = BORD, bandeau = BANDEAU }) {
  const n = largeurs.length;
  const ls = largeurs.map(l => Math.max(1, Number(l) || 1));
  const hs = hauteurs.map(h => Math.max(1, Number(h) || 1));
  const hauteurCible = n === 1 ? Math.min(hs[0], bordMax - bandeau) : 760;
  let cases = ls.map((l, i) => ({ largeur: Math.max(1, Math.round(l * hauteurCible / hs[i])), hauteur: Math.max(1, Math.round(hauteurCible)) }));
  const ecarts = ECART * (n - 1);
  let total = cases.reduce((t, c) => t + c.largeur, 0) + ecarts;
  let echelle = 1;
  if (total > bordMax) {
    echelle = (bordMax - ecarts) / (total - ecarts);
    cases = cases.map(c => ({ largeur: Math.max(1, Math.floor(c.largeur * echelle)), hauteur: Math.max(1, Math.floor(c.hauteur * echelle)) }));
    total = cases.reduce((t, c) => t + c.largeur, 0) + ecarts;
  }
  const largeur = Math.max(total, Math.min(600, bordMax));
  const hauteurImages = Math.max(...cases.map(c => c.hauteur));
  let x = 0;
  const posees = cases.map(c => { const p = { x, y: bandeau, ...c }; x += c.largeur + ECART; return p; });
  return { largeur, hauteur: bandeau + hauteurImages, echelle, bandeau, cases: posees };
}

// Libère la mémoire d'une source (ImageBitmap, canvas ou Image) : Safari iOS plafonne la mémoire des canvas.
export function liberer(source) {
  if (!source) return;
  try {
    if (typeof source.close === 'function') source.close();
    else { source.width = 0; source.height = 0; }
  } catch { /* sans effet */ }
}

// « from-image » applique l'orientation enregistrée par l'appareil (photo de téléphone).
// La photo est ensuite réduite à la taille de sa case, l'original est libéré aussitôt (repli : on garde l'original).
// Repli sans createImageBitmap : un élément Image chargé depuis une URL d'objet, révoquée ensuite.
export async function imageDepuisBlob(blob, { createImageBitmap: pont = globalThis.createImageBitmap, Image: Img = globalThis.Image, URL: U = globalThis.URL } = {}) {
  if (typeof pont === 'function') {
    let image = null;
    try { image = await pont(blob, { imageOrientation: 'from-image' }); } catch { /* repli sur Image */ }
    if (image) {
      const case0 = dimensionsCarte({ largeurs: [image.width], hauteurs: [image.height] }).cases[0];
      if (case0.largeur >= image.width && case0.hauteur >= image.height) return image;
      try {
        const reduite = await pont(image, { resizeWidth: case0.largeur, resizeHeight: case0.hauteur, resizeQuality: 'high' });
        liberer(image);
        return reduite;
      } catch { return image; }
    }
  }
  const url = U.createObjectURL(blob);
  try {
    const image = new Img();
    await new Promise((ok, ko) => { image.onload = ok; image.onerror = () => ko(new Error('image illisible')); image.src = url; });
    return image;
  } finally {
    U.revokeObjectURL(url);
  }
}

// Sur iPhone, une vidéo ne livre une image qu'après un vrai démarrage de lecture.
export function imagesDepuisVideo(blob, doc, { nombre = 3, delaiMs = DELAI_VIDEO_MS, hauteurMax = HAUTEUR_IMAGE_VIDEO, URL: U = globalThis.URL } = {}) {
  return new Promise((resoudre, rejeter) => {
    const video = doc.createElement('video');
    const url = U.createObjectURL(blob);
    const images = [];
    let fini = false;
    const fin = (ok, valeur) => {
      if (fini) return;
      fini = true;
      clearTimeout(minuteur);
      try { video.pause?.(); } catch { /* sans effet */ }
      try { video.removeAttribute('src'); video.load?.(); } catch { /* sans effet */ }
      U.revokeObjectURL(url);
      if (!ok) images.forEach(liberer);
      (ok ? resoudre : rejeter)(valeur);
    };
    const minuteur = setTimeout(() => (images.length ? fin(true, images) : fin(false, new Error('délai'))), delaiMs);
    const premiereImage = () => new Promise(ok => {
      if (typeof video.requestVideoFrameCallback === 'function') video.requestVideoFrameCallback(() => ok());
      else if (video.readyState >= 2) ok();
      else video.onloadeddata = () => ok();
    });
    const aller = t => new Promise(ok => { video.onseeked = () => { video.onseeked = null; ok(); }; video.currentTime = t; });
    const parcourir = async () => {
      const duree = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 0;
      // Couverture d'abord (instant 0, sans déplacement), puis vers le tiers et les deux tiers de la durée.
      const instants = Array.from({ length: nombre }, (_, i) => (duree && i ? Math.min(duree - 0.05, (duree * i) / nombre) : 0)).filter((t, i, xs) => i === 0 || t !== xs[i - 1]);
      video.muted = true; video.playsInline = true;
      const attente = premiereImage();
      await video.play();
      await attente;
      if (fini) return;
      // Image dessinée directement à taille réduite, jamais à la taille native.
      const capturer = () => {
        const echelle = Math.min(1, hauteurMax / (video.videoHeight || hauteurMax));
        const toile = doc.createElement('canvas');
        toile.width = Math.max(1, Math.round(video.videoWidth * echelle));
        toile.height = Math.max(1, Math.round(video.videoHeight * echelle));
        try {
          toile.getContext('2d').drawImage(video, 0, 0, toile.width, toile.height);
          images.push(toile);
        } catch { liberer(toile); }
      };
      // La couverture est la première image livrée par la lecture : aucun retour à l'instant 0 (le seeked y est incertain sur iOS).
      capturer();
      video.pause();
      for (const t of instants.slice(1)) {
        await aller(t);
        if (fini) return;
        capturer();
      }
      if (fini) return;
      if (images.length) fin(true, images); else fin(false, new Error('aucune image'));
    };
    video.muted = true; video.playsInline = true; video.preload = 'auto';
    video.onerror = () => fin(false, new Error('vidéo illisible'));
    video.onloadedmetadata = () => { parcourir().catch(e => fin(false, e)); };
    video.src = url;
  });
}

function dessiner(doc, etiquette, sources, delaiBlobMs) {
  const toile = doc.createElement('canvas');
  // La toile de la carte est libérée après toBlob, ou tout de suite si le dessin échoue.
  try { return peindre(toile, etiquette, sources, delaiBlobMs); } catch (e) { liberer(toile); throw e; }
}

function peindre(toile, etiquette, sources, delaiBlobMs) {
  const d = dimensionsCarte({ largeurs: sources.map(s => s.width), hauteurs: sources.map(s => s.height) });
  toile.width = d.largeur; toile.height = d.hauteur;
  const c = toile.getContext('2d');
  c.fillStyle = '#ffffff'; c.fillRect(0, 0, d.largeur, d.hauteur);
  c.fillStyle = '#111111'; c.fillRect(0, 0, d.largeur, d.bandeau);
  c.fillStyle = '#ffffff'; c.textBaseline = 'middle';
  const [ref, ...reste] = etiquette.split(' · ');
  c.font = 'bold 78px Arial, Helvetica, sans-serif';
  c.fillText(ref, 28, d.bandeau / 2);
  const decalage = 28 + c.measureText(ref).width + 40;
  c.font = '38px Arial, Helvetica, sans-serif';
  c.fillText(reste.join(' · '), decalage, d.bandeau / 2 + 4, Math.max(50, d.largeur - decalage - 20));
  d.cases.forEach((k, i) => c.drawImage(sources[i], k.x, k.y, k.largeur, k.hauteur));
  // toBlob peut lever ou ne jamais rappeler (iOS sous pression mémoire) : la toile est libérée dans tous les cas.
  return new Promise((resoudre, rejeter) => {
    const minuteur = setTimeout(() => { liberer(toile); rejeter(new Error('délai de la carte')); }, delaiBlobMs);
    try {
      toile.toBlob(b => {
        clearTimeout(minuteur);
        liberer(toile);
        return b ? resoudre({ carte: b, largeur: d.largeur, hauteur: d.hauteur }) : rejeter(new Error('carte'));
      }, 'image/jpeg', 0.85);
    } catch (e) {
      clearTimeout(minuteur);
      liberer(toile);
      rejeter(e);
    }
  });
}

function avecDelai(promesse, ms, surRetard) {
  let minuteur;
  let expire = false;
  const delai = new Promise((_, ko) => { minuteur = setTimeout(() => { expire = true; ko(new Error('délai dépassé')); }, ms); });
  // Un résultat qui arrive après le délai n'est plus utilisé : on le libère.
  promesse.then(v => { if (expire) surRetard?.(v); }, () => {});
  return Promise.race([promesse, delai]).finally(() => clearTimeout(minuteur));
}

export async function preparerCartes(demandes, chargerVisuel, outils = {}) {
  const doc = outils.document ?? globalThis.document;
  const versImage = outils.versImage ?? (blob => imageDepuisBlob(blob));
  const versImagesVideo = outils.versImagesVideo ?? (blob => imagesDepuisVideo(blob, doc));
  const dessin = outils.dessiner ?? ((etiquette, sources) => dessiner(doc, etiquette, sources, outils.delaiBlobMs ?? DELAI_BLOB_MS));
  // Un Reel de 15 à 20 Mo ne se télécharge pas en 8 secondes sur réseau mobile : 30 secondes pour une vidéo.
  const delaiImageChargee = outils.delaiChargementMs ?? DELAI_CHARGEMENT_MS;
  const delaiVideoChargee = outils.delaiChargementVideoMs ?? DELAI_CHARGEMENT_VIDEO_MS;
  const delaiImage = outils.delaiImageMs ?? DELAI_CHARGEMENT_MS;
  const cartes = new Map();
  for (const d of demandes) {
    let sources = [];
    try {
      const blob = await avecDelai(Promise.resolve().then(() => chargerVisuel(d.visuel)), d.type === 'video' ? delaiVideoChargee : delaiImageChargee);
      sources = d.type === 'video' ? await versImagesVideo(blob) : [await avecDelai(Promise.resolve().then(() => versImage(blob)), delaiImage, liberer)];
      cartes.set(d.ref, { ok: true, ...(await dessin(d.etiquette, sources)) });
    } catch {
      cartes.set(d.ref, { ok: false });
    } finally {
      sources.forEach(liberer);
    }
  }
  return cartes;
}
