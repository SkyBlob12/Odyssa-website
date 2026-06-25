#!/usr/bin/env node
// Ajoute les emplacements publicitaires AdSense sur tous les articles existants.
// Exécuter une seule fois : node scripts/patch-ads.js
// Les articles déjà patchés (contenant "adsbygoogle") sont ignorés.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const ADSENSE_SCRIPT = `  <!-- Remplacer ca-pub-7497823030976949 par votre Publisher ID AdSense -->
  <script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-7497823030976949" crossorigin="anonymous"></script>`;

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

const FOOTER_BANNER = `  <div class="ad-footer-section">
    <div class="ad-footer-inner">
      <p class="ad-label">Publicité</p>
      <ins class="adsbygoogle"
           style="display:block"
           data-ad-client="ca-pub-7497823030976949"
           data-ad-slot="XXXXXXXXXX"
           data-ad-format="auto"
           data-full-width-responsive="true"></ins>
      <script>(adsbygoogle = window.adsbygoogle || []).push({});<\/script>
    </div>
  </div>`;

function patchArticle(filePath) {
  let html = fs.readFileSync(filePath, 'utf-8');

  if (html.includes('adsbygoogle')) {
    console.log(`  SKIP (déjà patché): ${filePath}`);
    return;
  }
  if (!html.includes('class="article-inner"')) {
    console.log(`  SKIP (pas un article): ${filePath}`);
    return;
  }

  let modified = html;

  // 1. Ajouter le script AdSense avant </head>
  modified = modified.replace('</head>', `${ADSENSE_SCRIPT}\n</head>`);

  // 2. Envelopper article-main avec article-layout
  modified = modified.replace(
    '  <main class="article-main">\n    <div class="article-inner">',
    '  <main class="article-main">\n    <div class="article-layout">\n    <div class="article-inner">'
  );

  // 3. Ajouter la sidebar + fermer article-layout avant </main>
  modified = modified.replace(
    '\n    </div>\n  </main>',
    `\n    </div>${SIDEBAR_HTML}\n    </div>\n  </main>`
  );

  // 4. Ajouter le banner footer avant <footer class="legal-footer">
  modified = modified.replace(
    '\n  <footer class="legal-footer">',
    `\n${FOOTER_BANNER}\n\n  <footer class="legal-footer">`
  );

  if (modified === html) {
    console.log(`  WARN (aucun changement appliqué): ${filePath}`);
    return;
  }

  fs.writeFileSync(filePath, modified, 'utf-8');
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
console.log(`\nPatch AdSense � ${articles.length} fichiers trouvés\n`);
articles.forEach(patchArticle);
console.log('\nTerminé.');
