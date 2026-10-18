import type { Response } from 'express';
import type { ServerEvent } from '../shared/types.js';

interface Client {
  viaShare: boolean;
  /** Innlogget bruker, eller null for delingslenken. */
  userId: number | null;
}

/** Holder åpne Server-Sent Events-forbindelser og sender hendelser til alle. */
export class EventHub {
  private clients = new Map<Response, Client>();
  private heartbeat: NodeJS.Timeout;
  /** Kalles når en bruker lukker sin siste åpne fane. */
  onUserGone: (userId: number) => void = () => {};

  constructor() {
    this.heartbeat = setInterval(() => {
      for (const res of this.clients.keys()) res.write(': ping\n\n');
    }, 25_000);
    this.heartbeat.unref();
  }

  add(res: Response, viaShare: boolean, userId: number | null = null): void {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    res.write('retry: 3000\n\n');
    this.clients.set(res, { viaShare, userId });
    res.on('close', () => {
      this.clients.delete(res);
      if (userId !== null && ![...this.clients.values()].some((c) => c.userId === userId)) this.onUserGone(userId);
    });
  }

  send(res: Response, event: ServerEvent): void {
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  }

  broadcast(event: ServerEvent): void {
    const data = `data: ${JSON.stringify(event)}\n\n`;
    for (const res of this.clients.keys()) res.write(data);
  }

  /** Sender bare til innloggede brukere (ikke delingslenken). */
  broadcastToUsers(event: ServerEvent): void {
    const data = `data: ${JSON.stringify(event)}\n\n`;
    for (const [res, info] of this.clients) if (info.userId !== null) res.write(data);
  }

  /** Lukker forbindelser som kom via delingslenken, f.eks. når lenken endres eller slås av. */
  closeShared(): void {
    for (const [res, info] of this.clients) {
      if (info.viaShare) {
        res.end();
        this.clients.delete(res);
      }
    }
  }

  get size(): number {
    return this.clients.size;
  }
}
