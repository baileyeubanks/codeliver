"use client";

import { useState } from "react";
import {
  Mail,
  Link2,
  MessageSquare,
  Download,
  Lock,
  Copy,
  Send,
  Users,
  AlertTriangle,
  CheckCircle,
} from "lucide-react";

interface SharePanelProps {
  onShare: (config: ShareConfig) => void;
}

interface ShareConfig {
  mode: "review" | "approval" | "preview";
  method: "email" | "url";
  emails: string[];
  message: string;
  allowComments: boolean;
  allowDownloads: boolean;
  passwordProtected: boolean;
  sendCopy: boolean;
}

export default function SharePanel({ onShare }: SharePanelProps) {
  const [mode, setMode] = useState<"review" | "approval" | "preview">("review");
  const [method, setMethod] = useState<"email" | "url">("email");
  const [emailInput, setEmailInput] = useState("");
  const [emails, setEmails] = useState<string[]>([]);
  const [message, setMessage] = useState("");
  const [allowComments, setAllowComments] = useState(true);
  const [allowDownloads, setAllowDownloads] = useState(false);
  const [passwordProtected, setPasswordProtected] = useState(false);
  const [sendCopy, setSendCopy] = useState(false);
  const [createdUrl, setCreatedUrl] = useState("");

  function addEmail() {
    const e = emailInput.trim();
    if (e && !emails.includes(e)) {
      setEmails([...emails, e]);
    }
    setEmailInput("");
  }

  function removeEmail(email: string) {
    setEmails(emails.filter((e) => e !== email));
  }

  function handleShare() {
    if (method === "url") {
      setCreatedUrl(`${window.location.origin}/review/demo-token`);
    }
    onShare({
      mode,
      method,
      emails,
      message,
      allowComments,
      allowDownloads,
      passwordProtected,
      sendCopy,
    });
  }

  return (
    <div className="space-y-5">
      {/* Mode tabs */}
      <div className="tabs">
        {(["review", "approval", "preview"] as const).map((m) => (
          <button
            key={m}
            className={`tab flex-1 capitalize ${mode === m ? "active" : ""}`}
            onClick={() => setMode(m)}
          >
            {m}
          </button>
        ))}
      </div>

      {/* Settings */}
      <div className="space-y-3">
        {(mode === "approval" || mode === "preview") && (
          <div className="flex items-center justify-between">
            <span className="text-sm flex items-center gap-2">
              <MessageSquare size={14} /> Allow comments
            </span>
            <button
              className={`toggle ${allowComments ? "on" : ""}`}
              onClick={() => setAllowComments(!allowComments)}
            />
          </div>
        )}
        <div className="flex items-center justify-between">
          <span className="text-sm flex items-center gap-2">
            <Download size={14} /> Allow downloads
          </span>
          <button
            className={`toggle ${allowDownloads ? "on" : ""}`}
            onClick={() => setAllowDownloads(!allowDownloads)}
          />
        </div>
        <div className="flex items-center justify-between">
          <span className="text-sm flex items-center gap-2">
            <Lock size={14} /> Password protection
          </span>
          <button
            className={`toggle ${passwordProtected ? "on" : ""}`}
            onClick={() => setPasswordProtected(!passwordProtected)}
          />
        </div>
      </div>

      {/* Share via radio */}
      <div className="space-y-2">
        <p className="kicker">Share via</p>
        <div className="flex gap-4">
          <label className="flex items-center gap-2 cursor-pointer text-sm">
            <input
              type="radio"
              checked={method === "email"}
              onChange={() => { setMethod("email"); setCreatedUrl(""); }}
              className="accent-[var(--accent)]"
            />
            <Mail size={14} /> Email
          </label>
          <label className="flex items-center gap-2 cursor-pointer text-sm">
            <input
              type="radio"
              checked={method === "url"}
              onChange={() => { setMethod("url"); setCreatedUrl(""); }}
              className="accent-[var(--accent)]"
            />
            <Link2 size={14} /> URL
          </label>
        </div>
      </div>

      {method === "email" ? (
        <div className="space-y-3">
          {/* Email input */}
          <div>
            <div className="flex flex-wrap gap-1 mb-2">
              {emails.map((e) => (
                <span key={e} className="badge badge-version text-xs">
                  {e}
                  <button onClick={() => removeEmail(e)} className="ml-1 hover:text-[var(--red)]">×</button>
                </span>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                type="email"
                placeholder="Email address"
                value={emailInput}
                onChange={(e) => setEmailInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addEmail()}
                className="input flex-1"
              />
              <button className="btn-icon" onClick={addEmail} title="Add contact">
                <Users size={14} />
              </button>
            </div>
          </div>

          {/* Message */}
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Optional message..."
            rows={3}
            className="input"
            style={{ resize: "vertical" }}
          />

          <label className="flex items-center gap-2 text-xs text-[var(--muted)] cursor-pointer">
            <input
              type="checkbox"
              checked={sendCopy}
              onChange={(e) => setSendCopy(e.target.checked)}
              className="accent-[var(--accent)]"
            />
            Email a copy to myself
          </label>

          <button onClick={handleShare} className="btn btn-primary w-full">
            <Send size={14} /> Send
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {!createdUrl && (
            <>
              <div className="flex items-center gap-2 text-xs text-[var(--orange)] bg-[var(--orange-dim)] p-3 rounded-lg">
                <AlertTriangle size={14} />
                Anyone with this link will be able to access the media
              </div>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Optional message..."
                rows={2}
                className="input"
                style={{ resize: "vertical" }}
              />
              <button onClick={handleShare} className="btn btn-primary w-full">
                <Link2 size={14} /> Create URL
              </button>
            </>
          )}

          {createdUrl && (
            <div className="space-y-3">
              <div className="space-y-2 text-xs text-[var(--muted)]">
                <div className="flex items-center gap-2">
                  <CheckCircle size={12} className="text-[var(--accent)]" />
                  {mode === "approval" ? "Approval requested" : "Review enabled"}
                </div>
                {allowComments && (
                  <div className="flex items-center gap-2">
                    <CheckCircle size={12} className="text-[var(--accent)]" />
                    Comments are allowed
                  </div>
                )}
                {allowDownloads && (
                  <div className="flex items-center gap-2">
                    <CheckCircle size={12} className="text-[var(--accent)]" />
                    Media can be downloaded
                  </div>
                )}
              </div>

              <div className="flex items-center gap-2">
                <input
                  readOnly
                  value={createdUrl}
                  className="input flex-1"
                  style={{ fontSize: "0.75rem" }}
                />
                <button
                  onClick={() => navigator.clipboard.writeText(createdUrl)}
                  className="btn btn-secondary"
                >
                  <Copy size={13} /> Copy
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
