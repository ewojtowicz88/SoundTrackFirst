const formats = {
  Bookclub: {
    icon: '<img src="assets/bookclub-icon.jpeg" alt="">',
    className: 'bookclub',
    description: 'Create a shared space for a book, its readers, and the conversation that grows around it.',
    sourceLabel: 'Audible book link',
    sourcePlaceholder: 'https://www.audible.com/pd/…',
    sourceHelp: 'Paste the Audible page for the book you want the club to read.',
    lookupLabel: 'Find this book'
  },
  'Memory Box': {
    icon: '<img src="assets/memorybox-icon.jpeg" alt="">',
    className: 'memory',
    description: 'Collect photos, art, audiobooks, songs, playlists, and memories with the people who were there.',
    sourceLabel: 'Choose what to add first',
    sourcePlaceholder: 'https://open.spotify.com/playlist/… or /track/…',
    sourceHelp: 'Start with one item. You can add any other item type after the Memory Box is created.',
    lookupLabel: 'Add item'
  },
  'Score to Scene': {
    icon: '<img src="assets/score-to-scene-icon.jpeg" alt="">',
    className: 'score',
    description: 'Start with a Spotify playlist, then write the scene that belongs to every track.',
    sourceLabel: 'Spotify playlist link',
    sourcePlaceholder: 'https://open.spotify.com/playlist/…',
    sourceHelp: 'Paste the Spotify playlist that will become the score for your scenes.',
    lookupLabel: 'Find this playlist'
  },
  'Art Gallery': {
    icon: '<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M8 38h32M12 38V18l12-8 12 8v20M18 34V22h12v12M7 18h34"/></svg>',
    className: 'art-gallery',
    description: 'Search The Met collection, curate works of art, and discuss them with your collaborators.',
    sourceLabel: 'Search The Met collection',
    sourcePlaceholder: 'Artwork, artist, culture, or subject',
    sourceHelp: 'Search for a work of art to begin your gallery.',
    lookupLabel: 'Search artwork'
  }
};

const appVersion = globalThis.SOUNDTRACKFIRST_VERSION || '0.0.0';
const versionLabel = document.querySelector('.app-version');
versionLabel.textContent = `v${appVersion}`;
versionLabel.setAttribute('aria-label', `Application version ${appVersion}`);
document.querySelector('meta[name="application-version"]').content = appVersion;

const prototypeRoot = new URL('.', document.currentScript?.src || window.location.href);

const createScreen = document.querySelector('#create-screen');
const setupScreen = document.querySelector('#setup-screen');
const projectScreen = document.querySelector('#project-screen');
const profileScreen = document.querySelector('#profile-screen');
const libraryScreen = document.querySelector('#library-screen');
const selectedFormat = document.querySelector('#selected-format');
const selectedBadge = document.querySelector('#selected-badge');
const selectedDescription = document.querySelector('#selected-description');
const sourceLabel = document.querySelector('#source-label');
const sourceUrl = document.querySelector('#source-url');
const sourceHelp = document.querySelector('#source-help');
const lookupSource = document.querySelector('#lookup-source');
const metadataPreview = document.querySelector('#metadata-preview');
const nameStep = document.querySelector('#name-step');
const formMessage = document.querySelector('#form-message');
const memorySourceChoices = document.querySelector('#memory-source-choices');
const sourceLinkControls = document.querySelector('#source-link-controls');
const memoryPhotoSetup = document.querySelector('#memory-photo-setup');
const memoryFirstPhoto = document.querySelector('#memory-first-photo');
const memoryFirstPhotoName = document.querySelector('#memory-first-photo-name');
const artSearchControls = document.querySelector('#art-search-controls');
const artSearchQuery = document.querySelector('#art-search-query');
const artSearchField = document.querySelector('#art-search-field');
const artSearchResults = document.querySelector('#art-search-results');
const searchArtButton = document.querySelector('#search-art');
let activeFormat = 'Score to Scene';
let pendingFormat = null;
let authMode = 'login';
let resolvedSource = null;
let memorySourceType = null;
let memoryPhotoFile = null;
let activeProject = null;
let spotifyIframeApi = null;
let spotifyEmbedController = null;
let pendingTrackId = null;
let activeTrackUri = null;
let correctingSpotifyPlayback = false;

const collaboratorRoleLabels = {
  viewer: 'Viewer',
  collaborator: 'Collaborator',
  editor: 'Editor'
};

function normalizeCollaboratorRoles(project) {
  project.collaboratorRoles ||= {};
  for (const email of project.collaborators || []) {
    if (!collaboratorRoleLabels[project.collaboratorRoles[email]]) project.collaboratorRoles[email] = 'editor';
  }
  return project.collaboratorRoles;
}

function projectRole(project) {
  const email = getSession()?.username;
  if (!email || !project) return null;
  if (project.ownerEmail === email) return 'owner';
  normalizeCollaboratorRoles(project);
  return project.collaboratorRoles[email] || null;
}

function canContribute(project) {
  return ['owner', 'editor', 'collaborator'].includes(projectRole(project));
}

function canEditProjectContent(project) {
  return ['owner', 'editor'].includes(projectRole(project));
}

window.onSpotifyIframeApiReady = IFrameAPI => {
  spotifyIframeApi = IFrameAPI;
  if (pendingTrackId) startSpotifyTrack(pendingTrackId);
};

function startSpotifyTrack(trackId) {
  pendingTrackId = trackId;
  activeTrackUri = `spotify:track:${trackId}`;
  const player = document.querySelector('#track-player');
  player.hidden = false;
  if (spotifyEmbedController) {
    spotifyEmbedController.loadEntity(activeTrackUri);
    spotifyEmbedController.play();
    return;
  }
  if (!spotifyIframeApi) return;
  spotifyIframeApi.createController(
    document.querySelector('#track-frame'),
    { uri: `spotify:track:${trackId}`, width: '100%', height: 152 },
    controller => {
      spotifyEmbedController = controller;
      pendingTrackId = null;
      controller.addListener('playback_started', event => {
        if (!activeTrackUri || event.data.playingURI === activeTrackUri || correctingSpotifyPlayback) return;
        correctingSpotifyPlayback = true;
        controller.loadEntity(activeTrackUri);
        controller.play();
        window.setTimeout(() => { correctingSpotifyPlayback = false; }, 500);
      });
      controller.addListener('playback_update', event => {
        const { duration, position, isPaused, playingURI } = event.data;
        if (!activeTrackUri || playingURI !== activeTrackUri || !duration) return;
        if (isPaused && position >= duration - 750) {
          controller.restart();
          controller.play();
        }
      });
      controller.play();
    }
  );
}

const authDialog = document.querySelector('#auth-dialog');
const profileButton = document.querySelector('#profile-button');
const profileMenu = document.querySelector('#profile-menu');
const authForm = document.querySelector('#auth-form');
const loginTab = document.querySelector('#login-tab');
const createTab = document.querySelector('#create-tab');

const supabaseClient = supabase.createClient(
  'https://yjawkdddxcwwvipdjddy.supabase.co',
  'sb_publishable_fwdFBHZCOg8UZKcmpwR7xQ_GH6ELFtJ'
);
let currentSession = null;

function getSession() {
  return currentSession;
}

function getUsers() {
  try { return JSON.parse(localStorage.getItem('sfPrototypeUsers')) || {}; } catch { return {}; }
}

function getProjects() {
  try { return JSON.parse(localStorage.getItem('sfPrototypeProjects')) || {}; } catch { return {}; }
}

function sessionFromUser(user) {
  if (!user) return null;
  const username = user.email.toLowerCase();
  return {
    userId: user.id,
    username,
    displayName: user.user_metadata?.display_name || getUsers()[username]?.displayName || username.split('@')[0]
  };
}

async function loadProfiles() {
  const { data, error } = await supabaseClient.from('profiles').select('email, display_name');
  if (error) throw error;
  const users = {};
  for (const profile of data || []) users[profile.email.toLowerCase()] = { displayName: profile.display_name };
  localStorage.setItem('sfPrototypeUsers', JSON.stringify(users));
}

async function loadRemoteProjects(session) {
  const projects = getProjects();
  const cached = projects[session.username] || [];
  let { data, error } = await supabaseClient.from('projects').select('data, collaborator_emails').order('updated_at', { ascending: false });
  if (error) throw error;
  if (!data?.length && cached.length) {
    for (const project of cached.filter(item => item.ownerEmail === session.username)) await saveRemoteProject(project);
    ({ data, error } = await supabaseClient.from('projects').select('data, collaborator_emails').order('updated_at', { ascending: false }));
    if (error) throw error;
  }
  projects[session.username] = (data || []).map(row => ({
    ...row.data,
    collaborators: row.collaborator_emails || row.data.collaborators || []
  }));
  localStorage.setItem('sfPrototypeProjects', JSON.stringify(projects));
}

async function saveRemoteProject(project) {
  const session = getSession();
  if (!session) return;
  const data = JSON.parse(JSON.stringify(project));
  if (project.ownerEmail === session.username) {
    const { error } = await supabaseClient.from('projects').upsert({
      id: project.id,
      owner_id: session.userId,
      owner_email: project.ownerEmail,
      collaborator_emails: project.collaborators || [],
      data,
      created_at: project.createdAt || new Date().toISOString(),
      updated_at: project.updatedAt || new Date().toISOString()
    });
    if (error) throw error;
    return;
  }
  const { error } = await supabaseClient.from('projects').update({ data, updated_at: project.updatedAt || new Date().toISOString() }).eq('id', project.id);
  if (error) throw error;
}

function syncProject(project) {
  const projects = getProjects();
  const participants = new Set([project.ownerEmail, ...(project.collaborators || [])].filter(Boolean));
  for (const email of participants) {
    projects[email] ||= [];
    const index = projects[email].findIndex(item => item.id === project.id);
    const copy = JSON.parse(JSON.stringify(project));
    if (index >= 0) projects[email][index] = copy;
    else projects[email].unshift(copy);
  }
  localStorage.setItem('sfPrototypeProjects', JSON.stringify(projects));
  if (getSession()) saveRemoteProject(project).catch(error => console.warn('Creation could not be synced.', error));
}

function renderProjects() {
  const session = getSession();
  const projects = session ? (getProjects()[session.username] || []) : [];
  const section = document.querySelector('#continue-section');
  const list = document.querySelector('#creation-list');
  section.hidden = !session || projects.length === 0;
  list.replaceChildren();
  for (const project of projects.slice(0, 4)) {
    list.append(makeProjectCard(project));
  }
}

async function deleteProject(project) {
  const session = getSession();
  if (!session || project.ownerEmail !== session.username || !window.confirm(`Delete “${project.name}”? This cannot be undone.`)) return false;
  const projects = getProjects();
  for (const email of Object.keys(projects)) projects[email] = (projects[email] || []).filter(item => item.id !== project.id);
  localStorage.setItem('sfPrototypeProjects', JSON.stringify(projects));
  const { error } = await supabaseClient.from('projects').delete().eq('id', project.id);
  if (error) throw error;
  renderProjects();
  return true;
}

function makeProjectCard(project) {
  const card = document.createElement('article');
  card.className = 'recent-card';
  const badge = document.createElement('span');
  badge.className = `recent-badge ${formats[project.type].className}`;
  badge.setAttribute('aria-hidden', 'true');
  badge.innerHTML = formats[project.type].icon;
  const art = document.createElement('span');
  art.className = 'recent-art';
  art.setAttribute('aria-hidden', 'true');
  const source = project.type === 'Bookclub'
    ? project.book
    : ['Memory Box', 'Art Gallery'].includes(project.type)
      ? { image: project.memoryCover || project.memoryItems?.find(item => item.image)?.image || '' }
      : project.playlist;
  if (source?.image) {
    art.style.backgroundImage = `url("${source.image}")`;
    art.style.backgroundSize = 'cover';
    art.style.backgroundPosition = 'center';
  }
  const copy = document.createElement('span');
  copy.className = 'recent-copy';
  const title = document.createElement('strong');
  title.textContent = project.name;
  const detail = document.createElement('small');
  const itemCount = project.type === 'Bookclub'
    ? (project.book?.chapters?.length || 0)
    : ['Memory Box', 'Art Gallery'].includes(project.type)
      ? (project.memoryItems?.length || project.playlist?.songs?.length || 0)
      : (project.playlist?.songs?.length || 0);
  const itemLabel = project.type === 'Bookclub' ? 'chapters' : project.type === 'Art Gallery' ? 'artworks' : project.type === 'Memory Box' ? 'memories' : 'tracks';
  detail.textContent = `${project.type} · ${itemCount} ${itemLabel}`;
  copy.append(title, detail);
  const actions = document.createElement('span');
  actions.className = 'recent-actions';
  const remove = document.createElement('button');
  remove.className = 'card-delete';
  remove.type = 'button';
  remove.textContent = '×';
  remove.hidden = project.ownerEmail !== getSession()?.username;
  remove.setAttribute('aria-label', `Delete ${project.name}`);
  remove.addEventListener('click', event => {
    event.stopPropagation();
    if (deleteProject(project) && !libraryScreen.hidden) showLibrary();
  });
  const arrow = document.createElement('span');
  arrow.className = 'arrow';
  arrow.setAttribute('aria-hidden', 'true');
  arrow.textContent = '›';
  actions.append(remove, arrow);
  card.append(badge, art, copy, actions);
  card.tabIndex = 0;
  card.setAttribute('role', 'button');
  card.setAttribute('aria-label', `Open ${project.name}`);
  card.addEventListener('click', () => openProject(project));
  card.addEventListener('keydown', event => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      openProject(project);
    }
  });
  return card;
}

function setActiveNav(name) {
  document.querySelectorAll('.bottom-nav button').forEach(button => button.classList.remove('active'));
  document.querySelector(`#nav-${name}-button`)?.classList.add('active');
}

function setOpenProjectUrl(projectId = null) {
  const url = new URL(window.location.href);
  if (projectId) url.searchParams.set('project', projectId);
  else url.searchParams.delete('project');
  window.history.replaceState({}, '', url);
}

function showCreate() {
  setOpenProjectUrl();
  createScreen.hidden = false;
  setupScreen.hidden = true;
  projectScreen.hidden = true;
  profileScreen.hidden = true;
  libraryScreen.hidden = true;
  setActiveNav('create');
  renderProjects();
}

async function showLibrary() {
  const session = getSession();
  if (!session) {
    showAuth();
    return;
  }
  setOpenProjectUrl();
  const projects = getProjects()[session.username] || [];
  const list = document.querySelector('#library-list');
  list.replaceChildren(...projects.map(makeProjectCard));
  document.querySelector('#library-empty').hidden = projects.length > 0;
  createScreen.hidden = true;
  setupScreen.hidden = true;
  projectScreen.hidden = true;
  profileScreen.hidden = true;
  libraryScreen.hidden = false;
  setActiveNav('library');
  const missing = projects.filter(project => project.sourceUrl && (
    (project.type === 'Bookclub' && !project.book?.chapters?.length) ||
    (project.type === 'Score to Scene' && !project.playlist?.songs?.length)
  ));
  if (missing.length) {
    try {
      await Promise.all(missing.map(project => project.type === 'Bookclub' ? repairBookProject(project) : repairProject(project)));
      list.replaceChildren(...projects.map(makeProjectCard));
    } catch (error) {
      console.warn('A saved playlist could not be refreshed.', error);
    }
  }
}

function spotifyPlaylistId(value) {
  try {
    const url = new URL(value);
    if (!['open.spotify.com', 'spotify.com'].includes(url.hostname)) return null;
    return url.pathname.match(/^\/(?:intl-[a-z]{2}\/)?playlist\/([A-Za-z0-9]{22})\/?$/)?.[1] || null;
  } catch {
    return null;
  }
}

function spotifyTrackId(value) {
  try {
    const url = new URL(value);
    if (!['open.spotify.com', 'spotify.com'].includes(url.hostname)) return null;
    return url.pathname.match(/^\/(?:intl-[a-z]{2}\/)?track\/([A-Za-z0-9]{22})\/?$/)?.[1] || null;
  } catch {
    return null;
  }
}

function audibleAsin(value) {
  try {
    const url = new URL(value);
    if (!/(^|\.)audible\.(com|ca|co\.uk|com\.au)$/.test(url.hostname)) return null;
    const segments = url.pathname.split('/').filter(Boolean);
    const pdIndex = segments.findIndex(segment => segment.toLowerCase() === 'pd');
    if (pdIndex < 0) return null;
    return segments.slice(pdIndex + 1).find(segment => /^[A-Z0-9]{10}$/i.test(segment))?.toUpperCase() || null;
  } catch {
    return null;
  }
}

async function importPlaylist(sourceValue) {
  const playlistId = spotifyPlaylistId(sourceValue);
  if (!playlistId) throw new Error('Invalid Spotify playlist link');
  let playlist = null;
  if (['localhost', '127.0.0.1'].includes(window.location.hostname)) {
    try {
      const response = await fetch(new URL(`api/playlist/${playlistId}`, prototypeRoot));
      if (response.ok) playlist = await response.json();
    } catch { /* Use the hosted importer below. */ }
  }
  if (!playlist) {
    const { data, error } = await supabaseClient.functions.invoke('spotify-playlist', { body: { playlistId } });
    if (error) throw error;
    playlist = data;
  }
  if (!playlist.songs?.length) throw new Error('No public tracks were found in this playlist');
  return playlist;
}

async function importSpotifyTrack(sourceValue) {
  const trackId = spotifyTrackId(sourceValue);
  if (!trackId) throw new Error('Invalid Spotify track link');
  let track = null;
  if (['localhost', '127.0.0.1'].includes(window.location.hostname)) {
    try {
      const response = await fetch(new URL(`api/track/${trackId}`, prototypeRoot));
      if (response.ok) track = await response.json();
    } catch { /* Use the hosted importer below. */ }
  }
  if (!track) {
    const { data, error } = await supabaseClient.functions.invoke('spotify-playlist', { body: { trackId } });
    if (error) throw error;
    track = data;
  }
  if (!track?.title) throw new Error('No public details were found for this track');
  return track;
}

function songToMemoryItem(song) {
  return {
    id: crypto.randomUUID(),
    type: 'song',
    spotifyId: song.id,
    title: song.title,
    artists: song.artists || 'Unknown artist',
    image: song.image || '',
    url: song.url || `https://open.spotify.com/track/${song.id}`,
    durationMs: song.durationMs || 0,
    comments: []
  };
}

function audibleBookToMemoryItem(book) {
  return {
    id: crypto.randomUUID(),
    type: 'audiobook',
    title: book.name,
    artists: (book.authors || []).join(', ') || 'Author unavailable',
    narrators: (book.narrators || []).join(', '),
    image: book.image || '',
    url: book.url || '',
    description: book.description || '',
    runtimeMinutes: book.runtimeMinutes || 0,
    comments: []
  };
}

function metObjectToCollectionItem(object) {
  return {
    id: crypto.randomUUID(),
    type: 'art',
    metObjectId: object.objectID,
    title: object.title || 'Untitled work',
    artists: object.artistDisplayName || object.culture || 'Artist unknown',
    image: object.primaryImageSmall || object.primaryImage || '',
    fullImage: object.primaryImage || object.primaryImageSmall || '',
    url: object.objectURL || `https://www.metmuseum.org/art/collection/search/${object.objectID}`,
    date: object.objectDate || '',
    medium: object.medium || '',
    department: object.department || '',
    culture: object.culture || '',
    dimensions: object.dimensions || '',
    creditLine: object.creditLine || '',
    publicDomain: Boolean(object.isPublicDomain),
    comments: []
  };
}

async function searchMetArtwork(query, field = 'all') {
  const params = new URLSearchParams({ q: query.trim(), hasImages: 'true', offset: '0', limit: '30' });
  if (field !== 'all') params.set(field, 'true');
  const response = await fetch(`https://collectionapi.metmuseum.org/public/collection/v1.1/search?${params}`);
  if (!response.ok) throw new Error('The Met collection search is temporarily unavailable.');
  const result = await response.json();
  const ids = (result.objectIDs || []).slice(0, 18);
  const objects = await Promise.all(ids.map(async id => {
    try {
      const objectResponse = await fetch(`https://collectionapi.metmuseum.org/public/collection/v1/objects/${id}`);
      return objectResponse.ok ? objectResponse.json() : null;
    } catch { return null; }
  }));
  return objects.filter(object => object?.primaryImageSmall || object?.primaryImage);
}

function renderArtResults(container, objects, onSelect) {
  container.replaceChildren();
  if (!objects.length) {
    const empty = document.createElement('p');
    empty.className = 'art-search-empty';
    empty.textContent = 'No works with images were found. Try a broader search.';
    container.append(empty);
    return;
  }
  for (const object of objects) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'art-result-card';
    const image = document.createElement('img');
    image.src = object.primaryImageSmall || object.primaryImage;
    image.alt = '';
    image.loading = 'lazy';
    const copy = document.createElement('span');
    const title = document.createElement('strong');
    title.textContent = object.title || 'Untitled work';
    const artist = document.createElement('small');
    artist.textContent = [object.artistDisplayName || object.culture || 'Artist unknown', object.objectDate].filter(Boolean).join(' · ');
    copy.append(title, artist);
    button.append(image, copy);
    button.addEventListener('click', () => {
      container.querySelectorAll('button').forEach(card => card.classList.toggle('selected', card === button));
      onSelect(object);
    });
    container.append(button);
  }
}

async function importAudibleBook(sourceValue) {
  const asin = audibleAsin(sourceValue);
  if (!asin) throw new Error('Invalid Audible book link');
  let book = null;
  if (['localhost', '127.0.0.1'].includes(window.location.hostname)) {
    try {
      const response = await fetch(new URL(`api/audible/${asin}`, prototypeRoot));
      if (response.ok) book = await response.json();
    } catch { /* Use the hosted importer below. */ }
  }
  if (!book) {
    const { data, error } = await supabaseClient.functions.invoke('audible-book', { body: { asin } });
    if (error) throw error;
    book = data;
  }
  if (!book?.chapters?.length) throw new Error('No chapters were found for this Audible book');
  return book;
}

async function repairBookProject(project, force = false) {
  if ((!force && project.book?.chapters?.length) || !project.sourceUrl || project.type !== 'Bookclub') return project;
  const imported = await importAudibleBook(project.sourceUrl);
  const existingChapters = project.book?.chapters || [];
  const commentsByChapter = new Map(existingChapters.map(chapter => [chapter.id, chapter.comments || []]));
  project.book = {
    ...imported,
    metadataVersion: 1,
    chapters: imported.chapters.map((chapter, index) => ({
      ...chapter,
      comments: commentsByChapter.get(chapter.id) || existingChapters[index]?.comments || []
    }))
  };
  project.updatedAt = new Date().toISOString();
  syncProject(project);
  return project;
}

async function repairProject(project, force = false) {
  if ((!force && project.playlist?.songs?.length) || !project.sourceUrl || !['Score to Scene', 'Memory Box'].includes(project.type)) return project;
  const playlist = await importPlaylist(project.sourceUrl);
  const existingSongs = project.playlist?.songs || [];
  const scenesByTrack = new Map(existingSongs.map(song => [song.id, song.scene || '']));
  project.playlist = {
    ...playlist,
    metadataVersion: 3,
    songs: playlist.songs.map((song, index) => ({ ...song, position: index + 1, scene: scenesByTrack.get(song.id) || existingSongs[index]?.scene || '' }))
  };
  project.updatedAt = new Date().toISOString();
  syncProject(project);
  return project;
}

function showPlaylistReconnect(project) {
  const sceneList = document.querySelector('#scene-list');
  const reconnect = document.createElement('div');
  reconnect.className = 'playlist-reconnect';
  const label = document.createElement('label');
  label.htmlFor = 'reconnect-playlist-url';
  label.textContent = 'Reconnect the Spotify playlist';
  const input = document.createElement('input');
  input.id = 'reconnect-playlist-url';
  input.type = 'url';
  input.inputMode = 'url';
  input.placeholder = 'https://open.spotify.com/playlist/…';
  input.value = project.sourceUrl || '';
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'primary-button';
  button.textContent = 'Restore cover and scenes';
  const message = document.createElement('p');
  message.className = 'form-message';
  message.setAttribute('role', 'alert');
  button.addEventListener('click', async () => {
    const playlistId = spotifyPlaylistId(input.value.trim());
    if (!playlistId) {
      message.textContent = 'Paste the full public Spotify playlist link.';
      return;
    }
    button.disabled = true;
    button.textContent = 'Restoring playlist…';
    message.textContent = '';
    try {
      project.sourceUrl = input.value.trim();
      project.playlist = null;
      await repairProject(project);
      renderProjects();
      await openProject(project);
    } catch {
      message.textContent = 'Spotify did not expose tracks for that playlist. Confirm that it is public and try again.';
    } finally {
      button.disabled = false;
      button.textContent = 'Restore cover and scenes';
    }
  });
  reconnect.append(label, input, button, message);
  sceneList.replaceChildren(reconnect);
}

function renderLinkedText(target, value) {
  target.replaceChildren();
  const text = value || '';
  const pattern = /https?:\/\/[^\s]+/g;
  let last = 0;
  let match;
  while ((match = pattern.exec(text))) {
    if (match.index > last) target.append(document.createTextNode(text.slice(last, match.index)));
    const link = document.createElement('a');
    link.href = match[0];
    link.target = '_blank';
    link.rel = 'noopener';
    link.textContent = match[0];
    target.append(link);
    last = match.index + match[0].length;
  }
  if (last < text.length) target.append(document.createTextNode(text.slice(last)));
}

function saveScene(projectId, songIndex, scene) {
  const session = getSession();
  if (!session) return;
  const projects = getProjects();
  const project = (projects[session.username] || []).find(item => item.id === projectId);
  if (!project?.playlist?.songs?.[songIndex] || !canEditProjectContent(project)) return;
  project.playlist.songs[songIndex].scene = scene;
  project.updatedAt = new Date().toISOString();
  syncProject(project);
}

function revokeCollaborator(project, email) {
  const session = getSession();
  if (!session || project.ownerEmail !== session.username) return;
  project.collaborators = (project.collaborators || []).filter(item => item !== email);
  if (project.collaboratorRoles) delete project.collaboratorRoles[email];
  project.updatedAt = new Date().toISOString();
  const projects = getProjects();
  projects[email] = (projects[email] || []).filter(item => item.id !== project.id);
  localStorage.setItem('sfPrototypeProjects', JSON.stringify(projects));
  syncProject(project);
  renderCollaborators(project);
}

function renderCollaborators(project) {
  const session = getSession();
  const users = getUsers();
  const list = document.querySelector('#collaborator-list');
  list.replaceChildren();
  normalizeCollaboratorRoles(project);
  for (const email of project.collaborators || []) {
    const chip = document.createElement('span');
    chip.className = 'collaborator-chip';
    const identity = document.createElement('span');
    identity.className = 'collaborator-identity';
    const name = document.createElement('strong');
    name.textContent = users[email]?.displayName || email;
    const address = document.createElement('small');
    address.textContent = email;
    identity.append(name, address);
    chip.append(identity);
    if (project.ownerEmail === session?.username) {
      const role = document.createElement('select');
      role.setAttribute('aria-label', `Access level for ${email}`);
      for (const [value, label] of Object.entries(collaboratorRoleLabels)) {
        const option = document.createElement('option');
        option.value = value;
        option.textContent = label;
        option.selected = project.collaboratorRoles[email] === value;
        role.append(option);
      }
      role.addEventListener('change', () => {
        project.collaboratorRoles[email] = role.value;
        project.updatedAt = new Date().toISOString();
        syncProject(project);
      });
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.textContent = '×';
      remove.setAttribute('aria-label', `Revoke access for ${email}`);
      remove.addEventListener('click', () => revokeCollaborator(project, email));
      chip.append(role, remove);
    } else {
      const badge = document.createElement('small');
      badge.className = 'collaborator-role-badge';
      badge.textContent = collaboratorRoleLabels[project.collaboratorRoles[email]];
      chip.append(badge);
    }
    list.append(chip);
  }
}

function inviteCollaborator(email) {
  if (!activeProject) return;
  const normalized = email.trim().toLowerCase();
  const session = getSession();
  const message = document.querySelector('#collaborator-message');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
    message.textContent = 'Enter a valid email address.';
    return;
  }
  if (normalized === session?.username || (activeProject.collaborators || []).includes(normalized)) {
    message.textContent = 'That person already has access.';
    return;
  }
  activeProject.collaborators ||= [];
  activeProject.collaborators.push(normalized);
  normalizeCollaboratorRoles(activeProject);
  const selectedRole = document.querySelector('#collaborator-role').value;
  activeProject.collaboratorRoles[normalized] = collaboratorRoleLabels[selectedRole] ? selectedRole : 'collaborator';
  activeProject.updatedAt = new Date().toISOString();
  syncProject(activeProject);
  renderCollaborators(activeProject);
  document.querySelector('#collaborator-search').value = '';
  document.querySelector('#collaborator-options').replaceChildren();
  const registered = Boolean(getUsers()[normalized]);
  const roleLabel = collaboratorRoleLabels[activeProject.collaboratorRoles[normalized]];
  message.textContent = registered
    ? `${normalized} now has ${roleLabel.toLowerCase()} access.`
    : `${roleLabel} invitation saved for ${normalized}. It will appear when they create an account with that email.`;
}

async function renderCollaboratorOptions(query) {
  const options = document.querySelector('#collaborator-options');
  options.replaceChildren();
  const normalized = query.trim().toLowerCase();
  if (normalized.length < 2 || !activeProject) return;
  try { await loadProfiles(); } catch { /* Use the most recent local profile cache. */ }
  const users = getUsers();
  const session = getSession();
  const matches = Object.entries(users).filter(([email]) =>
    email !== session?.username &&
    !(activeProject.collaborators || []).includes(email) &&
    email.includes(normalized)
  ).slice(0, 5);
  for (const [email, user] of matches) {
    const option = document.createElement('button');
    option.type = 'button';
    option.innerHTML = `<strong></strong><small></small>`;
    option.querySelector('strong').textContent = user.displayName;
    option.querySelector('small').textContent = email;
    option.addEventListener('click', () => inviteCollaborator(email));
    options.append(option);
  }
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized) && !users[normalized] && !(activeProject.collaborators || []).includes(normalized)) {
    const external = document.createElement('button');
    external.type = 'button';
    external.innerHTML = '<strong>Invite by email</strong><small></small>';
    external.querySelector('small').textContent = normalized;
    external.addEventListener('click', () => inviteCollaborator(normalized));
    options.append(external);
  }
}

function closeTitleEditor() {
  document.querySelector('#project-title-editor').hidden = true;
  document.querySelector('.project-title-row').hidden = false;
}

function saveProjectTitle() {
  if (!activeProject || !canEditProjectContent(activeProject)) return;
  const input = document.querySelector('#project-title-input');
  const name = input.value.trim();
  if (!name) {
    input.focus();
    return;
  }
  const session = getSession();
  if (!session) return;
  activeProject.name = name;
  activeProject.updatedAt = new Date().toISOString();
  syncProject(activeProject);
  document.querySelector('#project-title').textContent = name;
  closeTitleEditor();
  renderProjects();
}

function formatChapterLength(lengthMs) {
  const minutes = Math.max(1, Math.round(Number(lengthMs || 0) / 60000));
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return `${hours} hr${hours === 1 ? '' : 's'}${remainder ? ` ${remainder} min` : ''}`;
}

async function addBookComment(project, chapterId, body) {
  const session = getSession();
  const message = body.trim();
  if (!session || !message) return;
  if (!canContribute(project)) throw new Error('Collaborator access is required to comment.');
  let latest = project;
  const { data, error } = await supabaseClient
    .from('projects')
    .select('data, collaborator_emails')
    .eq('id', project.id)
    .single();
  if (!error && data?.data) {
    latest = { ...data.data, collaborators: data.collaborator_emails || data.data.collaborators || [] };
  }
  const chapter = latest.book?.chapters?.find(item => item.id === chapterId);
  if (!chapter) throw new Error('That chapter could not be found. Refresh and try again.');
  chapter.comments ||= [];
  chapter.comments.push({
    id: crypto.randomUUID(),
    body: message,
    authorEmail: session.username,
    authorName: session.displayName,
    createdAt: new Date().toISOString()
  });
  latest.updatedAt = new Date().toISOString();
  const { error: updateError } = await supabaseClient
    .from('projects')
    .update({ data: latest, updated_at: latest.updatedAt })
    .eq('id', latest.id);
  if (updateError) throw updateError;
  syncProject(latest);
  activeProject = latest;
  await openProject(latest);
}

async function changeComment(project, containerType, containerId, commentId, action, body = '') {
  if (!canEditProjectContent(project)) throw new Error('Editor access is required.');
  const latest = await latestRemoteProject(project);
  const container = containerType === 'chapter'
    ? latest.book?.chapters?.find(item => item.id === containerId)
    : latest.memoryItems?.find(item => item.id === containerId);
  if (!container) throw new Error('That item could not be found. Refresh and try again.');
  const index = (container.comments || []).findIndex(comment => comment.id === commentId);
  if (index < 0) throw new Error('That comment could not be found. Refresh and try again.');
  if (action === 'delete') container.comments.splice(index, 1);
  else {
    const message = body.trim();
    if (!message) throw new Error('A comment cannot be empty.');
    container.comments[index].body = message;
    container.comments[index].editedAt = new Date().toISOString();
  }
  latest.updatedAt = new Date().toISOString();
  const { error } = await supabaseClient.from('projects').update({ data: latest, updated_at: latest.updatedAt }).eq('id', latest.id);
  if (error) throw error;
  syncProject(latest);
  activeProject = latest;
  await openProject(latest);
}

function appendCommentControls(post, project, containerType, containerId, comment) {
  if (!canEditProjectContent(project)) return;
  const actions = document.createElement('div');
  actions.className = 'comment-actions';
  const edit = document.createElement('button');
  edit.type = 'button';
  edit.textContent = 'Edit';
  edit.addEventListener('click', async () => {
    const next = window.prompt('Edit this comment', comment.body);
    if (next === null || next.trim() === comment.body) return;
    try { await changeComment(project, containerType, containerId, comment.id, 'edit', next); }
    catch (error) { window.alert(error.message || 'The comment could not be edited.'); }
  });
  const remove = document.createElement('button');
  remove.type = 'button';
  remove.textContent = 'Delete';
  remove.addEventListener('click', async () => {
    if (!window.confirm('Delete this comment?')) return;
    try { await changeComment(project, containerType, containerId, comment.id, 'delete'); }
    catch (error) { window.alert(error.message || 'The comment could not be deleted.'); }
  });
  actions.append(edit, remove);
  post.append(actions);
}

function renderBookclubProject(project) {
  const book = project.book;
  document.querySelector('#project-type').textContent = 'Bookclub';
  document.querySelector('#project-title').textContent = project.name;
  document.querySelector('#project-playlist').textContent = book.name;
  document.querySelector('#project-source-kind').textContent = 'Audible book';
  const owner = document.querySelector('#project-owner');
  owner.textContent = book.authors?.join(', ') || 'Author unavailable';
  owner.href = book.url || project.sourceUrl;
  document.querySelector('#project-owner-image').hidden = true;
  renderLinkedText(document.querySelector('#project-description'), book.description || 'No book description was provided.');
  const cover = document.querySelector('#project-cover');
  cover.hidden = !book.image;
  if (book.image) cover.src = book.image;
  const chapters = book.chapters || [];
  const commentCount = chapters.reduce((total, chapter) => total + (chapter.comments?.length || 0), 0);
  document.querySelector('#project-summary').textContent = `${chapters.length} chapter${chapters.length === 1 ? '' : 's'} · ${commentCount} discussion post${commentCount === 1 ? '' : 's'}`;
  const sceneList = document.querySelector('#scene-list');
  sceneList.replaceChildren();

  chapters.forEach((chapter, index) => {
    const card = document.createElement('article');
    card.className = 'chapter-card';
    const heading = document.createElement('div');
    heading.className = 'chapter-heading';
    const number = document.createElement('span');
    number.className = 'chapter-number';
    number.textContent = String(index + 1);
    const titleWrap = document.createElement('div');
    const title = document.createElement('h2');
    title.textContent = chapter.title;
    const length = document.createElement('small');
    length.textContent = formatChapterLength(chapter.lengthMs);
    titleWrap.append(title, length);
    heading.append(number, titleWrap);

    const discussion = document.createElement('div');
    discussion.className = 'chapter-discussion';
    if (!chapter.comments?.length) {
      const empty = document.createElement('p');
      empty.className = 'discussion-empty';
      empty.textContent = 'Start the conversation about this chapter.';
      discussion.append(empty);
    }
    for (const comment of chapter.comments || []) {
      const post = document.createElement('article');
      post.className = 'discussion-post';
      const meta = document.createElement('p');
      const author = document.createElement('strong');
      author.textContent = comment.authorName || comment.authorEmail || 'Bookclub member';
      const time = document.createElement('time');
      time.dateTime = comment.createdAt || '';
      time.textContent = comment.createdAt ? new Date(comment.createdAt).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '';
      meta.append(author, time);
      const copy = document.createElement('p');
      copy.textContent = comment.body;
      post.append(meta, copy);
      appendCommentControls(post, project, 'chapter', chapter.id, comment);
      discussion.append(post);
    }

    const composer = document.createElement('form');
    composer.className = 'chapter-composer';
    const label = document.createElement('label');
    label.className = 'visually-hidden';
    label.htmlFor = `chapter-comment-${index}`;
    label.textContent = `Add to the discussion for ${chapter.title}`;
    const input = document.createElement('textarea');
    input.id = `chapter-comment-${index}`;
    input.rows = 2;
    input.placeholder = 'Share a thought, question, or reaction…';
    const button = document.createElement('button');
    button.type = 'submit';
    button.textContent = 'Post';
    const status = document.createElement('p');
    status.className = 'form-message chapter-status';
    status.setAttribute('role', 'status');
    composer.append(label, input, button, status);
    composer.addEventListener('submit', async event => {
      event.preventDefault();
      if (!input.value.trim()) return input.focus();
      button.disabled = true;
      status.textContent = 'Posting…';
      try {
        await addBookComment(project, chapter.id, input.value);
      } catch (error) {
        status.textContent = error.message || 'Your comment could not be posted.';
        button.disabled = false;
      }
    });
    composer.hidden = !canContribute(project);
    card.append(heading, discussion, composer);
    sceneList.append(card);
  });
}

async function latestRemoteProject(project) {
  const { data, error } = await supabaseClient
    .from('projects')
    .select('data, collaborator_emails')
    .eq('id', project.id)
    .single();
  return !error && data?.data
    ? { ...data.data, collaborators: data.collaborator_emails || data.data.collaborators || [] }
    : project;
}

async function saveMemoryItems(project, additions) {
  if (!canContribute(project)) throw new Error('Collaborator access is required to add items.');
  const latest = await latestRemoteProject(project);
  latest.memoryItems ||= [];
  for (const item of additions) {
    const duplicate = item.type === 'song' && latest.memoryItems.some(existing => existing.type === 'song' && existing.spotifyId === item.spotifyId);
    if (!duplicate) latest.memoryItems.push(item);
  }
  latest.updatedAt = new Date().toISOString();
  const { error } = await supabaseClient.from('projects').update({ data: latest, updated_at: latest.updatedAt }).eq('id', latest.id);
  if (error) throw error;
  syncProject(latest);
  activeProject = latest;
  await openProject(latest);
}

async function addMemoryComment(project, itemId, body) {
  const session = getSession();
  const message = body.trim();
  if (!session || !message) return;
  if (!canContribute(project)) throw new Error('Collaborator access is required to comment.');
  const latest = await latestRemoteProject(project);
  const item = latest.memoryItems?.find(entry => entry.id === itemId);
  if (!item) throw new Error('That memory could not be found. Refresh and try again.');
  item.comments ||= [];
  item.comments.push({
    id: crypto.randomUUID(),
    body: message,
    authorEmail: session.username,
    authorName: session.displayName,
    createdAt: new Date().toISOString()
  });
  latest.updatedAt = new Date().toISOString();
  const { error } = await supabaseClient.from('projects').update({ data: latest, updated_at: latest.updatedAt }).eq('id', latest.id);
  if (error) throw error;
  syncProject(latest);
  activeProject = latest;
  await openProject(latest);
}

async function updateMemoryItemTitle(project, itemId, nextTitle) {
  if (!canEditProjectContent(project)) throw new Error('Editor access is required.');
  const title = nextTitle.trim();
  if (!title) throw new Error('Give this item a name.');
  const latest = await latestRemoteProject(project);
  const item = latest.memoryItems?.find(entry => entry.id === itemId);
  if (!item) throw new Error('That item could not be found. Refresh and try again.');
  item.title = title;
  latest.updatedAt = new Date().toISOString();
  const { error } = await supabaseClient.from('projects').update({ data: latest, updated_at: latest.updatedAt }).eq('id', latest.id);
  if (error) throw error;
  syncProject(latest);
  activeProject = latest;
  await openProject(latest);
}

async function removeMemoryItem(project, itemId) {
  if (!canEditProjectContent(project)) throw new Error('Editor access is required.');
  const latest = await latestRemoteProject(project);
  const index = (latest.memoryItems || []).findIndex(item => item.id === itemId);
  if (index < 0) throw new Error('That item could not be found. Refresh and try again.');
  latest.memoryItems.splice(index, 1);
  latest.updatedAt = new Date().toISOString();
  const { error } = await supabaseClient.from('projects').update({ data: latest, updated_at: latest.updatedAt }).eq('id', latest.id);
  if (error) throw error;
  syncProject(latest);
  activeProject = latest;
  await openProject(latest);
}

function appendDiscussion(container, comments, emptyText, project, itemId) {
  if (!comments?.length) {
    const empty = document.createElement('p');
    empty.className = 'discussion-empty';
    empty.textContent = emptyText;
    container.append(empty);
  }
  for (const comment of comments || []) {
    const post = document.createElement('article');
    post.className = 'discussion-post';
    const meta = document.createElement('p');
    const author = document.createElement('strong');
    author.textContent = comment.authorName || comment.authorEmail || 'Memory Box member';
    const time = document.createElement('time');
    time.dateTime = comment.createdAt || '';
    time.textContent = comment.createdAt ? new Date(comment.createdAt).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '';
    meta.append(author, time);
    const copy = document.createElement('p');
    copy.textContent = comment.body;
    post.append(meta, copy);
    appendCommentControls(post, project, 'memory', itemId, comment);
    container.append(post);
  }
}

function renderCollectionProject(project) {
  const isGallery = project.type === 'Art Gallery';
  project.memoryItems ||= (project.playlist?.songs || []).map(songToMemoryItem);
  const items = project.memoryItems;
  document.querySelector('#project-type').textContent = project.type;
  document.querySelector('#project-title').textContent = project.name;
  document.querySelector('#project-playlist').textContent = project.memorySourceName || project.playlist?.name || (isGallery ? 'A shared collection of art' : 'Photos, art, audiobooks, songs, and playlists');
  document.querySelector('#project-source-kind').textContent = isGallery ? 'The Met collection' : 'Shared collection';
  const owner = document.querySelector('#project-owner');
  owner.textContent = isGallery ? 'The Metropolitan Museum of Art' : 'Shared memory collection';
  if (isGallery) owner.href = 'https://www.metmuseum.org/art/collection';
  else owner.removeAttribute('href');
  document.querySelector('#project-owner-image').hidden = true;
  renderLinkedText(document.querySelector('#project-description'), isGallery
    ? 'Search The Met collection, curate works for this gallery, and discuss each one together.'
    : 'Add photos, art, audiobooks, songs, and playlists, then share the stories, reactions, and memories connected to each one.');
  const cover = document.querySelector('#project-cover');
  const coverUrl = project.memoryCover || project.playlist?.image || items.find(item => item.image)?.image || '';
  cover.hidden = !coverUrl;
  if (coverUrl) cover.src = coverUrl;
  const commentCount = items.reduce((total, item) => total + (item.comments?.length || 0), 0);
  document.querySelector('#project-summary').textContent = `${items.length} item${items.length === 1 ? '' : 's'} · ${commentCount} discussion post${commentCount === 1 ? '' : 's'}`;
  const sceneList = document.querySelector('#scene-list');
  sceneList.replaceChildren();

  const addPanel = document.createElement('section');
  addPanel.className = 'memory-add-panel';
  addPanel.hidden = !canContribute(project);
  const addTitle = document.createElement('h2');
  addTitle.textContent = isGallery ? 'Add artwork to this gallery' : 'Add to this Memory Box';
  const addChoices = document.createElement('div');
  addChoices.className = 'memory-choice-grid memory-add-choices';
  const addTypes = isGallery
    ? [['art', 'Search artwork', '▱']]
    : [['photo', 'Photo', '▧'], ['audiobook', 'Audiobook', '◉'], ['song', 'Song', '♪'], ['playlist', 'Playlist', '♫'], ['art', 'Art', '▱']];
  for (const [type, label, icon] of addTypes) {
    const choice = document.createElement('button');
    choice.type = 'button';
    choice.dataset.addType = type;
    choice.innerHTML = `<span aria-hidden="true">${icon}</span>${label}`;
    addChoices.append(choice);
  }
  const spotifyLabel = document.createElement('label');
  spotifyLabel.htmlFor = 'memory-spotify-url';
  spotifyLabel.textContent = 'Spotify link';
  spotifyLabel.hidden = true;
  const spotifyRow = document.createElement('div');
  spotifyRow.className = 'memory-add-row';
  spotifyRow.hidden = true;
  const spotifyInput = document.createElement('input');
  spotifyInput.id = 'memory-spotify-url';
  spotifyInput.type = 'url';
  spotifyInput.inputMode = 'url';
  spotifyInput.placeholder = 'Paste a Spotify link';
  const spotifyButton = document.createElement('button');
  spotifyButton.type = 'button';
  spotifyButton.textContent = 'Add';
  spotifyRow.append(spotifyInput, spotifyButton);
  const audibleLabel = document.createElement('label');
  audibleLabel.htmlFor = 'memory-audible-url';
  audibleLabel.textContent = 'Audible audiobook link';
  audibleLabel.hidden = true;
  const audibleRow = document.createElement('div');
  audibleRow.className = 'memory-add-row';
  audibleRow.hidden = true;
  const audibleInput = document.createElement('input');
  audibleInput.id = 'memory-audible-url';
  audibleInput.type = 'url';
  audibleInput.inputMode = 'url';
  audibleInput.placeholder = 'Paste an Audible book link';
  const audibleButton = document.createElement('button');
  audibleButton.type = 'button';
  audibleButton.textContent = 'Add audiobook';
  audibleRow.append(audibleInput, audibleButton);
  const photoLabel = document.createElement('label');
  photoLabel.htmlFor = 'memory-photo-title';
  photoLabel.textContent = 'Photo';
  photoLabel.hidden = true;
  const photoRow = document.createElement('div');
  photoRow.className = 'memory-add-row memory-photo-row';
  photoRow.hidden = true;
  const photoTitle = document.createElement('input');
  photoTitle.id = 'memory-photo-title';
  photoTitle.type = 'text';
  photoTitle.placeholder = 'Name this memory';
  const photoInput = document.createElement('input');
  photoInput.type = 'file';
  photoInput.accept = 'image/*';
  photoInput.className = 'memory-file-input';
  const photoButton = document.createElement('button');
  photoButton.type = 'button';
  photoButton.textContent = 'Choose photo';
  photoRow.append(photoTitle, photoButton, photoInput);
  const artLabel = document.createElement('label');
  artLabel.htmlFor = 'collection-art-query';
  artLabel.textContent = 'Search The Met collection';
  artLabel.hidden = true;
  const artRow = document.createElement('div');
  artRow.className = 'memory-art-search';
  artRow.hidden = true;
  const artSearchInput = document.createElement('input');
  artSearchInput.id = 'collection-art-query';
  artSearchInput.type = 'search';
  artSearchInput.placeholder = 'Artwork, artist, culture, or subject';
  const artField = document.createElement('select');
  for (const [value, label] of [['all', 'Everything'], ['title', 'Artwork title'], ['artistOrCulture', 'Artist or culture'], ['tags', 'Subject']]) {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = label;
    artField.append(option);
  }
  const artSearchButton = document.createElement('button');
  artSearchButton.type = 'button';
  artSearchButton.textContent = 'Search';
  const artResults = document.createElement('div');
  artResults.className = 'art-search-results';
  artRow.append(artSearchInput, artField, artSearchButton, artResults);
  const addStatus = document.createElement('p');
  addStatus.className = 'form-message';
  addStatus.setAttribute('role', 'status');
  addPanel.append(addTitle, addChoices, spotifyLabel, spotifyRow, audibleLabel, audibleRow, photoLabel, photoRow, artLabel, artRow, addStatus);
  sceneList.append(addPanel);

  let selectedAddType = null;
  addChoices.querySelectorAll('button').forEach(choice => choice.addEventListener('click', () => {
    selectedAddType = choice.dataset.addType;
    addChoices.querySelectorAll('button').forEach(button => button.classList.toggle('active', button === choice));
    const spotifySelected = ['song', 'playlist'].includes(selectedAddType);
    spotifyLabel.hidden = !spotifySelected;
    spotifyRow.hidden = !spotifySelected;
    audibleLabel.hidden = selectedAddType !== 'audiobook';
    audibleRow.hidden = selectedAddType !== 'audiobook';
    photoLabel.hidden = selectedAddType !== 'photo';
    photoRow.hidden = selectedAddType !== 'photo';
    artLabel.hidden = selectedAddType !== 'art';
    artRow.hidden = selectedAddType !== 'art';
    spotifyLabel.textContent = selectedAddType === 'song' ? 'Spotify song link' : 'Spotify playlist link';
    spotifyInput.placeholder = selectedAddType === 'song' ? 'Paste a Spotify song link' : 'Paste a Spotify playlist link';
    spotifyButton.textContent = selectedAddType === 'song' ? 'Add song' : 'Add playlist';
    addStatus.textContent = '';
    (selectedAddType === 'photo' ? photoTitle : selectedAddType === 'audiobook' ? audibleInput : selectedAddType === 'art' ? artSearchInput : spotifyInput).focus();
  }));

  artSearchButton.addEventListener('click', async () => {
    const query = artSearchInput.value.trim();
    if (!query) return artSearchInput.focus();
    artSearchButton.disabled = true;
    addStatus.textContent = 'Searching The Met…';
    artResults.replaceChildren();
    try {
      const objects = await searchMetArtwork(query, artField.value);
      addStatus.textContent = objects.length ? 'Choose a work to add.' : '';
      renderArtResults(artResults, objects, async object => {
        addStatus.textContent = 'Adding artwork…';
        try { await saveMemoryItems(project, [metObjectToCollectionItem(object)]); }
        catch (error) { addStatus.textContent = error.message || 'That artwork could not be added.'; }
      });
    } catch (error) {
      addStatus.textContent = error.message || 'Artwork search failed. Try again.';
    } finally {
      artSearchButton.disabled = false;
    }
  });
  artSearchInput.addEventListener('keydown', event => {
    if (event.key === 'Enter') { event.preventDefault(); artSearchButton.click(); }
  });
  if (isGallery) addChoices.querySelector('button')?.click();

  spotifyButton.addEventListener('click', async () => {
    const url = spotifyInput.value.trim();
    if (!url) return spotifyInput.focus();
    spotifyButton.disabled = true;
    addStatus.textContent = 'Adding music…';
    try {
      const playlistId = spotifyPlaylistId(url);
      const trackId = spotifyTrackId(url);
      if (selectedAddType === 'song' && !trackId) throw new Error('Paste a full Spotify song link.');
      if (selectedAddType === 'playlist' && !playlistId) throw new Error('Paste a full Spotify playlist link.');
      const additions = selectedAddType === 'playlist'
        ? (await importPlaylist(url)).songs.map(songToMemoryItem)
        : [songToMemoryItem(await importSpotifyTrack(url))];
      await saveMemoryItems(project, additions);
    } catch (error) {
      addStatus.textContent = error.message || 'That Spotify music could not be added.';
      spotifyButton.disabled = false;
    }
  });

  audibleButton.addEventListener('click', async () => {
    const url = audibleInput.value.trim();
    if (!url) return audibleInput.focus();
    audibleButton.disabled = true;
    addStatus.textContent = 'Adding audiobook…';
    try {
      await saveMemoryItems(project, [audibleBookToMemoryItem(await importAudibleBook(url))]);
    } catch (error) {
      addStatus.textContent = error.message || 'That audiobook could not be added.';
      audibleButton.disabled = false;
    }
  });

  photoButton.addEventListener('click', () => photoInput.click());
  photoInput.addEventListener('change', async () => {
    const file = photoInput.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      addStatus.textContent = 'Choose an image file.';
      return;
    }
    photoButton.disabled = true;
    addStatus.textContent = 'Uploading photo…';
    try {
      const safeName = file.name.replace(/[^A-Za-z0-9._-]+/g, '-');
      const path = `${project.id}/${crypto.randomUUID()}-${safeName}`;
      const { error } = await supabaseClient.storage.from('memory-box-images').upload(path, file, { contentType: file.type, upsert: false });
      if (error) throw error;
      const { data } = supabaseClient.storage.from('memory-box-images').getPublicUrl(path);
      await saveMemoryItems(project, [{
        id: crypto.randomUUID(),
        type: 'photo',
        title: photoTitle.value.trim() || file.name.replace(/\.[^.]+$/, ''),
        image: data.publicUrl,
        storagePath: path,
        comments: []
      }]);
    } catch (error) {
      addStatus.textContent = error.message || 'That photo could not be uploaded.';
      photoButton.disabled = false;
    }
  });

  items.forEach((item, index) => {
    const card = document.createElement('article');
    card.className = 'memory-card';
    const media = document.createElement('img');
    media.className = 'memory-media';
    media.src = item.image || (isGallery ? 'assets/memorybox-icon.jpeg' : 'assets/memorybox-icon.jpeg');
    media.alt = item.type === 'photo' ? item.title : '';
    media.loading = 'lazy';
    const heading = document.createElement('div');
    heading.className = 'memory-heading';
    const eyebrow = document.createElement('small');
    eyebrow.textContent = item.type === 'photo' ? 'Photo memory' : item.type === 'audiobook' ? 'Audible audiobook' : item.type === 'art' ? 'Work of art · The Met' : 'Spotify song';
    const title = document.createElement('h2');
    title.textContent = item.title || `Memory ${index + 1}`;
    const byline = document.createElement('p');
    byline.textContent = item.type === 'art'
      ? [item.artists, item.date, item.medium].filter(Boolean).join(' · ')
      : item.type === 'audiobook' && item.narrators
      ? `${item.artists || 'Author unavailable'} · Narrated by ${item.narrators}`
      : (item.artists || '');
    heading.append(eyebrow, title, byline);
    if (item.type === 'audiobook' && item.url) {
      const sourceLink = document.createElement('a');
      sourceLink.className = 'memory-source-link';
      sourceLink.href = item.url;
      sourceLink.target = '_blank';
      sourceLink.rel = 'noopener';
      sourceLink.textContent = 'Open in Audible';
      heading.append(sourceLink);
    }
    if (item.type === 'art' && item.url) {
      const sourceLink = document.createElement('a');
      sourceLink.className = 'memory-source-link';
      sourceLink.href = item.url;
      sourceLink.target = '_blank';
      sourceLink.rel = 'noopener';
      sourceLink.textContent = 'View at The Met';
      heading.append(sourceLink);
    }
    if (canEditProjectContent(project)) {
      const itemActions = document.createElement('div');
      itemActions.className = 'memory-item-actions';
      const editButton = document.createElement('button');
      editButton.type = 'button';
      editButton.className = 'memory-edit-name';
      editButton.textContent = '✎';
      editButton.setAttribute('aria-label', `Rename ${item.title || `item ${index + 1}`}`);
      const deleteButton = document.createElement('button');
      deleteButton.type = 'button';
      deleteButton.className = 'memory-delete-item';
      deleteButton.textContent = '×';
      deleteButton.setAttribute('aria-label', `Delete ${item.title || `item ${index + 1}`}`);
      const editor = document.createElement('form');
      editor.className = 'memory-name-editor';
      editor.hidden = true;
      const nameInput = document.createElement('input');
      nameInput.type = 'text';
      nameInput.value = item.title || '';
      nameInput.maxLength = 120;
      nameInput.setAttribute('aria-label', 'Item name');
      const save = document.createElement('button');
      save.type = 'submit';
      save.textContent = 'Save';
      const cancel = document.createElement('button');
      cancel.type = 'button';
      cancel.textContent = 'Cancel';
      const editStatus = document.createElement('p');
      editStatus.className = 'form-message memory-name-status';
      editor.append(nameInput, save, cancel, editStatus);
      editButton.addEventListener('click', () => {
        title.hidden = true;
        itemActions.hidden = true;
        editor.hidden = false;
        nameInput.focus();
        nameInput.select();
      });
      cancel.addEventListener('click', () => {
        editor.hidden = true;
        title.hidden = false;
        itemActions.hidden = false;
        editStatus.textContent = '';
      });
      nameInput.addEventListener('keydown', event => {
        if (event.key === 'Escape') cancel.click();
      });
      editor.addEventListener('submit', async event => {
        event.preventDefault();
        if (!nameInput.value.trim()) return nameInput.focus();
        save.disabled = true;
        cancel.disabled = true;
        editStatus.textContent = 'Saving…';
        try { await updateMemoryItemTitle(project, item.id, nameInput.value); }
        catch (error) {
          editStatus.textContent = error.message || 'The photo name could not be saved.';
          save.disabled = false;
          cancel.disabled = false;
        }
      });
      deleteButton.addEventListener('click', async () => {
        if (!window.confirm(`Delete “${item.title || 'this item'}” from the Memory Box?`)) return;
        try { await removeMemoryItem(project, item.id); }
        catch (error) { window.alert(error.message || 'The item could not be deleted.'); }
      });
      itemActions.append(editButton, deleteButton);
      heading.append(itemActions, editor);
    }
    if (item.type === 'song' && item.spotifyId) {
      const play = document.createElement('button');
      play.type = 'button';
      play.className = 'memory-play';
      play.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13l10-6.5z"/></svg>';
      play.setAttribute('aria-label', `Play ${item.title}`);
      play.addEventListener('click', () => startSpotifyTrack(item.spotifyId));
      heading.append(play);
    }
    const top = document.createElement('div');
    top.className = 'memory-top';
    top.append(media, heading);
    const discussion = document.createElement('div');
    discussion.className = 'chapter-discussion';
    appendDiscussion(discussion, item.comments, isGallery || item.type === 'art' ? 'Be the first to share what this artwork makes you think or feel.' : 'Be the first to share the story behind this memory.', project, item.id);
    const composer = document.createElement('form');
    composer.className = 'chapter-composer';
    const input = document.createElement('textarea');
    input.rows = 2;
    input.placeholder = isGallery || item.type === 'art' ? 'Share a thought, interpretation, or reaction…' : 'Share a memory, thought, or reaction…';
    input.setAttribute('aria-label', `Comment on ${item.title}`);
    const button = document.createElement('button');
    button.type = 'submit';
    button.textContent = 'Post';
    const status = document.createElement('p');
    status.className = 'form-message chapter-status';
    composer.append(input, button, status);
    composer.addEventListener('submit', async event => {
      event.preventDefault();
      if (!input.value.trim()) return input.focus();
      button.disabled = true;
      status.textContent = 'Posting…';
      try { await addMemoryComment(project, item.id, input.value); }
      catch (error) { status.textContent = error.message || 'Your comment could not be posted.'; button.disabled = false; }
    });
    composer.hidden = !canContribute(project);
    card.append(top, discussion, composer);
    sceneList.append(card);
  });
}

async function openProject(project) {
  activeProject = project;
  setOpenProjectUrl(project.id);
  document.querySelector('#refresh-project-status').textContent = '';
  project.ownerEmail ||= getSession()?.username || '';
  project.collaborators ||= [];
  normalizeCollaboratorRoles(project);
  closeTitleEditor();
  createScreen.hidden = true;
  setupScreen.hidden = true;
  projectScreen.hidden = false;
  projectScreen.dataset.type = project.type;
  projectScreen.dataset.role = projectRole(project) || 'viewer';
  profileScreen.hidden = true;
  libraryScreen.hidden = true;
  document.querySelector('#project-type').textContent = project.type;
  document.querySelector('#edit-project-title').hidden = !canEditProjectContent(project);
  if (project.type === 'Bookclub') {
    if (canEditProjectContent(project) && project.book?.chapters?.length && project.book.metadataVersion !== 1 && project.sourceUrl) {
      try { await repairBookProject(project, true); } catch { /* Keep saved book details if refresh fails. */ }
    }
    if (!project.book?.chapters?.length) {
      document.querySelector('#project-title').textContent = project.name;
      document.querySelector('#project-playlist').textContent = 'Loading Audible book…';
      document.querySelector('#project-summary').textContent = 'Loading the cover, details, and chapters from Audible…';
      document.querySelector('#scene-list').replaceChildren();
      try {
        if (!canEditProjectContent(project)) throw new Error('This book needs an editor to refresh it.');
        await repairBookProject(project);
      } catch {
        document.querySelector('#project-playlist').textContent = 'Audible book unavailable';
        document.querySelector('#project-summary').textContent = 'This book could not be refreshed from its Audible link.';
        return;
      }
    }
    const isOwner = project.ownerEmail === getSession()?.username;
    document.querySelector('#delete-project-button').hidden = !isOwner;
    document.querySelector('#invite-collaborator-button').hidden = !isOwner;
    document.querySelector('#invite-finder').hidden = true;
    document.querySelector('#collaborator-search').value = '';
    document.querySelector('#collaborator-options').replaceChildren();
    document.querySelector('#collaborator-message').textContent = '';
    renderCollaborators(project);
    renderBookclubProject(project);
    return;
  }
  if (['Memory Box', 'Art Gallery'].includes(project.type)) {
    if (!project.memoryItems && project.playlist?.songs?.length) {
      project.memoryItems = project.playlist.songs.map(songToMemoryItem);
      project.memoryCover = project.playlist.image || '';
      project.memorySourceName = project.playlist.name || '';
      project.updatedAt = new Date().toISOString();
      if (canEditProjectContent(project)) syncProject(project);
    }
    project.memoryItems ||= [];
    const isOwner = project.ownerEmail === getSession()?.username;
    document.querySelector('#delete-project-button').hidden = !isOwner;
    document.querySelector('#invite-collaborator-button').hidden = !isOwner;
    document.querySelector('#invite-finder').hidden = true;
    document.querySelector('#collaborator-search').value = '';
    document.querySelector('#collaborator-options').replaceChildren();
    document.querySelector('#collaborator-message').textContent = '';
    renderCollaborators(project);
    renderCollectionProject(project);
    return;
  }
  if (canEditProjectContent(project) && project.playlist?.songs?.length && project.playlist.metadataVersion !== 3 && project.sourceUrl) {
    try { await repairProject(project, true); } catch { /* Keep the saved playlist if metadata refresh fails. */ }
  }
  if (!project.playlist?.songs?.length) {
    document.querySelector('#project-title').textContent = project.name;
    document.querySelector('#project-playlist').textContent = project.sourceUrl ? 'Refreshing playlist…' : project.type;
    document.querySelector('#project-summary').textContent = project.sourceUrl ? 'Loading tracks and cover art from Spotify…' : 'This older creation needs its Spotify playlist connected again.';
    document.querySelector('#scene-list').replaceChildren();
    if (!project.sourceUrl) {
      showPlaylistReconnect(project);
      return;
    }
    try {
      if (!canEditProjectContent(project)) throw new Error('This playlist needs an editor to refresh it.');
      await repairProject(project);
    } catch {
      document.querySelector('#project-playlist').textContent = project.type;
      document.querySelector('#project-summary').textContent = 'This older creation needs its Spotify playlist connected again.';
      showPlaylistReconnect(project);
      return;
    }
  }
  document.querySelector('#project-title').textContent = project.name;
  const isOwner = project.ownerEmail === getSession()?.username;
  document.querySelector('#delete-project-button').hidden = !isOwner;
  document.querySelector('#invite-collaborator-button').hidden = !isOwner;
  document.querySelector('#invite-finder').hidden = true;
  document.querySelector('#collaborator-search').value = '';
  document.querySelector('#collaborator-options').replaceChildren();
  document.querySelector('#collaborator-message').textContent = '';
  renderCollaborators(project);
  document.querySelector('#project-source-kind').textContent = 'Spotify playlist';
  document.querySelector('#project-playlist').textContent = project.playlist?.name || project.type;
  const owner = document.querySelector('#project-owner');
  owner.textContent = project.playlist?.owner || 'Spotify user';
  owner.href = project.playlist?.ownerUrl || project.playlist?.url || '#';
  const ownerImage = document.querySelector('#project-owner-image');
  ownerImage.hidden = !project.playlist?.ownerImage;
  if (project.playlist?.ownerImage) ownerImage.src = project.playlist.ownerImage;
  const description = document.querySelector('#project-description');
  renderLinkedText(description, project.playlist?.description || 'No playlist description was provided.');
  const cover = document.querySelector('#project-cover');
  cover.hidden = !project.playlist?.image;
  if (project.playlist?.image) cover.src = project.playlist.image;
  const songs = project.playlist?.songs || [];
  document.querySelector('#project-summary').textContent = `${songs.length} track${songs.length === 1 ? '' : 's'} · ${canEditProjectContent(project) ? 'Your scenes save automatically' : 'Viewer access'}`;
  const sceneList = document.querySelector('#scene-list');
  sceneList.replaceChildren();

  songs.forEach((song, index) => {
    const card = document.createElement('article');
    card.className = 'scene-card';
    const heading = document.createElement('div');
    heading.className = 'scene-head';
    const number = document.createElement('span');
    number.className = 'scene-number';
    number.textContent = String(index + 1);
    const track = document.createElement('div');
    track.className = 'scene-song';
    const artwork = document.createElement('img');
    artwork.className = 'scene-song-art';
    artwork.alt = '';
    artwork.loading = 'lazy';
    artwork.hidden = !song.image;
    if (song.image) artwork.src = song.image;
    const songCopy = document.createElement('div');
    const title = document.createElement('strong');
    title.textContent = song.title;
    const artist = document.createElement('small');
    artist.textContent = song.artists;
    songCopy.append(title, artist);
    track.append(artwork, songCopy);
    const play = document.createElement('button');
    play.className = 'scene-play';
    play.type = 'button';
    play.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13l10-6.5z"/></svg>';
    play.setAttribute('aria-label', `Play ${song.title}`);
    play.addEventListener('click', () => {
      startSpotifyTrack(song.id);
    });
    heading.append(number, track, play);
    const label = document.createElement('label');
    const accessibleLabel = document.createElement('span');
    accessibleLabel.className = 'visually-hidden';
    accessibleLabel.textContent = `Describe the scene for ${song.title}`;
    const textarea = document.createElement('textarea');
    textarea.rows = 5;
    textarea.placeholder = 'Describe the scene for this song…';
    textarea.value = song.scene || '';
    textarea.readOnly = !canEditProjectContent(project);
    if (!textarea.readOnly) textarea.addEventListener('input', () => saveScene(project.id, index, textarea.value));
    label.append(accessibleLabel, textarea);
    card.append(heading, label);
    sceneList.append(card);
  });
}

async function refreshActiveProject() {
  if (!activeProject || !getSession()) return;
  const button = document.querySelector('#refresh-project-button');
  const status = document.querySelector('#refresh-project-status');
  button.disabled = true;
  status.textContent = 'Checking for changes…';
  try {
    const { data, error } = await supabaseClient
      .from('projects')
      .select('data, collaborator_emails')
      .eq('id', activeProject.id)
      .single();
    if (error) throw error;
    const refreshed = {
      ...data.data,
      collaborators: data.collaborator_emails || data.data.collaborators || []
    };
    const session = getSession();
    const projects = getProjects();
    projects[session.username] ||= [];
    const index = projects[session.username].findIndex(item => item.id === refreshed.id);
    if (index >= 0) projects[session.username][index] = refreshed;
    else projects[session.username].unshift(refreshed);
    localStorage.setItem('sfPrototypeProjects', JSON.stringify(projects));
    await openProject(refreshed);
    status.textContent = `Updated ${new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
  } catch (error) {
    status.textContent = error.message || 'Could not refresh changes.';
  } finally {
    button.disabled = false;
  }
}

async function hashPassword(password) {
  const bytes = new TextEncoder().encode(password);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

function updateProfileButton() {
  const session = getSession();
  profileButton.textContent = session ? session.displayName.split(/\s+/).map(part => part[0]).join('').slice(0, 2).toUpperCase() : 'Sign in';
  profileButton.setAttribute('aria-label', session ? `Signed in as ${session.displayName}` : 'Sign in');
  document.querySelector('#profile-menu-name').textContent = session ? `Signed in as ${session.displayName}` : '';
  if (!session) closeProfileMenu();
  renderProjects();
}

function closeProfileMenu() {
  profileMenu.hidden = true;
  profileButton.setAttribute('aria-expanded', 'false');
}

function showProfile() {
  const session = getSession();
  if (!session) {
    showAuth();
    return;
  }
  setOpenProjectUrl();
  const projects = getProjects()[session.username] || [];
  const itemCount = projects.reduce((total, project) => total
    + (project.type === 'Bookclub'
      ? (project.book?.chapters?.length || 0)
      : ['Memory Box', 'Art Gallery'].includes(project.type)
        ? (project.memoryItems?.length || project.playlist?.songs?.length || 0)
        : (project.playlist?.songs?.length || 0)), 0);
  const initials = session.displayName.split(/\s+/).map(part => part[0]).join('').slice(0, 2).toUpperCase();
  document.querySelector('#profile-avatar').textContent = initials;
  document.querySelector('#profile-display-name').textContent = session.displayName;
  document.querySelector('#profile-username').textContent = session.username;
  const stats = document.querySelector('#profile-stats');
  stats.replaceChildren();
  for (const [value, label] of [[projects.length, 'Creations'], [itemCount, 'Items & chapters']]) {
    const stat = document.createElement('div');
    stat.className = 'profile-stat';
    const number = document.createElement('strong');
    number.textContent = value;
    const caption = document.createElement('span');
    caption.textContent = label;
    stat.append(number, caption);
    stats.append(stat);
  }
  closeProfileMenu();
  createScreen.hidden = true;
  setupScreen.hidden = true;
  projectScreen.hidden = true;
  libraryScreen.hidden = true;
  profileScreen.hidden = false;
  setActiveNav('profile');
}

async function logout() {
  await supabaseClient.auth.signOut();
  currentSession = null;
  setOpenProjectUrl();
  pendingFormat = null;
  closeProfileMenu();
  setupScreen.hidden = true;
  projectScreen.hidden = true;
  profileScreen.hidden = true;
  libraryScreen.hidden = true;
  createScreen.hidden = false;
  document.querySelector('#track-player').hidden = true;
  spotifyEmbedController?.pause();
  updateProfileButton();
}

function setAuthMode(mode) {
  authMode = mode;
  const creating = mode === 'create';
  document.querySelector('#auth-name').hidden = !creating;
  document.querySelector('#display-name').required = creating;
  document.querySelector('#password').autocomplete = creating ? 'new-password' : 'current-password';
  document.querySelector('#auth-submit').textContent = creating ? 'Create account and continue' : 'Log in and continue';
  loginTab.classList.toggle('active', !creating);
  createTab.classList.toggle('active', creating);
  loginTab.setAttribute('aria-selected', String(!creating));
  createTab.setAttribute('aria-selected', String(creating));
  document.querySelector('#auth-error').textContent = '';
}

function showAuth() {
  setAuthMode('login');
  authForm.reset();
  authDialog.showModal();
  document.querySelector('#username').focus();
}

function openFormat(name) {
  setOpenProjectUrl();
  const format = formats[name];
  activeFormat = name;
  resolvedSource = null;
  memorySourceType = null;
  memoryPhotoFile = null;
  selectedFormat.textContent = name;
  selectedBadge.innerHTML = format.icon;
  selectedBadge.parentElement.className = `selected-heading ${format.className}`;
  selectedDescription.textContent = format.description;
  sourceLabel.textContent = format.sourceLabel;
  sourceUrl.placeholder = format.sourcePlaceholder;
  sourceHelp.textContent = format.sourceHelp;
  lookupSource.textContent = format.lookupLabel;
  sourceUrl.value = '';
  memoryFirstPhoto.value = '';
  memoryFirstPhotoName.value = '';
  document.querySelector('#memory-first-photo-file').textContent = 'No photo selected';
  formMessage.textContent = '';
  const sourceArt = document.querySelector('#source-art');
  sourceArt.style.backgroundImage = '';
  sourceArt.textContent = name === 'Bookclub' ? 'A' : name === 'Art Gallery' ? '▱' : '♫';
  metadataPreview.hidden = true;
  memorySourceChoices.hidden = name !== 'Memory Box';
  memorySourceChoices.querySelectorAll('button').forEach(button => button.classList.remove('active'));
  sourceLinkControls.hidden = name === 'Memory Box' || name === 'Art Gallery';
  memoryPhotoSetup.hidden = true;
  artSearchControls.hidden = name !== 'Art Gallery';
  artSearchQuery.value = '';
  artSearchResults.replaceChildren();
  nameStep.hidden = true;
  nameStep.querySelector('.primary-button').textContent = `Create ${name}`;
  createScreen.hidden = true;
  setupScreen.hidden = false;
  (name === 'Memory Box' ? memorySourceChoices.querySelector('button') : name === 'Art Gallery' ? artSearchQuery : sourceUrl).focus();
}

function chooseMemorySource(type) {
  memorySourceType = type;
  memoryPhotoFile = null;
  resolvedSource = null;
  sourceUrl.value = '';
  memoryFirstPhoto.value = '';
  metadataPreview.hidden = true;
  nameStep.hidden = true;
  formMessage.textContent = '';
  memorySourceChoices.querySelectorAll('button').forEach(button => button.classList.toggle('active', button.dataset.memorySource === type));
  const photo = type === 'photo';
  const art = type === 'art';
  sourceLinkControls.hidden = photo || art;
  memoryPhotoSetup.hidden = !photo;
  artSearchControls.hidden = !art;
  if (photo) {
    memoryFirstPhotoName.focus();
    return;
  }
  if (art) {
    artSearchQuery.value = '';
    artSearchResults.replaceChildren();
    artSearchQuery.focus();
    return;
  }
  const audiobook = type === 'audiobook';
  sourceLabel.textContent = audiobook ? 'Audible audiobook link' : type === 'song' ? 'Spotify song link' : 'Spotify playlist link';
  sourceUrl.placeholder = audiobook ? 'https://www.audible.com/pd/…' : type === 'song' ? 'https://open.spotify.com/track/…' : 'https://open.spotify.com/playlist/…';
  sourceHelp.textContent = audiobook ? 'Paste the Audible page for the audiobook.' : `Paste the Spotify ${type} link you want to add first.`;
  lookupSource.textContent = audiobook ? 'Find this audiobook' : type === 'song' ? 'Find this song' : 'Find this playlist';
  sourceUrl.focus();
}

memorySourceChoices.querySelectorAll('button').forEach(button => button.addEventListener('click', () => chooseMemorySource(button.dataset.memorySource)));

async function runSetupArtSearch() {
  const query = artSearchQuery.value.trim();
  if (!query) return artSearchQuery.focus();
  searchArtButton.disabled = true;
  searchArtButton.textContent = 'Searching…';
  formMessage.textContent = 'Searching The Met collection…';
  artSearchResults.replaceChildren();
  try {
    const objects = await searchMetArtwork(query, artSearchField.value);
    formMessage.textContent = objects.length ? 'Choose a work of art.' : '';
    renderArtResults(artSearchResults, objects, object => {
      const item = metObjectToCollectionItem(object);
      resolvedSource = { name: item.title, image: item.image, owner: item.artists, items: [item] };
      document.querySelector('#preview-label').textContent = 'The Metropolitan Museum of Art';
      document.querySelector('#preview-title').textContent = item.title;
      document.querySelector('#preview-byline').textContent = [item.artists, item.date].filter(Boolean).join(' · ');
      document.querySelector('#preview-meta').textContent = item.medium || item.department || 'Artwork selected';
      const art = document.querySelector('#source-art');
      art.textContent = '';
      art.style.backgroundImage = `url("${item.image}")`;
      art.style.backgroundSize = 'cover';
      art.style.backgroundPosition = 'center';
      metadataPreview.hidden = false;
      nameStep.hidden = false;
      nameStep.querySelector('.primary-button').textContent = `Create ${activeFormat}`;
      if (!document.querySelector('#creation-name').value.trim()) {
        document.querySelector('#creation-name').value = activeFormat === 'Art Gallery' ? `${item.title} Gallery` : '';
      }
      formMessage.textContent = '';
    });
  } catch (error) {
    formMessage.textContent = error.message || 'Artwork search failed. Try again.';
  } finally {
    searchArtButton.disabled = false;
    searchArtButton.textContent = 'Search';
  }
}

searchArtButton.addEventListener('click', runSetupArtSearch);
artSearchQuery.addEventListener('keydown', event => {
  if (event.key === 'Enter') { event.preventDefault(); runSetupArtSearch(); }
});

memoryFirstPhoto.addEventListener('change', () => {
  const file = memoryFirstPhoto.files?.[0];
  if (!file) return;
  if (!file.type.startsWith('image/')) {
    formMessage.textContent = 'Choose an image file.';
    memoryFirstPhoto.value = '';
    return;
  }
  memoryPhotoFile = file;
  const title = memoryFirstPhotoName.value.trim() || file.name.replace(/\.[^.]+$/, '');
  resolvedSource = { name: title, image: URL.createObjectURL(file), items: [] };
  document.querySelector('#memory-first-photo-file').textContent = file.name;
  document.querySelector('#preview-label').textContent = 'Photo';
  document.querySelector('#preview-title').textContent = title;
  document.querySelector('#preview-byline').textContent = 'Ready for your Memory Box';
  document.querySelector('#preview-meta').textContent = 'You can add more photos, art, audiobooks, songs, and playlists next.';
  const art = document.querySelector('#source-art');
  art.textContent = '';
  art.style.backgroundImage = `url("${resolvedSource.image}")`;
  art.style.backgroundSize = 'cover';
  art.style.backgroundPosition = 'center';
  metadataPreview.hidden = false;
  nameStep.hidden = false;
  nameStep.querySelector('.primary-button').textContent = 'Create Memory Box';
});

memoryFirstPhotoName.addEventListener('input', () => {
  if (!resolvedSource || memorySourceType !== 'photo') return;
  resolvedSource.name = memoryFirstPhotoName.value.trim() || memoryPhotoFile?.name.replace(/\.[^.]+$/, '') || 'Photo memory';
  document.querySelector('#preview-title').textContent = resolvedSource.name;
});

document.querySelectorAll('.creation-card').forEach(card => {
  card.addEventListener('click', () => {
    const name = card.dataset.format;
    if (!getSession()) {
      pendingFormat = name;
      showAuth();
      return;
    }
    openFormat(name);
  });
});

loginTab.addEventListener('click', () => setAuthMode('login'));
createTab.addEventListener('click', () => setAuthMode('create'));
document.querySelector('#dialog-close').addEventListener('click', () => authDialog.close());
profileButton.addEventListener('click', () => {
  if (!getSession()) {
    showAuth();
    return;
  }
  profileMenu.hidden = !profileMenu.hidden;
  profileButton.setAttribute('aria-expanded', String(!profileMenu.hidden));
});

document.querySelector('#view-profile-button').addEventListener('click', showProfile);
document.querySelector('#logout-button').addEventListener('click', logout);
document.querySelector('#profile-logout-button').addEventListener('click', logout);
document.querySelector('#nav-profile-button').addEventListener('click', showProfile);
document.querySelector('#profile-back-button').addEventListener('click', () => {
  showCreate();
});
document.querySelector('#nav-library-button').addEventListener('click', showLibrary);
document.querySelector('#nav-create-button').addEventListener('click', showCreate);
document.querySelector('#library-create-button').addEventListener('click', showCreate);

document.addEventListener('click', event => {
  if (!event.target.closest('.profile-control')) closeProfileMenu();
});

document.addEventListener('keydown', event => {
  if (event.key === 'Escape') closeProfileMenu();
});

authForm.addEventListener('submit', async event => {
  event.preventDefault();
  const username = document.querySelector('#username').value.trim().toLowerCase();
  const password = document.querySelector('#password').value;
  const error = document.querySelector('#auth-error');
  const submit = document.querySelector('#auth-submit');
  submit.disabled = true;
  error.textContent = '';
  try {
    const displayName = document.querySelector('#display-name').value.trim();
    const { data, error: authError } = authMode === 'create'
      ? await supabaseClient.auth.signUp({ email: username, password, options: { data: { display_name: displayName } } })
      : await supabaseClient.auth.signInWithPassword({ email: username, password });
    if (authError) throw authError;
    if (!data.user || !data.session) throw new Error('Check your email to confirm this account before signing in.');
    const users = getUsers();
    const resolvedName = data.user.user_metadata?.display_name || displayName || users[username]?.displayName || username.split('@')[0];
    users[username] = { displayName: resolvedName };
    localStorage.setItem('sfPrototypeUsers', JSON.stringify(users));
    currentSession = sessionFromUser(data.user);
    await Promise.all([loadRemoteProjects(currentSession), loadProfiles()]);
    updateProfileButton();
    authDialog.close();
    if (pendingFormat) {
      const destination = pendingFormat;
      pendingFormat = null;
      openFormat(destination);
    }
  } catch (requestError) {
    error.textContent = requestError.message;
  } finally {
    submit.disabled = false;
  }
});

lookupSource.addEventListener('click', async () => {
  let url;
  try {
    url = new URL(sourceUrl.value.trim());
  } catch {
    const expected = activeFormat === 'Bookclub' || memorySourceType === 'audiobook' ? 'Audible audiobook' : `Spotify ${memorySourceType || 'playlist'}`;
    formMessage.textContent = `Enter a valid ${expected} link.`;
    return;
  }

  const isBookclub = activeFormat === 'Bookclub';
  const usesAudible = isBookclub || (activeFormat === 'Memory Box' && memorySourceType === 'audiobook');
  const playlistId = usesAudible ? null : spotifyPlaylistId(url.href);
  const trackId = usesAudible ? null : spotifyTrackId(url.href);
  const bookAsin = usesAudible ? audibleAsin(url.href) : null;
  const validHost = usesAudible
    ? Boolean(bookAsin)
    : activeFormat === 'Memory Box'
      ? (memorySourceType === 'song' ? Boolean(trackId) : Boolean(playlistId))
      : Boolean(playlistId);
  if (!validHost) {
    formMessage.textContent = `That does not look like an ${usesAudible ? 'Audible' : 'Spotify'} link for this choice.`;
    return;
  }

  formMessage.textContent = '';
  if (!usesAudible) {
    const originalLabel = lookupSource.textContent;
    lookupSource.disabled = true;
    lookupSource.textContent = trackId ? 'Finding song…' : 'Finding playlist…';
    try {
      if (activeFormat === 'Memory Box' && memorySourceType === 'song') {
        const track = await importSpotifyTrack(url.href);
        resolvedSource = { name: track.title, image: track.image, owner: track.artists, items: [songToMemoryItem(track)] };
      } else {
        const playlist = await importPlaylist(url.href);
        resolvedSource = activeFormat === 'Memory Box'
          ? { ...playlist, items: playlist.songs.map(songToMemoryItem) }
          : playlist;
      }
      document.querySelector('#preview-label').textContent = memorySourceType === 'song' ? 'Spotify song' : 'Spotify playlist';
      document.querySelector('#preview-title').textContent = resolvedSource.name;
      document.querySelector('#preview-byline').textContent = resolvedSource.owner || 'Spotify';
      const count = resolvedSource.items?.length || resolvedSource.songs?.length || 0;
      document.querySelector('#preview-meta').textContent = activeFormat === 'Memory Box'
        ? `${count} song${count === 1 ? '' : 's'} ready for your Memory Box`
        : `${count} tracks ready for scenes`;
      const art = document.querySelector('#source-art');
      art.textContent = '';
      art.style.backgroundImage = resolvedSource.image ? `url("${resolvedSource.image}")` : '';
      art.style.backgroundSize = 'cover';
      art.style.backgroundPosition = 'center';
      metadataPreview.hidden = false;
      nameStep.hidden = false;
      nameStep.querySelector('.primary-button').textContent = `Create ${activeFormat}`;
      return;
    } catch {
      resolvedSource = null;
      formMessage.textContent = 'I could not read that Spotify music. Check that it is public and try again.';
      return;
    } finally {
      lookupSource.disabled = false;
      lookupSource.textContent = originalLabel;
    }
  }

  const originalLabel = lookupSource.textContent;
  lookupSource.disabled = true;
  lookupSource.textContent = 'Finding book…';
  try {
    const importedBook = await importAudibleBook(url.href);
    resolvedSource = activeFormat === 'Memory Box'
      ? { name: importedBook.name, image: importedBook.image, owner: (importedBook.authors || []).join(', '), items: [audibleBookToMemoryItem(importedBook)] }
      : importedBook;
    document.querySelector('#preview-label').textContent = 'Audible book';
    document.querySelector('#preview-title').textContent = resolvedSource.name;
    const authors = importedBook.authors?.join(', ') || 'Author unavailable';
    const narrators = importedBook.narrators?.join(', ') || 'Narrator unavailable';
    document.querySelector('#preview-byline').textContent = `${authors} · Narrated by ${narrators}`;
    const runtime = importedBook.runtimeMinutes ? `${Math.floor(importedBook.runtimeMinutes / 60)} hr ${importedBook.runtimeMinutes % 60} min` : 'Runtime unavailable';
    document.querySelector('#preview-meta').textContent = activeFormat === 'Memory Box'
      ? `${runtime} · Ready for your Memory Box`
      : `${importedBook.chapters.length} chapters · ${runtime}`;
    const art = document.querySelector('#source-art');
    art.textContent = '';
    art.style.backgroundImage = resolvedSource.image ? `url("${resolvedSource.image}")` : '';
    art.style.backgroundSize = 'cover';
    art.style.backgroundPosition = 'center';
    metadataPreview.hidden = false;
    nameStep.hidden = false;
    nameStep.querySelector('.primary-button').textContent = `Create ${activeFormat}`;
  } catch {
    resolvedSource = null;
    formMessage.textContent = 'I could not read that Audible book. Check the link and try again.';
  } finally {
    lookupSource.disabled = false;
    lookupSource.textContent = originalLabel;
  }
});

document.querySelector('#create-item').addEventListener('click', async () => {
  const session = getSession();
  if (!session) {
    pendingFormat = activeFormat;
    showAuth();
    return;
  }
  const nameInput = document.querySelector('#creation-name');
  const name = nameInput.value.trim();
  if (metadataPreview.hidden) {
    formMessage.textContent = activeFormat === 'Memory Box'
      ? 'Choose and add the first photo, artwork, audiobook, song, or playlist.'
      : activeFormat === 'Art Gallery'
        ? 'Search for and choose a work of art before creating this gallery.'
        : `Find the ${activeFormat === 'Bookclub' ? 'book' : 'playlist'} before creating this item.`;
    (activeFormat === 'Memory Box' ? memorySourceChoices.querySelector('button') : activeFormat === 'Art Gallery' ? artSearchQuery : sourceUrl).focus();
    return;
  }
  if (!name) {
    formMessage.textContent = 'Give this creation a name.';
    nameInput.focus();
    return;
  }
  const projects = getProjects();
  projects[session.username] ||= [];
  const projectId = crypto.randomUUID();
  const project = {
    id: projectId,
    type: activeFormat,
    name,
    ownerEmail: session.username,
    collaborators: [],
    collaboratorRoles: {},
    sourceUrl: memorySourceType === 'photo' || memorySourceType === 'art' || activeFormat === 'Art Gallery' ? '' : sourceUrl.value.trim(),
    createdAt: new Date().toISOString(),
    playlist: activeFormat === 'Score to Scene' && resolvedSource ? {
      ...resolvedSource,
      metadataVersion: 3,
      songs: (resolvedSource.songs || []).map((song, index) => ({ ...song, position: index + 1, scene: '' }))
    } : null,
    book: activeFormat === 'Bookclub' && resolvedSource ? {
      ...resolvedSource,
      metadataVersion: 1,
      chapters: (resolvedSource.chapters || []).map((chapter, index) => ({ ...chapter, position: index + 1, comments: [] }))
    } : null,
    memoryItems: ['Memory Box', 'Art Gallery'].includes(activeFormat) ? (resolvedSource?.items || []) : null,
    memoryCover: ['Memory Box', 'Art Gallery'].includes(activeFormat) ? (resolvedSource?.image || '') : '',
    memorySourceName: ['Memory Box', 'Art Gallery'].includes(activeFormat) ? (resolvedSource?.name || '') : ''
  };
  const createButton = document.querySelector('#create-item');
  createButton.disabled = true;
  if (activeFormat === 'Memory Box' && memorySourceType === 'photo') {
    try {
      if (!memoryPhotoFile) throw new Error('Choose a photo first.');
      formMessage.textContent = 'Uploading photo…';
      const safeName = memoryPhotoFile.name.replace(/[^A-Za-z0-9._-]+/g, '-');
      const path = `${projectId}/${crypto.randomUUID()}-${safeName}`;
      const { error } = await supabaseClient.storage.from('memory-box-images').upload(path, memoryPhotoFile, { contentType: memoryPhotoFile.type, upsert: false });
      if (error) throw error;
      const { data } = supabaseClient.storage.from('memory-box-images').getPublicUrl(path);
      const photoTitle = memoryFirstPhotoName.value.trim() || memoryPhotoFile.name.replace(/\.[^.]+$/, '');
      project.memoryItems = [{ id: crypto.randomUUID(), type: 'photo', title: photoTitle, image: data.publicUrl, storagePath: path, comments: [] }];
      project.memoryCover = data.publicUrl;
      project.memorySourceName = photoTitle;
    } catch (error) {
      formMessage.textContent = error.message || 'That photo could not be uploaded.';
      createButton.disabled = false;
      return;
    }
  }
  projects[session.username].unshift(project);
  syncProject(project);
  nameInput.value = '';
  setupScreen.hidden = true;
  if (['Score to Scene', 'Bookclub', 'Memory Box', 'Art Gallery'].includes(activeFormat)) openProject(project);
  else createScreen.hidden = false;
  renderProjects();
  createButton.disabled = false;
});

document.querySelector('#back-button').addEventListener('click', () => {
  setupScreen.hidden = true;
  createScreen.hidden = false;
});

document.querySelector('#library-button').addEventListener('click', () => {
  showLibrary();
});

document.querySelector('#close-player').addEventListener('click', () => {
  document.querySelector('#track-player').hidden = true;
  spotifyEmbedController?.pause();
});

document.querySelector('#delete-project-button').addEventListener('click', async () => {
  if (!activeProject) return;
  try {
    if (await deleteProject(activeProject)) {
      activeProject = null;
      showLibrary();
    }
  } catch (error) {
    window.alert(error.message || 'This creation could not be deleted.');
  }
});

document.querySelector('#edit-project-title').addEventListener('click', () => {
  if (!activeProject || !canEditProjectContent(activeProject)) return;
  const input = document.querySelector('#project-title-input');
  input.value = activeProject.name;
  document.querySelector('.project-title-row').hidden = true;
  document.querySelector('#project-title-editor').hidden = false;
  input.focus();
  input.select();
});
document.querySelector('#save-project-title').addEventListener('click', saveProjectTitle);
document.querySelector('#cancel-project-title').addEventListener('click', closeTitleEditor);
document.querySelector('#project-title-input').addEventListener('keydown', event => {
  if (event.key === 'Enter') saveProjectTitle();
  if (event.key === 'Escape') closeTitleEditor();
});

document.querySelector('#invite-collaborator-button').addEventListener('click', () => {
  const finder = document.querySelector('#invite-finder');
  finder.hidden = !finder.hidden;
  if (!finder.hidden) document.querySelector('#collaborator-search').focus();
});
document.querySelector('#collaborator-search').addEventListener('input', event => {
  document.querySelector('#collaborator-message').textContent = '';
  renderCollaboratorOptions(event.target.value);
});
document.querySelector('#refresh-project-button').addEventListener('click', refreshActiveProject);

async function initializeAccount() {
  const { data } = await supabaseClient.auth.getSession();
  currentSession = sessionFromUser(data.session?.user);
  if (currentSession) {
    try { await Promise.all([loadRemoteProjects(currentSession), loadProfiles()]); }
    catch (error) { console.warn('Saved creations could not be loaded.', error); }
  }
  updateProfileButton();
  const requestedProjectId = new URL(window.location.href).searchParams.get('project');
  if (currentSession && requestedProjectId) {
    const project = (getProjects()[currentSession.username] || []).find(item => item.id === requestedProjectId);
    if (project) await openProject(project);
    else setOpenProjectUrl();
  }
}

supabaseClient.auth.onAuthStateChange((_event, session) => {
  currentSession = sessionFromUser(session?.user);
});

initializeAccount();

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}
