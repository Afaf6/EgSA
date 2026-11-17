/**
 * In-memory demo database + deterministic telemetry generator.
 * Everything here is fake data for presentation purposes.
 */

// ───────────────────────── helpers ─────────────────────────
function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
function rand(seed) {
  // mulberry32 -> returns a single deterministic float in [0,1)
  let t = (seed + 0x6d2b79f5) >>> 0;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
export const oid = (prefix, n) => `${prefix}${String(n).padStart(24 - prefix.length, '0')}`;
const iso = (ms) => new Date(ms).toISOString();
const MIN = 60 * 1000;
const HOUR = 60 * MIN;

export const STEP_MS = 30 * 1000; // one stored frame every 30 s
export const HISTORY_HOURS = 12;

// ───────────────────────── users ─────────────────────────
export const DEMO_PASSWORD_HINT = 'any email / any password';

const ALL_PERMS = [
  'view_telemetry', 'upload_telemetry', 'export_telemetry', 'upload_config',
  'delete_config', 'manage_projects', 'delete_project', 'manage_users',
];

export const db = {
  users: [
    { _id: oid('a', 1), id: oid('a', 1), name: 'Demo Admin', email: 'admin@egse.demo', role: 'admin', teamRole: 'admin', permissions: ALL_PERMS, projectAccess: [], isActive: true, createdAt: iso(Date.now() - 90 * 24 * HOUR) },
    { _id: oid('a', 2), id: oid('a', 2), name: 'Sara Hassan', email: 'sara.hassan@egse.demo', role: 'tester', teamRole: 'lead', permissions: ['view_telemetry', 'upload_telemetry', 'export_telemetry', 'upload_config'], projectAccess: [], isActive: true, createdAt: iso(Date.now() - 60 * 24 * HOUR) },
    { _id: oid('a', 3), id: oid('a', 3), name: 'Omar Khaled', email: 'omar.khaled@egse.demo', role: 'tester', teamRole: 'tester', permissions: ['view_telemetry', 'export_telemetry'], projectAccess: [], isActive: true, createdAt: iso(Date.now() - 45 * 24 * HOUR) },
    { _id: oid('a', 4), id: oid('a', 4), name: 'Nour Ibrahim', email: 'nour.ibrahim@egse.demo', role: 'tester', teamRole: 'designer', permissions: ['view_telemetry', 'upload_config', 'manage_projects'], projectAccess: [], isActive: true, createdAt: iso(Date.now() - 30 * 24 * HOUR) },
    { _id: oid('a', 5), id: oid('a', 5), name: 'Youssef Adel', email: 'youssef.adel@egse.demo', role: 'tester', teamRole: 'ops', permissions: ['view_telemetry'], projectAccess: [], isActive: false, createdAt: iso(Date.now() - 12 * 24 * HOUR) },
  ],
  developers: [
    { _id: oid('b', 1), id: oid('b', 1), name: 'Mariam Fathy', email: 'mariam.dev@egse.demo', isActive: true, createdAt: iso(Date.now() - 120 * 24 * HOUR) },
    { _id: oid('b', 2), id: oid('b', 2), name: 'Karim Mostafa', email: 'karim.dev@egse.demo', isActive: true, createdAt: iso(Date.now() - 80 * 24 * HOUR) },
  ],
  projects: [],
  sims: {}, // parameterId -> simulation settings
  files: {}, // projectId -> processed files
  versions: {}, // projectId -> config versions
  crcPresets: [
    { _id: oid('c', 1), name: 'CRC-16/CCITT-FALSE', algorithm: 'crc16-ccitt', width: 16, polynomial: '0x1021', init: '0xFFFF', refIn: false, refOut: false, xorOut: '0x0000', isDefault: true },
    { _id: oid('c', 2), name: 'CRC-16/MODBUS', algorithm: 'crc16-modbus', width: 16, polynomial: '0x8005', init: '0xFFFF', refIn: true, refOut: true, xorOut: '0x0000', isDefault: true },
    { _id: oid('c', 3), name: 'CRC-32', algorithm: 'crc32', width: 32, polynomial: '0x04C11DB7', init: '0xFFFFFFFF', refIn: true, refOut: true, xorOut: '0xFFFFFFFF', isDefault: true },
    { _id: oid('c', 4), name: 'CRC-8', algorithm: 'crc8', width: 8, polynomial: '0x07', init: '0x00', refIn: false, refOut: false, xorOut: '0x00', isDefault: true },
  ],
  ingestion: {}, // projectId -> { settings, state, ... }
  jobs: [], // recompute jobs
  audit: [],
};

// ───────────────────────── seed: projects ─────────────────────────
let paramCounter = 1;

/**
 * sim = { nominal, amp, period(min), noise, dec, excursion?: {every(min), dur(s), delta} }
 * limits = [alarmLow, warnLow, warnHigh, alarmHigh]   (null = unbounded)
 */
function makeParam(frameKey, order, def) {
  const n = paramCounter++;
  const id = oid('d', n);
  const [alarmLow, warnLow, warnHigh, alarmHigh] = def.limits || [null, null, null, null];
  const scale = def.scale ?? 1;
  const p = {
    _id: id,
    id,
    parameterId: `0x${(order + 1).toString(16).toUpperCase().padStart(2, '0')}`,
    name: def.name,
    description: def.desc || '',
    unit: def.unit || '',
    dataType: def.dataType || 'UINT16_LE',
    byteOffset: def.byteOffset,
    length: def.length || 2,
    bitOffset: null,
    bitLength: null,
    signed: Boolean(def.signed),
    endianness: 'LE',
    byteSwap: false,
    scale,
    offset: def.offset ?? 0,
    equation: '',
    enabled: true,
    displayOrder: order,
    minValue: def.min ?? '',
    maxValue: def.max ?? '',
    alarmLow, warnLow, warnHigh, alarmHigh,
    limits: { alarmLow, alarmHigh, warningLow: warnLow, warningHigh: warnHigh, warnLow, warnHigh },
    statusRanges: {
      normal: { min: warnLow ?? '', max: warnHigh ?? '' },
      warning: { min: alarmLow ?? '', max: alarmHigh ?? '' },
      critical: { min: '', max: '' },
    },
    equationHash: `eq-${n}`,
  };
  db.sims[id] = { dec: 2, noise: 0, period: 30, amp: 0, ...def.sim, key: `${frameKey}:${def.name}` };
  return p;
}

function makeFrame(projectKey, subsystemId, fIdx, def) {
  const id = oid('e', Number(`${projectKey}${fIdx}`));
  let offset = 8;
  const parameters = def.params.map((pd, i) => {
    const length = pd.length || 2;
    const p = makeParam(`${id}`, i, { ...pd, byteOffset: offset, length });
    offset += length;
    return p;
  });
  return {
    _id: id,
    id,
    name: def.name,
    description: def.description || '',
    subsystemId,
    totalFrameLength: offset + 2,
    frameLength: offset + 2,
    searchHeader: def.sync,
    syncWord: def.sync,
    protocol: def.protocol || 'Generic',
    dataRepresentation: 'binary',
    bitNumbering: 'msb0',
    trailerLength: 2,
    hasCrc: true,
    crc: { enabled: true, algorithm: 'crc16-ccitt', polynomial: '0x1021', init: '0xFFFF' },
    timestamp: { enabled: true, offset: 4, length: 4, endianness: 'LE', unit: 's', epoch: 'unix' },
    parameters,
  };
}

function makeSubsystem(projectKey, sIdx, def) {
  const id = oid('f', Number(`${projectKey}${sIdx}`));
  return {
    _id: id,
    id,
    name: def.name,
    subsystemCode: def.code,
    description: def.description || '',
    frames: def.frames.map((fd, i) => makeFrame(projectKey, id, `${sIdx}${i}`, fd)),
  };
}

function seedProjects() {
  // ── Project 1 : NileSat-1 ──
  const p1Subs = [
    {
      name: 'Electrical Power System', code: 'EPS', description: 'Battery, solar arrays and power distribution',
      frames: [{
        name: 'EPS_HK', sync: '0xEB90', description: 'EPS housekeeping',
        params: [
          { name: 'BATT_VOLTAGE', unit: 'V', desc: 'Main battery bus voltage', scale: 0.01, limits: [6.4, 6.8, 8.2, 8.4], sim: { nominal: 7.55, amp: 0.35, period: 94, noise: 0.03, dec: 2, excursion: { every: 17, dur: 70, delta: -0.95 } } },
          { name: 'BATT_CURRENT', unit: 'A', desc: 'Battery charge / discharge current', signed: true, dataType: 'INT16_LE', scale: 0.001, limits: [-3, -2.5, 2.5, 3], sim: { nominal: 0.4, amp: 1.2, period: 94, noise: 0.06, dec: 2 } },
          { name: 'BATT_SOC', unit: '%', desc: 'State of charge', scale: 0.1, limits: [10, 20, 100, 101], sim: { nominal: 78, amp: 12, period: 94, noise: 0.4, dec: 1 } },
          { name: 'SOLAR_PANEL_TEMP', unit: '°C', desc: 'Solar panel temperature', signed: true, dataType: 'INT16_LE', scale: 0.1, limits: [-60, -50, 85, 95], sim: { nominal: 22, amp: 48, period: 94, noise: 0.6, dec: 1 } },
          { name: 'BUS_5V', unit: 'V', desc: '5 V regulated bus', scale: 0.001, limits: [4.6, 4.8, 5.2, 5.4], sim: { nominal: 5.01, amp: 0.02, period: 11, noise: 0.01, dec: 3 } },
          { name: 'BUS_3V3', unit: 'V', desc: '3.3 V regulated bus', scale: 0.001, limits: [3.0, 3.15, 3.45, 3.6], sim: { nominal: 3.31, amp: 0.015, period: 13, noise: 0.008, dec: 3 } },
        ],
      }],
    },
    {
      name: 'On-Board Computer', code: 'OBC', description: 'Main flight computer',
      frames: [{
        name: 'OBC_HK', sync: '0xEB91', description: 'OBC housekeeping',
        params: [
          { name: 'CPU_LOAD', unit: '%', desc: 'CPU utilisation', scale: 0.1, limits: [null, null, 85, 95], sim: { nominal: 38, amp: 14, period: 7, noise: 2.5, dec: 1, excursion: { every: 23, dur: 60, delta: 50 } } },
          { name: 'MEM_USAGE', unit: '%', desc: 'RAM usage', scale: 0.1, limits: [null, null, 85, 95], sim: { nominal: 52, amp: 4, period: 40, noise: 0.5, dec: 1 } },
          { name: 'OBC_TEMP', unit: '°C', desc: 'OBC board temperature', signed: true, dataType: 'INT16_LE', scale: 0.1, limits: [-30, -20, 60, 70], sim: { nominal: 31, amp: 6, period: 94, noise: 0.2, dec: 1 } },
          { name: 'UPTIME', unit: 's', desc: 'Seconds since last boot', dataType: 'UINT32_LE', length: 4, limits: [null, null, null, null], sim: { nominal: 0, amp: 0, period: 1, noise: 0, dec: 0, counter: true, base: 1250000 } },
          { name: 'BOOT_COUNT', unit: '', desc: 'Number of reboots', length: 2, limits: [null, null, null, null], sim: { nominal: 14, amp: 0, period: 1, noise: 0, dec: 0 } },
        ],
      }],
    },
    {
      name: 'Attitude Determination & Control', code: 'ADCS', description: 'Attitude sensors and actuators',
      frames: [{
        name: 'ADCS_ATT', sync: '0xEB92', description: 'ADCS attitude frame',
        params: [
          { name: 'GYRO_X', unit: 'deg/s', signed: true, dataType: 'INT16_LE', scale: 0.01, limits: [-5, -3, 3, 5], sim: { nominal: 0, amp: 0.8, period: 6, noise: 0.08, dec: 2 } },
          { name: 'GYRO_Y', unit: 'deg/s', signed: true, dataType: 'INT16_LE', scale: 0.01, limits: [-5, -3, 3, 5], sim: { nominal: 0.1, amp: 0.7, period: 8, noise: 0.08, dec: 2 } },
          { name: 'GYRO_Z', unit: 'deg/s', signed: true, dataType: 'INT16_LE', scale: 0.01, limits: [-5, -3, 3, 5], sim: { nominal: -0.05, amp: 0.6, period: 9, noise: 0.08, dec: 2, excursion: { every: 29, dur: 60, delta: 3.6 } } },
          { name: 'SUN_ANGLE', unit: 'deg', scale: 0.1, limits: [null, null, 175, 180], sim: { nominal: 62, amp: 55, period: 94, noise: 0.5, dec: 1 } },
          { name: 'WHEEL_RPM', unit: 'rpm', signed: true, dataType: 'INT16_LE', limits: [-6000, -5500, 5500, 6000], sim: { nominal: 1800, amp: 900, period: 15, noise: 15, dec: 0 } },
        ],
      }],
    },
    {
      name: 'Communications', code: 'COMMS', description: 'S-band / UHF transceiver',
      frames: [{
        name: 'COMMS_STATUS', sync: '0xEB93', description: 'Transceiver status',
        params: [
          { name: 'RSSI', unit: 'dBm', signed: true, dataType: 'INT16_LE', scale: 0.1, limits: [-120, -110, -30, -20], sim: { nominal: -82, amp: 12, period: 26, noise: 1.2, dec: 1 } },
          { name: 'TX_POWER', unit: 'dBm', scale: 0.1, limits: [null, 28, 34, 36], sim: { nominal: 31, amp: 0.4, period: 20, noise: 0.1, dec: 1 } },
          { name: 'LINK_QUALITY', unit: '%', scale: 0.1, limits: [30, 50, 100, 101], sim: { nominal: 91, amp: 6, period: 26, noise: 1.2, dec: 1 } },
          { name: 'PA_TEMP', unit: '°C', signed: true, dataType: 'INT16_LE', scale: 0.1, limits: [-30, -20, 65, 80], sim: { nominal: 38, amp: 8, period: 40, noise: 0.3, dec: 1, excursion: { every: 31, dur: 90, delta: 30 } } },
        ],
      }],
    },
  ];

  // ── Project 2 : CubeSat-Alpha ──
  const p2Subs = [
    {
      name: 'Electrical Power System', code: 'EPS', description: 'Power subsystem',
      frames: [{
        name: 'EPS_BASIC', sync: '0xA55A', description: 'Basic power telemetry',
        params: [
          { name: 'BATT_VOLTAGE', unit: 'V', scale: 0.01, limits: [3.3, 3.5, 4.15, 4.25], sim: { nominal: 3.85, amp: 0.2, period: 94, noise: 0.015, dec: 2 } },
          { name: 'SOLAR_CURRENT', unit: 'mA', limits: [null, null, 900, 1000], sim: { nominal: 420, amp: 380, period: 94, noise: 12, dec: 0 } },
          { name: 'BOARD_TEMP', unit: '°C', signed: true, dataType: 'INT16_LE', scale: 0.1, limits: [-20, -10, 55, 65], sim: { nominal: 18, amp: 14, period: 94, noise: 0.3, dec: 1 } },
        ],
      }],
    },
    {
      name: 'Payload', code: 'PL', description: 'Camera payload',
      frames: [{
        name: 'PL_STATUS', sync: '0xA55B', description: 'Payload status',
        params: [
          { name: 'SENSOR_TEMP', unit: '°C', signed: true, dataType: 'INT16_LE', scale: 0.1, limits: [-25, -15, 35, 45], sim: { nominal: 12, amp: 8, period: 60, noise: 0.25, dec: 1 } },
          { name: 'IMAGES_STORED', unit: '', limits: [null, null, null, null], sim: { nominal: 0, amp: 0, period: 1, noise: 0, dec: 0, counter: true, base: 340, rate: 1 / 600 } },
        ],
      }],
    },
  ];

  const now = Date.now();
  db.projects = [
    {
      _id: oid('9', 1), id: oid('9', 1), name: 'NileSat-1', satelliteName: 'NileSat-1 (Earth Observation)',
      description: 'LEO earth-observation microsatellite — flight model EGSE campaign', version: 4,
      mainTlmProtocol: 'CCSDS', protocol: 'CCSDS', status: 'active',
      createdAt: iso(now - 70 * 24 * HOUR), updatedAt: iso(now - 2 * 24 * HOUR),
      subsystems: p1Subs.map((s, i) => makeSubsystem('1', i + 1, s)),
    },
    {
      _id: oid('9', 2), id: oid('9', 2), name: 'CubeSat-Alpha', satelliteName: 'CubeSat-Alpha (3U)',
      description: 'University 3U CubeSat — educational mission', version: 2,
      mainTlmProtocol: 'Generic', protocol: 'Generic', status: 'active',
      createdAt: iso(now - 35 * 24 * HOUR), updatedAt: iso(now - 5 * 24 * HOUR),
      subsystems: p2Subs.map((s, i) => makeSubsystem('2', i + 1, s)),
    },
  ];

  // processed files + versions + ingestion settings
  db.projects.forEach((proj) => seedProjectSupport(proj));
}

function seedProjectSupport(proj) {
  const now = Date.now();
  const pid = proj._id;
  const frames = allFrames(proj);
  const FILE_COUNT = 6;
  const spanMs = HISTORY_HOURS * HOUR;
  const fileSpan = spanMs / FILE_COUNT;
  const start = floorStep(now - spanMs);
  const prefix = proj.name.replace(/[^A-Za-z0-9]/g, '').toUpperCase();

  db.files[pid] = Array.from({ length: FILE_COUNT }, (_, i) => {
    const from = start + i * fileSpan;
    const to = from + fileSpan;
    const perFrame = Math.floor(fileSpan / STEP_MS);
    const frameSummary = {};
    frames.forEach((f) => { frameSummary[f.name] = perFrame; });
    const total = perFrame * frames.length;
    const d = new Date(from);
    const stamp = `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}_${String(d.getUTCHours()).padStart(2, '0')}${String(d.getUTCMinutes()).padStart(2, '0')}`;
    const id = oid('1', Number(`${proj._id.slice(-1)}${i + 1}`));
    return {
      _id: id, id, project: pid, projectId: pid,
      fileName: `${prefix}_${stamp}.tlm`,
      originalName: `${prefix}_${stamp}.tlm`,
      status: 'completed',
      fileSize: 180000 + Math.floor(rand(hashStr(id)) * 90000),
      recordCount: total,
      subfolder: i % 2 === 0 ? 'pass_A' : 'pass_B',
      createdAt: iso(to + 2 * MIN),
      processedAt: iso(to + 3 * MIN),
      rangeFrom: from,
      rangeTo: to,
      subsystems: proj.subsystems.map((s) => ({ id: s._id, _id: s._id, name: s.name, code: s.subsystemCode })),
      stats: {
        totalLines: total, totalFrames: total, validFrames: total - Math.round(total * 0.004), invalidFrames: Math.round(total * 0.004),
        totalParameters: frames.reduce((a, f) => a + f.parameters.length, 0) * perFrame,
        storedRecords: total, linkedRecords: 0, frameSummary,
      },
    };
  });

  db.versions[pid] = Array.from({ length: proj.version }, (_, i) => ({
    _id: oid('2', Number(`${pid.slice(-1)}${i + 1}`)),
    version: i + 1, versionNumber: i + 1,
    createdAt: iso(now - (proj.version - i) * 9 * 24 * HOUR),
    createdBy: { name: i % 2 ? 'Sara Hassan' : 'Demo Admin', email: i % 2 ? 'sara.hassan@egse.demo' : 'admin@egse.demo' },
    source: i === 0 ? 'manual' : i % 2 ? 'upload' : 'manual',
    restoredFrom: null,
    summary: i === 0 ? 'Initial configuration' : `Updated limits and ${i + 1} frame definition(s)`,
  }));

  db.ingestion[pid] = {
    state: 'stopped', lastPollAt: null, lastError: null, nextAttemptAt: null,
    settings: { inputPath: `D:\\EGSE\\${proj.name}\\incoming`, outputPath: `D:\\EGSE\\${proj.name}\\processed`, intervalSec: 5, maxFileSizeMB: 500 },
    files: [],
  };
}

// ───────────────────────── accessors ─────────────────────────
export const getProject = (id) => db.projects.find((p) => p._id === id || p.id === id || p.name === id);
export const allFrames = (proj) =>
  (proj?.subsystems || []).flatMap((s) =>
    (s.frames || []).map((f) => ({ ...f, subsystemId: s._id, subsystemName: s.name, subsystemCode: s.subsystemCode })),
  );
export const findFrame = (proj, frameId) => allFrames(proj).find((f) => f._id === frameId || f.id === frameId || f.name === frameId);
export const floorStep = (ms) => Math.floor(ms / STEP_MS) * STEP_MS;

// ───────────────────────── telemetry generation ─────────────────────────
function simValue(sim, t, frameSeed) {
  const tMin = t / MIN;
  if (sim.counter) {
    const rate = sim.rate ?? 1; // per second
    return Math.round((sim.base || 0) + (t / 1000 - 1.76e9) * rate);
  }
  const phase = (hashStr(sim.key) % 628) / 100;
  let v = sim.nominal + sim.amp * Math.sin((2 * Math.PI * tMin) / sim.period + phase);
  if (sim.noise) v += (rand(hashStr(sim.key) ^ Math.floor(t / 1000)) - 0.5) * 2 * sim.noise;
  if (sim.excursion) {
    const everyMs = sim.excursion.every * MIN;
    const offset = (hashStr(sim.key) % 7) * MIN;
    if (((t + offset) % everyMs) < sim.excursion.dur * 1000) v += sim.excursion.delta;
  }
  const f = 10 ** (sim.dec ?? 2);
  return Math.round(v * f) / f;
}

export function statusOf(p, v) {
  if (v === null || v === undefined || Number.isNaN(v)) return 'invalid';
  if (p.alarmLow !== null && p.alarmLow !== undefined && v < p.alarmLow) return 'alarm';
  if (p.alarmHigh !== null && p.alarmHigh !== undefined && v > p.alarmHigh) return 'alarm';
  if (p.warnLow !== null && p.warnLow !== undefined && v < p.warnLow) return 'warning';
  if (p.warnHigh !== null && p.warnHigh !== undefined && v > p.warnHigh) return 'warning';
  if (p.alarmLow == null && p.alarmHigh == null && p.warnLow == null && p.warnHigh == null) return 'unmonitored';
  return 'normal';
}

export function makeReadings(frame, t) {
  return (frame.parameters || []).filter((p) => p.enabled !== false).map((p) => {
    const sim = db.sims[p._id] || { nominal: 0, amp: 1, period: 30, dec: 2, key: p.name };
    const eng = simValue(sim, t);
    const scale = p.scale || 1;
    const raw = Math.round((eng - (p.offset || 0)) / scale);
    const status = statusOf(p, eng);
    return {
      parameterId: p._id,
      parameterName: p.name,
      name: p.name,
      rawValue: raw,
      engineeringValue: eng,
      value: eng,
      unit: p.unit || '',
      limitStatus: status,
      status,
      equationHash: p.equationHash,
    };
  });
}

function fileForTime(pid, t) {
  const f = (db.files[pid] || []).find((x) => t >= x.rangeFrom && t < x.rangeTo);
  return f ? f.fileName : (db.files[pid] || []).slice(-1)[0]?.fileName || 'live';
}

export function makeRecord(proj, frame, t, { live = false } = {}) {
  const crcBad = rand(hashStr(frame._id) ^ Math.floor(t / STEP_MS)) < 0.004;
  return {
    _id: `rec_${frame._id.slice(-6)}_${Math.floor(t / 1000)}`,
    project: proj._id,
    projectId: proj._id,
    frame: frame._id,
    frameId: frame._id,
    frameName: frame.name,
    subsystem: frame.subsystemId,
    subsystemId: frame.subsystemId,
    subsystemName: frame.subsystemName,
    subsystemCode: frame.subsystemCode,
    frameTimestamp: iso(t),
    timestamp: iso(t),
    receivedAt: iso(t + 400),
    createdAt: iso(t + 400),
    sourceFile: live ? 'live-stream' : fileForTime(proj._id, t),
    crcStatus: crcBad ? 'FAIL' : 'OK',
    crcValid: !crcBad,
    readings: makeReadings(frame, t),
  };
}

/** All record timestamps that exist for the history window, ascending. */
export function historyTimes(from, to) {
  const now = Date.now();
  const start = Math.max(floorStep(now - HISTORY_HOURS * HOUR), floorStep(from ?? 0));
  const end = Math.min(floorStep(now), to ?? now);
  const out = [];
  for (let t = start; t <= end; t += STEP_MS) out.push(t);
  return out;
}

seedProjects();

// ───────────────────────── mutations helpers ─────────────────────────
let idSeq = 5000;
export const newId = (prefix = 'n') => oid(prefix, ++idSeq);

export function addAudit(action, resource, resourceId, details = {}, status = 'SUCCESS') {
  db.audit.unshift({
    _id: newId('7'), id: newId('7'), action, resource, resourceId, status, details,
    userEmail: 'admin@egse.demo', ipAddress: '127.0.0.1', createdAt: new Date().toISOString(),
  });
}

// seed some audit history
(() => {
  const now = Date.now();
  const rows = [
    ['AUTH_LOGIN', 'User', oid('a', 1), 'SUCCESS', 5],
    ['PROJECT_CREATE', 'Project', oid('9', 1), 'SUCCESS', 70 * 24 * 60],
    ['CONFIG_UPLOAD', 'Configuration', oid('9', 1), 'SUCCESS', 40 * 24 * 60],
    ['USER_CREATE', 'User', oid('a', 2), 'SUCCESS', 60 * 24 * 60],
    ['TELEMETRY_UPLOAD', 'Telemetry', oid('9', 1), 'SUCCESS', 180],
    ['AUTH_LOGIN_FAILED', 'User', '', 'FAILURE', 600],
    ['CONFIG_UPDATE', 'Configuration', oid('9', 1), 'SUCCESS', 2 * 24 * 60],
    ['PROJECT_CREATE', 'Project', oid('9', 2), 'SUCCESS', 35 * 24 * 60],
    ['TELEMETRY_EXPORT', 'Telemetry', oid('9', 1), 'SUCCESS', 90],
    ['AUTH_LOGOUT', 'User', oid('a', 3), 'SUCCESS', 300],
  ];
  rows.forEach(([action, resource, resourceId, status, minsAgo], i) => {
    db.audit.push({
      _id: oid('7', i + 1), id: oid('7', i + 1), action, resource, resourceId, status,
      details: status === 'FAILURE' ? { reason: 'Invalid credentials' } : {},
      userEmail: status === 'FAILURE' ? 'unknown@egse.demo' : 'admin@egse.demo', ipAddress: `10.0.0.${10 + i}`,
      createdAt: iso(now - minsAgo * MIN),
    });
  });
  db.audit.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
})();
