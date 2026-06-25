#!/usr/bin/env node
// Corrige le double-encodage UTF-8 causé par PowerShell (lecture en latin1, écriture en UTF-8).
// Détecte automatiquement les fichiers corrompus et les répare.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const CORRUPTION_MARKERS = ['Ã©', 'Ã¨', 'Ã ', 'Ãª', 'Ã®', 'Ã´', 'Ã¹', 'Ã»', 'Ã0', 'Ã¬', 'â¬"', 'â¬"', 'â¬S', 'Ã§', 'Ã¯', 'Ã¼'];

function isCorrupted(str) {
  return CORRUPTION_MARKERS.some(m => str.includes(m));
}

function fixFile(filePath) {
  const rawBytes = fs.readFileSync(filePath);

  // Retirer le BOM UTF-8 si présent (ajouté par PowerShell)
  const hasBOM = rawBytes[0] === 0xEF && rawBytes[1] === 0xBB && rawBytes[2] === 0xBF;
  const bytes = hasBOM ? rawBytes.slice(3) : rawBytes;

  const asUtf8 = bytes.toString('utf-8');

  if (!isCorrupted(asUtf8)) {
    return; // fichier sain, on ne touche pas
  }

  // Récupérer les octets UTF-8 d'origine : chaque char lu comme son octet latin1
  const recovered = Buffer.from(asUtf8, 'latin1');

  // Vérifier que le résultat est du UTF-8 valide
  const check = recovered.toString('utf-8');
  if (isCorrupted(check)) {
    console.log(`  WARN (toujours corrompu après fix): ${filePath}`);
    return;
  }

  fs.writeFileSync(filePath, recovered);
  console.log(`  FIXED: ${path.relative(path.join(__dirname, '..'), filePath)}`);
}

function walk(dir, exts, results = []) {
  let items;
  try { items = fs.readdirSync(dir, { withFileTypes: true }); }
  catch { return results; }
  for (const item of items) {
    const full = path.join(dir, item.name);
    if (item.isDirectory() && item.name !== 'node_modules') {
      walk(full, exts, results);
    } else if (item.isFile() && exts.includes(path.extname(item.name))) {
      results.push(full);
    }
  }
  return results;
}

const root = path.join(__dirname, '..');
const files = walk(root, ['.html', '.js', '.css']);
console.log(`\nFix encodage  ${files.length} fichiers analysés\n`);
files.forEach(fixFile);
console.log('\nTerminé.');
