import { createServer } from 'node:http';
import { readFile, stat, writeFile, mkdir } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';

const port = Number(process.env.PORT || 4174);
const host = process.env.HOST || '0.0.0.0';
const root = new URL('.', import.meta.url).pathname.replace(/^\/(.:)/, '$1');
const prefix = '/SoundTrackFirst/prototype/';
const contentTypes = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml' };
const dataDirectory = process.env.DATA_DIR || join(root, 'backend-data');
const usersFile = join(dataDirectory, 'users.json');
const projectsFile = join(dataDirectory, 'projects.json');

async function readJson(file, fallback) {
  try { return JSON.parse(await readFile(file, 'utf8')); } catch { return fallback; }
}

async function writeJson(file, value) {
  await mkdir(dataDirectory, { recursive: true });
  await writeFile(file, JSON.stringify(value, null, 2), 'utf8');
}

async function readBody(request) {
  let body = '';
  for await (const chunk of request) body += chunk;
  return body ? JSON.parse(body) : {};
}

function json(response, status, value) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  response.end(JSON.stringify(value));
}

async function authenticate(request, email) {
  const users = await readJson(usersFile, []);
  const password = request.headers['x-demo-password'] || '';
  return users.find(user => user.email === String(email || '').toLowerCase() && user.password === password) || null;
}

function firstSource(container) {
  return container?.sources?.find(source => source?.url)?.url || '';
}

async function addMissingTrackImages(songs) {
  const enriched = songs.map(song => ({ ...song }));
  for (let index = 0; index < enriched.length; index += 10) {
    await Promise.all(enriched.slice(index, index + 10).map(async song => {
      if (song.image) return;
      try {
        const response = await fetch(`https://open.spotify.com/oembed?url=https://open.spotify.com/track/${song.id}`);
        if (response.ok) song.image = (await response.json()).thumbnail_url || '';
      } catch { /* Keep the song usable if artwork is unavailable. */ }
    }));
  }
  return enriched;
}

async function readSpotifyPlaylist(playlistId) {
  const spotifyUrl = `https://open.spotify.com/playlist/${playlistId}`;
  let embedPlaylist = null;
  const embedResponse = await fetch(`https://open.spotify.com/embed/playlist/${playlistId}`, {
    headers: { 'User-Agent': 'Mozilla/5.0 SoundtrackFirstPrototype/1.0', 'Accept-Language': 'en-US,en;q=0.9' }
  });
  if (embedResponse.ok) {
    const embedHtml = await embedResponse.text();
    const nextData = embedHtml.match(/<script[^>]+id="__NEXT_DATA__"[^>]*>([^<]+)<\/script>/)?.[1];
    if (nextData) {
      const entity = JSON.parse(nextData)?.props?.pageProps?.state?.data?.entity;
      const songs = (entity?.trackList || []).flatMap(track => {
        const id = track?.uri?.match(/^spotify:track:(.+)$/)?.[1];
        return id && track?.title ? [{ id, title: track.title, artists: track.subtitle || 'Unknown artist' }] : [];
      });
      if (entity?.name && songs.length) {
        embedPlaylist = {
          url: spotifyUrl,
          name: entity.name,
          description: '',
          image: firstSource(entity.coverArt) || entity.visualIdentity?.image?.find(image => image?.url)?.url || '',
          owner: entity.subtitle || 'Spotify user',
          ownerImage: '',
          ownerUrl: '',
          songs,
          truncated: false
        };
      }
    }
  }
  const upstream = await fetch(spotifyUrl, {
    headers: { 'User-Agent': 'Mozilla/5.0 SoundtrackFirstPrototype/1.0', 'Accept-Language': 'en-US,en;q=0.9' }
  });
  if (!upstream.ok) {
    if (embedPlaylist) return embedPlaylist;
    throw new Error('Spotify playlist unavailable');
  }
  const html = await upstream.text();
  const encoded = html.match(/<script id="initialState"[^>]*>([^<]+)<\/script>/)?.[1];
  if (!encoded) {
    if (embedPlaylist) return embedPlaylist;
    throw new Error('Spotify playlist data unavailable');
  }
  const state = JSON.parse(Buffer.from(encoded, 'base64').toString('utf8'));
  const playlist = state?.entities?.items?.[`spotify:playlist:${playlistId}`];
  if (!playlist) {
    if (embedPlaylist) return embedPlaylist;
    throw new Error('Spotify playlist not found');
  }
  const songs = (playlist.content?.items || []).flatMap(entry => {
    const track = entry?.itemV2?.data;
    const id = track?.uri?.match(/^spotify:track:(.+)$/)?.[1];
    if (!id || !track?.name) return [];
    return [{
      id,
      title: track.name,
      artists: (track.artists?.items || []).map(artist => artist?.profile?.name).filter(Boolean).join(', ') || 'Unknown artist',
      image: firstSource(track.albumOfTrack?.coverArt)
    }];
  });
  const owner = playlist.ownerV2?.data;
  const publicPlaylist = {
    url: spotifyUrl,
    name: playlist.name || 'Spotify playlist',
    description: playlist.description || '',
    image: firstSource(playlist.images?.items?.[0]) || '',
    owner: owner?.name || owner?.username || 'Spotify user',
    ownerImage: firstSource(owner?.avatar) || '',
    ownerUrl: owner?.username ? `https://open.spotify.com/user/${encodeURIComponent(owner.username)}` : '',
    songs,
    truncated: Number(playlist.content?.totalCount || songs.length) > songs.length
  };
  const result = embedPlaylist ? {
    ...publicPlaylist,
    image: embedPlaylist.image || publicPlaylist.image,
    songs: embedPlaylist.songs.map(song => ({
      ...song,
      image: publicPlaylist.songs.find(item => item.id === song.id)?.image || ''
    })),
    truncated: Number(playlist.content?.totalCount || embedPlaylist.songs.length) > embedPlaylist.songs.length
  } : publicPlaylist;
  result.songs = await addMissingTrackImages(result.songs);
  return result;
}

createServer(async (request, response) => {
  try {
    const url = new URL(request.url, `http://${request.headers.host}`);
    if (url.pathname === '/health') return json(response, 200, { status: 'ok' });
    if (url.pathname === '/') {
      response.writeHead(302, { Location: prefix });
      response.end();
      return;
    }
    if (url.pathname === `${prefix}api/auth/register` && request.method === 'POST') {
      const body = await readBody(request);
      const email = String(body.email || '').trim().toLowerCase();
      const users = await readJson(usersFile, []);
      if (!email || !body.password || !body.displayName) return json(response, 400, { error: 'Name, email, and password are required.' });
      if (users.some(user => user.email === email)) return json(response, 409, { error: 'An account already exists for that email address.' });
      users.push({ email, password: String(body.password), displayName: String(body.displayName).trim(), createdAt: new Date().toISOString() });
      await writeJson(usersFile, users);
      return json(response, 201, { email, displayName: String(body.displayName).trim() });
    }
    if (url.pathname === `${prefix}api/auth/login` && request.method === 'POST') {
      const body = await readBody(request);
      const user = await authenticate({ headers: { 'x-demo-password': String(body.password || '') } }, body.email);
      return user ? json(response, 200, { email: user.email, displayName: user.displayName }) : json(response, 401, { error: 'That email address and password do not match.' });
    }
    if (url.pathname === `${prefix}api/projects` && request.method === 'GET') {
      const email = String(url.searchParams.get('email') || '').toLowerCase();
      const user = await authenticate(request, email);
      if (!user) return json(response, 401, { error: 'Sign in again.' });
      const projects = await readJson(projectsFile, []);
      return json(response, 200, { projects: projects.filter(project => project.ownerEmail === email || (project.collaborators || []).includes(email)) });
    }
    if (url.pathname === `${prefix}api/projects` && request.method === 'PUT') {
      const project = await readBody(request);
      const email = String(project.requestingEmail || '').toLowerCase();
      const user = await authenticate(request, email);
      if (!user) return json(response, 401, { error: 'Sign in again.' });
      delete project.requestingEmail;
      if (project.ownerEmail !== email && !(project.collaborators || []).includes(email)) return json(response, 403, { error: 'You do not have access.' });
      const projects = await readJson(projectsFile, []);
      const index = projects.findIndex(item => item.id === project.id);
      if (index >= 0) projects[index] = project; else projects.unshift(project);
      await writeJson(projectsFile, projects);
      return json(response, 200, { project });
    }
    const projectDeleteMatch = url.pathname.match(new RegExp(`^${prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}api/projects/([^/]+)$`));
    if (projectDeleteMatch && request.method === 'DELETE') {
      const email = String(url.searchParams.get('email') || '').toLowerCase();
      const user = await authenticate(request, email);
      if (!user) return json(response, 401, { error: 'Sign in again.' });
      const projects = await readJson(projectsFile, []);
      const project = projects.find(item => item.id === projectDeleteMatch[1]);
      if (!project || project.ownerEmail !== email) return json(response, 403, { error: 'Only the creator can delete this creation.' });
      await writeJson(projectsFile, projects.filter(item => item.id !== project.id));
      return json(response, 200, { deleted: true });
    }
    const playlistMatch = url.pathname.match(/^\/SoundTrackFirst\/prototype\/api\/playlist\/([A-Za-z0-9]{22})$/);
    if (playlistMatch) {
      const playlist = await readSpotifyPlaylist(playlistMatch[1]);
      response.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      response.end(JSON.stringify(playlist));
      return;
    }
    if (!url.pathname.startsWith(prefix)) throw new Error('Not found');
    const relative = decodeURIComponent(url.pathname.slice(prefix.length)) || 'index.html';
    const filePath = normalize(join(root, relative));
    if (!filePath.startsWith(normalize(root)) || !(await stat(filePath)).isFile()) throw new Error('Not found');
    response.writeHead(200, { 'Content-Type': contentTypes[extname(filePath)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    response.end(await readFile(filePath));
  } catch {
    response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end('Not found');
  }
}).listen(port, host, () => console.log(`Prototype running on ${host}:${port}${prefix}`));
