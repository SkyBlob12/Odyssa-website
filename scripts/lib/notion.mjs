import { log } from './util.mjs';

const NOTION_VERSION = '2022-06-28';
const API = 'https://api.notion.com/v1';

const STATUS_PROP = 'Statut';
const TO_PUBLISH = 'À publier';
const IN_PR = 'En PR';

function headers(token) {
  return {
    Authorization: `Bearer ${token}`,
    'Notion-Version': NOTION_VERSION,
    'Content-Type': 'application/json',
  };
}

/** Lit une valeur texte depuis une propriété Notion, quel que soit son type. */
function readPlain(prop) {
  if (!prop) return '';
  switch (prop.type) {
    case 'title':
    case 'rich_text':
      return (prop[prop.type] || []).map((t) => t.plain_text).join('').trim();
    case 'select':
      return prop.select?.name || '';
    case 'status':
      return prop.status?.name || '';
    case 'multi_select':
      return (prop.multi_select || []).map((s) => s.name).join(', ');
    case 'url':
      return prop.url || '';
    default:
      return '';
  }
}

/** Récupère les destinations dont le Statut = "À publier", de la plus ancienne à la plus récente. */
export async function fetchDestinationsToPublish(token, dbId) {
  const res = await fetch(`${API}/databases/${dbId}/query`, {
    method: 'POST',
    headers: headers(token),
    body: JSON.stringify({
      page_size: 25,
      sorts: [{ timestamp: 'created_time', direction: 'ascending' }],
    }),
  });
  if (!res.ok) throw new Error(`Notion query ${res.status}: ${await res.text()}`);
  const data = await res.json();

  const out = [];
  for (const page of data.results || []) {
    const props = page.properties || {};
    const statusProp = props[STATUS_PROP];
    const status = readPlain(statusProp);
    if (status !== TO_PUBLISH) continue;

    // La colonne titre (type "title") quel que soit son nom.
    const titleKey = Object.keys(props).find((k) => props[k].type === 'title');
    const name = readPlain(props[titleKey]);
    if (!name) continue;

    out.push({
      pageId: page.id,
      name,
      country: readPlain(props['Pays']),
      angle: readPlain(props['Angle/notes']) || readPlain(props['Angle']) || readPlain(props['Notes']),
      link: readPlain(props['Lien post']),
      statusType: statusProp?.type || 'select',
    });
  }
  log(`Notion : ${out.length} destination(s) à publier`);
  return out;
}

/** Passe une page au statut "En PR" (ou autre valeur fournie). */
export async function markStatus(token, pageId, statusType, value = IN_PR) {
  const properties = {
    [STATUS_PROP]:
      statusType === 'status' ? { status: { name: value } } : { select: { name: value } },
  };
  const res = await fetch(`${API}/pages/${pageId}`, {
    method: 'PATCH',
    headers: headers(token),
    body: JSON.stringify({ properties }),
  });
  if (!res.ok) throw new Error(`Notion update ${res.status}: ${await res.text()}`);
}
