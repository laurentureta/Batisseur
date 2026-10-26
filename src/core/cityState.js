import { CENTER_ZONE } from '../world/constants.js';

export function newCity() {
  return {
    districts: [{ id: 1, name: 'Le Vieux Village', specialty: 'residential', zones: [CENTER_ZONE] }],
    nextDistrict: 2, projects: {}, families: [], routes: [], buffers: {}, deliveries: [],
    nextDelivery: 1, delivered: 0, regionalDelivered: 0, photo: { frame: 'postcard' },
  };
}
export function ensureCity(state) {
  const base = newCity();
  if (!state.city || typeof state.city !== 'object') state.city = base;
  for (const key in base) if (state.city[key] === undefined) state.city[key] = base[key];
  state.regionId ||= 'home';
  return state.city;
}
