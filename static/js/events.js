/**
 * Obsidian QuickView - Lightweight Event Bus
 * Enables decoupled, unidirectional communication between UI components.
 */

export class EventEmitter {
  constructor() {
    this.events = {};
  }

  on(event, listener) {
    if (!this.events[event]) {
      this.events[event] = [];
    }
    this.events[event].push(listener);
    return () => this.off(event, listener);
  }

  off(event, listener) {
    if (!this.events[event]) return;
    this.events[event] = this.events[event].filter(l => l !== listener);
  }

  emit(event, data) {
    if (!this.events[event]) return;
    for (const listener of this.events[event]) {
      try {
        listener(data);
      } catch (err) {
        console.error(`[EventBus] Error in listener for event "${event}":`, err);
      }
    }
  }

  once(event, listener) {
    const unbind = this.on(event, (data) => {
      unbind();
      listener(data);
    });
    return unbind;
  }
}

export const eventBus = new EventEmitter();
