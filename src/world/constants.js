// Constantes du monde : taille de la carte, types de terrain, rythme du temps.

export const SIZE = 50; // carte de 50 x 50 cases
export const ZONE = 10; // une zone = 10 x 10 cases
export const ZONES = 5; // 5 x 5 zones
export const N = SIZE * SIZE;
export const CENTER_ZONE = 12; // zone de départ (au centre)

export const T = {
  GRASS: 0,
  FOREST: 1,
  ROCK: 2,
  WATER: 3,
  SAND: 4,
  MOUNTAIN: 5,
  DEEP: 6,
};

export const TERRAIN_BY_NAME = {
  grass: T.GRASS,
  forest: T.FOREST,
  rock: T.ROCK,
  water: T.WATER,
  sand: T.SAND,
  mountain: T.MOUNTAIN,
  deep: T.DEEP,
};

export const TERRAIN_NAMES = ['Prairie', 'Forêt', 'Rochers', 'Eau', 'Sable', 'Montagne', 'Mer'];
export const TERRAIN_ICONS = ['🌿', '🌲', '🪨', '💧', '🏖️', '⛰️', '🌊'];

export const DAY_SECONDS = 90; // une journée de jeu = 90 s à vitesse normale
export const WORK_RATIO = 0.7; // part des habitants qui travaillent
export const FOOD_PER_RESIDENT = 0.5; // nourriture mangée par habitant et par jour
export const BASE_STORAGE = 250;
export const TOWNHALL_STORAGE = 150; // par niveau de mairie

export function isWater(t) {
  return t === T.WATER || t === T.DEEP;
}
