const SUPABASE_URL = process.env.SUPABASE_URL || 'https://fhrnfnboenkhkzmieokr.supabase.co';
const SUPABASE_PUBLISHABLE_KEY =
  process.env.SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_UD7qKmNg4FHjC2UVCRY6MQ_y0VMcpJ3';
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const DEFAULT_REDIRECT_URL =
  process.env.SARIFPRO_AUTH_REDIRECT_URL || 'https://sarifpro.netlify.app/auth/reset-password/';
const { randomBytes } = require('crypto');

function json(statusCode, body) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    },
    body: JSON.stringify(body),
  };
}

function getBearerToken(headers) {
  const value = headers.authorization || headers.Authorization || '';
  const match = value.match(/^Bearer\s+(.+)$/i);
  return match ? match[1] : '';
}

function generateTemporaryPassword() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%';
  const bytes = randomBytes(18);
  return Array.from(bytes, byte => alphabet[byte % alphabet.length]).join('');
}

async function supabaseRest(path, options = {}) {
  if (!SERVICE_ROLE_KEY) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is not configured for this site.');
  }

  const response = await fetch(`${SUPABASE_URL}${path}`, {
    ...options,
    headers: {
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
      ...(options.headers || {}),
    },
  });

  const text = await response.text();
  const body = text ? JSON.parse(text) : null;
  if (!response.ok) {
    throw new Error(body?.message || body?.error || text || 'Supabase request failed.');
  }
  return body;
}

async function authAdmin(path, options = {}) {
  if (!SERVICE_ROLE_KEY) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is not configured for this site.');
  }

  const response = await fetch(`${SUPABASE_URL}${path}`, {
    ...options,
    headers: {
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });

  const text = await response.text();
  const body = text ? JSON.parse(text) : null;
  if (!response.ok) {
    throw new Error(body?.msg || body?.message || body?.error || text || 'Supabase Auth request failed.');
  }
  return body;
}

async function assertAdmin(accessToken) {
  if (!accessToken) {
    throw new Error('Missing admin session.');
  }

  const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/is_sarifpro_admin`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_PUBLISHABLE_KEY,
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: '{}',
  });

  if (!response.ok) {
    throw new Error('Could not verify admin access.');
  }

  const isAdmin = await response.json();
  if (isAdmin !== true) {
    throw new Error('Admin access is required.');
  }
}

async function sendRecoveryEmail(email, redirectTo) {
  const response = await fetch(
    `${SUPABASE_URL}/auth/v1/recover?redirect_to=${encodeURIComponent(redirectTo || DEFAULT_REDIRECT_URL)}`,
    {
      method: 'POST',
      headers: {
        apikey: SUPABASE_PUBLISHABLE_KEY,
        Authorization: `Bearer ${SUPABASE_PUBLISHABLE_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email }),
    },
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || 'Failed to send password reset email.');
  }
}

async function setTemporaryPassword(userId) {
  const temporaryPassword = generateTemporaryPassword();
  await authAdmin(`/auth/v1/admin/users/${encodeURIComponent(userId)}`, {
    method: 'PUT',
    body: JSON.stringify({
      password: temporaryPassword,
      email_confirm: true,
    }),
  });

  return temporaryPassword;
}

async function listAuthUsers() {
  const firstPage = await authAdmin('/auth/v1/admin/users?page=1&per_page=1000', { method: 'GET' });
  return Array.isArray(firstPage?.users) ? firstPage.users : [];
}

function latestByUser(rows, userId) {
  return rows
    .filter(row => row.user_id === userId)
    .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0))[0] || null;
}

function latestSubscription(subscriptions, userId, deviceId) {
  return subscriptions
    .filter(row => {
      if (row.user_id !== userId) {
        return false;
      }
      return !deviceId || row.device_id === deviceId || row.device_id === null;
    })
    .sort((a, b) => {
      const deviceRankA = deviceId && a.device_id === deviceId ? 0 : 1;
      const deviceRankB = deviceId && b.device_id === deviceId ? 0 : 1;
      if (deviceRankA !== deviceRankB) {
        return deviceRankA - deviceRankB;
      }
      return new Date(b.created_at || 0) - new Date(a.created_at || 0);
    })[0] || null;
}

function effectiveSubscriptionStatus(subscription) {
  if (!subscription) {
    return 'pending';
  }
  if (['active', 'trial'].includes(subscription.status) && new Date(subscription.expiry_date).getTime() < Date.now()) {
    return 'expired';
  }
  return subscription.status;
}

function matchesSearch(row, search) {
  if (!search) {
    return true;
  }
  const haystack = [
    row.email,
    row.full_name,
    row.phone,
    row.device_id,
    row.device_name,
  ].join(' ').toLowerCase();
  return haystack.includes(search);
}

async function listClients(searchValue = '', statusValue = 'all') {
  const search = String(searchValue || '').trim().toLowerCase();
  const status = String(statusValue || 'all').trim().toLowerCase();
  const users = await listAuthUsers();
  const clients = await supabaseRest('/rest/v1/clients?select=user_id,full_name,phone,status,device_id,created_at&order=created_at.desc', {
    method: 'GET',
  });
  const devices = await supabaseRest('/rest/v1/devices?select=user_id,device_id,device_name,is_active,created_at&order=created_at.desc', {
    method: 'GET',
  });
  const subscriptions = await supabaseRest('/rest/v1/subscriptions?select=id,user_id,device_id,plan_type,status,expiry_date,created_at&order=created_at.desc', {
    method: 'GET',
  });
  const userById = new Map(users.map(user => [user.id, user]));

  return clients
    .map(client => {
      const device = latestByUser(devices, client.user_id) || { device_id: client.device_id };
      const subscription = latestSubscription(subscriptions, client.user_id, device?.device_id);
      return {
        user_id: client.user_id,
        email: userById.get(client.user_id)?.email || '',
        full_name: client.full_name || '',
        phone: client.phone || '',
        client_status: client.status || 'pending',
        device_id: device?.device_id || client.device_id || '',
        device_name: device?.device_name || 'SarifPro Android device',
        device_active: Boolean(device?.is_active),
        subscription_id: subscription?.id || null,
        plan_type: subscription?.plan_type || null,
        subscription_status: effectiveSubscriptionStatus(subscription),
        expiry_date: subscription?.expiry_date || null,
        subscription_created_at: subscription?.created_at || null,
        client_created_at: client.created_at || null,
      };
    })
    .filter(row => matchesSearch(row, search))
    .filter(row => {
      if (status === 'all') {
        return true;
      }
      return row.client_status === status || row.subscription_status === status;
    });
}

async function updateClientProfile(body) {
  const userId = String(body.userId || '').trim();
  const clientStatus = String(body.clientStatus || '').trim().toLowerCase();
  if (!userId) {
    throw new Error('User id is required.');
  }
  if (!['active', 'blocked', 'pending'].includes(clientStatus)) {
    throw new Error('Unsupported client status.');
  }

  const rows = await supabaseRest(`/rest/v1/clients?user_id=eq.${encodeURIComponent(userId)}`, {
    method: 'PATCH',
    body: JSON.stringify({
      full_name: String(body.fullName || '').trim(),
      phone: String(body.phone || '').trim(),
      status: clientStatus,
    }),
  });

  if (clientStatus === 'blocked') {
    await supabaseRest(`/rest/v1/devices?user_id=eq.${encodeURIComponent(userId)}`, {
      method: 'PATCH',
      body: JSON.stringify({ is_active: false }),
    });
    await supabaseRest(
      `/rest/v1/subscriptions?user_id=eq.${encodeURIComponent(userId)}&status=in.(active,trial,pending)`,
      {
        method: 'PATCH',
        body: JSON.stringify({ status: 'blocked' }),
      },
    );
  }

  return rows?.[0] || { user_id: userId };
}

async function updateDeviceStatus(body) {
  const deviceId = String(body.deviceId || '').trim();
  if (!deviceId) {
    throw new Error('Device id is required.');
  }
  const rows = await supabaseRest(`/rest/v1/devices?device_id=eq.${encodeURIComponent(deviceId)}`, {
    method: 'PATCH',
    body: JSON.stringify({ is_active: Boolean(body.isActive) }),
  });
  return rows?.[0] || { device_id: deviceId, is_active: Boolean(body.isActive) };
}

function getPlanExpiry(planType) {
  const expiry = new Date();
  if (planType === 'trial') {
    expiry.setDate(expiry.getDate() + 3);
  } else if (planType === 'monthly') {
    expiry.setMonth(expiry.getMonth() + 1);
  } else if (planType === 'quarterly') {
    expiry.setMonth(expiry.getMonth() + 3);
  } else if (planType === 'yearly') {
    expiry.setFullYear(expiry.getFullYear() + 1);
  }
  return expiry.toISOString();
}

async function grantSubscription(body) {
  const userId = String(body.userId || '').trim();
  const deviceId = String(body.deviceId || '').trim();
  const planType = String(body.planType || '').trim().toLowerCase();
  const status = planType === 'trial' ? 'trial' : 'active';
  const now = new Date().toISOString();

  if (!userId || !deviceId) {
    throw new Error('User id and device id are required.');
  }
  if (!['trial', 'monthly', 'quarterly', 'yearly'].includes(planType)) {
    throw new Error('Unsupported plan type.');
  }

  await supabaseRest(`/rest/v1/clients?user_id=eq.${encodeURIComponent(userId)}`, {
    method: 'PATCH',
    body: JSON.stringify({ status: 'active', device_id: deviceId }),
  });
  await supabaseRest('/rest/v1/devices?on_conflict=device_id', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
    body: JSON.stringify({
      user_id: userId,
      device_id: deviceId,
      device_name: 'SarifPro Android device',
      is_active: true,
    }),
  });
  await supabaseRest(
    `/rest/v1/subscriptions?user_id=eq.${encodeURIComponent(userId)}&status=in.(active,trial,pending)`,
    {
      method: 'PATCH',
      body: JSON.stringify({ status: 'expired' }),
    },
  );

  const rows = await supabaseRest('/rest/v1/subscriptions', {
    method: 'POST',
    body: JSON.stringify({
      user_id: userId,
      device_id: deviceId,
      plan_type: planType,
      start_date: now,
      expiry_date: getPlanExpiry(planType),
      status,
      payment_reference: `ADMIN-${userId.replace(/-/g, '')}-${Math.floor(Date.now() / 1000)}`,
      created_at: now,
    }),
  });
  return rows?.[0] || null;
}

async function setSubscriptionStatus(body) {
  const subscriptionId = String(body.subscriptionId || '').trim();
  const status = String(body.status || '').trim().toLowerCase();
  if (!subscriptionId) {
    throw new Error('Subscription id is required.');
  }
  if (!['active', 'expired', 'blocked', 'trial', 'pending'].includes(status)) {
    throw new Error('Unsupported subscription status.');
  }
  const rows = await supabaseRest(`/rest/v1/subscriptions?id=eq.${encodeURIComponent(subscriptionId)}`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  });
  return rows?.[0] || { id: subscriptionId, status };
}

exports.handler = async event => {
  if (event.httpMethod !== 'POST') {
    return json(405, { error: 'Method not allowed.' });
  }

  try {
    const accessToken = getBearerToken(event.headers || {});
    await assertAdmin(accessToken);

    const body = JSON.parse(event.body || '{}');
    const action = String(body.action || '');
    const userId = String(body.userId || '').trim();
    const email = String(body.email || '').trim().toLowerCase();
    const redirectTo = String(body.redirectTo || DEFAULT_REDIRECT_URL);

    if (action === 'send_recovery_email') {
      if (!userId || !email) {
        return json(400, { error: 'User id and email are required.' });
      }
      await sendRecoveryEmail(email, redirectTo);
      return json(200, { message: `Password reset email sent to ${email}.` });
    }

    if (action === 'set_temporary_password') {
      if (!userId || !email) {
        return json(400, { error: 'User id and email are required.' });
      }
      const temporaryPassword = await setTemporaryPassword(userId);
      return json(200, { temporaryPassword });
    }

    if (action === 'list_clients') {
      return json(200, {
        users: await listClients(body.search, body.status),
      });
    }

    if (action === 'update_client_profile') {
      return json(200, {
        client: await updateClientProfile(body),
      });
    }

    if (action === 'update_device_status') {
      return json(200, {
        device: await updateDeviceStatus(body),
      });
    }

    if (action === 'grant_subscription') {
      return json(200, {
        subscription: await grantSubscription(body),
      });
    }

    if (action === 'set_subscription_status') {
      return json(200, {
        subscription: await setSubscriptionStatus(body),
      });
    }

    return json(400, { error: 'Unsupported password action.' });
  } catch (error) {
    return json(400, {
      error: error instanceof Error ? error.message : 'Password recovery failed.',
    });
  }
};
