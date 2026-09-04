// GameState — central, event-emitting, QA-inspectable.
// One source of truth for objectives, flags, notes, doors, visited rooms.

export class GameState {
  constructor(objectivesData) {
    this.objectives = objectivesData.objectives.map((o) => ({ ...o, done: false }));
    this.flags = { ...objectivesData.flags_initial };
    this.notesFound = new Set();
    this.notesTotal = objectivesData.notes_total;
    this.visited = new Set();
    this.listeners = new Map();
    this.startTime = 0;
    this.endTime = 0;
  }

  on(event, fn) {
    if (!this.listeners.has(event)) this.listeners.set(event, []);
    this.listeners.get(event).push(fn);
    return () => this.off(event, fn);
  }

  off(event, fn) {
    const arr = this.listeners.get(event);
    if (arr) this.listeners.delete(event);
  }

  emit(event, data) {
    for (const fn of this.listeners.get(event) || []) fn(data);
    for (const fn of this.listeners.get("*") || []) fn(event, data);
  }

  get currentObjective() {
    return this.objectives.find((o) => !o.done) || null;
  }

  setFlag(name, value = true) {
    if (this.flags[name] === value) return;
    this.flags[name] = value;
    this.emit(`flag:${name}`, value);
    this.emit("flag", { name, value });
  }

  completeObjectiveByFlag(flag) {
    const obj = this.objectives.find((o) => o.flag === flag && !o.done);
    if (!obj) return false;
    obj.done = true;
    this.emit("objective:done", obj);
    const next = this.currentObjective;
    if (next) this.emit("objective:new", next);
    return true;
  }

  findNote(id) {
    this.notesFound.add(id);
    this.emit("note:found", { id, count: this.notesFound.size, total: this.notesTotal });
  }

  visit(roomId) {
    if (this.visited.has(roomId)) return;
    this.visited.add(roomId);
    this.emit("room:visited", roomId);
  }

  startClock() {
    this.startTime = performance.now();
  }

  finish() {
    if (!this.endTime) this.endTime = performance.now();
    this.setFlag("escaped", true);
    this.emit("game:ended", {
      minutes: ((this.endTime - this.startTime) / 60000).toFixed(1),
      notes: this.notesFound.size,
      total: this.notesTotal,
    });
  }

  // QA + debug dump
  dump() {
    return {
      objective: this.currentObjective ? this.currentObjective.id : null,
      objectives: this.objectives.map((o) => ({ id: o.id, done: o.done })),
      flags: { ...this.flags },
      notes: [...this.notesFound],
      visited: [...this.visited],
    };
  }
}
