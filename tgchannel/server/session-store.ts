/**
 * Session store for center manager.
 * Tracks all registered Claude instances and the active instance.
 */

export type Instance = {
  sessionId: string
  pid: number
  label: string
  lastMessage: string
  cwd: string
  registeredAt: number
  lastActivityAt: number
}

export class SessionStore {
  private instances = new Map<string, Instance>()
  private activeSessionId: string | null = null

  register(inst: Instance): void {
    this.instances.set(inst.sessionId, inst)
    if (this.activeSessionId === null) {
      this.activeSessionId = inst.sessionId
    }
    this.updateActivity(inst.sessionId)
  }

  unregister(sessionId: string): void {
    this.instances.delete(sessionId)
    if (this.activeSessionId === sessionId) {
      // Pick the most recently active instance
      this.activeSessionId = this.pickMostRecent()
    }
  }

  updateActivity(sessionId: string): void {
    const inst = this.instances.get(sessionId)
    if (inst) {
      inst.lastActivityAt = Date.now()
    }
  }

  updateLastMessage(sessionId: string, msg: string): void {
    const inst = this.instances.get(sessionId)
    if (inst) {
      inst.lastMessage = msg
      inst.lastActivityAt = Date.now()
    }
  }

  setActive(sessionId: string): boolean {
    if (!this.instances.has(sessionId)) return false
    this.activeSessionId = sessionId
    this.updateActivity(sessionId)
    return true
  }

  getActive(): string | null {
    return this.activeSessionId
  }

  getInstance(sessionId: string): Instance | undefined {
    return this.instances.get(sessionId)
  }

  getAllInstances(): Instance[] {
    return Array.from(this.instances.values()).sort(
      (a, b) => b.lastActivityAt - a.lastActivityAt,
    )
  }

  private pickMostRecent(): string | null {
    const all = this.getAllInstances()
    return all.length > 0 ? all[0]!.sessionId : null
  }
}