const supabaseClient = supabase.createClient(
  'https://yjawkdddxcwwvipdjddy.supabase.co',
  'sb_publishable_fwdFBHZCOg8UZKcmpwR7xQ_GH6ELFtJ'
);

const form = document.querySelector('#registration-form');
const status = document.querySelector('#registration-status');
const submit = document.querySelector('#register-button');

form.addEventListener('submit', async event => {
  event.preventDefault();
  const displayName = document.querySelector('#display-name').value.trim();
  const email = document.querySelector('#email').value.trim().toLowerCase();
  const password = document.querySelector('#password').value;
  const confirmation = document.querySelector('#confirm-password').value;
  status.textContent = '';

  if (password !== confirmation) {
    status.textContent = 'The passwords do not match.';
    document.querySelector('#confirm-password').focus();
    return;
  }

  submit.disabled = true;
  submit.textContent = 'Creating account…';
  try {
    const { data, error } = await supabaseClient.auth.signUp({
      email,
      password,
      options: { data: { display_name: displayName } }
    });
    if (error) throw error;
    if (!data.user) throw new Error('The account could not be created.');
    form.hidden = true;
    document.querySelector('#registration-success').hidden = false;
  } catch (error) {
    status.textContent = error.message || 'The account could not be created.';
    submit.disabled = false;
    submit.textContent = 'Create account';
  }
});
