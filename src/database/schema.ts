export const schemaStatements = [
  `CREATE TABLE IF NOT EXISTS transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL,
      transaction_type TEXT,
      amount REAL NOT NULL,
      phone TEXT NOT NULL,
      reference TEXT NOT NULL UNIQUE,
      status TEXT NOT NULL,
      sms_body TEXT NOT NULL,
      timestamp INTEGER NOT NULL,
      result_message TEXT,
      failure_reason TEXT,
      error_code TEXT,
      completed_at INTEGER,
      confirmation_source TEXT,
      confirmed_amount REAL,
      confirmation_reference TEXT,
      receiver_name TEXT,
      receiver_phone TEXT,
      bank_account TEXT,
      transaction_date TEXT,
      confirmation_note TEXT,
      confirmation_started_at INTEGER,
      confirmation_expires_at INTEGER,
      source TEXT,
      source_reference TEXT,
      dedupe_key TEXT,
      related_event_id TEXT,
      transfer_destination TEXT
    );`,
  `CREATE TABLE IF NOT EXISTS subscriptions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      plan_type TEXT NOT NULL,
      start_date TEXT NOT NULL,
      expiry_date TEXT NOT NULL,
      status TEXT NOT NULL,
      payment_reference TEXT NOT NULL,
      created_at TEXT NOT NULL
    );`,
  `CREATE TABLE IF NOT EXISTS payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      amount REAL NOT NULL,
      reference TEXT NOT NULL UNIQUE,
      status TEXT NOT NULL,
      timestamp INTEGER NOT NULL
    );`,
  `CREATE TABLE IF NOT EXISTS logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL,
      message TEXT NOT NULL,
      timestamp INTEGER NOT NULL
    );`,
  `CREATE TABLE IF NOT EXISTS balance_checks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      balance REAL NOT NULL,
      transfer_amount REAL NOT NULL,
      status TEXT NOT NULL,
      source TEXT NOT NULL,
      timestamp INTEGER NOT NULL
    );`,
  `CREATE TABLE IF NOT EXISTS subscription_cache (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      user_id TEXT,
      status TEXT NOT NULL,
      expiry_date TEXT NOT NULL,
      last_verified_at INTEGER NOT NULL,
      device_id TEXT NOT NULL,
      device_valid INTEGER NOT NULL DEFAULT 0,
      validation_source TEXT NOT NULL DEFAULT 'online'
    );`,
];
