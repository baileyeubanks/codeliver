import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveReviewAuthReturn, googleReviewAuthEnabled } from '../lib/auth/review-return.ts';
const target='/review/7239cd32-6d7f-428c-b949-648931a9f8c4';
test('review return accepts only exact relative opaque review paths',()=>{
 assert.equal(resolveReviewAuthReturn(target),target);
 for(const value of [undefined,null,'/projects','https://evil.example'+target,'https://co-videopro.com'+target,'//evil.example'+target,target+'?next=evil',target+'#x',target+'/extra',target+'/', '/review/not-a-uuid','/review/%37'+target.slice(9),'\\evil',target+'\n']) assert.equal(resolveReviewAuthReturn(value),null,String(value));
});
test('Google sign in is disabled without explicit deployment configuration',()=>{
 for(const value of [undefined,'','false','1','TRUE']) assert.equal(googleReviewAuthEnabled({CODELIVER_GOOGLE_AUTH_ENABLED:value}),false);
 assert.equal(googleReviewAuthEnabled({CODELIVER_GOOGLE_AUTH_ENABLED:'true'}),true);
});

test('real sharing credentials return through auth',()=>{ const next='/review/'+'a'.repeat(64); assert.equal(resolveReviewAuthReturn(next),next); assert.equal(resolveReviewAuthReturn('/review/'+'a'.repeat(257)),null); });
