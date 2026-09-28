const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function firstSource(container: any) {
  return container?.sources?.find((source: any) => source?.url)?.url || '';
}

function decodeBase64Json(value: string) {
  const bytes = Uint8Array.from(atob(value), character => character.charCodeAt(0));
  return JSON.parse(new TextDecoder().decode(bytes));
}

async function addMissingTrackImages(songs: any[]) {
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

async function readSpotifyPlaylist(playlistId: string) {
  const spotifyUrl = `https://open.spotify.com/playlist/${playlistId}`;
  const headers = { 'User-Agent': 'Mozilla/5.0 SoundtrackFirstPrototype/1.0', 'Accept-Language': 'en-US,en;q=0.9' };
  let embedPlaylist: any = null;

  const embedResponse = await fetch(`https://open.spotify.com/embed/playlist/${playlistId}`, { headers });
  if (embedResponse.ok) {
    const embedHtml = await embedResponse.text();
    const nextData = embedHtml.match(/<script[^>]+id="__NEXT_DATA__"[^>]*>([^<]+)<\/script>/)?.[1];
    if (nextData) {
      const entity = JSON.parse(nextData)?.props?.pageProps?.state?.data?.entity;
      const songs = (entity?.trackList || []).flatMap((track: any) => {
        const id = track?.uri?.match(/^spotify:track:(.+)$/)?.[1];
        return id && track?.title ? [{ id, title: track.title, artists: track.subtitle || 'Unknown artist' }] : [];
      });
      if (entity?.name && songs.length) {
        embedPlaylist = {
          url: spotifyUrl,
          name: entity.name,
          description: '',
          image: firstSource(entity.coverArt) || entity.visualIdentity?.image?.find((image: any) => image?.url)?.url || '',
          owner: entity.subtitle || 'Spotify user',
          ownerImage: '',
          ownerUrl: '',
          songs,
          truncated: false,
        };
      }
    }
  }

  const upstream = await fetch(spotifyUrl, { headers });
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
  const state = decodeBase64Json(encoded);
  const playlist = state?.entities?.items?.[`spotify:playlist:${playlistId}`];
  if (!playlist) {
    if (embedPlaylist) return embedPlaylist;
    throw new Error('Spotify playlist not found');
  }
  const songs = (playlist.content?.items || []).flatMap((entry: any) => {
    const track = entry?.itemV2?.data;
    const id = track?.uri?.match(/^spotify:track:(.+)$/)?.[1];
    if (!id || !track?.name) return [];
    return [{
      id,
      title: track.name,
      artists: (track.artists?.items || []).map((artist: any) => artist?.profile?.name).filter(Boolean).join(', ') || 'Unknown artist',
      image: firstSource(track.albumOfTrack?.coverArt),
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
    truncated: Number(playlist.content?.totalCount || songs.length) > songs.length,
  };
  const result = embedPlaylist ? {
    ...publicPlaylist,
    image: embedPlaylist.image || publicPlaylist.image,
    songs: embedPlaylist.songs.map((song: any) => ({
      ...song,
      image: publicPlaylist.songs.find((item: any) => item.id === song.id)?.image || '',
    })),
    truncated: Number(playlist.content?.totalCount || embedPlaylist.songs.length) > embedPlaylist.songs.length,
  } : publicPlaylist;
  result.songs = await addMissingTrackImages(result.songs);
  return result;
}

Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const { playlistId } = await request.json();
    if (!/^[A-Za-z0-9]{22}$/.test(String(playlistId || ''))) throw new Error('Invalid Spotify playlist link');
    const playlist = await readSpotifyPlaylist(playlistId);
    if (!playlist.songs?.length) throw new Error('No public tracks were found in this playlist');
    return Response.json(playlist, { headers: { ...corsHeaders, 'Cache-Control': 'public, max-age=300' } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : 'Playlist lookup failed' }, { status: 400, headers: corsHeaders });
  }
});
