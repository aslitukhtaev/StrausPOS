/**
 * Litsenziya kaliti formati (SHARTNOMA) — oflayn, Ed25519 imzo.
 *
 *  Kompyuter kodi: sha256("delfin|" + Windows MachineGuid) ning birinchi 8 bayti → Crockford base32 (13 belgi),
 *                  ko'rsatishda "XXXXX-XXXXX-XXX".
 *  Kalit: payload (17 bayt) + imzo (64 bayt) → Crockford base32, 5 belgidan "-" bilan guruhlangan.
 *    payload = [versiya=1 (1 bayt)] [kompyuter hash (8 bayt)] [tugash kuni uint32 BE] [berilgan kuni uint32 BE]
 *    kun = UTC 1970-01-01 dan beri kunlar; tugash kuni 0 = DOIMIY.
 *  Imzo: Ed25519(maxfiy kalit, payload). Ochiq kalit dasturda (electron/main/license), maxfiy kalit FAQAT ishlab chiquvchida.
 */
export const LICENSE_VERSION = 1
export const PAYLOAD_LEN = 17
export const SIG_LEN = 64
export const DAY_MS = 86_400_000

const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'

export function base32Encode(bytes: Uint8Array): string {
  let out = ''
  let buf = 0
  let bits = 0
  for (const b of bytes) {
    buf = (buf << 8) | b
    bits += 8
    while (bits >= 5) {
      out += ALPHABET[(buf >>> (bits - 5)) & 31]
      bits -= 5
    }
    buf &= (1 << bits) - 1
  }
  if (bits > 0) out += ALPHABET[(buf << (5 - bits)) & 31]
  return out
}

/** Noto'g'ri belgilar bo'lsa null. O,I,L — 0,1,1 deb olinadi; bo'sh joy va "-" e'tiborsiz. */
export function base32Decode(text: string): Uint8Array | null {
  const clean = text.toUpperCase().replace(/[\s-]/g, '').replace(/O/g, '0').replace(/[IL]/g, '1')
  const out: number[] = []
  let buf = 0
  let bits = 0
  for (const ch of clean) {
    const v = ALPHABET.indexOf(ch)
    if (v < 0) return null
    buf = (buf << 5) | v
    bits += 5
    if (bits >= 8) {
      out.push((buf >>> (bits - 8)) & 255)
      bits -= 8
    }
    buf &= (1 << bits) - 1
  }
  return Uint8Array.from(out)
}

export function group(s: string, n = 5): string {
  return (s.match(new RegExp(`.{1,${n}}`, 'g')) ?? []).join('-')
}

export function formatMachineCode(hash8: Uint8Array): string {
  return group(base32Encode(hash8))
}

export function parseMachineCode(code: string): Uint8Array | null {
  const b = base32Decode(code)
  return b && b.length === 8 ? b : null
}

export function dayOf(ms: number): number {
  return Math.floor(ms / DAY_MS)
}

export interface LicensePayload {
  version: number
  machine: Uint8Array
  /** UTC kun raqami; 0 = doimiy */
  expiresDay: number
  issuedDay: number
}

export function encodePayload(p: LicensePayload): Uint8Array {
  const b = new Uint8Array(PAYLOAD_LEN)
  b[0] = p.version
  b.set(p.machine, 1)
  const dv = new DataView(b.buffer)
  dv.setUint32(9, p.expiresDay >>> 0)
  dv.setUint32(13, p.issuedDay >>> 0)
  return b
}

export function decodePayload(b: Uint8Array): LicensePayload {
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength)
  return { version: b[0], machine: b.slice(1, 9), expiresDay: dv.getUint32(9), issuedDay: dv.getUint32(13) }
}

/** Kalit matnini payload + imzoga ajratish (imzo TEKSHIRILMAYDI). Format xato bo'lsa null. */
export function splitKey(key: string): { payload: Uint8Array; signature: Uint8Array } | null {
  const b = base32Decode(key)
  if (!b || b.length !== PAYLOAD_LEN + SIG_LEN) return null
  return { payload: b.slice(0, PAYLOAD_LEN), signature: b.slice(PAYLOAD_LEN) }
}

export function joinKey(payload: Uint8Array, signature: Uint8Array): string {
  const all = new Uint8Array(PAYLOAD_LEN + SIG_LEN)
  all.set(payload, 0)
  all.set(signature, PAYLOAD_LEN)
  return group(base32Encode(all))
}
