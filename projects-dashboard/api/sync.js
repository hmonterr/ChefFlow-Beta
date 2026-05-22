// Vercel serverless function: fetches the Claude Dashboard graph from Notion.
//
// Three Notion DBs:
//   PROJECTS_DB_ID  → Projects (top-level work)
//   TASKS_DB_ID     → Tasks (relation → Project, relation → Skills/Agents)
//   SKILLS_DB_ID    → Skills & Automations (the "agents")
//
// GET /api/sync → returns { projects: [{...project, tasks: [{...task, agents: [{...skill}]}]}] }

const NOTION_VERSION = '2022-06-28';
const NOTION_API = 'https://api.notion.com/v1';

function rt(prop) {
  return prop?.rich_text?.map((t) => t.plain_text).join('') || null;
}
function title(prop) {
  return prop?.title?.map((t) => t.plain_text).join('') || null;
}
function sel(prop) {
  return prop?.select?.name || null;
}
function ms(prop) {
  return (prop?.multi_select || []).map((o) => o.name);
}
function rel(prop) {
  return (prop?.relation || []).map((r) => r.id);
}
function num(prop) {
  return typeof prop?.number === 'number' ? prop.number : null;
}
function url(prop) {
  return prop?.url || null;
}
function dt(prop) {
  return prop?.date?.start || null;
}

function pageToProject(page) {
  const p = page.properties || {};
  return {
    id: page.id,
    url: page.url,
    name: title(p.Name),
    status: sel(p.Status),
    category: sel(p.Category),
    priority: sel(p.Priority),
    order: num(p.Order),
    repo: url(p.Repo),
    notes: rt(p.Notes),
  };
}

function pageToTask(page) {
  const p = page.properties || {};
  return {
    id: page.id,
    url: page.url,
    name: title(p.Name),
    status: sel(p.Status),
    priority: sel(p.Priority),
    order: num(p.Order),
    due: dt(p.Due),
    notes: rt(p.Notes),
    projectIds: rel(p.Project),
    agentIds: rel(p.Agents),
  };
}

function pageToSkill(page) {
  const p = page.properties || {};
  return {
    id: page.id,
    url: page.url,
    name: title(p.Name),
    type: sel(p.Type),
    category: sel(p.Category),
    status: sel(p.Status),
    trigger: rt(p.Trigger),
    frequency: sel(p.Frequency),
    integrations: ms(p.Integrations),
    link: url(p.Link),
    notes: rt(p.Notes),
  };
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

function normalizeId(id) {
  return String(id || '').replace(/-/g, '');
}

module.exports = async (req, res) => {
  const token = process.env.NOTION_TOKEN;
  const projectsId = process.env.PROJECTS_DB_ID;
  const tasksId = process.env.TASKS_DB_ID;
  const skillsId = process.env.SKILLS_DB_ID;
  if (!token || !projectsId || !tasksId || !skillsId) {
    res.status(500).json({
      error: 'Missing env vars. Need NOTION_TOKEN, PROJECTS_DB_ID, TASKS_DB_ID, SKILLS_DB_ID.',
    });
    return;
  }

  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const [projectPages, taskPages, skillPages] = await Promise.all([
      queryAll(projectsId),
      queryAll(tasksId),
      queryAll(skillsId),
    ]);

    const projects = projectPages.map(pageToProject);
    const tasks = taskPages.map(pageToTask);
    const skills = skillPages.map(pageToSkill);

    const skillById = new Map(skills.map((s) => [normalizeId(s.id), s]));
    const projectById = new Map(projects.map((p) => [normalizeId(p.id), p]));

    for (const t of tasks) {
      t.agents = t.agentIds
        .map((id) => skillById.get(normalizeId(id)))
        .filter(Boolean);
    }

    const tasksByProject = new Map();
    for (const t of tasks) {
      for (const pid of t.projectIds) {
        const key = normalizeId(pid);
        if (!tasksByProject.has(key)) tasksByProject.set(key, []);
        tasksByProject.get(key).push(t);
      }
    }

    for (const p of projects) {
      const list = tasksByProject.get(normalizeId(p.id)) || [];
      list.sort((a, b) => {
        const oa = a.order ?? 999, ob = b.order ?? 999;
        if (oa !== ob) return oa - ob;
        return (a.name || '').localeCompare(b.name || '');
      });
      p.tasks = list;
    }

    projects.sort((a, b) => {
      const oa = a.order ?? 999, ob = b.order ?? 999;
      if (oa !== ob) return oa - ob;
      return (a.name || '').localeCompare(b.name || '');
    });

    res.status(200).json({
      projects,
      skills,
      counts: {
        projects: projects.length,
        tasks: tasks.length,
        skills: skills.length,
      },
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};
