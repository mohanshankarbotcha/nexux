import { EventEmitter } from 'node:events';
import { NexusEvent, NexusEventType } from '../types/events.js';

export type NexusEventListener = (event: NexusEvent) => void;

export class NexusEventBus {
  private emitter = new EventEmitter();

  constructor() {
    this.emitter.setMaxListeners(100);
  }

  emit(event: NexusEvent): void {
    // Emit by exact event type
    this.emitter.emit(event.type, event);
    // Emit by task ID if relevant
    if (event.taskId) {
      this.emitter.emit(`task:${event.taskId}`, event);
    }
    // Emit to wildcard listener for global subscribers
    this.emitter.emit('*', event);
  }

  onType<T extends NexusEvent>(type: NexusEventType, listener: (event: T) => void): () => void {
    const handler = (evt: unknown) => listener(evt as T);
    this.emitter.on(type, handler);
    return () => this.emitter.off(type, handler);
  }

  on<T extends NexusEvent>(type: NexusEventType, listener: (event: T) => void): () => void {
    return this.onType(type, listener);
  }

  onTask(taskId: string, listener: NexusEventListener): () => void {
    const channel = `task:${taskId}`;
    this.emitter.on(channel, listener);
    return () => this.emitter.off(channel, listener);
  }

  onAll(listener: NexusEventListener): () => void {
    this.emitter.on('*', listener);
    return () => this.emitter.off('*', listener);
  }

  /**
   * Encodes a NexusEvent into standard Server-Sent Events (SSE) format.
   */
  static formatSSE(event: NexusEvent): string {
    const eventName = event.type;
    const data = JSON.stringify(event);
    return `event: ${eventName}\ndata: ${data}\n\n`;
  }
}

export const globalEventBus = new NexusEventBus();
