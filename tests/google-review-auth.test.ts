import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { dirname,extname,resolve } from 'node:path';
import { fileURLToPath,pathToFileURL } from 'node:url';
import test from 'node:test';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const state=globalThis as typeof globalThis & { authUser: unknown; oauthCalls: unknown[]; oauthError: boolean };
state.authUser={id:'reviewer',app_metadata:{}};state.oauthCalls=[];state.oauthError=false;
const moduleUrl=(source:string)=>'data:text/javascript,'+encodeURIComponent(source);
const next=moduleUrl(`export class NextResponse extends Response {static json(body,init){return new NextResponse(JSON.stringify(body),{...init,headers:{'Content-Type':'application/json',...init?.headers}})}static redirect(url,status=307){return new NextResponse(null,{status,headers:{Location:String(url)}})}}`);
const auth=moduleUrl(`export async function createSupabaseAuth(){return {auth:{signInWithOAuth:async input=>{globalThis.oauthCalls.push(input);return {data:{url:'https://example.supabase.co/auth/v1/authorize?provider=google'},error:globalThis.oauthError?{message:'private provider failure'}:null}},exchangeCodeForSession:async()=>({error:null}),getUser:async()=>({data:{user:globalThis.authUser},error:null}),signOut:async()=>({error:null})}}}`);
registerHooks({resolve(specifier,context,nextResolve){if(specifier==='next/server')return nextResolve(next,context);if(specifier==='@/lib/supabase-auth')return nextResolve(auth,context);if(specifier.startsWith('@/')){const base=resolve(root,specifier.slice(2));return nextResolve(pathToFileURL(extname(base)?base:existsSync(base+'.ts')?base+'.ts':base+'.tsx').href,context)}return nextResolve(specifier,context)}});
const target='/review/7239cd32-6d7f-428c-b949-648931a9f8c4';
const request=(body:unknown,origin='https://co-videopro.com')=>new Request('https://co-videopro.com/api/auth/google',{method:'POST',headers:{origin,'Content-Type':'application/json'},body:JSON.stringify(body)});
test('Google start is disabled by default, rejects cross-origin and unsafe returns, preserves PKCE callback target',async()=>{
 const prior=process.env.CODELIVER_GOOGLE_AUTH_ENABLED;
 try{
 const {GET,POST}=await import('../app/api/auth/google/route.ts');
 delete process.env.CODELIVER_GOOGLE_AUTH_ENABLED;
 assert.deepEqual(await (await GET()).json(),{enabled:false});assert.equal((await POST(request({next:target}))).status,503);assert.equal(state.oauthCalls.length,0);
 process.env.CODELIVER_GOOGLE_AUTH_ENABLED='true';
 assert.equal((await POST(request({next:target},'https://evil.example'))).status,403);
 assert.equal((await POST(request({next:'https://evil.example'}))).status,400);assert.equal(state.oauthCalls.length,0);
 assert.equal((await POST(request({next:target,extra:'x'.repeat(3000)}))).status,413);
 assert.equal(state.oauthCalls.length,0);
 assert.equal((await POST(request({next:target}))).status,200);
 const call=state.oauthCalls[0] as {provider:string;options:{redirectTo:string;skipBrowserRedirect:boolean}};
 assert.equal(call.provider,'google');assert.equal(call.options.skipBrowserRedirect,true);
 const callback=new URL(call.options.redirectTo);assert.equal(callback.origin,'https://co-videopro.com');assert.equal(callback.pathname,'/auth/callback');assert.equal(callback.searchParams.get('next'),target);
 state.oauthError=true;const failure=await POST(request({next:target}));assert.equal(failure.status,503);assert.doesNotMatch(await failure.text(),/private provider failure/);
 }finally{state.oauthError=false;if(prior===undefined)delete process.env.CODELIVER_GOOGLE_AUTH_ENABLED;else process.env.CODELIVER_GOOGLE_AUTH_ENABLED=prior;}
});
test('callback allows verified reviewer return without role elevation and preserves workspace/recovery routing',async()=>{
 const {GET}=await import('../app/auth/callback/route.ts');
 const call=(next:string,flow='')=>GET(new Request('https://co-videopro.com/auth/callback?code=test&next='+encodeURIComponent(next)+(flow?'&flow='+flow:'')));
 state.authUser={id:'reviewer',app_metadata:{},user_metadata:{content_coop_role:'staff'}};
 assert.equal((await call(target)).headers.get('location'),'https://co-videopro.com'+target);
 assert.match((await call('/projects')).headers.get('location')!,/\/onboarding\?/);
 assert.match((await call('https://evil.example')).headers.get('location')!,/^https:\/\/co-videopro.com\/onboarding\?/);
 assert.equal((await call(target,'recovery')).headers.get('location'),'https://co-videopro.com/reset-password');
 state.authUser={id:'staff',app_metadata:{content_coop_role:'staff'}};assert.equal((await call('/projects')).headers.get('location'),'https://co-videopro.com/projects');
 state.authUser={id:'client',app_metadata:{content_coop_role:'client'}};assert.match((await call('/projects')).headers.get('location')!,/surface_mismatch/);
 state.authUser=null;assert.match((await call(target)).headers.get('location')!,/session_missing/);
});
