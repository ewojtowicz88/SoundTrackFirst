const supabaseClient = supabase.createClient(
  'https://yjawkdddxcwwvipdjddy.supabase.co',
  'sb_publishable_fwdFBHZCOg8UZKcmpwR7xQ_GH6ELFtJ'
);

const form = document.querySelector('#registration-form');
const status = document.querySelector('#registration-status');
const submit = document.querySelector('#register-button');
const referralSource = document.querySelector('#referral-source');
const referralOtherWrap = document.querySelector('#referral-other-wrap');
const referralOther = document.querySelector('#referral-other');
const currentVersion = globalThis.SOUNDTRACKFIRST_VERSION || '0.13.1';

document.querySelector('#terms-version').textContent = currentVersion;

referralSource.addEventListener('change', () => {
  const isOther = referralSource.value === 'Other';
  referralOtherWrap.hidden = !isOther;
  referralOther.required = isOther;
  if (!isOther) referralOther.value = '';
});

form.addEventListener('submit', async event => {
  event.preventDefault();
  const displayName = document.querySelector('#display-name').value.trim();
  const email = document.querySelector('#email').value.trim().toLowerCase();
  const password = document.querySelector('#password').value;
  const confirmation = document.querySelector('#confirm-password').value;
  const referral = referralSource.value;
  const referralDetail = referralOther.value.trim();
  status.textContent = '';

  if (password !== confirmation) {
    status.textContent = 'The passwords do not match.';
    document.querySelector('#confirm-password').focus();
    return;
  }

  if (referral === 'Other' && referralDetail.length < 5) {
    status.textContent = 'Please tell us how you heard about us using at least 5 characters.';
    referralOther.focus();
    return;
  }

  submit.disabled = true;
  submit.textContent = 'Creating account…';
  try {
    const { data, error } = await supabaseClient.auth.signUp({
      email,
      password,
      options: {
        data: {
          display_name: displayName,
          referral_source: referral,
          referral_other: referral === 'Other' ? referralDetail : null,
          terms_version: `alpha-${currentVersion}`,
          terms_accepted_at: new Date().toISOString()
        }
      }
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
