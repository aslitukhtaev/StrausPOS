/**
 * Asosiy kompyuter: LAN server holati (network.* amalga oshirish).
 * Holat bazaning kv jadvalida ('network': {enabled, port, code}) saqlanadi.
 * Kod almashsa yoki server o'chirilsa — barcha terminal kontekstlari (login'lari) o'chiriladi.
 * Ruxsat tekshiruvi (settings.manage) PosService.network da — bu klass faqat host.
 */
import crypto from 'crypto'
import os from 'os'
import type { PosApi } from '../../../src/shared/api'
import type { NetworkStatus } from '../../../src/shared/types'
import { LanServer } from './server'
import { DEFAULT_LAN_PORT, DISCOVERY_PORT, isValidCode } from './protocol'

export interface NetConfig {
  enabled: boolean
  port: number
  code: string
}

export interface NetStore {
  load(): string | null
  save(json: string): void
}

export interface NetworkManagerOptions {
  store: NetStore
  /** Yangi terminal uchun alohida login konteksti (litsenziya o'ramidagi PosService.forTerminal()) */
  createTerminal: () => PosApi
  /** So'rovlarni ketma-ket bajarish (dev-server navbati) */
  run?: <T>(fn: () => Promise<T>) => Promise<T>
  name: () => string
  version: string
  clock?: () => number
  discoveryPort?: number | null
  /** Testlar: 127.0.0.1 */
  bindHost?: string
}

export function newCode(): string {
  return String(crypto.randomInt(0, 1_000_000)).padStart(6, '0')
}

/** Shu kompyuterning IPv4 manzillari (ichki/loopback emas) */
export function lanAddresses(): string[] {
  const out: string[] = []
  for (const list of Object.values(os.networkInterfaces())) {
    for (const a of list ?? []) {
      if (((a.family as unknown) === 'IPv4' || (a.family as unknown) === 4) && !a.internal) out.push(a.address)
    }
  }
  return out
}

type NetworkApi = PosApi['network']

export class NetworkManager implements NetworkApi {
  private cfg: NetConfig
  readonly server: LanServer

  constructor(private readonly opts: NetworkManagerOptions) {
    this.cfg = this.load()
    this.server = new LanServer({
      createTerminal: opts.createTerminal,
      run: opts.run,
      name: opts.name,
      version: opts.version,
      code: () => this.cfg.code,
      clock: opts.clock,
      discoveryPort: opts.discoveryPort === undefined ? DISCOVERY_PORT : opts.discoveryPort
    })
  }

  private load(): NetConfig {
    let raw: Partial<NetConfig> = {}
    try {
      const s = this.opts.store.load()
      if (s) raw = JSON.parse(s) as Partial<NetConfig>
    } catch {
      raw = {}
    }
    const port = Number.isInteger(raw.port) && (raw.port as number) >= 0 && (raw.port as number) <= 65535 ? (raw.port as number) : DEFAULT_LAN_PORT
    const cfg: NetConfig = { enabled: raw.enabled === true, port, code: isValidCode(raw.code) ? raw.code : newCode() }
    if (!isValidCode(raw.code)) this.persist(cfg)
    return cfg
  }

  private persist(cfg: NetConfig): void {
    this.opts.store.save(JSON.stringify(cfg))
  }

  get config(): NetConfig {
    return { ...this.cfg }
  }

  /** Ilova ochilganda: yoqilgan bo'lsa server avtomatik ko'tariladi (xato bo'lsa log, ilova ishlayveradi) */
  async init(): Promise<void> {
    if (!this.cfg.enabled) return
    try {
      await this.server.start(this.cfg.port, this.opts.bindHost)
    } catch (e) {
      console.error('[lan] avtomatik ishga tushmadi:', e instanceof Error ? e.message : e)
    }
  }

  async shutdown(): Promise<void> {
    await this.server.stop()
  }

  status = async (): Promise<NetworkStatus> => ({
    enabled: this.cfg.enabled,
    port: this.server.running ? this.server.port : this.cfg.port,
    code: this.cfg.code,
    addresses: lanAddresses(),
    terminals: await this.server.terminals()
  })

  setEnabled = async (enabled: boolean): Promise<NetworkStatus> => {
    if (enabled) {
      await this.server.start(this.cfg.port, this.opts.bindHost) // band port → o'zbekcha xato, holat o'zgarmaydi
    } else {
      await this.server.stop()
      this.server.clearTerminals()
    }
    this.cfg = { ...this.cfg, enabled }
    this.persist(this.cfg)
    return this.status()
  }

  regenerateCode = async (): Promise<NetworkStatus> => {
    let code = newCode()
    while (code === this.cfg.code) code = newCode()
    this.cfg = { ...this.cfg, code }
    this.persist(this.cfg)
    this.server.clearTerminals()
    return this.status()
  }
}
