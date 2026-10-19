import test from 'node:test';
import assert from 'node:assert/strict';
import {expiryPayoff,combinedPayoff} from '../public/payoff.js';
test('payoff selection sums quantities and excludes acquisition costs',()=>{
 assert.equal(combinedPayoff({share:2,call:3,barrier:1},60),160);
 assert.equal(combinedPayoff({share:2,call:3,barrier:1},60,true),150);
 assert.equal(combinedPayoff({share:0,call:0,barrier:0},60),0);
 assert.equal(expiryPayoff('call',40),0);
});
test('knockout payoff includes final observation and permanent earlier touches',()=>{
 assert.equal(expiryPayoff('barrier',64),14);
 assert.equal(expiryPayoff('barrier',65),0);
 assert.equal(expiryPayoff('barrier',60,true),0);
 assert.equal(combinedPayoff({share:1,call:1,barrier:2},70),90);
});
