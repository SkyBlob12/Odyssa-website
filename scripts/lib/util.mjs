import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
export const ROOT = resolve(__dirname, '..', '..'); // racine du repo

export const SITE_URL = 'https://odyssa-app.com';

export function log(...args) {
  console.log('[blog]', ...args);
}

/** Slug propre, sans accents, kebab-case. */
export function slugify(str) {
  return String(str)
    .normalize('NFD').replace(/[̀-ͯ]/g, '')   // accents
    .toLowerCase()
    .replace(/['’]/g, ' ')
    .replace(/&/g, ' et ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-')
    .slice(0, 70);
}

/** Échappe le HTML (texte injecté dans le contenu). */
export function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Échappe pour un attribut JSON-LD / JSON inline. */
export function escapeJson(str) {
  return String(str ?? '').replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, ' ').trim();
}

/** Remplace tous les {{TOKEN}} d'un template par les valeurs fournies. */
export function fillTemplate(template, vars) {
  return template.replace(/\{\{([A-Z0-9_]+)\}\}/g, (m, key) =>
    Object.prototype.hasOwnProperty.call(vars, key) ? String(vars[key]) : m
  );
}

export async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}

export async function writeJson(path, data) {
  await writeFile(path, JSON.stringify(data, null, 2) + '\n', 'utf8');
}

export async function readText(path) {
  return readFile(path, 'utf8');
}

export async function writeText(path, content) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, content, 'utf8');
}

/** Temps de lecture estimé (≈200 mots/min). */
export function readingTime(wordCount) {
  return `${Math.max(2, Math.round(wordCount / 200))} min de lecture`;
}

/** Date du jour au format YYYY-MM-DD. */
export function today() {
  return new Date().toISOString().slice(0, 10);
}

/** Numéro de semaine ISO, pour nommer les branches/PR. */
export function isoWeekTag(d = new Date()) {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - dayNum + 3);
  const firstThursday = new Date(Date.UTC(date.getUTCFullYear(), 0, 4));
  const week = 1 + Math.round((date - firstThursday) / 604800000);
  return `${date.getUTCFullYear()}-w${String(week).padStart(2, '0')}`;
}
