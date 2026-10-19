// Suchmaschinen und Schnellwahl des eingebauten Browsers.

export const SEARCH_ENGINES = [
  { id: 'duckduckgo', name: 'DuckDuckGo', note: 'Datenschutzfreundlich, ohne JavaScript nutzbar', url: 'https://html.duckduckgo.com/html/?q=' },
  { id: 'startpage', name: 'Startpage', note: 'Anonymisierte Suchergebnisse', url: 'https://www.startpage.com/do/search?q=' },
  { id: 'mojeek', name: 'Mojeek', note: 'Unabhängiger Suchindex', url: 'https://www.mojeek.com/search?q=' },
  { id: 'bing', name: 'Bing', note: 'Suchmaschine von Microsoft', url: 'https://www.bing.com/search?q=' },
  { id: 'ecosia', name: 'Ecosia', note: 'Pflanzt Bäume mit Werbeeinnahmen', url: 'https://www.ecosia.org/search?q=' },
];

export const SPEED_DIAL = [
  { title: 'Wikipedia', url: 'https://de.wikipedia.org/', color: '#4a4f5c' },
  { title: 'DuckDuckGo', url: 'https://html.duckduckgo.com/html/', color: '#de5833' },
  { title: 'Tagesschau', url: 'https://www.tagesschau.de/', color: '#0b3d91' },
  { title: 'OpenStreetMap', url: 'https://www.openstreetmap.org/', color: '#7ebc6f' },
  { title: 'GitHub', url: 'https://github.com/idtbas/Xstation-', color: '#24292f' },
  { title: 'Wetter', url: 'https://wttr.in/?lang=de', color: '#0a6cff' },
  { title: 'Hacker News', url: 'https://news.ycombinator.com/', color: '#ff6600' },
  { title: 'MDN Web Docs', url: 'https://developer.mozilla.org/de/', color: '#10a310' },
];

export function searchUrl(engineId, q) {
  const se = SEARCH_ENGINES.find((e) => e.id === engineId) || SEARCH_ENGINES[0];
  return se.url + encodeURIComponent(q);
}

// Eingabe in der Adressleiste → URL oder Suche
export function resolveInput(text, engineId) {
  const t = text.trim();
  if (!t) return null;
  if (/^https?:\/\//i.test(t)) return t;
  if (/^[\w-]+(\.[\w-]+)+(:\d+)?(\/.*)?$/i.test(t) && !/\s/.test(t)) return `https://${t}`;
  return searchUrl(engineId, t);
}
