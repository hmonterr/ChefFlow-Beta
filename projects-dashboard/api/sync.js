// Vercel serverless function: proxies the Notion API for the Projects DB.
// Env vars required: NOTION_TOKEN, PROJECTS_DB_ID
//
// GET  /api/sync       → returns { projects: [...] }
// POST /api/sync       → body: { edits: [{ id, name, category, status, priority, link, notes, isNew }] }
//                        returns { written: <count> }

const NOTION_VERSION = '2022-06-28';
const NOTION_API = 'https://api.notion.com/v1';

function readProp(props, key, kind) {
  const p = props?.[key];
  if (!p) return null;
  switch (kind) {
    case 'title':
      return p.title?.map((t) => t.plain_text).join('') || null;
    case 'select':
      return p.select?.name || null;
    case 'url':
      return p.url || null;
    case 'rich_text':
      return p.rich_text?.map((t) => t.plain_text).join('') || null;
    default:
      return null;
  }
}

function pageToProject(page) {
  const props = page.properties || {};
  return {
    id: page.id,
    name: readProp(props, 'Name', 'title'),
    category: readProp(props, 'Category', 'select'),
    status: readProp(props, 'Status', 'select'),
    priority: readProp(props, 'Priority', 'select'),
    link: readProp(props, 'Link', 'url'),
    notes: readProp(props, 'Notes', 'rich_text'),
  };
}

function buildProps(edit) {
  const props = {};
  if (edit.name !== undefined)
    props.Name = { title: [{ text: { content: edit.name || '' } }] };
  if (edit.category !== undefined)
    props.Category = edit.category ? { select: { name: edit.category } } : { select: null };
  if (edit.status !== undefined)
    props.Status = edit.status ? { select: { name: edit.status } } : { select: null };
  if (edit.priority !== undefined)
    props.Priority = edit.priority ? { select: { name: edit.priority } } : { select: null };
  if (edit.link !== undefined)
    props.Link = { url: edit.link || null };
  if (edit.notes !== undefined)
    props.Notes = { rich_text: edit.notes ? [{ text: { content: edit.notes } }] : [] };
  return props;
}

async function notionFetch(path, init = {}) {
  const res = await fetch(`${NOTION_API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${process.env.NOTION_TOKEN}`,
      'Notion-Version': NOTION_VERSION,
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Notion ${res.status}: ${body}`);
  }
  return res.json();
}

async function queryAll(dbId) {
  const all = [];
  let cursor = undefined;
  do {
    const body = { page_size: 100 };
    if (cursor) body.start_cursor = cursor;
    const data = await notionFetch(`/databases/${dbId}/query`, {
      method: 'POST',
      body: JSON.stringify(body),
    });
    all.push(...data.results);
    cursor = data.has_more ? data.next_cursor : null;
  } while (cursor);
  return all;
}

module.exports = async (req, res) => {
  const token = process.env.NOTION_TOKEN;
  const dbId = process.env.PROJECTS_DB_ID;
  if (!token || !dbId) {
    res.status(500).json({ error: 'Missing NOTION_TOKEN or PROJECTS_DB_ID env var' });
    return;
  }

  try {
    if (req.method === 'GET') {
      const pages = await queryAll(dbId);
      const projects = pages.map(pageToProject);
      res.status(200).json({ projects });
      return;
    }

    if (req.method === 'POST') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {};
      const edits = Array.isArray(body.edits) ? body.edits : [];
      let written = 0;
      for (const edit of edits) {
        const props = buildProps(edit);
        if (edit.isNew || String(edit.id || '').startsWith('new-')) {
          await notionFetch('/pages', {
            method: 'POST',
            body: JSON.stringify({
              parent: { database_id: dbId },
              properties: props,
            }),
          });
        } else {
          await notionFetch(`/pages/${edit.id}`, {
            method: 'PATCH',
            body: JSON.stringify({ properties: props }),
          });
        }
        written += 1;
      }
      res.status(200).json({ written });
      return;
    }

    res.status(405).json({ error: 'Method not allowed' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};
