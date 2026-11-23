const files = [
  'icons',
  'shared',
  'enrollment',
  'dialogs',
  'schedule',
  'academic-record',
  'summary',
  'login',
  'professor',
  'admin',
];
const templates = new Map();

async function loadTemplates() {
  const sources = await Promise.all(
    files.map(async (name) => {
      const url = new URL('../pages/' + name + '.html', import.meta.url);
      const response = await fetch(url);
      if (!response.ok)
        throw new Error(
          'Unable to load ' + name + '.html (' + response.status + ')',
        );
      return response.text();
    }),
  );
  for (const source of sources) {
    // Read raw markup: parsing DOM first would alter table/SVG fragments and
    // placeholders used inside attributes before their values are supplied.
    const pattern = /<template\s+id="([\w-]+)"\s*>([\s\S]*?)<\/template>/g;
    const matches = [...source.matchAll(pattern)];
    if (!matches.length)
      throw new Error('A template file is empty or invalid.');
    for (const [, id, markup] of matches) {
      if (templates.has(id)) throw new Error('Duplicate template: ' + id);
      templates.set(id, markup.trim());
    }
  }
}

try {
  await loadTemplates();
} catch (error) {
  const app = document.getElementById('app');
  if (app)
    app.textContent =
      'The page templates could not be loaded. Please reload the page and check that the pages folder is available.';
  throw error;
}

export function renderTemplate(id, values = {}) {
  if (!templates.has(id)) throw new Error('Unknown template: ' + id);
  return templates.get(id).replace(/{{([A-Za-z0-9_]+)}}/g, (_, key) => {
    if (!Object.hasOwn(values, key))
      throw new Error('Missing value ' + key + ' in template ' + id);
    return String(values[key]);
  });
}
