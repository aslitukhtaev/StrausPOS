/**
 * Kompyuter identifikatori va Windows registry yordamchilari (Node 16, native modulsiz — `reg.exe` orqali).
 *
 *  Kompyuter kodi = formatMachineCode(sha256("delfin|" + MachineGuid)[0..8]).
 *  Windows: HKLM\SOFTWARE\Microsoft\Cryptography\MachineGuid (64-bit ko'rinish, 32-bit ilovada ham).
 *  Boshqa OS yoki o'qib bo'lmasa: barqaror fallback — hostname + birinchi (nom bo'yicha saralangan) jismoniy MAC.
 */
import crypto from 'crypto'
import os from 'os'
import { execFile, execFileSync } from 'child_process'
import { formatMachineCode } from '../../../src/shared/license'

const REG_TIMEOUT_MS = 5000

export function machineHash(guid: string): Uint8Array {
  const h = crypto.createHash('sha256').update('delfin|' + guid, 'utf8').digest()
  return new Uint8Array(h.subarray(0, 8))
}

/** `reg query` chiqishidan qiymatni ajratish: "    MachineGuid    REG_SZ    xxxx" */
export function parseRegValue(output: string, name: string): string | null {
  for (const line of output.split(/\r?\n/)) {
    const m = /^\s*(\S+)\s+REG_\w+\s+(.*?)\s*$/.exec(line)
    if (m && m[1].toLowerCase() === name.toLowerCase()) return m[2]
  }
  return null
}

function regQuery(key: string, name: string, extra: string[] = []): string | null {
  try {
    const out = execFileSync('reg', ['query', key, '/v', name, ...extra], {
      encoding: 'utf8',
      windowsHide: true,
      timeout: REG_TIMEOUT_MS,
      stdio: ['ignore', 'pipe', 'ignore']
    })
    return parseRegValue(out, name)
  } catch {
    return null
  }
}

function windowsMachineGuid(): string | null {
  const key = 'HKLM\\SOFTWARE\\Microsoft\\Cryptography'
  // 32-bit (ia32) ilova 64-bit Windows'da: WOW64 ko'rinishida MachineGuid yo'q — /reg:64 bilan o'qiymiz
  const v = regQuery(key, 'MachineGuid', ['/reg:64']) ?? regQuery(key, 'MachineGuid')
  return v && v.trim() ? v.trim().toLowerCase() : null
}

/** Fallback: hostname + birinchi jismoniy MAC (interfeys nomi bo'yicha saralangan — barqaror tartib) */
export function fallbackGuid(): string {
  let mac = ''
  try {
    const ifs = os.networkInterfaces()
    const names = Object.keys(ifs).sort()
    for (const n of names) {
      for (const a of ifs[n] ?? []) {
        if (!a.internal && a.mac && a.mac !== '00:00:00:00:00:00') {
          mac = a.mac.toLowerCase()
          break
        }
      }
      if (mac) break
    }
  } catch {
    /* MAC yo'q */
  }
  return 'fallback|' + os.hostname().toLowerCase() + '|' + mac
}

export function machineGuid(): string {
  if (process.platform === 'win32') {
    const g = windowsMachineGuid()
    if (g) return g
  }
  return fallbackGuid()
}

let cached: { hash: Uint8Array; code: string } | null = null

/** Shu kompyuterning hash'i va ko'rsatiladigan kodi (bir marta hisoblanadi) */
export function localMachine(): { hash: Uint8Array; code: string } {
  if (!cached) {
    const hash = machineHash(machineGuid())
    cached = { hash, code: formatMachineCode(hash) }
  }
  return cached
}

// ───── HKCU registry kalit-qiymat (sinov boshlanishi va lastSeen uchun) ─────
export interface RegistryStore {
  get(name: string): string | null
  set(name: string, value: string): void
}

export const LICENSE_REG_KEY = 'HKCU\\Software\\DelfinSauna'

/** Windows HKCU registry; boshqa OS'da null. Yozish asinxron (UI'ni to'xtatmaydi), o'qish sinxron. */
export function windowsRegistry(): RegistryStore | null {
  if (process.platform !== 'win32') return null
  return {
    get: (name) => regQuery(LICENSE_REG_KEY, name),
    set: (name, value) => {
      execFile('reg', ['add', LICENSE_REG_KEY, '/v', name, '/d', value, '/f'], { windowsHide: true, timeout: REG_TIMEOUT_MS }, () => {
        /* xato bo'lsa — boshqa joylarda (DB, fayl) saqlangan */
      })
    }
  }
}
