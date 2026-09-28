import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';

const port = 4174;
const root = new URL('.', import.meta.url).pathname.replace(/^\/(.:)/, '$1');
const prefix = '/SoundTrackFirst/prototype/';
const contentTypes = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml' };

function firstSource(container) {
  return container?.sources?.find(source => source?.url)?.url || '';
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
      artists: (track.artists?.items || []).map(artist => artist?.profile?.name).filter(Boolean).join(', ') || 'Unknown artist'
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
  return embedPlaylist ? {
    ...publicPlaylist,
    image: embedPlaylist.image || publicPlaylist.image,
    songs: embedPlaylist.songs,
    truncated: Number(playlist.content?.totalCount || embedPlaylist.songs.length) > embedPlaylist.songs.length
  } : publicPlaylist;
}

createServer(async (request, response) => {
  try {
    const url = new URL(request.url, `http://${request.headers.host}`);
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
}).listen(port, '127.0.0.1', () => console.log(`Prototype running at http://localhost:${port}${prefix}`));
