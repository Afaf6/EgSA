/**
 * Fake REST backend. Maps "METHOD /path" to handlers that read/write the
 * in-memory db from ./data.js and answer with the same JSON envelope the real
 * server uses: { success, data, meta? }.
 */
import {
  db, oid, newId, getProject, allFrames, findFrame, historyTimes, makeRecord, makeReadings,
  statusOf, addAudit, floorStep, STEP_MS, HISTORY_HOURS,
} from './data';
import { mockBus } from './bus';

const ok = (data, meta) => ({ success: true, data, ...(meta ? { meta } : {}) });
export class MockHttpError extends Error {
  constructor(status, message, code, details) {
    super(message);
    this.statusCode = status;
    this.code = code || (status === 404 ? 'NOT_FOUND' : 'ERROR');
    this.details = details || null;
  }
}
const notFound = (what = 'Resource') => new MockHttpError(404, `${what} not found`, 'NOT_FOUND');

const MIN = 60 * 1000;
const HOUR = 60 * MIN;
const clone = (x) => JSON.parse(JSON.stringify(x));
const toMs = (v, fallback) => {
  if (!v) return fallback;
  const t = Date.parse(v);
  return Number.isNaN(t) ? fallback : t;
};
const num = (v, d) => (v === undefined || v === null || v === '' || Number.isNaN(Number(v)) ? d : Number(v));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const currentUser = () => {
  try {
    const raw = localStorage.getItem('egse_user');
    if (raw) return { ...db.users[0], ...JSON.parse(raw) };
  } catch { /* ignore */ }
  return db.users[0];
};

function paginate(list, query, defLimit = 25) {
  const page = Math.max(1, num(query?.page, 1));
  const limit = Math.max(1, num(query?.limit, defLimit));
  const total = list.length;
  const pages = Math.max(1, Math.ceil(total / limit));
  return {
    items: list.slice((page - 1) * limit, page * limit),
    meta: { page, limit, total, totalPages: pages, pages },
  };
}

// ───────────────────────── derived views ─────────────────────────
const projectSummary = (p) => ({ ...p, subsystems: p.subsystems });

function subsystemStatusCounts(proj, sub) {
  const t = floorStep(Date.now());
  const counts = { normal: 0, warning: 0, alarm: 0, invalid: 0, unmonitored: 0 };
  (sub.frames || []).forEach((f) => {
    const frame = { ...f, subsystemId: sub._id, subsystemName: sub.name, subsystemCode: sub.subsystemCode };
    makeReadings(frame, t).forEach((r) => {
      const k = r.limitStatus === 'critical' ? 'alarm' : r.limitStatus;
      counts[k] = (counts[k] || 0) + 1;
    });
  });
  return counts;
}

function buildOverview(proj) {
  const frames = allFrames(proj);
  const files = db.files[proj._id] || [];
  const totalReadings = files.reduce((a, f) => a + (f.stats?.totalParameters || 0), 0);
  const statusCounts = { normal: 0, warning: 0, alarm: 0, invalid: 0, unmonitored: 0, total: 0 };
  const subsystems = proj.subsystems.map((s) => {
    const sc = subsystemStatusCounts(proj, s);
    Object.keys(sc).forEach((k) => { statusCounts[k] += sc[k]; });
    const readingsCount = Object.values(sc).reduce((a, b) => a + b, 0);
    return {
      id: s._id, _id: s._id, name: s.name, subsystemCode: s.subsystemCode,
      framesCount: (s.frames || []).length,
      parametersCount: (s.frames || []).reduce((a, f) => a + (f.parameters || []).length, 0),
      readingsCount, statusCounts: sc,
    };
  });
  statusCounts.total = statusCounts.normal + statusCounts.warning + statusCounts.alarm + statusCounts.invalid + statusCounts.unmonitored;
  return {
    project: { ...proj, subsystems: undefined },
    summary: {
      subsystemsCount: proj.subsystems.length,
      framesCount: frames.length,
      parametersCount: frames.reduce((a, f) => a + f.parameters.length, 0),
      totalReadings,
      processedFilesCount: files.length,
      lastDataReceived: files.length ? files[files.length - 1].processedAt : null,
    },
    statusCounts,
    subsystems,
    recentFiles: [...files].reverse().slice(0, 6).map((f) => ({
      id: f._id, _id: f._id, fileName: f.fileName, subfolder: f.subfolder, status: f.status,
      recordCount: f.recordCount, processedAt: f.processedAt,
    })),
  };
}

// ───────────────────────── telemetry queries ─────────────────────────
function resolveFrames(proj, q) {
  let frames = allFrames(proj);
  if (q.subsystemId) frames = frames.filter((f) => f.subsystemId === q.subsystemId);
  if (q.frameId) frames = frames.filter((f) => f._id === q.frameId || f.name === q.frameId);
  return frames;
}

function queryRecords(q) {
  const proj = getProject(q.projectId);
  if (!proj) throw notFound('Project');
  const frames = resolveFrames(proj, q);
  let from = toMs(q.from, 0);
  let to = toMs(q.to, Date.now());
  if (q.sourceFile) {
    const f = (db.files[proj._id] || []).find((x) => x.fileName === q.sourceFile);
    if (f) { from = Math.max(from, f.rangeFrom); to = Math.min(to, f.rangeTo - 1); }
  }
  const times = historyTimes(from, to);
  const pairs = [];
  frames.forEach((f) => times.forEach((t) => pairs.push([f, t])));
  pairs.sort((a, b) => a[1] - b[1] || 0);
  if (q.sortOrder === 'desc') pairs.reverse();

  const page = Math.max(1, num(q.page, 1));
  const limit = Math.max(1, num(q.limit, 50));

  if (q.status && q.status !== 'all') {
    const want = String(q.status).toLowerCase();
    const matched = pairs
      .map(([f, t]) => makeRecord(proj, f, t))
      .filter((r) => r.readings.some((x) => x.limitStatus === want || (want === 'critical' && x.limitStatus === 'alarm')));
    const total = matched.length;
    return { data: matched.slice((page - 1) * limit, page * limit), meta: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)), pages: Math.max(1, Math.ceil(total / limit)) } };
  }
  const total = pairs.length;
  const slice = pairs.slice((page - 1) * limit, page * limit).map(([f, t]) => makeRecord(proj, f, t));
  return { data: slice, meta: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)), pages: Math.max(1, Math.ceil(total / limit)) } };
}

function queryHistory(q) {
  const proj = getProject(q.projectId);
  if (!proj) throw notFound('Project');
  let frames = allFrames(proj);
  if (q.frameId) frames = frames.filter((f) => f._id === q.frameId);
  const frame = frames.find((f) => f.parameters.some((p) => p.name.toLowerCase() === String(q.parameterName || '').toLowerCase()));
  if (!frame) return ok([], { total: 0 });
  const times = historyTimes(toMs(q.from, 0), toMs(q.to, Date.now()));
  const limit = Math.max(1, num(q.limit, 1000));
  const stride = Math.max(1, Math.ceil(times.length / limit));
  const want = q.status ? String(q.status).toLowerCase() : null;
  const out = [];
  for (let i = 0; i < times.length; i += stride) {
    const rec = makeRecord(proj, frame, times[i]);
    const r = rec.readings.find((x) => x.parameterName.toLowerCase() === String(q.parameterName).toLowerCase());
    if (!r) continue;
    if (want && want !== 'all' && r.limitStatus !== want) continue;
    out.push({ _id: rec._id, frameId: frame._id, frameTimestamp: rec.frameTimestamp, receivedAt: rec.receivedAt, readings: [r] });
  }
  return ok(out, { total: out.length });
}

function toCsv(rows, headers) {
  const esc = (v) => {
    const s = v === undefined || v === null ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [headers.join(','), ...rows.map((r) => headers.map((h) => esc(r[h])).join(','))].join('\n');
}

function exportRecordsCsv(q) {
  const proj = getProject(q.projectId);
  if (!proj) throw notFound('Project');
  const res = queryRecords({ ...q, page: 1, limit: 5000, sortOrder: q.sortOrder || 'asc' });
  const names = [];
  res.data.forEach((r) => r.readings.forEach((x) => { if (!names.includes(x.parameterName)) names.push(x.parameterName); }));
  const rows = res.data.map((r) => {
    const row = { timestamp: r.frameTimestamp, frame: r.frameName, subsystem: r.subsystemName, crc: r.crcStatus };
    r.readings.forEach((x) => { row[x.parameterName] = x.engineeringValue; });
    return row;
  });
  return new Blob([toCsv(rows, ['timestamp', 'frame', 'subsystem', 'crc', ...names])], { type: 'text/csv;charset=utf-8;' });
}

function fakeUploadStats(proj, name, size) {
  const frames = allFrames(proj);
  const per = 120;
  const total = per * Math.max(1, frames.length);
  const frameSummary = {};
  const subsystemSummary = {};
  frames.forEach((f) => { frameSummary[f.name] = per; subsystemSummary[f.subsystemName] = (subsystemSummary[f.subsystemName] || 0) + per; });
  const t = floorStep(Date.now());
  return {
    fileName: name, totalBytes: size, totalLines: total + 3, totalFrames: total, validFrames: total - 2, invalidFrames: 2,
    nonTelemetryLines: 0, storedRecords: total - 2, linkedRecords: 0, crcFailedStored: 1,
    totalParameters: frames.reduce((a, f) => a + f.parameters.length, 0) * per,
    subsystemSummary, frameSummary,
    statusSummary: { normal: total * 5, warning: 14, alarm: 3, invalid: 0 },
    decodedPreview: frames.slice(0, 3).map((f) => makeRecord(proj, f, t)),
    latestParametersBySubsystem: {},
    failedFrames: [],
  };
}

function registerUploadedFile(proj, name, size, stats) {
  const id = newId('1');
  const entry = {
    _id: id, id, project: proj._id, projectId: proj._id, fileName: name, originalName: name, status: 'completed',
    fileSize: size, recordCount: stats.storedRecords, subfolder: '', createdAt: new Date().toISOString(), processedAt: new Date().toISOString(),
    rangeFrom: Date.now() - HOUR, rangeTo: Date.now(),
    subsystems: proj.subsystems.map((s) => ({ id: s._id, _id: s._id, name: s.name, code: s.subsystemCode })),
    stats: { ...stats, frameSummary: stats.frameSummary },
  };
  (db.files[proj._id] ||= []).push(entry);
  addAudit('TELEMETRY_UPLOAD', 'Telemetry', proj._id, { fileName: name });
  return entry;
}

async function simulateProgress(config, ms = 900) {
  const cb = config?.onUploadProgress;
  if (!cb) { await sleep(ms / 2); return; }
  const steps = 6;
  for (let i = 1; i <= steps; i++) {
    await sleep(ms / steps);
    cb({ loaded: i, total: steps });
  }
}

// ───────────────────────── config helpers ─────────────────────────
const bumpVersion = (proj, summary = 'Configuration updated', source = 'manual') => {
  proj.version = (proj.version || 0) + 1;
  proj.updatedAt = new Date().toISOString();
  (db.versions[proj._id] ||= []).push({
    _id: newId('2'), version: proj.version, versionNumber: proj.version, createdAt: proj.updatedAt,
    createdBy: { name: currentUser().name, email: currentUser().email }, source, restoredFrom: null, summary,
  });
  return proj.version;
};

function ensureSim(p) {
  if (db.sims[p._id]) return;
  const lo = p.warnLow ?? p.alarmLow;
  const hi = p.warnHigh ?? p.alarmHigh;
  const nominal = lo != null && hi != null ? (Number(lo) + Number(hi)) / 2 : lo != null ? Number(lo) + 10 : hi != null ? Number(hi) - 10 : 50;
  const amp = lo != null && hi != null ? (Number(hi) - Number(lo)) / 6 : 5;
  db.sims[p._id] = { nominal, amp, period: 30, noise: amp / 10, dec: 2, key: `new:${p.name}` };
}

function normalizeParam(incoming, existing = {}) {
  const p = { ...existing, ...incoming };
  const lim = incoming.limits || {};
  const sr = incoming.statusRanges || existing.statusRanges || {};
  const pick = (...v) => v.find((x) => x !== undefined && x !== '' && x !== null) ?? null;
  p.alarmLow = pick(incoming.alarmLow, lim.alarmLow, existing.alarmLow);
  p.alarmHigh = pick(incoming.alarmHigh, lim.alarmHigh, existing.alarmHigh);
  p.warnLow = pick(incoming.warnLow, lim.warnLow, lim.warningLow, sr.normal?.min, existing.warnLow);
  p.warnHigh = pick(incoming.warnHigh, lim.warnHigh, lim.warningHigh, sr.normal?.max, existing.warnHigh);
  ['alarmLow', 'alarmHigh', 'warnLow', 'warnHigh'].forEach((k) => { if (p[k] !== null) p[k] = Number(p[k]); });
  p._id = existing._id || incoming._id || newId('d');
  p.id = p._id;
  p.equationHash = `eq-${p._id.slice(-4)}`;
  ensureSim(p);
  return p;
}

const findSub = (proj, sid) => proj.subsystems.find((s) => s._id === sid || s.id === sid || s.subsystemCode === sid);

// ───────────────────────── route table ─────────────────────────
const routes = [];
const route = (method, pattern, handler) => {
  const keys = [];
  const rx = new RegExp(`^${pattern.replace(/:([a-zA-Z]+)/g, (_, k) => { keys.push(k); return '([^/]+)'; })}$`);
  routes.push({ method, rx, keys, handler });
};

// ── auth ──
route('POST', '/auth/login', ({ body }) => {
  const user = { ...db.users[0], email: body?.email || db.users[0].email, name: body?.email ? (body.email.split('@')[0] || 'Demo Admin').replace(/^./, (c) => c.toUpperCase()) : 'Demo Admin' };
  addAudit('AUTH_LOGIN', 'User', user._id);
  return ok({ token: 'demo-access-token', refreshToken: 'demo-refresh-token', user });
});
route('POST', '/auth/register', ({ body }) => ok({ user: { ...db.users[0], ...body } }));
route('POST', '/auth/refresh-token', () => ok({ token: 'demo-access-token', refreshToken: 'demo-refresh-token', user: currentUser() }));
route('POST', '/auth/logout', () => ok({}));
route('POST', '/auth/forgot-password', () => ok({}));
route('POST', '/auth/reset-password/:token', () => ok({}));
route('PATCH', '/auth/change-password', () => ok({}));
route('GET', '/auth/me', () => ok({ user: currentUser() }));

// ── projects ──
route('GET', '/projects', ({ query }) => {
  const { items, meta } = paginate(db.projects.map(projectSummary), { page: query?.page, limit: query?.limit }, 100);
  return ok(clone(items), meta);
});
route('POST', '/projects', ({ body }) => {
  const id = newId('9');
  const proj = {
    _id: id, id, name: body?.name || 'New Project', satelliteName: body?.satelliteName || '', description: body?.description || '',
    version: 1, mainTlmProtocol: body?.mainTlmProtocol || body?.protocol || 'Generic', protocol: body?.protocol || body?.mainTlmProtocol || 'Generic',
    status: 'active', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), subsystems: [],
  };
  db.projects.unshift(proj);
  db.files[id] = [];
  db.versions[id] = [{ _id: newId('2'), version: 1, versionNumber: 1, createdAt: proj.createdAt, createdBy: { name: currentUser().name, email: currentUser().email }, source: 'manual', summary: 'Project created' }];
  db.ingestion[id] = { state: 'stopped', lastPollAt: null, lastError: null, nextAttemptAt: null, settings: { inputPath: '', outputPath: '', intervalSec: 5, maxFileSizeMB: 500 }, files: [] };
  addAudit('PROJECT_CREATE', 'Project', id, { name: proj.name });
  return ok(clone(proj));
});
route('GET', '/projects/:id', ({ params }) => {
  const p = getProject(params.id);
  if (!p) throw notFound('Project');
  return ok(clone(p));
});
route('GET', '/projects/:id/overview', ({ params }) => {
  const p = getProject(params.id);
  if (!p) throw notFound('Project');
  return ok(clone(buildOverview(p)));
});
route('PATCH', '/projects/:id', ({ params, body }) => {
  const p = getProject(params.id);
  if (!p) throw notFound('Project');
  Object.assign(p, body, { _id: p._id, id: p._id, subsystems: p.subsystems, updatedAt: new Date().toISOString() });
  addAudit('PROJECT_UPDATE', 'Project', p._id);
  return ok(clone(p));
});
route('DELETE', '/projects/:id', ({ params }) => {
  const i = db.projects.findIndex((p) => p._id === params.id);
  if (i < 0) throw notFound('Project');
  const [p] = db.projects.splice(i, 1);
  addAudit('PROJECT_DELETE', 'Project', p._id, { name: p.name });
  return ok({ deleted: true });
});

// ── subsystems ──
route('GET', '/projects/:pid/subsystems', ({ params }) => ok(clone(getProject(params.pid)?.subsystems || [])));
route('POST', '/projects/:pid/subsystems', ({ params, body }) => {
  const p = getProject(params.pid);
  if (!p) throw notFound('Project');
  const id = newId('f');
  const s = { _id: id, id, name: body?.name || 'New Subsystem', subsystemCode: body?.subsystemCode || body?.code || `S${p.subsystems.length + 1}`, description: body?.description || '', frames: [] };
  p.subsystems.push(s);
  bumpVersion(p, `Added subsystem ${s.name}`);
  return ok(clone(s));
});
route('GET', '/projects/:pid/subsystems/:sid', ({ params }) => {
  const s = findSub(getProject(params.pid) || { subsystems: [] }, params.sid);
  if (!s) throw notFound('Subsystem');
  return ok(clone(s));
});
route('PATCH', '/projects/:pid/subsystems/:sid', ({ params, body }) => {
  const s = findSub(getProject(params.pid) || { subsystems: [] }, params.sid);
  if (!s) throw notFound('Subsystem');
  Object.assign(s, body, { _id: s._id, id: s._id, frames: s.frames });
  return ok(clone(s));
});
route('DELETE', '/projects/:pid/subsystems/:sid', ({ params }) => {
  const p = getProject(params.pid);
  if (!p) throw notFound('Project');
  p.subsystems = p.subsystems.filter((s) => s._id !== params.sid && s.subsystemCode !== params.sid);
  bumpVersion(p, 'Removed subsystem');
  return ok({ deleted: true });
});

// ── frames ──
route('GET', '/projects/:pid/subsystems/:sid/frames', ({ params }) => ok(clone(findSub(getProject(params.pid) || { subsystems: [] }, params.sid)?.frames || [])));
route('POST', '/projects/:pid/subsystems/:sid/frames', ({ params, body }) => {
  const p = getProject(params.pid);
  const s = p && findSub(p, params.sid);
  if (!s) throw notFound('Subsystem');
  const id = newId('e');
  const f = {
    dataRepresentation: 'binary', bitNumbering: 'msb0', trailerLength: 2, hasCrc: false, protocol: 'Generic',
    ...body, _id: id, id, subsystemId: s._id, frameLength: body?.totalFrameLength || body?.frameLength || 0, parameters: [],
  };
  s.frames.push(f);
  bumpVersion(p, `Added frame ${f.name}`);
  return ok(clone(f));
});
const findFrameIn = (params) => {
  const p = getProject(params.pid);
  const s = p && findSub(p, params.sid);
  const f = s?.frames.find((x) => x._id === params.fid || x.id === params.fid);
  if (!f) throw notFound('Frame');
  return { p, s, f };
};
route('GET', '/projects/:pid/subsystems/:sid/frames/:fid', ({ params }) => ok(clone(findFrameIn(params).f)));
route('PATCH', '/projects/:pid/subsystems/:sid/frames/:fid', ({ params, body }) => {
  const { p, f } = findFrameIn(params);
  const { parameters, ...rest } = body || {};
  Object.assign(f, rest, { _id: f._id, id: f._id });
  if (rest.totalFrameLength) f.frameLength = rest.totalFrameLength;
  const v = bumpVersion(p, `Updated frame ${f.name}`);
  return ok({ ...clone(f), committedVersion: v });
});
route('DELETE', '/projects/:pid/subsystems/:sid/frames/:fid', ({ params }) => {
  const { p, s, f } = findFrameIn(params);
  s.frames = s.frames.filter((x) => x._id !== f._id);
  bumpVersion(p, `Removed frame ${f.name}`);
  return ok({ deleted: true });
});

// ── parameters ──
route('GET', '/projects/:pid/subsystems/:sid/frames/:fid/parameters', ({ params }) => ok(clone(findFrameIn(params).f.parameters)));
route('POST', '/projects/:pid/subsystems/:sid/frames/:fid/parameters', ({ params, body }) => {
  const { p, f } = findFrameIn(params);
  const param = normalizeParam({ displayOrder: f.parameters.length, enabled: true, ...body });
  f.parameters.push(param);
  bumpVersion(p, `Added parameter ${param.name}`);
  return ok(clone(param));
});
route('GET', '/projects/:pid/subsystems/:sid/frames/:fid/parameters/:xid', ({ params }) => {
  const par = findFrameIn(params).f.parameters.find((x) => x._id === params.xid);
  if (!par) throw notFound('Parameter');
  return ok(clone(par));
});
route('PATCH', '/projects/:pid/subsystems/:sid/frames/:fid/parameters/:xid', ({ params, body }) => {
  const { p, f } = findFrameIn(params);
  const i = f.parameters.findIndex((x) => x._id === params.xid);
  if (i < 0) throw notFound('Parameter');
  f.parameters[i] = normalizeParam(body || {}, f.parameters[i]);
  bumpVersion(p, `Updated parameter ${f.parameters[i].name}`);
  return ok(clone(f.parameters[i]));
});
route('DELETE', '/projects/:pid/subsystems/:sid/frames/:fid/parameters/:xid', ({ params }) => {
  const { p, f } = findFrameIn(params);
  f.parameters = f.parameters.filter((x) => x._id !== params.xid);
  bumpVersion(p, 'Removed parameter');
  return ok({ deleted: true });
});

// ── configuration ──
route('GET', '/configuration/crc/presets', () => ok(clone(db.crcPresets)));
route('POST', '/configuration/crc/presets/restore-defaults', () => ok(clone(db.crcPresets)));
route('POST', '/configuration/crc/presets', ({ body }) => {
  const preset = { _id: newId('c'), ...body };
  db.crcPresets.push(preset);
  return ok(clone(preset));
});
route('PUT', '/configuration/crc/presets/:id', ({ params, body }) => {
  const i = db.crcPresets.findIndex((x) => x._id === params.id);
  if (i < 0) throw notFound('Preset');
  db.crcPresets[i] = { ...db.crcPresets[i], ...body };
  return ok(clone(db.crcPresets[i]));
});
route('DELETE', '/configuration/crc/presets/:id', ({ params }) => {
  db.crcPresets = db.crcPresets.filter((x) => x._id !== params.id);
  return ok({ deleted: true });
});
route('POST', '/configuration/verify-crc', () => ok({ valid: true, match: true, computed: '0x29B1', expected: '0x29B1', message: 'CRC verified (demo)' }));
route('GET', '/config/protocols', () => ok({ protocols: ['Generic', 'CCSDS', 'ECSS PUS', 'AX.25', 'Custom'] }));
route('GET', '/configuration/template/excel', () =>
  new Blob(['Subsystem,Frame,Parameter,Unit,Offset,Length\nEPS,EPS_HK,BATT_VOLTAGE,V,8,2\n'], { type: 'text/csv' }));
route('POST', '/configuration/upload', async ({ body, config }) => {
  await simulateProgress(config, 700);
  const projectId = typeof body?.get === 'function' ? body.get('projectId') : body?.projectId;
  const p = getProject(projectId);
  if (p) bumpVersion(p, 'Configuration uploaded', 'upload');
  return { ...ok({ version: p?.version, summary: { subsystems: p?.subsystems.length || 0, frames: p ? allFrames(p).length : 0 } }), message: 'Configuration uploaded and saved successfully (demo).' };
});
route('POST', '/configuration/manual', ({ body }) => {
  const p = getProject(body?.projectId);
  if (!p) throw notFound('Project');
  (body?.configurations || []).forEach((c) => {
    let sub = p.subsystems.find((s) => s.subsystemCode === c.subsystem?.subsystemCode || s.name === c.subsystem?.name);
    if (!sub) {
      const sid = newId('f');
      sub = { _id: sid, id: sid, name: c.subsystem?.name || 'Subsystem', subsystemCode: c.subsystem?.subsystemCode || 'SUB', description: '', frames: [] };
      p.subsystems.push(sub);
    }
    let frame = sub.frames.find((f) => f.name === c.frame?.name);
    if (!frame) {
      const fid = newId('e');
      frame = { _id: fid, id: fid, subsystemId: sub._id, parameters: [], ...c.frame };
      sub.frames.push(frame);
    } else {
      Object.assign(frame, c.frame, { _id: frame._id, id: frame._id });
    }
    if (c.frame?.totalFrameLength) frame.frameLength = c.frame.totalFrameLength;
    frame.parameters = (c.parameters || []).map((inc, idx) => {
      const existing = frame.parameters.find((x) => x._id === inc._id || x._id === inc.id || x.name === inc.name) || {};
      return normalizeParam({ ...inc, displayOrder: inc.displayOrder ?? idx }, existing);
    });
  });
  const version = bumpVersion(p, 'Manual configuration saved');
  addAudit('CONFIG_UPDATE', 'Configuration', p._id);
  return ok({ version, committedVersion: version, warnings: [] });
});
route('GET', '/configuration/:pid', ({ params }) => {
  const p = getProject(params.pid);
  if (!p) throw notFound('Project');
  const { subsystems, ...project } = clone(p);
  return ok({ project, subsystems });
});
route('DELETE', '/configuration/:pid', ({ params }) => {
  const p = getProject(params.pid);
  if (p) { p.subsystems = []; bumpVersion(p, 'Configuration cleared'); }
  return ok({ deleted: true });
});
route('GET', '/configuration/:pid/export', ({ params, config }) => {
  const p = getProject(params.pid);
  if (!p) throw notFound('Project');
  const payload = JSON.stringify({ project: { name: p.name, version: p.version }, subsystems: p.subsystems }, null, 2);
  return config?.responseType === 'blob' ? new Blob([payload], { type: 'application/json' }) : ok(JSON.parse(payload));
});
const fakePreview = (p) => ({
  currentVersion: p?.version ?? 0,
  summary: { added: 0, changed: 0, unchanged: p ? allFrames(p).reduce((a, f) => a + f.parameters.length, 0) : 0, conflicts: 0 },
  tree: (p?.subsystems || []).map((s) => ({
    name: s.name, codeHex: s.subsystemCode, status: 'UNCHANGED',
    frames: s.frames.map((f) => ({ name: f.name, status: 'UNCHANGED', conflicts: [], parameters: f.parameters.map((x) => ({ name: x.name, status: 'UNCHANGED' })) })),
  })),
});
route('POST', '/configuration/:pid/preview', ({ params }) => ok(fakePreview(getProject(params.pid))));
route('POST', '/configuration/:pid/apply', ({ params }) => {
  const p = getProject(params.pid);
  const version = p ? bumpVersion(p, 'Configuration applied', 'upload') : 0;
  return ok({ version, newVersion: version, summary: { added: 0, updated: 0, skipped: 0 }, warnings: [] });
});
route('GET', '/configuration/:pid/versions', ({ params }) => ok(clone([...(db.versions[params.pid] || [])].reverse())));
route('GET', '/configuration/:pid/versions/:v', ({ params }) => {
  const p = getProject(params.pid);
  const { subsystems, ...project } = clone(p || {});
  return ok({ version: Number(params.v), snapshot: { project, subsystems }, configurations: subsystems });
});
route('POST', '/configuration/:pid/versions/:v/restore', ({ params }) => {
  const p = getProject(params.pid);
  if (p) bumpVersion(p, `Restored from v${params.v}`, 'restore');
  return ok({ version: p?.version, warnings: [] });
});

// ── telemetry ──
route('GET', '/telemetry/frames', ({ query }) => {
  const p = getProject(query?.projectId);
  return ok(allFrames(p || { subsystems: [] }).map((f) => ({ frameId: f._id, frameName: f.name, configured: true, count: Math.floor((HISTORY_HOURS * HOUR) / STEP_MS) })));
});
route('GET', '/telemetry/current', ({ query }) => {
  const p = getProject(query?.projectId);
  if (!p) throw notFound('Project');
  const t = floorStep(Date.now());
  const frames = resolveFrames(p, { frameId: query?.frameId }).map((f) => {
    const rec = makeRecord(p, f, t);
    return { ...rec, frame: f._id, _id: f._id };
  });
  return ok({ frames });
});
route('GET', '/telemetry/history/export-csv', ({ query }) => {
  const res = queryHistory({ ...query, limit: 5000 });
  const rows = res.data.map((r) => ({ timestamp: r.frameTimestamp, parameter: r.readings[0].parameterName, value: r.readings[0].engineeringValue, unit: r.readings[0].unit, status: r.readings[0].limitStatus }));
  return new Blob([toCsv(rows, ['timestamp', 'parameter', 'value', 'unit', 'status'])], { type: 'text/csv;charset=utf-8;' });
});
route('GET', '/telemetry/history', ({ query }) => queryHistory(query || {}));
route('GET', '/telemetry/analytics', ({ query }) => {
  const p = getProject(query?.projectId);
  return ok({ totalRecords: (db.files[p?._id] || []).reduce((a, f) => a + f.recordCount, 0), statusSummary: { normal: 97, warning: 2.4, alarm: 0.6 } });
});
route('GET', '/telemetry/stats/:pid', ({ params }) => {
  const files = db.files[params.pid] || [];
  return ok({ totalRecords: files.reduce((a, f) => a + f.recordCount, 0), totalFiles: files.length, lastReceivedAt: files.at(-1)?.processedAt || null });
});
route('GET', '/telemetry/export/csv', ({ query }) => exportRecordsCsv(query || {}));
route('GET', '/telemetry/export/excel', ({ query }) => exportRecordsCsv(query || {}));
route('GET', '/telemetry/export/stream', ({ query }) => exportRecordsCsv(query || {}));
route('GET', '/telemetry/readings', ({ query }) => {
  const r = queryRecords(query || {});
  return ok(r.data, r.meta);
});
route('GET', '/telemetry/files/:pid', ({ params, query }) => {
  let list = [...(db.files[params.pid] || [])].reverse();
  if (query?.status && query.status !== 'all') list = list.filter((f) => f.status === query.status);
  if (query?.search) list = list.filter((f) => f.fileName.toLowerCase().includes(String(query.search).toLowerCase()));
  const { items, meta } = paginate(list, query, 25);
  return ok(clone(items), meta);
});
route('DELETE', '/telemetry/files/:pid/empty', ({ params, query }) => {
  const files = db.files[params.pid] || [];
  const empties = files.filter((f) => !f.recordCount);
  if (String(query?.confirm) === 'true') db.files[params.pid] = files.filter((f) => f.recordCount);
  return ok({ count: empties.length, deletedFiles: empties.length });
});
route('DELETE', '/telemetry/files/:pid/:fid', ({ params }) => {
  db.files[params.pid] = (db.files[params.pid] || []).filter((f) => f._id !== params.fid);
  return ok({ deleted: true, deletedFiles: 1 });
});
route('GET', '/telemetry', ({ query }) => {
  const r = queryRecords(query || {});
  return ok(r.data, r.meta);
});
route('POST', '/telemetry/upload', async ({ body, config }) => {
  await simulateProgress(config, 1400);
  const file = typeof body?.get === 'function' ? body.get('file') : null;
  const projectId = typeof body?.get === 'function' ? body.get('projectId') : null;
  const p = getProject(projectId) || db.projects[0];
  const name = file?.name || 'upload.tlm';
  const stats = fakeUploadStats(p, name, file?.size || 120000);
  registerUploadedFile(p, name, file?.size || 120000, stats);
  return ok({ stats });
});
route('POST', '/telemetry/upload-multiple', async ({ body, config }) => {
  await simulateProgress(config, 1600);
  const files = typeof body?.getAll === 'function' ? body.getAll('files') : [];
  const p = getProject(body?.get?.('projectId')) || db.projects[0];
  const results = files.map((file) => {
    const stats = fakeUploadStats(p, file.name, file.size);
    registerUploadedFile(p, file.name, file.size, stats);
    return { fileName: file.name, originalName: file.name, status: 'processed', stats, storedRecords: stats.storedRecords };
  });
  return ok({ results, totalFiles: files.length, processed: files.length, duplicates: 0, rejected: 0, failed: 0 });
});
route('POST', '/telemetry/search-frame', ({ body }) => {
  const p = getProject(body?.projectId) || db.projects[0];
  const f = allFrames(p)[0];
  return ok({ found: true, matches: [{ frameName: f.name, frameId: f._id, offset: 0, length: f.frameLength }], frame: f });
});
route('POST', '/telemetry/decode', ({ body }) => {
  const p = getProject(body?.projectId) || db.projects[0];
  const f = findFrame(p, body?.frameId) || allFrames(p)[0];
  const rec = makeRecord(p, f, floorStep(Date.now()));
  return ok({ ...rec, frameName: f.name, crcStatus: 'OK', readings: rec.readings });
});
route('POST', '/telemetry/reprocess', () => ok({ reprocessed: true, storedRecords: 0 }));
route('POST', '/telemetry/recompute', ({ body }) => {
  const id = newId('3');
  const job = { id, _id: id, jobId: id, projectId: body?.projectId, status: 'running', progress: 0, createdAt: new Date().toISOString(), processed: 0, total: 1000 };
  db.jobs.push(job);
  return ok(clone(job));
});
route('GET', '/telemetry/recompute/jobs', ({ query }) => ok(clone(db.jobs.filter((j) => !query?.projectId || j.projectId === query.projectId))));
route('GET', '/telemetry/recompute/status/:jid', ({ params }) => {
  const job = db.jobs.find((j) => j.id === params.jid);
  if (!job) throw notFound('Job');
  job.progress = Math.min(100, job.progress + 35);
  job.processed = Math.round((job.progress / 100) * job.total);
  if (job.progress >= 100) job.status = 'completed';
  return ok(clone(job));
});
route('POST', '/telemetry/recompute/resume/:jid', ({ params }) => ok(clone(db.jobs.find((j) => j.id === params.jid) || {})));

// ── ingestion (shared folder watcher) ──
let watcherTimer = null;
const ing = (pid) => (db.ingestion[pid] ||= { state: 'stopped', settings: { inputPath: '', outputPath: '', intervalSec: 5, maxFileSizeMB: 500 }, files: [] });
function startFakeWatcher(pid) {
  clearInterval(watcherTimer);
  let n = 0;
  const proj = getProject(pid);
  watcherTimer = setInterval(() => {
    if (ing(pid).state !== 'running') return;
    n += 1;
    const fileName = `${(proj?.name || 'PROJECT').replace(/[^A-Za-z0-9]/g, '').toUpperCase()}_live_${String(n).padStart(3, '0')}.tlm`;
    ing(pid).lastPollAt = new Date().toISOString();
    mockBus.emit('ingestion:state', { state: 'running', lastPollAt: ing(pid).lastPollAt, lastError: null });
    const base = { fileName, subfolderName: 'incoming', outputStatus: 'pending', updatedAt: new Date().toISOString() };
    mockBus.emit('ingestion:file', { ...base, status: 'processing', counters: { totalFrames: 0, storedRecords: 0 } });
    setTimeout(() => {
      const done = { ...base, status: 'completed', outputStatus: 'written', updatedAt: new Date().toISOString(), counters: { totalFrames: 240, validFrames: 239, invalidFrames: 1, storedRecords: 239 } };
      ing(pid).files = [done, ...ing(pid).files.filter((f) => f.fileName !== fileName)];
      mockBus.emit('ingestion:file', done);
    }, 1800);
  }, 6000);
}
route('GET', '/ingestion/:pid/status', ({ params }) => { const s = ing(params.pid); return ok({ state: s.state, lastPollAt: s.lastPollAt || null, lastError: null, nextAttemptAt: null }); });
route('PUT', '/ingestion/:pid/settings', ({ params, body }) => { Object.assign(ing(params.pid).settings, body); return ok(clone(ing(params.pid).settings)); });
route('POST', '/ingestion/:pid/test', ({ body }) => ok({
  valid: true,
  checks: [
    { name: 'input_exists', passed: true, message: 'Input folder exists' },
    { name: 'input_readable', passed: true, message: 'Input folder is readable' },
    { name: 'output_writable', passed: true, message: 'Output folder is writable' },
  ],
  input: { path: body?.inputPath, exists: true, readable: true, fileCount: 12 },
  output: { path: body?.outputPath, exists: true, writable: true },
}));
route('POST', '/ingestion/:pid/start', ({ params }) => { ing(params.pid).state = 'running'; startFakeWatcher(params.pid); mockBus.emit('ingestion:state', { state: 'running' }); return ok({ state: 'running' }); });
route('POST', '/ingestion/:pid/stop', ({ params }) => { ing(params.pid).state = 'stopped'; clearInterval(watcherTimer); mockBus.emit('ingestion:state', { state: 'stopped' }); return ok({ state: 'stopped' }); });
route('GET', '/ingestion/:pid/files', ({ params }) => ok(clone(ing(params.pid).files)));

// ── users ──
route('GET', '/users/developers', () => ok(clone(db.developers)));
route('POST', '/users/developers', ({ body }) => { const d = { _id: newId('b'), id: newId('b'), isActive: true, createdAt: new Date().toISOString(), ...body }; db.developers.push(d); return ok(clone(d)); });
route('PATCH', '/users/developers/:id/status', ({ params, body }) => { const d = db.developers.find((x) => x._id === params.id); if (d) d.isActive = body?.isActive; return ok(clone(d || {})); });
route('POST', '/users/import', async ({ config }) => { await simulateProgress(config, 800); return ok({ total: 3, created: 3, skipped: 0, failed: 0, errors: [] }); });
route('GET', '/users', ({ query }) => {
  const { items, meta } = paginate(db.users, query, 50);
  return ok(clone(items), meta);
});
route('POST', '/users', ({ body }) => {
  const id = newId('a');
  const u = { _id: id, id, role: 'tester', permissions: [], projectAccess: [], isActive: true, createdAt: new Date().toISOString(), ...body };
  delete u.password;
  db.users.push(u);
  addAudit('USER_CREATE', 'User', id);
  return ok(clone(u));
});
route('GET', '/users/:id', ({ params }) => { const u = db.users.find((x) => x._id === params.id); if (!u) throw notFound('User'); return ok(clone(u)); });
route('PATCH', '/users/:id', ({ params, body }) => { const u = db.users.find((x) => x._id === params.id); if (!u) throw notFound('User'); Object.assign(u, body, { _id: u._id, id: u._id }); delete u.password; return ok(clone(u)); });
route('DELETE', '/users/:id', ({ params }) => { db.users = db.users.filter((x) => x._id !== params.id); return ok({ deleted: true }); });

// ── audit ──
route('DELETE', '/audit-logs/purge', ({ query }) => {
  const cutoff = Date.now() - num(query?.days, 30) * 24 * HOUR;
  const before = db.audit.length;
  db.audit = db.audit.filter((l) => new Date(l.createdAt).getTime() >= cutoff);
  return ok({ deleted: before - db.audit.length });
});
route('GET', '/audit-logs/:id', ({ params }) => { const l = db.audit.find((x) => x._id === params.id); if (!l) throw notFound('Log'); return ok(clone(l)); });
route('GET', '/audit-logs', ({ query }) => {
  let list = db.audit;
  if (query?.status) list = list.filter((l) => l.status === query.status);
  if (query?.action) {
    const prefixes = String(query.action).split(',');
    list = list.filter((l) => prefixes.some((p) => l.action.startsWith(p)));
  }
  if (query?.search) list = list.filter((l) => JSON.stringify(l).toLowerCase().includes(String(query.search).toLowerCase()));
  const { items, meta } = paginate(list, query, 50);
  return ok(clone(items), meta);
});

// ───────────────────────── dispatcher ─────────────────────────
export async function handleRequest(method, rawUrl, { query, body, config } = {}) {
  const url = String(rawUrl).split('?')[0].replace(/\/+$/, '') || '/';
  const upper = method.toUpperCase();
  await sleep(120 + Math.random() * 160);
  if (config?.signal?.aborted) {
    const e = new Error('canceled');
    e.name = 'CanceledError';
    e.code = 'ERR_CANCELED';
    throw e;
  }
  for (const r of routes) {
    if (r.method !== upper) continue;
    const m = url.match(r.rx);
    if (!m) continue;
    const params = {};
    r.keys.forEach((k, i) => { params[k] = decodeURIComponent(m[i + 1]); });
    const result = await r.handler({ params, query: query || {}, body, config });
    if (config?.signal?.aborted) {
      const e = new Error('canceled');
      e.name = 'CanceledError';
      e.code = 'ERR_CANCELED';
      throw e;
    }
    return result;
  }
  console.warn(`[mock] no handler for ${upper} ${url}`);
  throw new MockHttpError(404, `Mock endpoint not implemented: ${upper} ${url}`, 'NOT_FOUND');
}
