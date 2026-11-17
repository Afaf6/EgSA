// Maps a stored parameter's encoding to the Edit Parameter form and back.
//
// The server keeps a parameter's encoding in these fields, and the decoder reads them as:
//   dataType     e.g. "INT16_LE": base type, plus an optional byte-order suffix (none = LE)
//   signed       boolean; true also makes a UINT type signed
//   endianness   optional override of the suffix ("BE"/"LE"/"Big Endian"/...)
//   byteSwap     boolean; flips the resulting byte order
// The form shows one base type, one signedness and one byte order. Values are only derived
// for display; the stored fields change only when the user changes one of these three selects.

const ALIASES = { FLOAT: "FLOAT32", DOUBLE: "FLOAT64" };
const MULTI_BYTE = /^(U?INT(16|32|64)|FLOAT(32|64))$/;
const INTEGER = /^U?INT(8|16|32|64)$/;

function normalizeEndian(value) {
  const v = String(value ?? "").trim().toUpperCase().replace(/[-_ ]/g, "");
  if (v === "BE" || v === "BIG" || v === "BIGENDIAN") return "BE";
  if (v === "LE" || v === "LITTLE" || v === "LITTLEENDIAN") return "LE";
  return null;
}

const isTrue = (v) => v === true || v === "true" || v === "signed";

/** Splits "INT16_LE" into { base: "INT16", suffix: "LE" }. Unknown text stays as the base. */
export function splitDataType(dataType) {
  const raw = String(dataType ?? "").trim().toUpperCase();
  const m = raw.match(/^(.+?)_(LE|BE)$/);
  const base = m ? m[1] : raw;
  return { base: ALIASES[base] || base, suffix: m ? m[2] : null };
}

export const hasByteOrder = (base) => MULTI_BYTE.test(base);
export const hasSignedness = (base) => INTEGER.test(base);

/** What the decoder will actually use, for display in the form and details panel. */
export function describeEncoding(param) {
  const { base, suffix } = splitDataType(param?.dataType || "UINT8");
  let byteOrder = null;
  if (hasByteOrder(base)) {
    byteOrder = normalizeEndian(param?.endianness) || suffix || "LE";
    if (isTrue(param?.byteSwap)) byteOrder = byteOrder === "BE" ? "LE" : "BE";
  }
  let signedness = null;
  if (hasSignedness(base)) signedness = base.startsWith("INT") || isTrue(param?.signed) ? "signed" : "unsigned";
  else if (/^FLOAT/.test(base)) signedness = "signed";
  return { base, byteOrder, signedness };
}

function compose(base, byteOrder) {
  return hasByteOrder(base) && byteOrder ? `${base}_${byteOrder}` : base;
}

/**
 * The stored fields after the user changes one select. `field` is "base", "signedness" or
 * "byteOrder". The result fully determines the decoder's reading, so a stale override can not
 * silently win: byteSwap is cleared and an endianness override follows the chosen byte order.
 */
export function applyEncodingChange(param, field, value) {
  const current = describeEncoding(param);
  const next = { ...current, [field]: value };

  if (field === "base") {
    // A newly chosen type carries its own signedness; keep the byte order the user sees.
    next.signedness = hasSignedness(value) ? (value.startsWith("INT") ? "signed" : "unsigned") : null;
    next.byteOrder = hasByteOrder(value) ? current.byteOrder || "LE" : null;
  }

  let base = next.base;
  if (field === "signedness" && hasSignedness(base)) {
    base = value === "signed" ? base.replace(/^UINT/, "INT") : base.replace(/^INT/, "UINT");
  }

  const update = {
    dataType: compose(base, next.byteOrder),
    signed: hasSignedness(base) ? base.startsWith("INT") : false,
    byteSwap: false,
  };
  if (normalizeEndian(param?.endianness)) update.endianness = next.byteOrder || null;
  return update;
}

/** Form defaults for a new parameter, in the same shape the server stores. */
export const NEW_PARAMETER_ENCODING = { dataType: "UINT8", signed: false, byteSwap: false, endianness: null };
