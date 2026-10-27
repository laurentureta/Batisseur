import test from 'node:test';
import assert from 'node:assert/strict';
import { GameCore } from '../src/core/GameCore.js';
import { createNewState } from '../src/core/state.js';
import { SIZE } from '../src/world/constants.js';
import { dailyActivity, activityDestination, planErrand, freightScene } from '../src/render/livingPlans.js';

test('habitants : horaires et destinations dépendent des services réellement construits', () => {
  assert.equal(dailyActivity(3, 0), null);
  assert.equal(dailyActivity(8, 0), 'school');
  assert.equal(dailyActivity(16, 0), 'play');
  assert.equal(dailyActivity(9, 1), 'shopping');
  assert.equal(dailyActivity(14, 1), 'stroll');
  assert.equal(dailyActivity(19, 2), 'social');
  assert.equal(activityDestination({type:'market'}, 'shopping'), true);
  assert.equal(activityDestination({type:'market',cons:{k:'new'}}, 'shopping'), false);
  assert.equal(activityDestination({type:'school',fire:1}, 'school'), false);
});

test('habitants : trajet vers un commerce relié ; une coupure empêche la sortie', () => {
  const game = new GameCore({sites:false});
  game.loadState(createNewState({seed:1729, mode:'libre'}));
  const home={id:100,type:'house',x:50,z:50,rot:0,level:1,residents:4};
  const market={id:101,type:'market',x:55,z:50,rot:0,level:1};
  game.world.addBuilding(home);game.world.addBuilding(market);
  for(let x=50;x<58;x++)game.world.setRoad(51*SIZE+x,1);
  game.world.setRoad(51*SIZE+50,1);
  const trip=planErrand(game.world,home,[market], 'shopping');
  assert.equal(trip.target,market.id);
  assert.equal(trip.activity,'shopping');
  assert.ok(trip.path.every((i)=>game.world.road[i]));
  game.world.setRoad(51*SIZE+53,0);
  assert.equal(planErrand(game.world,home,[market], 'shopping'),null);
});

test('fret : scènes liées à la vraie région et aux échéances, sans crédit visuel anticipé', () => {
  const job={id:1,mode:'train',from:'home',to:'island',sentAt:100000,readyAt:190000,res:'wood',qty:80};
  assert.equal(freightScene([job],'home','train',100100).phase,'loading');
  const leaving=freightScene([job],'home','train',110000);
  assert.equal(leaving.phase,'departing');assert.ok(leaving.progress>0 && leaving.progress<1);
  assert.equal(freightScene([job],'home','train',150000),null);
  assert.equal(freightScene([job],'mountain','train',100100),null);
  assert.equal(freightScene([job],'island','boat',185000),null);
  assert.equal(freightScene([job],'island','train',185000).phase,'arriving');
  assert.equal(freightScene([job],'island','train',190100),null);
  assert.equal(freightScene([{...job,delivered:true}],'island','train',190100).phase,'unloading');
  assert.equal(freightScene([{...job,delivered:true}],'island','train',210000),null);
  assert.equal(job.delivered,undefined);
  assert.equal(freightScene([{...job,readyAt:NaN}],'home','train',100100),null);
});
