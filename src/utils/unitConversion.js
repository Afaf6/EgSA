/**
 * Satellite Telemetry Unit Definitions & Conversion Engine
 * Supports standard aerospace, electrical, RF, thermodynamic, and mechanical dimensions.
 */

export const UNIT_CATEGORIES = {
  voltage: {
    key: "voltage",
    label: "Voltage",
    baseUnit: "V",
    units: [
      { id: "V", label: "V (Volt)", symbol: "V", toBase: 1 },
      { id: "mV", label: "mV (Millivolt)", symbol: "mV", toBase: 0.001 },
      { id: "µV", label: "µV (Microvolt)", symbol: "µV", toBase: 1e-6 },
      { id: "kV", label: "kV (Kilovolt)", symbol: "kV", toBase: 1000 },
    ],
  },
  current: {
    key: "current",
    label: "Current",
    baseUnit: "A",
    units: [
      { id: "A", label: "A (Ampere)", symbol: "A", toBase: 1 },
      { id: "mA", label: "mA (Milliampere)", symbol: "mA", toBase: 0.001 },
      { id: "µA", label: "µA (Microampere)", symbol: "µA", toBase: 1e-6 },
      { id: "kA", label: "kA (Kiloampere)", symbol: "kA", toBase: 1000 },
    ],
  },
  power: {
    key: "power",
    label: "Power",
    baseUnit: "W",
    units: [
      { id: "W", label: "W (Watt)", symbol: "W", toBase: 1 },
      { id: "mW", label: "mW (Milliwatt)", symbol: "mW", toBase: 0.001 },
      { id: "kW", label: "kW (Kilowatt)", symbol: "kW", toBase: 1000 },
      { id: "dBm", label: "dBm (Decibel-milliwatts)", symbol: "dBm", isLogarithmic: true },
    ],
  },
  temperature: {
    key: "temperature",
    label: "Temperature",
    baseUnit: "°C",
    isAffine: true,
    units: [
      { id: "°C", label: "°C (Celsius)", symbol: "°C" },
      { id: "K", label: "K (Kelvin)", symbol: "K" },
      { id: "°F", label: "°F (Fahrenheit)", symbol: "°F" },
    ],
  },
  angle: {
    key: "angle",
    label: "Angle & Rotation",
    baseUnit: "deg",
    units: [
      { id: "deg", label: "deg (°)", symbol: "deg", toBase: 1 },
      { id: "rad", label: "rad (Radian)", symbol: "rad", toBase: 180 / Math.PI },
      { id: "RPM", label: "RPM (Rev / min)", symbol: "RPM", toBase: 6 },
      { id: "deg/s", label: "deg/s (Rate)", symbol: "deg/s", toBase: 1 },
      { id: "rad/s", label: "rad/s (Rate)", symbol: "rad/s", toBase: 180 / Math.PI },
      { id: "arcsec", label: "arcsec (Arcsecond)", symbol: "arcsec", toBase: 1 / 3600 },
    ],
  },
  frequency: {
    key: "frequency",
    label: "Frequency & Rate",
    baseUnit: "Hz",
    units: [
      { id: "Hz", label: "Hz (Hertz)", symbol: "Hz", toBase: 1 },
      { id: "kHz", label: "kHz (Kilohertz)", symbol: "kHz", toBase: 1000 },
      { id: "MHz", label: "MHz (Megahertz)", symbol: "MHz", toBase: 1e6 },
      { id: "GHz", label: "GHz (Gigahertz)", symbol: "GHz", toBase: 1e9 },
      { id: "bps", label: "bps (Bits/sec)", symbol: "bps", toBase: 1 },
      { id: "kbps", label: "kbps (Kilobits/sec)", symbol: "kbps", toBase: 1000 },
      { id: "Mbps", label: "Mbps (Megabits/sec)", symbol: "Mbps", toBase: 1e6 },
    ],
  },
  pressure: {
    key: "pressure",
    label: "Pressure",
    baseUnit: "Pa",
    units: [
      { id: "Pa", label: "Pa (Pascal)", symbol: "Pa", toBase: 1 },
      { id: "hPa", label: "hPa (Hectopascal / mbar)", symbol: "hPa", toBase: 100 },
      { id: "bar", label: "bar (Bar)", symbol: "bar", toBase: 100000 },
      { id: "mbar", label: "mbar (Millibar)", symbol: "mbar", toBase: 100 },
      { id: "psi", label: "psi (Pounds/sq in)", symbol: "psi", toBase: 6894.757 },
      { id: "torr", label: "torr (Torr / mmHg)", symbol: "torr", toBase: 133.322 },
      { id: "atm", label: "atm (Atmosphere)", symbol: "atm", toBase: 101325 },
    ],
  },
  time: {
    key: "time",
    label: "Time",
    baseUnit: "s",
    units: [
      { id: "s", label: "s (Second)", symbol: "s", toBase: 1 },
      { id: "ms", label: "ms (Millisecond)", symbol: "ms", toBase: 0.001 },
      { id: "µs", label: "µs (Microsecond)", symbol: "µs", toBase: 1e-6 },
      { id: "min", label: "min (Minute)", symbol: "min", toBase: 60 },
      { id: "h", label: "h (Hour)", symbol: "h", toBase: 3600 },
      { id: "d", label: "d (Day)", symbol: "d", toBase: 86400 },
    ],
  },
  ratio: {
    key: "ratio",
    label: "Ratio & Percentage",
    baseUnit: "%",
    units: [
      { id: "%", label: "% (Percent)", symbol: "%", toBase: 1 },
      { id: "ratio", label: "ratio (0..1)", symbol: "ratio", toBase: 100 },
      { id: "ppm", label: "ppm (Parts/million)", symbol: "ppm", toBase: 0.0001 },
      { id: "dB", label: "dB (Decibel)", symbol: "dB", toBase: 1 },
    ],
  },
  data: {
    key: "data",
    label: "Data & Storage",
    baseUnit: "bytes",
    units: [
      { id: "bytes", label: "bytes (Bytes)", symbol: "bytes", toBase: 1 },
      { id: "bits", label: "bits (Bits)", symbol: "bits", toBase: 0.125 },
      { id: "KB", label: "KB (Kilobytes)", symbol: "KB", toBase: 1024 },
      { id: "MB", label: "MB (Megabytes)", symbol: "MB", toBase: 1048576 },
      { id: "GB", label: "GB (Gigabytes)", symbol: "GB", toBase: 1073741824 },
    ],
  },
  dimensionless: {
    key: "dimensionless",
    label: "Dimensionless / Discrete",
    baseUnit: "count",
    units: [
      { id: "count", label: "count", symbol: "count", toBase: 1 },
      { id: "raw", label: "raw", symbol: "raw", toBase: 1 },
      { id: "status", label: "status", symbol: "status", toBase: 1 },
      { id: "enum", label: "enum", symbol: "enum", toBase: 1 },
      { id: "None", label: "None", symbol: "None", toBase: 1 },
    ],
  },
};

/** Flattened list of all standard unit IDs for quick lookups */
export const ALL_STANDARD_UNITS = Object.values(UNIT_CATEGORIES).flatMap((cat) =>
  cat.units.map((u) => u.id)
);

/**
 * Normalizes user-entered unit strings (e.g. "degC", "celsius", "Vdc" -> "°C", "V")
 */
export function normalizeUnit(rawUnit) {
  if (!rawUnit || typeof rawUnit !== "string") return "";
  const trimmed = rawUnit.trim();
  const lower = trimmed.toLowerCase();

  if (["°c", "c", "degc", "deg c", "celsius", "centigrade"].includes(lower)) return "°C";
  if (["k", "kelvin", "degk"].includes(lower)) return "K";
  if (["°f", "f", "degf", "fahrenheit"].includes(lower)) return "°F";
  if (["v", "volt", "volts", "vdc", "vac"].includes(lower)) return "V";
  if (["mv", "millivolt", "mvolt"].includes(lower)) return "mV";
  if (["a", "amp", "ampere", "amps"].includes(lower)) return "A";
  if (["ma", "milliamp", "mamp"].includes(lower)) return "mA";
  if (["w", "watt", "watts"].includes(lower)) return "W";
  if (["mw", "milliwatt"].includes(lower)) return "mW";
  if (["deg", "degree", "degrees", "°"].includes(lower)) return "deg";
  if (["rad", "radian", "radians"].includes(lower)) return "rad";
  if (["hz", "hertz"].includes(lower)) return "Hz";
  if (["khz", "kilohertz"].includes(lower)) return "kHz";
  if (["mhz", "megahertz"].includes(lower)) return "MHz";
  if (["pa", "pascal"].includes(lower)) return "Pa";
  if (["bar", "bars"].includes(lower)) return "bar";
  if (["mbar", "millibar"].includes(lower)) return "mbar";
  if (["s", "sec", "second", "seconds"].includes(lower)) return "s";
  if (["ms", "msec", "millisecond"].includes(lower)) return "ms";
  if (["%", "percent", "percentage"].includes(lower)) return "%";
  if (["count", "counts", "cnt"].includes(lower)) return "count";

  // Check exact matches in standard units
  const exact = ALL_STANDARD_UNITS.find((u) => u.toLowerCase() === lower);
  return exact || trimmed;
}

/**
 * Finds which category a given unit belongs to.
 */
export function findUnitCategory(unitStr) {
  const norm = normalizeUnit(unitStr);
  if (!norm) return null;

  for (const [catKey, cat] of Object.entries(UNIT_CATEGORIES)) {
    const found = cat.units.some((u) => u.id === norm || u.symbol === norm);
    if (found) return catKey;
  }
  return null;
}

/**
 * Returns list of units compatible with the given unit for conversion.
 */
export function getCompatibleUnits(unitStr) {
  const catKey = findUnitCategory(unitStr);
  if (!catKey || !UNIT_CATEGORIES[catKey]) return [];
  return UNIT_CATEGORIES[catKey].units;
}

/**
 * Converts a numerical value from one unit to another.
 * Returns null if units are incompatible or value is not a valid number.
 */
export function convertValue(val, fromUnit, toUnit) {
  const num = Number(val);
  if (isNaN(num)) return null;

  const from = normalizeUnit(fromUnit);
  const to = normalizeUnit(toUnit);
  if (!from || !to) return null;
  if (from === to) return num;

  // Temperature (Affine)
  if (["°C", "K", "°F"].includes(from) && ["°C", "K", "°F"].includes(to)) {
    // 1. Convert from source to Celsius base
    let celsiusVal = num;
    if (from === "K") celsiusVal = num - 273.15;
    else if (from === "°F") celsiusVal = (num - 32) * (5 / 9);

    // 2. Convert from Celsius base to target
    let res = celsiusVal;
    if (to === "K") res = celsiusVal + 273.15;
    else if (to === "°F") res = (celsiusVal * 9) / 5 + 32;
    return parseFloat(res.toPrecision(12));
  }

  // Linear dimensional conversions
  const fromCatKey = findUnitCategory(from);
  const toCatKey = findUnitCategory(to);
  if (!fromCatKey || fromCatKey !== toCatKey) return null;

  const cat = UNIT_CATEGORIES[fromCatKey];
  const fromObj = cat.units.find((u) => u.id === from);
  const toObj = cat.units.find((u) => u.id === to);
  if (!fromObj || !toObj || fromObj.toBase === undefined || toObj.toBase === undefined) {
    return null;
  }

  // Base value = num * fromObj.toBase
  // Target value = Base value / toObj.toBase
  const valInBase = num * fromObj.toBase;
  return parseFloat((valInBase / toObj.toBase).toPrecision(12));
}

/**
 * Calculates multiplier and offset conversion factors between two units:
 * result = (value * multiplier) + offsetAdd
 */
export function getConversionFactors(fromUnit, toUnit) {
  const from = normalizeUnit(fromUnit);
  const to = normalizeUnit(toUnit);
  if (!from || !to || from === to) return { multiplier: 1, offsetAdd: 0 };

  // Temperature Special Cases
  if (from === "°C" && to === "K") return { multiplier: 1, offsetAdd: 273.15 };
  if (from === "K" && to === "°C") return { multiplier: 1, offsetAdd: -273.15 };
  if (from === "°C" && to === "°F") return { multiplier: 1.8, offsetAdd: 32 };
  if (from === "°F" && to === "°C") return { multiplier: 5 / 9, offsetAdd: -32 * (5 / 9) };
  if (from === "K" && to === "°F") return { multiplier: 1.8, offsetAdd: -273.15 * 1.8 + 32 };
  if (from === "°F" && to === "K") return { multiplier: 5 / 9, offsetAdd: -32 * (5 / 9) + 273.15 };

  const fromCatKey = findUnitCategory(from);
  const toCatKey = findUnitCategory(to);
  if (!fromCatKey || fromCatKey !== toCatKey) return { multiplier: 1, offsetAdd: 0 };

  const cat = UNIT_CATEGORIES[fromCatKey];
  const fromObj = cat.units.find((u) => u.id === from);
  const toObj = cat.units.find((u) => u.id === to);
  if (!fromObj || !toObj || fromObj.toBase === undefined || toObj.toBase === undefined) {
    return { multiplier: 1, offsetAdd: 0 };
  }

  const multiplier = fromObj.toBase / toObj.toBase;
  return { multiplier, offsetAdd: 0 };
}

/**
 * Converts a parameter schema row to a new unit, automatically scaling its
 * scale, offset, and threshold limits (warnLow, alarmLow, warnHigh, alarmHigh).
 */
function applyConversionToEquation(equation, multiplier, offsetAdd) {
  if (multiplier === 1 && offsetAdd === 0) return equation;
  // Plain decimals only: the equation engine does not read exponent notation such as 1e-9
  const format = (n) => {
    const text = String(parseFloat(n.toPrecision(12)));
    return text.includes("e") ? n.toFixed(20).replace(/0+$/, "") : text;
  };
  let converted = `(${equation})`;
  if (multiplier !== 1) converted += ` * ${format(multiplier)}`;
  if (offsetAdd > 0) converted += ` + ${format(offsetAdd)}`;
  if (offsetAdd < 0) converted += ` - ${format(-offsetAdd)}`;
  return converted;
}

export function convertParameterRow(row, targetUnit, options = { updateScale: true, updateLimits: true }) {
  if (!row) return row;
  const currentUnit = row.unit || "";
  const normTarget = normalizeUnit(targetUnit);
  if (!normTarget || normTarget === currentUnit) return row;

  const { multiplier, offsetAdd } = getConversionFactors(currentUnit, normTarget);

  const updated = { ...row, unit: normTarget };

  // Adjust scale and offset if linear or affine
  const equation = typeof row.equation === "string" ? row.equation.trim() : "";
  if (options.updateScale !== false && equation) {
    // Scale and offset produce x, and the equation's result is the final value,
    // so the conversion applies to that result and scale and offset stay as they are.
    updated.equation = applyConversionToEquation(equation, multiplier, offsetAdd);
  } else if (options.updateScale !== false) {
    const curScale = row.scale !== undefined && row.scale !== null && !isNaN(Number(row.scale)) ? Number(row.scale) : 1;
    const curOffset = row.offset !== undefined && row.offset !== null && !isNaN(Number(row.offset)) ? Number(row.offset) : 0;

    // Engineering value: (raw * scale) + offset
    // After unit conversion: ((raw * scale) + offset) * multiplier + offsetAdd
    // = raw * (scale * multiplier) + (offset * multiplier + offsetAdd)
    const newScale = curScale * multiplier;
    const newOffset = curOffset * multiplier + offsetAdd;

    // Round small floating inaccuracies (e.g. 0.0000000000000001)
    updated.scale = parseFloat(newScale.toPrecision(7));
    updated.offset = parseFloat(newOffset.toPrecision(7));
  }

  // Adjust threshold limits
  if (options.updateLimits !== false) {
    const limitKeys = ["warnLow", "alarmLow", "warnHigh", "alarmHigh"];
    for (const key of limitKeys) {
      if (row[key] !== "" && row[key] !== null && row[key] !== undefined && !isNaN(Number(row[key]))) {
        const converted = convertValue(row[key], currentUnit, normTarget);
        if (converted !== null) {
          updated[key] = parseFloat(converted.toPrecision(7));
        }
      }
    }
  }

  return updated;
}
