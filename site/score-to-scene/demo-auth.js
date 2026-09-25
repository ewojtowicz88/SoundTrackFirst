(() => {
  const DEMO_USERS = new Map([
    ['user1', 'password1'],
    ['user2', 'password2'],
    ['user3', 'password3'],
    ['user4', 'password4'],
    ['user5', 'password5'],
  ]);
  const SESSION_KEY = 'score-to-scene-demo-user';

  function showApp(username) {
    document.querySelector('.demo-auth-overlay')?.remove();
    const top = document.querySelector('.top');
    if (!top || top.querySelector('.demo-user-badge')) return;

    const badge = document.createElement('span');
    badge.className = 'demo-user-badge';
    badge.innerHTML = `<span>Signed in as ${username}</span><button type="button">Sign out</button>`;
    badge.querySelector('button').addEventListener('click', () => {
      sessionStorage.removeItem(SESSION_KEY);
      location.reload();
    });
    top.insertBefore(badge, top.lastElementChild);
  }

  function showSignIn() {
    const overlay = document.createElement('section');
    overlay.className = 'demo-auth-overlay';
    overlay.setAttribute('aria-label', 'Demo sign in');
    overlay.innerHTML = `
      <form class="demo-auth-card">
        <p class="eyebrow">Soundtrack First demo</p>
        <h1>Sign in to your stories.</h1>
        <p>Use one of the numbered demo accounts to enter Score to Scene.</p>
        <div class="field">
          <label for="demo-username">Username</label>
          <input id="demo-username" type="text" autocomplete="username" required placeholder="user1">
        </div>
        <div class="field">
          <label for="demo-password">Password</label>
          <input id="demo-password" type="password" autocomplete="current-password" required placeholder="password1">
        </div>
        <div class="demo-auth-error" role="alert"></div>
        <button class="btn" type="submit">Sign in</button>
        <p class="demo-auth-note">Demo only. Accounts are not private. Projects remain available across devices through their collaboration links.</p>
      </form>`;
    document.body.appendChild(overlay);

    const form = overlay.querySelector('form');
    form.addEventListener('submit', event => {
      event.preventDefault();
      const username = overlay.querySelector('#demo-username').value.trim().toLowerCase();
      const password = overlay.querySelector('#demo-password').value;
      if (DEMO_USERS.get(username) !== password) {
        overlay.querySelector('.demo-auth-error').textContent = 'That demo username and password do not match.';
        return;
      }
      sessionStorage.setItem(SESSION_KEY, username);
      showApp(username);
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    const username = sessionStorage.getItem(SESSION_KEY);
    if (username && DEMO_USERS.has(username)) showApp(username);
    else showSignIn();
  });
})();
