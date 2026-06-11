const SUPABASE_URL = 'https://fhrnfnboenkhkzmieokr.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_UD7qKmNg4FHjC2UVCRY6MQ_y0VMcpJ3';
const AUTH_REDIRECT_URL = `${window.location.origin}/auth/reset-password/`;

const client = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
});

const state = {
  activeTab: 'requests',
  users: [],
  selectedUser: null,
  searchTimer: null,
};

const elements = {
  loginCard: document.getElementById('login-card'),
  panelCard: document.getElementById('panel-card'),
  loginForm: document.getElementById('login-form'),
  email: document.getElementById('email'),
  password: document.getElementById('password'),
  statusMessage: document.getElementById('status-message'),
  sessionLabel: document.getElementById('session-label'),
  requestsSection: document.getElementById('requests-section'),
  usersSection: document.getElementById('users-section'),
  requestsBody: document.getElementById('requests-body'),
  usersBody: document.getElementById('users-body'),
  statusFilter: document.getElementById('status-filter'),
  userStatusFilter: document.getElementById('user-status-filter'),
  userSearch: document.getElementById('user-search'),
  refreshButton: document.getElementById('refresh-button'),
  refreshUsersButton: document.getElementById('refresh-users-button'),
  logoutButton: document.getElementById('logout-button'),
  requestsTab: document.getElementById('requests-tab'),
  usersTab: document.getElementById('users-tab'),
  userDialog: document.getElementById('user-dialog'),
  dialogTitle: document.getElementById('dialog-title'),
  dialogSubtitle: document.getElementById('dialog-subtitle'),
  editFullName: document.getElementById('edit-full-name'),
  editPhone: document.getElementById('edit-phone'),
  editClientStatus: document.getElementById('edit-client-status'),
  editDeviceActive: document.getElementById('edit-device-active'),
  grantPlan: document.getElementById('grant-plan'),
  editSubscriptionStatus: document.getElementById('edit-subscription-status'),
  saveUserButton: document.getElementById('save-user-button'),
  grantSubscriptionButton: document.getElementById('grant-subscription-button'),
  setSubscriptionStatusButton: document.getElementById('set-subscription-status-button'),
  sendResetButton: document.getElementById('send-reset-button'),
  temporaryPasswordButton: document.getElementById('temporary-password-button'),
  passwordResult: document.getElementById('password-result'),
};

function setStatus(message, isError = false) {
  elements.statusMessage.textContent = message;
  elements.statusMessage.classList.toggle('error', isError);
}

function showPanel(email) {
  elements.loginCard.classList.add('hidden');
  elements.panelCard.classList.remove('hidden');
  elements.sessionLabel.textContent = `Signed in as ${email}`;
}

function showLogin() {
  elements.loginCard.classList.remove('hidden');
  elements.panelCard.classList.add('hidden');
  elements.requestsBody.innerHTML = '';
  elements.usersBody.innerHTML = '';
  elements.sessionLabel.textContent = '';
}

function formatDate(value) {
  if (!value) {
    return '-';
  }
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function badgeClass(value) {
  const normalized = String(value ?? '').toLowerCase();
  return `badge ${escapeHtml(normalized)}`;
}

function renderRequests(rows) {
  if (!rows.length) {
    elements.requestsBody.innerHTML = '<tr><td colspan="7">No requests found.</td></tr>';
    return;
  }

  elements.requestsBody.innerHTML = rows
    .map(row => {
      const disabled = row.status !== 'pending' ? 'disabled' : '';
      return `
        <tr>
          <td><strong>${escapeHtml(row.payment_reference)}</strong></td>
          <td class="mono">${escapeHtml(row.device_id)}</td>
          <td>${formatDate(row.created_at)}</td>
          <td>${row.expected_amount ?? '-'}</td>
          <td><span class="${badgeClass(row.status)}">${escapeHtml(row.status)}</span></td>
          <td>${escapeHtml(row.plan_type)}</td>
          <td>
            <div class="request-actions">
              <select data-plan="${escapeHtml(row.payment_reference)}" ${disabled}>
                <option value="monthly" ${row.plan_type === 'monthly' ? 'selected' : ''}>Monthly</option>
                <option value="quarterly" ${row.plan_type === 'quarterly' ? 'selected' : ''}>Quarterly</option>
                <option value="yearly" ${row.plan_type === 'yearly' ? 'selected' : ''}>Yearly</option>
              </select>
              <button class="small-action approve" data-approve="${escapeHtml(row.payment_reference)}" ${disabled}>Approve</button>
              <button class="small-action reject" data-reject="${escapeHtml(row.payment_reference)}" ${disabled}>Reject</button>
            </div>
          </td>
        </tr>
      `;
    })
    .join('');
}

function renderUsers(rows) {
  state.users = rows;
  if (!rows.length) {
    elements.usersBody.innerHTML = '<tr><td colspan="6">No users found.</td></tr>';
    return;
  }

  elements.usersBody.innerHTML = rows
    .map(row => `
      <tr>
        <td>
          <div class="user-cell">
            <span class="user-email">${escapeHtml(row.email)}</span>
            <span>${escapeHtml(row.full_name || 'No name')}</span>
            <span class="admin-muted">${escapeHtml(row.phone || '-')}</span>
          </div>
        </td>
        <td>
          <div class="user-cell">
            <span class="mono">${escapeHtml(row.device_id || '-')}</span>
            <span>${escapeHtml(row.device_name || 'Android device')}</span>
            <span class="${badgeClass(row.device_active ? 'active' : 'blocked')}">${row.device_active ? 'device active' : 'device disabled'}</span>
          </div>
        </td>
        <td><span class="${badgeClass(row.client_status)}">${escapeHtml(row.client_status)}</span></td>
        <td>
          <div class="user-cell">
            <span>${escapeHtml(row.plan_type || '-')}</span>
            <span class="${badgeClass(row.subscription_status || 'pending')}">${escapeHtml(row.subscription_status || 'none')}</span>
          </div>
        </td>
        <td>${formatDate(row.expiry_date)}</td>
        <td><button class="small-action approve" data-manage-user="${escapeHtml(row.user_id)}">Manage</button></td>
      </tr>
    `)
    .join('');
}

function switchTab(tab) {
  state.activeTab = tab;
  const showUsers = tab === 'users';
  elements.requestsSection.classList.toggle('hidden', showUsers);
  elements.usersSection.classList.toggle('hidden', !showUsers);
  elements.requestsTab.classList.toggle('active', !showUsers);
  elements.usersTab.classList.toggle('active', showUsers);
  if (showUsers && state.users.length === 0) {
    void refreshUsers();
  }
}

async function requireAdmin() {
  const { data, error } = await client.rpc('is_sarifpro_admin');
  if (error) {
    throw error;
  }
  if (data !== true) {
    throw new Error('This login is not on the SarifPro admin allowlist.');
  }
}

async function refreshRequests() {
  setStatus('Loading renewal requests...');
  const { data, error } = await client.rpc('admin_list_payment_requests', {
    p_status: elements.statusFilter.value,
  });
  if (error) {
    setStatus(error.message, true);
    return;
  }
  renderRequests(data ?? []);
  setStatus(`Loaded ${(data ?? []).length} request(s).`);
}

async function refreshUsers() {
  setStatus('Loading users...');
  const { data, error } = await client.rpc('admin_list_clients', {
    p_search: elements.userSearch.value.trim(),
    p_status: elements.userStatusFilter.value,
  });
  if (error) {
    setStatus(error.message, true);
    return;
  }
  renderUsers(data ?? []);
  setStatus(`Loaded ${(data ?? []).length} user(s).`);
}

async function callAdminFunction(action, payload = {}) {
  const { data } = await client.auth.getSession();
  const token = data.session?.access_token;
  if (!token) {
    throw new Error('Admin session expired. Please sign in again.');
  }

  const response = await fetch('/api/admin-user-auth', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      action,
      ...payload,
    }),
  });

  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(result.error || 'Admin request failed.');
  }
  return result;
}

async function approveRequest(reference) {
  const planSelect = document.querySelector(`select[data-plan="${CSS.escape(reference)}"]`);
  const plan = planSelect?.value || 'monthly';
  setStatus(`Approving ${reference}...`);
  const { error } = await client.rpc('admin_approve_payment_request', {
    p_payment_reference: reference,
    p_plan_type: plan,
  });
  if (error) {
    setStatus(error.message, true);
    return;
  }
  setStatus(`Approved ${reference}.`);
  await refreshRequests();
}

async function rejectRequest(reference) {
  const confirmed = window.confirm(`Reject renewal request ${reference}?`);
  if (!confirmed) {
    return;
  }
  setStatus(`Rejecting ${reference}...`);
  const { error } = await client.rpc('admin_reject_payment_request', {
    p_payment_reference: reference,
  });
  if (error) {
    setStatus(error.message, true);
    return;
  }
  setStatus(`Rejected ${reference}.`);
  await refreshRequests();
}

function openUserDialog(userId) {
  const user = state.users.find(row => row.user_id === userId);
  if (!user) {
    return;
  }
  state.selectedUser = user;
  elements.dialogTitle.textContent = user.email;
  elements.dialogSubtitle.textContent = `${user.user_id} | ${user.device_id || 'No device'}`;
  elements.editFullName.value = user.full_name || '';
  elements.editPhone.value = user.phone || '';
  elements.editClientStatus.value = user.client_status || 'active';
  elements.editDeviceActive.value = String(Boolean(user.device_active));
  elements.grantPlan.value = user.plan_type && user.plan_type !== 'trial' ? user.plan_type : 'monthly';
  elements.editSubscriptionStatus.value = user.subscription_status || 'pending';
  elements.passwordResult.textContent = '';
  elements.userDialog.showModal();
}

async function saveUserProfile() {
  const user = state.selectedUser;
  if (!user) {
    return;
  }

  setStatus(`Saving ${user.email}...`);
  const { error: profileError } = await client.rpc('admin_update_client_profile', {
    p_user_id: user.user_id,
    p_full_name: elements.editFullName.value.trim(),
    p_phone: elements.editPhone.value.trim(),
    p_client_status: elements.editClientStatus.value,
  });
  if (profileError) {
    setStatus(profileError.message, true);
    return;
  }

  if (user.device_id) {
    const { error: deviceError } = await client.rpc('admin_update_device_status', {
      p_device_id: user.device_id,
      p_is_active: elements.editDeviceActive.value === 'true',
    });
    if (deviceError) {
      setStatus(deviceError.message, true);
      return;
    }
  }

  setStatus(`Saved ${user.email}.`);
  await refreshUsers();
}

async function grantSubscription() {
  const user = state.selectedUser;
  if (!user?.device_id) {
    setStatus('This user has no device id to bind the subscription to.', true);
    return;
  }

  setStatus(`Granting ${elements.grantPlan.value} plan to ${user.email}...`);
  const { error } = await client.rpc('admin_grant_subscription', {
    p_user_id: user.user_id,
    p_device_id: user.device_id,
    p_plan_type: elements.grantPlan.value,
    p_status: elements.grantPlan.value === 'trial' ? 'trial' : 'active',
  });
  if (error) {
    setStatus(error.message, true);
    return;
  }
  setStatus(`Subscription updated for ${user.email}.`);
  await refreshUsers();
}

async function setSubscriptionStatus() {
  const user = state.selectedUser;
  if (!user?.subscription_id) {
    setStatus('This user has no subscription to update. Grant a plan first.', true);
    return;
  }

  setStatus(`Updating subscription status for ${user.email}...`);
  const { error } = await client.rpc('admin_set_subscription_status', {
    p_subscription_id: user.subscription_id,
    p_status: elements.editSubscriptionStatus.value,
  });
  if (error) {
    setStatus(error.message, true);
    return;
  }
  setStatus(`Subscription status updated for ${user.email}.`);
  await refreshUsers();
}

async function callPasswordFunction(action) {
  const user = state.selectedUser;
  if (!user) {
    return null;
  }
  return callAdminFunction(action, {
    userId: user.user_id,
    email: user.email,
    redirectTo: AUTH_REDIRECT_URL,
  });
}

async function sendResetEmail() {
  const user = state.selectedUser;
  if (!user) {
    return;
  }

  try {
    elements.passwordResult.textContent = 'Sending reset email...';
    const { error } = await client.auth.resetPasswordForEmail(user.email, {
      redirectTo: AUTH_REDIRECT_URL,
    });
    if (error) {
      throw error;
    }
    elements.passwordResult.textContent = `Password reset email sent to ${user.email}.`;
    setStatus(`Password reset email sent to ${user.email}.`);
  } catch (error) {
    elements.passwordResult.textContent = error.message;
    setStatus(error.message, true);
  }
}

async function setTemporaryPassword() {
  const user = state.selectedUser;
  if (!user) {
    return;
  }
  const confirmed = window.confirm(`Set a new temporary password for ${user.email}? The old password will stop working.`);
  if (!confirmed) {
    return;
  }

  try {
    elements.passwordResult.textContent = 'Creating temporary password...';
    const result = await callPasswordFunction('set_temporary_password');
    elements.passwordResult.textContent = `Temporary password: ${result.temporaryPassword}`;
    setStatus(`Temporary password created for ${user.email}.`);
  } catch (error) {
    elements.passwordResult.textContent = error.message;
    setStatus(error.message, true);
  }
}

elements.loginForm.addEventListener('submit', async event => {
  event.preventDefault();
  setStatus('Signing in...');
  const { data, error } = await client.auth.signInWithPassword({
    email: elements.email.value.trim(),
    password: elements.password.value,
  });
  if (error) {
    setStatus(error.message, true);
    return;
  }

  try {
    await requireAdmin();
    showPanel(data.user?.email || elements.email.value.trim());
    switchTab('requests');
    await refreshRequests();
  } catch (adminError) {
    await client.auth.signOut();
    showLogin();
    setStatus(adminError.message, true);
  }
});

elements.logoutButton.addEventListener('click', async () => {
  await client.auth.signOut();
  showLogin();
  setStatus('Signed out.');
});

elements.refreshButton.addEventListener('click', refreshRequests);
elements.statusFilter.addEventListener('change', refreshRequests);
elements.refreshUsersButton.addEventListener('click', refreshUsers);
elements.userStatusFilter.addEventListener('change', refreshUsers);
elements.userSearch.addEventListener('input', () => {
  window.clearTimeout(state.searchTimer);
  state.searchTimer = window.setTimeout(refreshUsers, 350);
});
elements.requestsTab.addEventListener('click', () => switchTab('requests'));
elements.usersTab.addEventListener('click', () => switchTab('users'));
elements.saveUserButton.addEventListener('click', saveUserProfile);
elements.grantSubscriptionButton.addEventListener('click', grantSubscription);
elements.setSubscriptionStatusButton.addEventListener('click', setSubscriptionStatus);
elements.sendResetButton.addEventListener('click', sendResetEmail);
elements.temporaryPasswordButton.addEventListener('click', setTemporaryPassword);

elements.requestsBody.addEventListener('click', event => {
  const approve = event.target.closest('[data-approve]');
  if (approve) {
    void approveRequest(approve.getAttribute('data-approve'));
    return;
  }
  const reject = event.target.closest('[data-reject]');
  if (reject) {
    void rejectRequest(reject.getAttribute('data-reject'));
  }
});

elements.usersBody.addEventListener('click', event => {
  const manage = event.target.closest('[data-manage-user]');
  if (manage) {
    openUserDialog(manage.getAttribute('data-manage-user'));
  }
});

async function bootstrap() {
  const { data } = await client.auth.getSession();
  if (!data.session) {
    showLogin();
    return;
  }

  try {
    await requireAdmin();
    showPanel(data.session.user.email);
    switchTab('requests');
    await refreshRequests();
  } catch (error) {
    await client.auth.signOut();
    showLogin();
    setStatus(error.message, true);
  }
}

void bootstrap();
