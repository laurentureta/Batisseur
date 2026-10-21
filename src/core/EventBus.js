// Petit bus d'événements : les modules communiquent sans se connaître.
export class EventBus {
  constructor() {
    this.map = new Map();
  }

  on(name, fn) {
    let set = this.map.get(name);
    if (!set) this.map.set(name, (set = new Set()));
    set.add(fn);
    return () => this.off(name, fn);
  }

  off(name, fn) {
    this.map.get(name)?.delete(fn);
  }

  emit(name, ...args) {
    const set = this.map.get(name);
    if (!set) return;
    for (const fn of [...set]) {
      try {
        fn(...args);
      } catch (err) {
        console.error(`[bus] ${name}`, err);
      }
    }
  }
}
