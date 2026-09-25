(() => {
  const DEMO_USERS = new Map([
    ['user1', 'password1'],
    ['user2', 'password2'],
    ['user3', 'password3'],
    ['user4', 'password4'],
    ['user5', 'password5'],
  ]);
  const USER_KEY = 'score-to-scene-demo-user';
  const PASSWORD_KEY = 'score-to-scene-demo-password';

  function credentials() {
    const username = sessionStorage.getItem(USER_KEY);
    const password = sessionStorage.getItem(PASSWORD_KEY);
    return username && DEMO_USERS.get(username) === password ? { username, password } : null;
  }

  window.getScoreToSceneCredentials = credentials;

  function showApp(username) {
    document.querySelector('.demo-auth-overlay')?.remove();
    const top = document.querySelector('.top');
    if (top && !top.querySelector('.demo-user-badge')) {
      const badge = document.createElement('span');
      badge.className = 'demo-user-badge';
      badge.innerHTML = `<span>Signed in as ${username}</span><button type="button">Sign out</button>`;
      badge.querySelector('button').addEventListener('click', () => {
        sessionStorage.removeItem(USER_KEY);
        sessionStorage.removeItem(PASSWORD_KEY);
        location.assign('./');
      });
      top.insertBefore(badge, top.lastElementChild);
    }
    document.dispatchEvent(new CustomEvent('score-to-scene-auth-ready', { detail: { username } }));
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
        <p class="demo-auth-note">Demo only. These shared demonstration accounts are not private.</p>
      </form>`;
    document.body.appendChild(overlay);

    overlay.querySelector('form').addEventListener('submit', event => {
      event.preventDefault();
      const username = overlay.querySelector('#demo-username').value.trim().toLowerCase();
      const password = overlay.querySelector('#demo-password').value;
      if (DEMO_USERS.get(username) !== password) {
        overlay.querySelector('.demo-auth-error').textContent = 'That demo username and password do not match.';
        return;
      }
      sessionStorage.setItem(USER_KEY, username);
      sessionStorage.setItem(PASSWORD_KEY, password);
      showApp(username);
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    const current = credentials();
    if (current) showApp(current.username);
    else showSignIn();
  });
})();
