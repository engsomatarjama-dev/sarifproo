const SUPABASE_URL = 'https://fhrnfnboenkhkzmieokr.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_UD7qKmNg4FHjC2UVCRY6MQ_y0VMcpJ3';

const client = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    autoRefreshToken: false,
    detectSessionInUrl: false,
    persistSession: false,
  },
});

const form = document.getElementById('reset-form');
const intro = document.getElementById('intro');
const passwordInput = document.getElementById('password');
const confirmPasswordInput = document.getElementById('confirm-password');
const submitButton = document.getElementById('submit-button');
const message = document.getElementById('message');

function showMessage(text, type) {
  message.textContent = text;
  message.className = `message ${type}`;
}

function getUrlValues() {
  const query = new URLSearchParams(window.location.search);
  const hash = new URLSearchParams(window.location.hash.slice(1));
  return { query, hash };
}

async function establishRecoverySession() {
  const { query, hash } = getUrlValues();
  const error = query.get('error_description') || hash.get('error_description') || query.get('error') || hash.get('error');
  if (error) {
    throw new Error('This password reset link is invalid or has expired. Please request a new reset link from the SarifPro app.');
  }

  const code = query.get('code');
  if (code) {
    const { error: exchangeError } = await client.auth.exchangeCodeForSession(code);
    if (exchangeError) {
      throw exchangeError;
    }
  } else {
    const accessToken = hash.get('access_token');
    const refreshToken = hash.get('refresh_token');
    if (!accessToken || !refreshToken) {
      throw new Error('This password reset link is missing recovery credentials. Please request a new reset link from the SarifPro app.');
    }

    const { error: sessionError } = await client.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    });
    if (sessionError) {
      throw sessionError;
    }
  }

  window.history.replaceState(null, document.title, window.location.pathname);
}

async function initialize() {
  try {
    await establishRecoverySession();
    form.classList.remove('hidden');
  } catch (error) {
    intro.textContent = 'Password reset cannot continue.';
    showMessage(error instanceof Error ? error.message : 'Password reset link failed.', 'error');
  }
}

form.addEventListener('submit', async event => {
  event.preventDefault();
  const password = passwordInput.value;
  const confirmPassword = confirmPasswordInput.value;

  if (password.length < 8) {
    showMessage('Password must be at least 8 characters.', 'error');
    return;
  }

  if (password !== confirmPassword) {
    showMessage('Passwords do not match.', 'error');
    return;
  }

  submitButton.disabled = true;
  try {
    const { error } = await client.auth.updateUser({ password });
    if (error) {
      throw error;
    }
    form.classList.add('hidden');
    intro.textContent = 'Password reset successful. You can now return to the SarifPro app and login with your new password.';
    showMessage('Password reset successful. You can now return to the SarifPro app and login with your new password.', 'success');
    passwordInput.value = '';
    confirmPasswordInput.value = '';
    await client.auth.signOut();
  } catch (error) {
    showMessage(error instanceof Error ? error.message : 'Password reset failed. Please request a new reset link.', 'error');
    submitButton.disabled = false;
  }
});

void initialize();
