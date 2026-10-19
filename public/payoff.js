// Hypothetical terminal cash flows in coins, excluding acquisition cost.
export function expiryPayoff(asset,finalPrice,earlierBarrierHit=false){
 if(asset==='share')return finalPrice;
 if(asset==='call')return Math.max(finalPrice-50,0);
 if(asset==='barrier')return earlierBarrierHit||finalPrice>=65?0:Math.max(finalPrice-50,0);
 throw new Error('Unknown instrument');
}
export function combinedPayoff(quantities,finalPrice,earlierBarrierHit=false){
 return Object.entries(quantities).reduce((sum,[asset,quantity])=>sum+quantity*expiryPayoff(asset,finalPrice,earlierBarrierHit),0);
}
