// Règles d'affichage ; le serveur impose les mêmes coûts et récompenses.
export const ADVENTURES = {
 lighthouse:{name:'Le Phare des équipiers',icon:'🗼',description:'Un phare partagé pour guider les navires de tous les villages.',decor:'x_watchtower',stages:[
  {name:'Préparer les échafaudages',resource:'wood',goal:120,coins:200},
  {name:'Élever la tour',resource:'stone',goal:160,coins:400},
  {name:'Accueillir les gardiens',resource:'food',goal:200,coins:800},
 ]},
 exhibition:{name:'L’Exposition des villages',icon:'🏛️',description:'Une grande exposition où chaque maire présente le savoir-faire de sa ville.',decor:'x_gold_statue',stages:[
  {name:'Aménager les pavillons',resource:'wood',goal:160,coins:200},
  {name:'Décorer les allées',resource:'stone',goal:120,coins:400},
  {name:'Ouvrir les portes au public',resource:'food',goal:240,coins:800},
 ]},
 regionalstation:{name:'La Gare des horizons',icon:'🚂',description:'Une gare collective pour relier les territoires de la coopérative.',decor:'x_mini_mill',stages:[
  {name:'Préparer le quai',resource:'stone',goal:160,coins:200},
  {name:'Monter la halle',resource:'wood',goal:200,coins:400},
  {name:'Préparer le premier départ',resource:'food',goal:160,coins:800},
 ]},
};
export const ADVENTURE_DECOR = Object.values(ADVENTURES).map(a=>a.decor);
