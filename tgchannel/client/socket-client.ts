/**
 * Socket client for Claude instance to communicate with center manager.
 */

import { createConnection, type Socket } from 'net'
import type { Instance } from '../manager/session-store.js'

export type SocketMessage =
  | { type: 'register'; sessionId: string; pid: number; label: string; lastMessage: string; cwd: string }
  | { type: 'unregister'; sessionId: string }
  | { type: 'switch'; toSessionId: string }
  | { type: 'update_last_message'; sessionId: string; message: string }
  | { type: 'forward'; sessionId: string; content: string; meta: Record<string, string> }
  | { type: 'reply'; sessionId: string; chat_id: string; text: string; reply_to?: string }
  | { type: 'list_instances' }
  | { type: 'get_active' }
  | { type: 'registered'; sessionId: string; activeSessionId: string | null }
  | { type: 'instances_updated'; instances: Instance[] }
  | { type: 'active_changed'; activeSessionId: string | null }
  | { type: 'instances_list'; instances: Instance[]; activeSessionId: string | null }
  | { type: 'active_result'; activeSessionId: string | null }

export type InboundHandler = (msg: SocketMessage) => void

export class SocketClient {
  private socket: Socket | null = null
  private socketPath: string
  private handlers: InboundHandler[] = []
  private pending: Map<string, (msg: SocketMessage) => void> = new Map()
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private sessionId: string | null = null
  private activeSessionId: string | null = null

  constructor(socketPath: string) {
    this.socketPath = socketPath
  }

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.socket = createConnection(this.socketPath, () => {
        console.log('connected to center manager')
        resolve()
      })

      this.socket.on('data', chunk => {
        const lines = chunk.toString().split('\n')
        for (const line of lines) {
          if (!line.trim()) continue
          try {
            const msg = JSON.parse(line) as SocketMessage
            this.handleMessage(msg)
          } catch (e) {
            console.error('parse error:', e)
          }
        }
      })

      this.socket.on('close', () => {
        console.log('disconnected from center manager')
        this.scheduleReconnect()
      })

      this.socket.on('error', err => {
        console.error('socket error:', err)
        reject(err)
      })
    })
  }

  private handleMessage(msg: SocketMessage): void {
    // Check if this is a response to a pending request
    const corrId = (msg as any)._corrId
    if (corrId && this.pending.has(corrId)) {
      const handler = this.pending.get(corrId)!
      this.pending.delete(corrId)
      handler(msg)
      return
    }

    // Notify handlers
    for (const h of this.handlers) {
      h(msg)
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      this.connect().catch(console.error)
    }, 3000)
  }

  send(msg: SocketMessage): void {
    if (this.socket) {
      this.socket.write(JSON.stringify(msg) + '\n')
    }
  }

  register(sessionId: string, pid: number, label: string, cwd: string): void {
    this.sessionId = sessionId
    this.send({
      type: 'register',
      sessionId,
      pid,
      label,
      lastMessage: '',
      cwd,
    })
  }

  updateLastMessage(message: string): void {
    if (this.sessionId) {
      this.send({ type: 'update_last_message', sessionId: this.sessionId, message })
    }
  }

  switch(toSessionId: string): void {
    this.send({ type: 'switch', toSessionId })
  }

  reply(chat_id: string, text: string, reply_to?: string): void {
    if (this.sessionId) {
      this.send({ type: 'reply', sessionId: this.sessionId, chat_id, text, reply_to })
    }
  }

  onMessage(handler: InboundHandler): void {
    this.handlers.push(handler)
  }

  getSessionId(): string | null {
    return this.sessionId
  }

  isActive(): boolean {
    return this.sessionId === this.activeSessionId
  }

  close(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
    if (this.socket) {
      this.socket.end()
      this.socket = null
    }
  }
}