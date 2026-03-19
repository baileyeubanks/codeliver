"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

const B = {
  cream: "#f0ebe0", parchment: "#faf6ef", sand: "#d8cfc0",
  navy: "#0b1928", navyMid: "#0f2035",
  accent: "#2a8a8e", accentDim: "#1f6d70",
  slate: "#485670", periwinkle: "#b3c8f0", copper: "#5ba5a8",
  text: "#edf3ff", textMuted: "#7a9bc4",
  border: "#2b4263", borderFocus: "#2a8a8e", error: "#de7676",
};
const SERIF = "'Fraunces', Georgia, serif";
const SANS = "'Plus Jakarta Sans', 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";

const inputStyle: React.CSSProperties = {
  border: `1px solid ${B.border}`, borderRadius: 8, background: "rgba(255,255,255,0.04)",
  color: B.text, padding: ".6rem .75rem", fontSize: ".875rem", fontFamily: SANS,
  outline: "none", transition: "border-color 140ms ease, background 140ms ease",
  width: "100%", boxSizing: "border-box",
};
const labelStyle: React.CSSProperties = {
  fontSize: ".68rem", letterSpacing: ".1em", textTransform: "uppercase",
  color: B.periwinkle, fontWeight: 700, fontFamily: SANS,
};

export default function LoginPage() {
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleLogin(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setLoading(true);
    const fd = new FormData(e.currentTarget);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: fd.get("email"), password: fd.get("password") }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Login failed"); setLoading(false); return; }
      router.push("/");
    } catch { setError("Connection error"); setLoading(false); }
  }

  const onFocus = (e: React.FocusEvent<HTMLInputElement>) => { e.currentTarget.style.borderColor = B.borderFocus; e.currentTarget.style.background = "rgba(255,255,255,0.07)"; };
  const onBlur = (e: React.FocusEvent<HTMLInputElement>) => { e.currentTarget.style.borderColor = B.border; e.currentTarget.style.background = "rgba(255,255,255,0.04)"; };

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,300..900;1,9..144,300..900&family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap');
        .cco-login-root { min-height:100vh; display:grid; grid-template-columns:1fr 420px; font-family:${SANS}; }
        .cco-login-brand { background:${B.cream}; display:flex; flex-direction:column; justify-content:space-between; padding:2.5rem 3rem; overflow:hidden; }
        .cco-login-form-side { background:${B.navy}; display:flex; flex-direction:column; justify-content:center; padding:2.5rem; }
        .cco-login-headline { font-family:${SERIF}; font-size:clamp(2rem,3.5vw,3rem); font-weight:700; color:${B.navy}; line-height:1.12; letter-spacing:-.02em; margin:0 0 1rem; }
        .cco-login-headline em { font-style:italic; color:${B.accent}; }
        @media(max-width:860px){
          .cco-login-root{grid-template-columns:1fr;grid-template-rows:auto 1fr;}
          .cco-login-brand{padding:2rem 1.75rem 1.5rem;min-height:auto;}
          .cco-login-brand-footer{display:none!important;}
          .cco-login-form-side{padding:2rem 1.75rem 2.5rem;justify-content:flex-start;}
          .cco-login-headline{font-size:1.75rem;margin-bottom:.6rem;}
        }
        @media(max-width:480px){
          .cco-login-brand{padding:1.5rem 1.25rem 1rem;}
          .cco-login-form-side{padding:1.75rem 1.25rem 2rem;}
        }
      `}</style>
      <main className="cco-login-root">
        <div className="cco-login-brand">
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
            <div style={{display:"flex",alignItems:"center",gap:".5rem"}}>
              <span style={{fontFamily:SANS,fontSize:".78rem",fontWeight:700,color:B.navy,letterSpacing:".04em"}}>Content Co-op</span>
              <span style={{width:1,height:14,background:B.sand,display:"inline-block",margin:"0 .35rem"}}/>
              <span style={{fontFamily:SANS,fontSize:".72rem",fontWeight:600,color:B.slate,letterSpacing:".06em",textTransform:"uppercase"}}>Co-Deliver</span>
            </div>
            <a href="https://contentco-op.com/suite#co-deliver" style={{fontSize:".72rem",color:B.slate,textDecoration:"none",letterSpacing:".04em",fontFamily:SANS}}>suite overview ↗</a>
          </div>
          <div style={{flex:1,display:"flex",flexDirection:"column",justifyContent:"center",padding:"2rem 0"}}>
            <div style={{display:"inline-flex",alignItems:"center",gap:".45rem",marginBottom:"1.25rem"}}>
              <div style={{width:20,height:2,background:B.copper,borderRadius:2}}/>
              <span style={{fontFamily:SANS,fontSize:".68rem",fontWeight:700,color:B.copper,letterSpacing:".16em",textTransform:"uppercase"}}>Step 3 / Review and delivery</span>
            </div>
            <h1 className="cco-login-headline">Ship the work<br/>without losing<br/>the <em>thread.</em></h1>
            <p style={{fontFamily:SANS,fontSize:".9rem",color:B.slate,lineHeight:1.65,maxWidth:380,margin:"0 0 2rem"}}>
              Timecoded review, version control, and stakeholder sign-off in one place. Co-Deliver closes the loop between your team and your client — no more scattered email threads or lost approvals.
            </p>
            <div style={{display:"flex",gap:".5rem",flexWrap:"wrap"}}>
              {["Agency + client alignment","Review to approval","Delivery without the email hunt"].map(c=>(
                <span key={c} style={{fontFamily:SANS,fontSize:".7rem",fontWeight:600,color:B.slate,background:"transparent",border:`1px solid ${B.sand}`,borderRadius:999,padding:".3rem .75rem",letterSpacing:".02em"}}>{c}</span>
              ))}
            </div>
          </div>
          <div className="cco-login-brand-footer" style={{display:"flex",alignItems:"center",gap:"1rem"}}>
            <div style={{height:1,background:B.sand,flex:1}}/>
            <span style={{fontFamily:SANS,fontSize:".7rem",color:B.sand,whiteSpace:"nowrap"}}>© Content Co-op LLC</span>
          </div>
        </div>
        <div className="cco-login-form-side">
          <div style={{maxWidth:340,width:"100%",margin:"0 auto"}}>
            <div style={{marginBottom:"1.75rem"}}>
              <div style={{fontFamily:SANS,fontSize:".68rem",letterSpacing:".18em",textTransform:"uppercase",color:B.periwinkle,fontWeight:700,marginBottom:".5rem"}}>Sign in</div>
              <h2 style={{fontFamily:SERIF,fontSize:"1.5rem",fontWeight:700,color:B.text,margin:0,letterSpacing:"-.02em"}}>Open Co-Deliver.</h2>
              <p style={{fontFamily:SANS,fontSize:".78rem",color:B.textMuted,lineHeight:1.6,margin:".65rem 0 0"}}>
                Timecoded review links, version control, approval tracking, and client-safe final delivery — built for agency-client teams.
              </p>
            </div>
            {error&&<div style={{color:B.error,fontSize:".82rem",marginBottom:".9rem",padding:".5rem .75rem",borderRadius:8,background:"rgba(222,118,118,0.08)",border:"1px solid rgba(222,118,118,0.2)",fontFamily:SANS}}>{error}</div>}
            <form onSubmit={handleLogin} style={{display:"grid",gap:".65rem"}}>
              <div style={{display:"flex",flexDirection:"column",gap:".28rem"}}>
                <label style={labelStyle}>Email</label>
                <input name="email" type="email" required autoComplete="email" style={inputStyle} onFocus={onFocus} onBlur={onBlur}/>
              </div>
              <div style={{display:"flex",flexDirection:"column",gap:".28rem"}}>
                <label style={labelStyle}>Password</label>
                <input name="password" type="password" required autoComplete="current-password" style={inputStyle} onFocus={onFocus} onBlur={onBlur}/>
              </div>
              <button type="submit" disabled={loading} style={{
                marginTop:".5rem",background:loading?B.accentDim:B.accent,color:"#fff",border:"none",
                borderRadius:8,padding:".7rem 1.6rem",fontSize:".82rem",fontWeight:700,fontFamily:SANS,
                letterSpacing:".08em",textTransform:"uppercase",cursor:loading?"wait":"pointer",
                transition:"background 160ms ease,transform 120ms ease,opacity 140ms ease",
                opacity:loading?0.7:1,width:"100%",
              }}
                onMouseEnter={e=>{if(!loading)e.currentTarget.style.transform="translateY(-1px)";}}
                onMouseLeave={e=>{e.currentTarget.style.transform="none";}}
              >{loading?"Signing in…":"Sign in"}</button>
            </form>
            <p style={{marginTop:"1.25rem",fontFamily:SANS,fontSize:".72rem",color:B.textMuted,lineHeight:1.6,textAlign:"center"}}>
              Review links are public and token-based. AI transcription and comment summaries should be described as beta features.
            </p>
            <p style={{marginTop:".5rem",fontFamily:SANS,fontSize:".72rem",color:B.periwinkle,lineHeight:1.6,textAlign:"center"}}>
              <a href="https://contentco-op.com/suite#co-deliver" style={{color:"inherit",textDecoration:"none"}}>See the full Co-Apps workflow ↗</a>
            </p>
          </div>
        </div>
      </main>
    </>
  );
}
