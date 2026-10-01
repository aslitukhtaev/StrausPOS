/**
 * Preload: window.api — PosApi shaklida (contextIsolation, sandbox).
 * Har bir chaqiruv `api:group.method` IPC kanaliga boradi; xato bo'lsa toza o'zbekcha matnli Error tashlanadi.
 */
import { contextBridge, ipcRenderer } from 'electron'
import type { PosApi } from '../../src/shared/api'
import { API_METHODS, channelOf } from '../main/apiMethods'
import type { Envelope } from '../main/apiMethods'

function build(): PosApi {
  const api: Record<string, Record<string, (...args: unknown[]) => Promise<unknown>>> = {}
  for (const { group, method } of API_METHODS) {
    const ch = channelOf(group, method)
    if (!api[group]) api[group] = {}
    api[group][method] = async (...args: unknown[]) => {
      const res = (await ipcRenderer.invoke(ch, ...args)) as Envelope
      if (!res || typeof res !== 'object') throw new Error("Noma'lum xato")
      if (res.ok) return res.value
      throw new Error(res.error)
    }
  }
  return api as unknown as PosApi
}

contextBridge.exposeInMainWorld('api', build())
