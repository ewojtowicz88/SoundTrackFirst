const formats = {
  Bookclub: {
    icon: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3.5 5.5c3.2-.6 5.7.1 8.5 2.2v11c-2.8-2.1-5.3-2.8-8.5-2.2v-11Zm17 0c-3.2-.6-5.7.1-8.5 2.2v11c2.8-2.1 5.3-2.8 8.5-2.2v-11Z"/></svg>',
    className: 'bookclub',
    description: 'Create a shared space for a book, its readers, and the conversation that grows around it.',
    sourceLabel: 'Audible book link',
    sourcePlaceholder: 'https://www.audible.com/pd/…',
    sourceHelp: 'Paste the Audible page for the book you want the club to read.',
    lookupLabel: 'Find this book'
  },
  'Memory Box': {
    icon: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 8.5 12 4l8 4.5-8 4.5-8-4.5Zm0 0V17l8 4 8-4V8.5M12 13v8"/></svg>',
    className: 'memory',
    description: 'Collect songs, photographs, notes, and memories with the people who were there.',
    sourceLabel: 'Spotify playlist link',
    sourcePlaceholder: 'https://open.spotify.com/playlist/…',
    sourceHelp: 'Paste the Spotify playlist that will hold this collection of memories.',
    lookupLabel: 'Find this playlist'
  },
  'Score to Scene': {
    icon: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3.5 5.5h17v13h-17zM3.5 9h17M7 5.5v3.5m10-3.5v3.5M9 15.7a1.7 1.7 0 1 1-1.7-1.7c.6 0 1.1.2 1.7.5v-3l5-1v4.2a1.7 1.7 0 1 1-1.7-1.7c.6 0 1.1.2 1.7.5v-3"/></svg>',
    className: 'score',
    description: 'Start with a Spotify playlist, then write the scene that belongs to every track.',
    sourceLabel: 'Spotify playlist link',
    sourcePlaceholder: 'https://open.spotify.com/playlist/…',
    sourceHelp: 'Paste the Spotify playlist that will become the score for your scenes.',
    lookupLabel: 'Find this playlist'
  }
};

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
let activeFormat = 'Score to Scene';
let pendingFormat = null;
let authMode = 'login';
let resolvedSource = null;
let activeProject = null;
let spotifyIframeApi = null;
let spotifyEmbedController = null;
let pendingTrackId = null;
let activeTrackUri = null;
let correctingSpotifyPlayback = false;

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

function getSession() {
  try { return JSON.parse(localStorage.getItem('sfPrototypeSession')); } catch { return null; }
}

function getUsers() {
  try { return JSON.parse(localStorage.getItem('sfPrototypeUsers')) || {}; } catch { return {}; }
}

function getProjects() {
  try { return JSON.parse(localStorage.getItem('sfPrototypeProjects')) || {}; } catch { return {}; }
}

async function demoApi(path, options = {}, passwordOverride = null) {
  const session = getSession();
  const headers = new Headers(options.headers || {});
  if (options.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  const password = passwordOverride ?? session?.password;
  if (password) headers.set('X-Demo-Password', password);
  const response = await fetch(`api/${path}`, { ...options, headers });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Unable to complete that request.');
  return data;
}

async function loadRemoteProjects(session) {
  const data = await demoApi(`projects?email=${encodeURIComponent(session.username)}`);
  const projects = getProjects();
  projects[session.username] = data.projects || [];
  localStorage.setItem('sfPrototypeProjects', JSON.stringify(projects));
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
  const session = getSession();
  if (session) demoApi('projects', { method: 'PUT', body: JSON.stringify({ ...project, requestingEmail: session.username }) }).catch(() => {});
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

function deleteProject(project) {
  const session = getSession();
  if (!session || project.ownerEmail !== session.username || !window.confirm(`Delete “${project.name}”? This cannot be undone.`)) return false;
  const projects = getProjects();
  for (const email of Object.keys(projects)) projects[email] = (projects[email] || []).filter(item => item.id !== project.id);
  localStorage.setItem('sfPrototypeProjects', JSON.stringify(projects));
  demoApi(`projects/${encodeURIComponent(project.id)}?email=${encodeURIComponent(session.username)}`, { method: 'DELETE' }).catch(() => {});
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
  if (project.playlist?.image) {
    art.style.backgroundImage = `url("${project.playlist.image}")`;
    art.style.backgroundSize = 'cover';
    art.style.backgroundPosition = 'center';
  }
  const copy = document.createElement('span');
  copy.className = 'recent-copy';
  const title = document.createElement('strong');
  title.textContent = project.name;
  const detail = document.createElement('small');
  detail.textContent = `${project.type} · ${project.playlist?.songs?.length || 0} tracks`;
  copy.append(title, detail);
  const actions = document.createElement('span');
  actions.className = 'recent-actions';
  const remove = document.createElement('button');
  remove.className = 'card-delete';
  remove.type = 'button';
  remove.textContent = '×';
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

function showCreate() {
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
  const missing = projects.filter(project => !project.playlist?.songs?.length && project.sourceUrl && ['Score to Scene', 'Memory Box'].includes(project.type));
  if (missing.length) {
    try {
      await Promise.all(missing.map(repairProject));
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

async function importPlaylist(sourceValue) {
  const playlistId = spotifyPlaylistId(sourceValue);
  if (!playlistId) throw new Error('Invalid Spotify playlist link');
  const response = await fetch(`api/playlist/${playlistId}`);
  if (!response.ok) throw new Error('Playlist lookup failed');
  const playlist = await response.json();
  if (!playlist.songs?.length) throw new Error('No public tracks were found in this playlist');
  return playlist;
}

async function repairProject(project, force = false) {
  if ((!force && project.playlist?.songs?.length) || !project.sourceUrl || !['Score to Scene', 'Memory Box'].includes(project.type)) return project;
  const playlist = await importPlaylist(project.sourceUrl);
  const existingSongs = project.playlist?.songs || [];
  const scenesByTrack = new Map(existingSongs.map(song => [song.id, song.scene || '']));
  project.playlist = {
    ...playlist,
    metadataVersion: 2,
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
  if (!project?.playlist?.songs?.[songIndex]) return;
  project.playlist.songs[songIndex].scene = scene;
  project.updatedAt = new Date().toISOString();
  syncProject(project);
}

function revokeCollaborator(project, email) {
  const session = getSession();
  if (!session || project.ownerEmail !== session.username) return;
  project.collaborators = (project.collaborators || []).filter(item => item !== email);
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
  for (const email of project.collaborators || []) {
    const chip = document.createElement('span');
    chip.className = 'collaborator-chip';
    chip.append(document.createTextNode(users[email]?.displayName || email));
    if (project.ownerEmail === session?.username) {
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.textContent = '×';
      remove.setAttribute('aria-label', `Revoke access for ${email}`);
      remove.addEventListener('click', () => revokeCollaborator(project, email));
      chip.append(remove);
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
  activeProject.updatedAt = new Date().toISOString();
  syncProject(activeProject);
  renderCollaborators(activeProject);
  document.querySelector('#collaborator-search').value = '';
  document.querySelector('#collaborator-options').replaceChildren();
  const registered = Boolean(getUsers()[normalized]);
  message.textContent = registered
    ? `${normalized} can now open this creation from their Library.`
    : `Invitation saved for ${normalized}. It will appear when they create an account with that email.`;
}

function renderCollaboratorOptions(query) {
  const options = document.querySelector('#collaborator-options');
  options.replaceChildren();
  const normalized = query.trim().toLowerCase();
  if (normalized.length < 2 || !activeProject) return;
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
  if (!activeProject) return;
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

async function openProject(project) {
  activeProject = project;
  project.ownerEmail ||= getSession()?.username || '';
  project.collaborators ||= [];
  closeTitleEditor();
  createScreen.hidden = true;
  setupScreen.hidden = true;
  projectScreen.hidden = false;
  profileScreen.hidden = true;
  libraryScreen.hidden = true;
  if (project.playlist?.songs?.length && project.playlist.metadataVersion !== 2 && project.sourceUrl) {
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
  document.querySelector('#project-summary').textContent = `${songs.length} track${songs.length === 1 ? '' : 's'} · Your scenes save automatically`;
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
    const title = document.createElement('strong');
    title.textContent = song.title;
    const artist = document.createElement('small');
    artist.textContent = song.artists;
    track.append(title, artist);
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
    textarea.addEventListener('input', () => saveScene(project.id, index, textarea.value));
    label.append(accessibleLabel, textarea);
    card.append(heading, label);
    sceneList.append(card);
  });
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
  const projects = getProjects()[session.username] || [];
  const sceneCount = projects.reduce((total, project) => total + (project.playlist?.songs?.length || 0), 0);
  const initials = session.displayName.split(/\s+/).map(part => part[0]).join('').slice(0, 2).toUpperCase();
  document.querySelector('#profile-avatar').textContent = initials;
  document.querySelector('#profile-display-name').textContent = session.displayName;
  document.querySelector('#profile-username').textContent = session.username;
  const stats = document.querySelector('#profile-stats');
  stats.replaceChildren();
  for (const [value, label] of [[projects.length, 'Creations'], [sceneCount, 'Playlist tracks']]) {
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

function logout() {
  localStorage.removeItem('sfPrototypeSession');
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
  const format = formats[name];
  activeFormat = name;
  resolvedSource = null;
  selectedFormat.textContent = name;
  selectedBadge.innerHTML = format.icon;
  selectedBadge.parentElement.className = `selected-heading ${format.className}`;
  selectedDescription.textContent = format.description;
  sourceLabel.textContent = format.sourceLabel;
  sourceUrl.placeholder = format.sourcePlaceholder;
  sourceHelp.textContent = format.sourceHelp;
  lookupSource.textContent = format.lookupLabel;
  sourceUrl.value = '';
  formMessage.textContent = '';
  const sourceArt = document.querySelector('#source-art');
  sourceArt.style.backgroundImage = '';
  sourceArt.textContent = name === 'Bookclub' ? 'A' : '♫';
  metadataPreview.hidden = true;
  nameStep.hidden = true;
  createScreen.hidden = true;
  setupScreen.hidden = false;
  sourceUrl.focus();
}

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
    const result = await demoApi(
      authMode === 'create' ? 'auth/register' : 'auth/login',
      { method: 'POST', body: JSON.stringify({ email: username, password, displayName }) },
      password
    );
    const users = getUsers();
    users[username] = { displayName: result.displayName };
    localStorage.setItem('sfPrototypeUsers', JSON.stringify(users));
    const session = { username: result.email, displayName: result.displayName, password };
    localStorage.setItem('sfPrototypeSession', JSON.stringify(session));
    await loadRemoteProjects(session);
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
    formMessage.textContent = `Enter a valid ${activeFormat === 'Bookclub' ? 'Audible book' : 'Spotify playlist'} link.`;
    return;
  }

  const isBookclub = activeFormat === 'Bookclub';
  const playlistId = isBookclub ? null : spotifyPlaylistId(url.href);
  const validHost = isBookclub ? /(^|\.)audible\.(com|ca|co\.uk|com\.au)$/.test(url.hostname) : Boolean(playlistId);
  if (!validHost) {
    formMessage.textContent = `That does not look like an ${isBookclub ? 'Audible' : 'Spotify'} link.`;
    return;
  }

  formMessage.textContent = '';
  if (!isBookclub) {
    const originalLabel = lookupSource.textContent;
    lookupSource.disabled = true;
    lookupSource.textContent = 'Finding playlist…';
    try {
      resolvedSource = await importPlaylist(url.href);
      document.querySelector('#preview-label').textContent = 'Spotify playlist';
      document.querySelector('#preview-title').textContent = resolvedSource.name;
      document.querySelector('#preview-byline').textContent = resolvedSource.owner || 'Spotify playlist';
      document.querySelector('#preview-meta').textContent = `${resolvedSource.songs?.length || 0} tracks ready for scenes`;
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
      formMessage.textContent = 'I could not read that playlist. Check that it is public and try again.';
      return;
    } finally {
      lookupSource.disabled = false;
      lookupSource.textContent = originalLabel;
    }
  }

  document.querySelector('#preview-label').textContent = isBookclub ? 'Audible book' : 'Spotify playlist';
  document.querySelector('#preview-title').textContent = isBookclub ? 'Audible details ready to import' : 'Playlist details ready to import';
  document.querySelector('#preview-byline').textContent = isBookclub ? 'Title · Author · Narrator' : 'Playlist · Creator';
  document.querySelector('#preview-meta').textContent = isBookclub ? 'Cover, runtime, release date, and description' : 'Cover, tracks, duration, and description';
  document.querySelector('#source-art').textContent = isBookclub ? 'A' : '♫';
  metadataPreview.hidden = false;
  nameStep.hidden = false;
  nameStep.querySelector('.primary-button').textContent = `Create ${activeFormat}`;
});

document.querySelector('#create-item').addEventListener('click', () => {
  const session = getSession();
  if (!session) {
    pendingFormat = activeFormat;
    showAuth();
    return;
  }
  const nameInput = document.querySelector('#creation-name');
  const name = nameInput.value.trim();
  if (metadataPreview.hidden) {
    formMessage.textContent = `Find the ${activeFormat === 'Bookclub' ? 'book' : 'playlist'} before creating this item.`;
    sourceUrl.focus();
    return;
  }
  if (!name) {
    formMessage.textContent = 'Give this creation a name.';
    nameInput.focus();
    return;
  }
  const projects = getProjects();
  projects[session.username] ||= [];
  projects[session.username].unshift({
    id: crypto.randomUUID(),
    type: activeFormat,
    name,
    ownerEmail: session.username,
    collaborators: [],
    sourceUrl: sourceUrl.value.trim(),
    createdAt: new Date().toISOString(),
    playlist: resolvedSource ? {
      ...resolvedSource,
      metadataVersion: 2,
      songs: (resolvedSource.songs || []).map((song, index) => ({ ...song, position: index + 1, scene: '' }))
    } : null
  });
  const project = projects[session.username][0];
  syncProject(project);
  nameInput.value = '';
  setupScreen.hidden = true;
  if (activeFormat === 'Score to Scene') openProject(project);
  else createScreen.hidden = false;
  renderProjects();
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

document.querySelector('#delete-project-button').addEventListener('click', () => {
  if (activeProject && deleteProject(activeProject)) {
    activeProject = null;
    showLibrary();
  }
});

document.querySelector('#edit-project-title').addEventListener('click', () => {
  if (!activeProject) return;
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

updateProfileButton();

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}
