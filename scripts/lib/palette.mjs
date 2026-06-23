/**
 * Dérive la palette d'une fiche destination à partir de la couleur
 * dominante de la photo de couverture.
 *
 * Principe : on garde une identité rétro constante (accent moutarde,
 * touche chaude rouille, papier crème, encre sombre) et on fait varier
 * la COULEUR PRINCIPALE (hero, titres, footer) selon la photo — c'est
 * la plus grande surface, donc celle qui personnalise vraiment la page.
 * La principale est contrainte en luminosité pour rester lisible en
 * texte blanc par-dessus.
 */

const ACCENT = '#E0A52E'; // moutarde
const WARM = '#BF5A33';   // rouille
const PAPER = '#F4ECD8';  // crème
const INK = '#2C2A24';    // encre
const DEFAULT_PRIMARY = '#1F6E66'; // sarcelle (fallback)

function clamp(v, min, max) {
  return Math.min(max, Math.max(min, v));
}

function rgbToHsl({ r, g, b }) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0;
  const l = (max + min) / 2;
  const d = max - min;
  if (d !== 0) {
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      default: h = (r - g) / d + 4;
    }
    h /= 6;
  }
  return { h: h * 360, s, l };
}

function hslToHex({ h, s, l }) {
  h /= 360;
  const hue = (p, q, t) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  let r, g, b;
  if (s === 0) {
    r = g = b = l;
  } else {
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue(p, q, h + 1 / 3);
    g = hue(p, q, h);
    b = hue(p, q, h - 1 / 3);
  }
  const to = (x) => Math.round(x * 255).toString(16).padStart(2, '0');
  return `#${to(r)}${to(g)}${to(b)}`.toUpperCase();
}

/**
 * @param {{r:number,g:number,b:number}|null} dominant
 * @returns {{primary,accent,warm,paper,ink}}
 */
export function derivePalette(dominant) {
  let primary = DEFAULT_PRIMARY;
  if (dominant) {
    const hsl = rgbToHsl(dominant);
    // Photo trop grise / délavée → on garde le fallback sarcelle.
    if (hsl.s >= 0.08) {
      primary = hslToHex({
        h: hsl.h,
        s: clamp(hsl.s, 0.24, 0.62),
        l: clamp(hsl.l, 0.26, 0.40), // assez sombre pour du texte blanc
      });
    }
  }
  return { primary, accent: ACCENT, warm: WARM, paper: PAPER, ink: INK };
}

export const FALLBACK_PALETTE = { primary: DEFAULT_PRIMARY, accent: ACCENT, warm: WARM, paper: PAPER, ink: INK };
