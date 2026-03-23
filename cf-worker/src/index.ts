import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';

type Bindings = {
  DB: D1Database;
  CORS_ORIGINS: string;
  DAILY_READ_LIMIT: string;
  DAILY_WRITE_LIMIT: string;
  QUOTA_TIMEZONE: string;
};

type Variables = {
  userId: string;
};

type SessionRow = {
  user_id: string;
  access_expires_at: string;
};

type BottleRow = {
  id: string;
  content: string;
  author_id: string;
  status: 'floating' | 'picked';
  created_at: string;
  picked_by: string | null;
  picked_at: string | null;
};

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();

app.use('*', async (c, next) => {
  const allowOrigins = parseOrigins(c.env.CORS_ORIGINS);
  const origin = c.req.header('Origin') ?? '';

  if (origin && (allowOrigins.includes('*') || allowOrigins.includes(origin))) {
    c.header('Access-Control-Allow-Origin', origin);
    c.header('Vary', 'Origin');
  } else if (allowOrigins.includes('*')) {
    c.header('Access-Control-Allow-Origin', '*');
  }
  c.header('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  c.header('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  c.header('Access-Control-Allow-Credentials', 'true');

  if (c.req.method === 'OPTIONS') {
    return c.body(null, 204);
  }
  await next();
});

app.onError((err, c) => {
  if (err instanceof HTTPException) {
    return c.json(
      {
        message: err.message
      },
      err.status
    );
  }
  return c.json(
    {
      message: 'Internal server error'
    },
    500
  );
});

app.post('/api/auth/guest', async (c) => {
  const now = new Date();
  const userId = `guest_${crypto.randomUUID()}`;
  const accessToken = issueOpaqueToken();
  const refreshToken = issueOpaqueToken();
  const accessExpiresAt = new Date(now.getTime() + 2 * 60 * 60 * 1000).toISOString();
  const refreshExpiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString();

  await consumeQuota(c.env, 0, 2, '\u767b\u5f55');

  await c.env.DB.batch([
    c.env.DB.prepare('INSERT INTO users(id, created_at) VALUES (?, ?)').bind(userId, now.toISOString()),
    c.env.DB
      .prepare(
        `
        INSERT INTO sessions(access_token, refresh_token, user_id, access_expires_at, refresh_expires_at, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `
      )
      .bind(accessToken, refreshToken, userId, accessExpiresAt, refreshExpiresAt, now.toISOString())
  ]);

  return c.json({
    accessToken,
    refreshToken,
    expiresIn: 7200
  });
});

app.post('/api/auth/refresh', async (c) => {
  const body = await c.req.json<{ refreshToken?: string }>().catch(() => ({}));
  const refreshToken = body.refreshToken?.trim();
  if (!refreshToken) {
    throw new HTTPException(400, { message: 'refreshToken is required' });
  }

  const nowIso = new Date().toISOString();
  const row = await c.env.DB.prepare(
    `
    SELECT user_id, refresh_expires_at
    FROM sessions
    WHERE refresh_token = ?
    LIMIT 1
  `
  )
    .bind(refreshToken)
    .first<{ user_id: string; refresh_expires_at: string }>();

  if (!row || row.refresh_expires_at <= nowIso) {
    throw new HTTPException(401, { message: 'Refresh token invalid or expired' });
  }

  await consumeQuota(c.env, 0, 1, '\u5237\u65b0\u767b\u5f55\u72b6\u6001');

  const newAccessToken = issueOpaqueToken();
  const newRefreshToken = issueOpaqueToken();
  const accessExpiresAt = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
  const refreshExpiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

  await c.env.DB.prepare(
    `
    UPDATE sessions
    SET access_token = ?, refresh_token = ?, access_expires_at = ?, refresh_expires_at = ?
    WHERE refresh_token = ?
  `
  )
    .bind(newAccessToken, newRefreshToken, accessExpiresAt, refreshExpiresAt, refreshToken)
    .run();

  return c.json({
    accessToken: newAccessToken,
    refreshToken: newRefreshToken,
    expiresIn: 7200
  });
});

app.use('/api/bottles/*', async (c, next) => {
  const authHeader = c.req.header('Authorization') ?? '';
  if (!authHeader.startsWith('Bearer ')) {
    throw new HTTPException(401, { message: 'Missing bearer token' });
  }
  const accessToken = authHeader.slice(7).trim();
  if (!accessToken) {
    throw new HTTPException(401, { message: 'Missing bearer token' });
  }

  const nowIso = new Date().toISOString();
  const session = await c.env.DB.prepare(
    `
    SELECT user_id, access_expires_at
    FROM sessions
    WHERE access_token = ?
    LIMIT 1
  `
  )
    .bind(accessToken)
    .first<SessionRow>();

  if (!session || session.access_expires_at <= nowIso) {
    throw new HTTPException(401, { message: 'Access token invalid or expired' });
  }

  c.set('userId', session.user_id);
  await next();
});

app.post('/api/bottles', async (c) => {
  const body = await c.req.json<{ content?: string }>().catch(() => ({}));
  const content = body.content?.trim() ?? '';
  if (!content || content.length > 300) {
    throw new HTTPException(400, { message: 'content length must be 1~300' });
  }

  await consumeQuota(c.env, 0, 1, '\u6254\u74f6\u5b50');

  const row: BottleRow = {
    id: crypto.randomUUID(),
    content,
    author_id: c.get('userId'),
    status: 'floating',
    created_at: new Date().toISOString(),
    picked_by: null,
    picked_at: null
  };

  await c.env.DB.prepare(
    `
    INSERT INTO bottles(id, content, author_id, status, created_at, picked_by, picked_at)
    VALUES (?, ?, ?, ?, ?, NULL, NULL)
  `
  )
    .bind(row.id, row.content, row.author_id, row.status, row.created_at)
    .run();

  return c.json(row);
});

app.post('/api/bottles/pick', async (c) => {
  await consumeQuota(c.env, 20, 0, '\u6361\u74f6\u5b50');
  const userId = c.get('userId');

  for (let i = 0; i < 3; i += 1) {
    const candidate = await c.env.DB.prepare(
      `
      SELECT b.id, b.content, b.author_id, b.status, b.created_at, b.picked_by, b.picked_at
      FROM bottles b
      LEFT JOIN bottle_pick_history h
        ON h.user_id = ? AND h.bottle_id = b.id
      WHERE b.status = 'floating'
        AND b.author_id != ?
        AND h.bottle_id IS NULL
      ORDER BY RANDOM()
      LIMIT 1
    `
    )
      .bind(userId, userId)
      .first<BottleRow>();

    if (!candidate) {
      return c.json(null);
    }

    await consumeQuota(c.env, 0, 1, '\u6361\u74f6\u5b50');

    const pickedAt = new Date().toISOString();
    const updateResult = await c.env.DB.prepare(
      `
      UPDATE bottles
      SET status = 'picked', picked_by = ?, picked_at = ?
      WHERE id = ? AND status = 'floating'
    `
    )
      .bind(userId, pickedAt, candidate.id)
      .run();

    if ((updateResult.meta.changes ?? 0) === 0) {
      continue;
    }

    await c.env.DB.prepare(
      `
      INSERT OR IGNORE INTO bottle_pick_history(user_id, bottle_id, created_at)
      VALUES (?, ?, ?)
    `
    )
      .bind(userId, candidate.id, pickedAt)
      .run();

    return c.json({
      ...candidate,
      status: 'picked',
      picked_by: userId,
      picked_at: pickedAt
    });
  }

  return c.json(null);
});

app.post('/api/bottles/:id/pass', async (c) => {
  const bottleId = c.req.param('id');
  const userId = c.get('userId');

  await consumeQuota(c.env, 0, 1, '\u7565\u8fc7\u74f6\u5b50');

  const result = await c.env.DB.prepare(
    `
    UPDATE bottles
    SET status = 'floating', picked_by = NULL, picked_at = NULL
    WHERE id = ? AND picked_by = ?
  `
  )
    .bind(bottleId, userId)
    .run();

  if ((result.meta.changes ?? 0) === 0) {
    throw new HTTPException(404, { message: 'Bottle not found or not owned by you' });
  }

  const row = await c.env.DB.prepare(
    `
    SELECT id, content, author_id, status, created_at, picked_by, picked_at
    FROM bottles
    WHERE id = ?
    LIMIT 1
  `
  )
    .bind(bottleId)
    .first<BottleRow>();

  return c.json(row);
});

app.get('/api/bottles/mine', async (c) => {
  const userId = c.get('userId');
  const { offset, limit } = parsePagination(c.req.query('offset'), c.req.query('limit'));

  const [thrownRows, pickedRows, thrownCount, pickedCount] = await Promise.all([
    c.env.DB.prepare(
      `
      SELECT id, content, author_id, status, created_at, picked_by, picked_at
      FROM bottles
      WHERE author_id = ?
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `
    )
      .bind(userId, limit, offset)
      .all<BottleRow>(),
    c.env.DB.prepare(
      `
      SELECT id, content, author_id, status, created_at, picked_by, picked_at
      FROM bottles
      WHERE picked_by = ?
      ORDER BY picked_at DESC
      LIMIT ? OFFSET ?
    `
    )
      .bind(userId, limit, offset)
      .all<BottleRow>(),
    c.env.DB.prepare('SELECT COUNT(*) AS total FROM bottles WHERE author_id = ?').bind(userId).first<{ total: number }>(),
    c.env.DB.prepare('SELECT COUNT(*) AS total FROM bottles WHERE picked_by = ?').bind(userId).first<{ total: number }>()
  ]);

  const readCost = Math.max((thrownRows.results?.length ?? 0) + (pickedRows.results?.length ?? 0), 1);
  await consumeQuota(c.env, readCost, 0, '\u67e5\u770b\u6211\u7684\u74f6\u5b50');

  return c.json({
    thrown: thrownRows.results ?? [],
    picked: pickedRows.results ?? [],
    pagination: {
      offset,
      limit,
      thrownTotal: Number(thrownCount?.total ?? 0),
      pickedTotal: Number(pickedCount?.total ?? 0)
    }
  });
});

app.get('/api/bottles/pool', async (c) => {
  const { offset, limit } = parsePagination(c.req.query('offset'), c.req.query('limit'));
  const [rowsResult, totalResult] = await Promise.all([
    c.env.DB.prepare(
      `
      SELECT id, content, author_id, status, created_at, picked_by, picked_at
      FROM bottles
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `
    )
      .bind(limit, offset)
      .all<BottleRow>(),
    c.env.DB.prepare('SELECT COUNT(*) AS total FROM bottles').first<{ total: number }>()
  ]);

  const rows = rowsResult.results ?? [];
  await consumeQuota(c.env, Math.max(rows.length, 1), 0, '\u67e5\u770b\u74f6\u5b50\u6c60');

  return c.json({
    rows,
    pagination: {
      offset,
      limit,
      total: Number(totalResult?.total ?? 0)
    }
  });
});

app.get('/api/bottles/quota/usage', async (c) => {
  const usage = await getUsage(c.env);
  return c.json(usage);
});

export default app;

function parseOrigins(raw: string): string[] {
  return raw
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function issueOpaqueToken(): string {
  return `${crypto.randomUUID()}${crypto.randomUUID()}`.replaceAll('-', '');
}

function parsePagination(offsetRaw?: string, limitRaw?: string): { offset: number; limit: number } {
  const offset = Number.isFinite(Number(offsetRaw)) ? Math.max(0, Number(offsetRaw)) : 0;
  const limitNum = Number.isFinite(Number(limitRaw)) ? Number(limitRaw) : 10;
  const limit = Math.min(50, Math.max(1, limitNum));
  return { offset, limit };
}

function dayKeyByTimeZone(date: Date, timeZone: string): string {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  return formatter.format(date);
}

async function consumeQuota(
  env: Bindings,
  readDelta: number,
  writeDelta: number,
  actionLabel: string
): Promise<void> {
  const readLimit = Number(env.DAILY_READ_LIMIT || '5000000');
  const writeLimit = Number(env.DAILY_WRITE_LIMIT || '100000');
  const dayKey = dayKeyByTimeZone(new Date(), env.QUOTA_TIMEZONE || 'Asia/Shanghai');
  const nowIso = new Date().toISOString();

  await env.DB.prepare(
    `
    INSERT INTO quota_counters(day_key, read_used, write_used, updated_at)
    VALUES (?, 0, 0, ?)
    ON CONFLICT(day_key) DO NOTHING
  `
  )
    .bind(dayKey, nowIso)
    .run();

  const updated = await env.DB.prepare(
    `
    UPDATE quota_counters
    SET read_used = read_used + ?, write_used = write_used + ?, updated_at = ?
    WHERE day_key = ?
      AND read_used + ? <= ?
      AND write_used + ? <= ?
    RETURNING read_used, write_used
  `
  )
    .bind(readDelta, writeDelta, nowIso, dayKey, readDelta, readLimit, writeDelta, writeLimit)
    .first<{ read_used: number; write_used: number }>();

  if (!updated) {
    throw new HTTPException(429, {
      message: `\u4eca\u5929\u5df2\u7ecf\u4e0d\u80fd${actionLabel}\u4e86\uff0c\u660e\u5929\u518d\u6765\u5427`
    });
  }
}

async function getUsage(env: Bindings) {
  const dayKey = dayKeyByTimeZone(new Date(), env.QUOTA_TIMEZONE || 'Asia/Shanghai');
  const row = await env.DB.prepare(
    `
    SELECT read_used, write_used
    FROM quota_counters
    WHERE day_key = ?
    LIMIT 1
  `
  )
    .bind(dayKey)
    .first<{ read_used: number; write_used: number }>();

  return {
    day: dayKey,
    readUsed: Number(row?.read_used ?? 0),
    readLimit: Number(env.DAILY_READ_LIMIT || '5000000'),
    writeUsed: Number(row?.write_used ?? 0),
    writeLimit: Number(env.DAILY_WRITE_LIMIT || '100000')
  };
}
