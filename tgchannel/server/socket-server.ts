/**
 * Unix socket server for IPC between center manager and Claude instances.
 */

import { createServer, type Socket } from 'net'
import type { Instance } from './session-store.js'

export type SocketMessage =
  | { type: 'register'; sessionId: string; pid: number; label: string; lastMessage: string; cwd: string; channelEnabled?: boolean }
  | { type: 'unregister'; sessionId: string }
  | { type: 'switch'; toSessionId: string }
  | { type: 'update_last_message'; sessionId: string; message: string }
  | { type: 'forward'; sessionId?: string; content: string; meta: Record<string, string> }
  | { type: 'reply'; sessionId: string; chat_id: string; text: string; reply_to?: string; files?: string[]; format?: string }
  | { type: 'react'; sessionId: string; chat_id: string; message_id: string; emoji: string }
  | { type: 'edit_message'; sessionId: string; chat_id: string; message_id: string; text: string; format?: string }
  | { type: 'download_attachment'; sessionId: string; file_id: string; corrId?: string }
  | { type: 'list_instances' }
  | { type: 'get_active' }
  | { type: 'ping' }
  | { type: 'permission_request'; request_id: string; tool_name: string; description: string; input_preview: string; sessionId?: string }
  | { type: 'permission_response'; request_id: string }

export type MessageHandler = (msg: SocketMessage, socket: Socket) => void

export class SocketServer {
  private server: ReturnType<typeof createServer>
  private handler: MessageHandler

  constructor(socketPath: string, handler: MessageHandler) {
    this.server = createServer(socket => this.onConnection(socket))
    this.server.listen(socketPath, () => {
      console.log(`socket server listening on ${socketPath}`)
    })
  }

  private onConnection(socket: Socket): void {
    let buffer = ''

    socket.on('data', chunk => {
      buffer += chunk.toString()
      let newline: number
      while ((newline = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, newline)
        buffer = buffer.slice(newline + 1)
        try {
          const msg = JSON.parse(line) as SocketMessage
          this.handler(msg, socket)
        } catch {
          console.error('invalid JSON from socket:', line)
        }
      }
    })

    socket.on('error', err => {
      console.error('socket error:', err)
    })
  }

  send(socket: Socket, msg: unknown): void {
    socket.write(JSON.stringify(msg) + '\n')
  }

  broadcast(msg: unknown, excludeSocket?: Socket): void {
    const data = JSON.stringify(msg) + '\n'
    for (const client of this.server.children ?? []) {
      if (client !== excludeSocket) {
        client.write(data)
      }
    }
  }

  close(): void {
    this.server.close()
  }
}

export function encodeMessage(msg: SocketMessage): string {
  return JSON.stringify(msg) + '\n'
}