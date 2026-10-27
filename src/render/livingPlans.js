// Small, deterministic plans shared by the presentation and its tests. These plans
// never change stocks: the regional simulation remains the sole owner of cargo.
import { BUILDINGS } from '../data/buildings.js';
import { roadNextTo, roadPath } from '../sim/paths.js';

export function dailyActivity(hour, person = 0) {
  hour = ((hour % 24) + 24) % 24;
  if (hour < 6 || hour >= 21) return null;
  if (person % 4 === 0) return hour < 15 ? 'school' : 'play';
  if (hour < 12) return 'shopping';
  if (hour < 18) return person % 4 === 1 ? 'stroll' : 'play';
  return 'social';
}

export function activityDestination(b, activity) {
  const d = BUILDINGS[b.type];
  if (!d || b.cons?.k === 'new' || b.fire) return false;
  if (activity === 'school') return d.coverage?.need === 'education';
  if (activity === 'shopping') return d.cat === 'commerce';
  if (activity === 'social') return d.cat === 'commerce' || d.coverage?.need === 'leisure';
  return d.coverage?.need === 'leisure' || d.cat === 'decor' || b.type === 'civic_square' && b.level >= 4;
}

/** A destination is selected only if the road really connects the two buildings. */
export function planErrand(world, home, destinations, activity, salt = 0) {
  const start = roadNextTo(world, home);
  if (start < 0) return null;
  const options = destinations.filter((b) => b.id !== home.id && activityDestination(b, activity));
  const n = options.length;
  for (let k = 0; k < Math.min(n, 8); k++) {
    const target = options[((salt >>> 0) + k) % n];
    const end = roadNextTo(world, target);
    const path = end < 0 ? null : roadPath(world, start, end, 60);
    if (path?.length > 1) return { path, target: target.id, home: home.id, activity };
  }
  return null;
}

/** Stable visual windows around a real shipment's wall-clock timestamps. */
export function freightScene(shipments, region, mode, now = Date.now()) {
  const scenes = [];
  for (const job of shipments || []) {
    if (job.mode !== mode || !Number.isFinite(job.sentAt) || !Number.isFinite(job.readyAt) || job.readyAt <= job.sentAt) continue;
    const duration = job.readyAt - job.sentAt;
    const load = Math.min(7000, duration * 0.15), travel = Math.min(9000, duration * 0.2);
    if (job.from === region && now >= job.sentAt && now < job.sentAt + load + travel) {
      const age = now - job.sentAt;
      scenes.push({ job, phase: age < load ? 'loading' : 'departing', progress: age < load ? age / load : (age - load) / travel, priority: 2 });
    }
    if (job.to === region && now >= job.readyAt - travel && now < job.readyAt + load) {
      const left = job.readyAt - now;
      // Credit must have happened before the unloading celebration appears.
      if (left <= 0 && !job.delivered) continue;
      scenes.push({ job, phase: left > 0 ? 'arriving' : 'unloading', progress: left > 0 ? 1 - left / travel : -left / load, priority: 1 });
    }
  }
  return scenes.sort((a, b) => a.priority - b.priority || a.job.sentAt - b.job.sentAt)[0] || null;
}
