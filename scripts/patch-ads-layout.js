#!/usr/bin/env node
// Ajoute article-layout + article-sidebar sur les articles déjà patchés (step 1 & 4 OK).
// Gère les fins de ligne CRLF/LF. Idempotent : ignore les fichiers déjà wrappés.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const SIDEBAR_HTML = `
    <aside class="article-sidebar">
      <div class="article-sidebar-sticky">
        <div class="ad-unit">
          <p class="ad-label">Publicité</p>
          <ins class="adsbygoogle"
               style="display:block"
               data-ad-client="ca-pub-7497823030976949"
               data-ad-slot="XXXXXXXXXX"
               data-ad-format="auto"
               data-full-width-responsive="true"></ins>
          <script>(adsbygoogle = window.adsbygoogle || []).push({});<\/script>
        </div>
        <div class="ad-unit">
          <p class="ad-label">Publicité</p>
          <ins class="adsbygoogle"
               style="display:block"
               data-ad-client="ca-pub-7497823030976949"
               data-ad-slot="XXXXXXXXXX"
               data-ad-format="auto"
               data-full-width-responsive="true"></ins>
          <script>(adsbygoogle = window.adsbygoogle || []).push({});<\/script>
        </div>
      </div>
    </aside>`;

function patchLayout(filePath) {
  const raw = fs.readFileSync(filePath, 'utf-8');

  if (!raw.includes('class="article-inner"')) {
    console.log(`  SKIP (pas un article): ${filePath}`);
    return;
  }
  if (raw.includes('class="article-layout"')) {
    console.log(`  SKIP (déjà wrappé): ${filePath}`);
    return;
  }

  // Normaliser CRLF �  LF pour simplifier les remplacements
  let html = raw.replace(/\r\n/g, '\n');

  // Wrap article-inner avec article-layout
  html = html.replace(
    '  <main class="article-main">\n    <div class="article-inner">',
    '  <main class="article-main">\n    <div class="article-layout">\n    <div class="article-inner">'
  );

  // Ajouter la sidebar + fermeture article-layout
  html = html.replace(
    '\n    </div>\n  </main>',
    `\n    </div>${SIDEBAR_HTML}\n    </div>\n  </main>`
  );

  if (html === raw.replace(/\r\n/g, '\n')) {
    console.log(`  WARN (pattern non trouvé): ${filePath}`);
    return;
  }

  fs.writeFileSync(filePath, html, 'utf-8');
  console.log(`  OK: ${filePath}`);
}

function findArticles(dir, results = []) {
  const SKIP = new Set(['node_modules', '_templates', 'assets']);
  let items;
  try { items = fs.readdirSync(dir, { withFileTypes: true }); }
  catch { return results; }

  for (const item of items) {
    if (!item.isDirectory() || SKIP.has(item.name)) continue;
    const subDir = path.join(dir, item.name);
    const indexFile = path.join(subDir, 'index.html');
    if (fs.existsSync(indexFile)) results.push(indexFile);
    findArticles(subDir, results);
  }
  return results;
}

const blogDir = path.join(__dirname, '..', 'blog');
const articles = findArticles(blogDir);
console.log(`\nPatch layout sidebar � ${articles.length} fichiers\n`);
articles.forEach(patchLayout);
console.log('\nTerminé.');
