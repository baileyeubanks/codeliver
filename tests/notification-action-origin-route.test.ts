import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import test from "node:test";

const stub = (source: string) => `data:text/javascript,${encodeURIComponent(source)}`;
const stubs: Record<string, string> = {
  "@/lib/auth-client": stub(`export async function requireAuthWithClient(){
    const query={select(){return this},eq(){return this},limit(){return this},async maybeSingle(){return {data:null,error:null}}};
    return {user:{id:'synthetic-owner',email:'qa@example.com'},supabase:{auth:{admin:{async getUserById(){return {data:{user:{email:'qa@example.com'}},error:null}}}},from(){return query}}};
  }`),
  "@/lib/api/responses": stub(`export const apiJson=(body,init={})=>Response.json(body,init);export const apiError=(error,code,status)=>apiJson({error,code},{status});export const backendUnavailable=()=>apiError('Unavailable','BACKEND_UNAVAILABLE',503);`),
  "@/lib/api/backend": stub(`export const isBackendUnavailableError=()=>false;`),
  "@/lib/email": stub(`export const getBaseUrl=()=> 'https://client.contentco-op.com';`),
  "@/lib/notifications/adapters": stub(`export const createInAppNotificationAdapter=()=>({});export const getExternalNotificationAdapters=()=>[];`),
  "@/lib/notifications/server-delivery": stub(`export async function dispatchAuditedNotification({request}){return {ok:true,offline_dispatch_boundary:true,action:request.action,url:request.message.actionUrl}}`),
};
registerHooks({resolve(specifier, context, next){
  if(stubs[specifier])return {url:stubs[specifier],shortCircuit:true};
  if(specifier.startsWith('@/'))return next(new URL('../'+specifier.slice(2)+'.ts',import.meta.url).href,context);
  return next(specifier,context);
}});
const { POST } = await import('../app/api/notifications/send/route.ts');
async function preview(action_url: string, overrides: Record<string,unknown> = {}) {
  const response=await POST(new Request('https://co-videopro.com/api/notifications/send',{
    method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'preview',event_type:'comment_added',purpose:'transactional',channels:['in_app'],recipient:{user_id:'synthetic-owner'},message:{title:'QA',body:'Offline only',action_url},...overrides}),
  }));
  return {status:response.status,body:await response.json()};
}
test('canonical CVP absolute links and intended relative links reach only the mocked preview boundary',async()=>{
  for(const url of ['https://co-videopro.com/review/synthetic-token','/review/synthetic-token','/projects/synthetic?tab=review#comments']){
    const result=await preview(url);assert.equal(result.status,200,url);assert.equal(result.body.offline_dispatch_boundary,true);assert.equal(result.body.action,'preview');assert.equal(result.body.url,url);
  }
});
test('other companies, old portal, lookalikes and alternate scheme or port never reach dispatch',async()=>{
  for(const url of ['https://client.contentco-op.com/review/synthetic-token','https://admin.astrocleanings.com/projects/synthetic','https://co-videopro.com.attacker.test/review/synthetic-token','https://attacker.test/review/synthetic-token','http://co-videopro.com/review/synthetic-token','https://co-videopro.com:444/review/synthetic-token','//attacker.test/review/synthetic-token']){
    const result=await preview(url);assert.equal(result.status,400,url);assert.equal(result.body.field,'message.action_url');assert.equal(result.body.offline_dispatch_boundary,undefined);
  }
});
test('origin repair does not grant another recipient or unconfirmed send authority',async()=>{
  assert.equal((await preview('/review/synthetic-token',{recipient:{user_id:'another-owner'}})).status,403);
  const result=await preview('/review/synthetic-token',{action:'send'});assert.equal(result.status,400);assert.equal(result.body.offline_dispatch_boundary,undefined);
});
