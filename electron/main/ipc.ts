/**
 * PosApi → IPC. Har bir metod `ipcMain.handle('api:group.method')` sifatida ro'yxatdan o'tadi.
 * Natija konvertda qaytadi ({ok, value} | {ok:false, error}) — shunda renderer toza o'zbekcha xato matnini oladi
 * (Electron'ning "Error invoking remote method ..." prefiksisiz).
 */
import { ipcMain } from 'electron'
import type { IpcMainInvokeEvent } from 'electron'
import type { PosApi } from '../../src/shared/api'
import { API_METHODS, channelOf, invokeApi } from './apiMethods'
import type { Envelope } from './apiMethods'

export function registerIpc(api: PosApi, isTrustedSender: (e: IpcMainInvokeEvent) => boolean = () => true): () => void {
  const channels: string[] = []
  for (const { group, method } of API_METHODS) {
    const ch = channelOf(group, method)
    channels.push(ch)
    ipcMain.handle(ch, async (event, ...args: unknown[]): Promise<Envelope> => {
      if (!isTrustedSender(event)) return { ok: false, error: "Ruxsat etilmagan so'rov" }
      try {
        const value = await invokeApi(api, group, method, args)
        return { ok: true, value }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        if (!(e instanceof Error) || e.name !== 'PosError') console.error(`[ipc] ${ch}:`, e)
        return { ok: false, error: msg || "Noma'lum xato" }
      }
    })
  }
  return () => channels.forEach((ch) => ipcMain.removeHandler(ch))
}
