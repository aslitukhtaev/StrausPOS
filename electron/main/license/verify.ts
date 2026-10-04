/**
 * Litsenziya kalitini tekshirish (Ed25519, Node `crypto.verify`). Ochiq kalit PARAMETR — testlar o'z juftligini beradi,
 * prod'da `publicKey.ts` dagi LICENSE_PUBLIC_KEY_DER_B64.
 */
import crypto from 'crypto'
import type { KeyObject } from 'crypto'
import { DAY_MS, LICENSE_VERSION, decodePayload, dayOf, joinKey, splitKey } from '../../../src/shared/license'
import type { LicensePayload } from '../../../src/shared/license'

export const MSG_KEY_INVALID = "Kalit noto'g'ri"
export const MSG_KEY_OTHER_MACHINE = 'Kalit boshqa kompyuter uchun'
export const MSG_KEY_EXPIRED = "Kalit muddati o'tgan"

export type PublicKeyInput = string | KeyObject

/** SPKI DER base64 → KeyObject (yaroqsiz bo'lsa throw) */
export function toPublicKey(k: PublicKeyInput): KeyObject {
  if (typeof k !== 'string') return k
  return crypto.createPublicKey({ key: Buffer.from(k, 'base64'), format: 'der', type: 'spki' })
}

export interface VerifiedKey {
  payload: LicensePayload
  /** Normallashtirilgan kalit matni (guruhlangan) */
  key: string
  permanent: boolean
  /** Muddatli kalit: amal qilish oxiri (tugash kunidan keyingi UTC yarim tun); doimiy → null */
  expiresAt: number | null
}

export type VerifyResult = { ok: true; value: VerifiedKey } | { ok: false; error: 'invalid' | 'machine' }

function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false
  return true
}

/** Imzo, versiya va kompyuterni tekshiradi (muddat — alohida, `isKeyExpired`). */
export function verifyLicenseKey(text: unknown, publicKey: KeyObject, machine: Uint8Array): VerifyResult {
  if (typeof text !== 'string' || text.length > 1000) return { ok: false, error: 'invalid' }
  const parts = splitKey(text)
  if (!parts) return { ok: false, error: 'invalid' }
  let good = false
  try {
    good = crypto.verify(null, Buffer.from(parts.payload), publicKey, Buffer.from(parts.signature))
  } catch {
    good = false
  }
  if (!good) return { ok: false, error: 'invalid' }
  const payload = decodePayload(parts.payload)
  if (payload.version !== LICENSE_VERSION) return { ok: false, error: 'invalid' }
  if (!sameBytes(payload.machine, machine)) return { ok: false, error: 'machine' }
  const permanent = payload.expiresDay === 0
  return {
    ok: true,
    value: {
      payload,
      key: joinKey(parts.payload, parts.signature),
      permanent,
      expiresAt: permanent ? null : (payload.expiresDay + 1) * DAY_MS
    }
  }
}

/** Muddatli kalit: dayOf(now) > expiresDay → o'tgan */
export function isKeyExpired(k: VerifiedKey, now: number): boolean {
  return !k.permanent && dayOf(now) > k.payload.expiresDay
}
