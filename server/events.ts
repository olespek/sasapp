import type { Response } from 'express';
import type { ServerEvent } from '../shared/types.js';

/** Holder åpne Server-Sent Events-forbindelser og sender hendelser til alle. */
export class EventHub {
  private clients = new Map<Response, { viaShare: boolean }>();
  private heartbeat: NodeJS.Timeout;

  constructor() {
    this.heartbeat = setInterval(() => {
      for (const res of this.clients.keys()) res.write(': ping\n\n');
    }, 25_000);
    this.heartbeat.unref();
  }

  add(res: Response, viaShare: boolean): void {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    res.write('retry: 3000\n\n');
    this.clients.set(res, { viaShare });
    res.on('close', () => this.clients.delete(res));
  }

  broadcast(event: ServerEvent): void {
    const data = `data: ${JSON.stringify(event)}\n\n`;
    for (const res of this.clients.keys()) res.write(data);
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
