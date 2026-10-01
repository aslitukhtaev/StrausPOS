/** PIN xeshlash (Node 16: crypto.scryptSync). Format: scrypt$<salt hex>$<hash hex> */
import crypto from 'crypto'

const KEYLEN = 32

export function isValidPin(pin: unknown): pin is string {
  return typeof pin === 'string' && /^\d{4,8}$/.test(pin)
}

export function hashPin(pin: string): string {
  const salt = crypto.randomBytes(16)
  const hash = crypto.scryptSync(pin, salt, KEYLEN)
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`
}

export function verifyPin(pin: string, stored: string): boolean {
  const parts = stored.split('$')
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false
  const salt = Buffer.from(parts[1], 'hex')
  const expected = Buffer.from(parts[2], 'hex')
  if (expected.length !== KEYLEN) return false
  const actual = crypto.scryptSync(String(pin), salt, KEYLEN)
  return crypto.timingSafeEqual(actual, expected)
}
