"use client";

import { useState } from "react";
import { Save, Tag, Bell, HelpCircle, ExternalLink, FileText } from "lucide-react";

interface InfoPanelProps {
  title: string;
  description: string;
  tags: string[];
  notificationsOn: boolean;
  onSave: (data: { title: string; description: string; tags: string[] }) => void;
}

export default function InfoPanel({
  title: initialTitle,
  description: initialDesc,
  tags: initialTags,
  notificationsOn,
  onSave,
}: InfoPanelProps) {
  const [title, setTitle] = useState(initialTitle);
  const [description, setDescription] = useState(initialDesc);
  const [tagInput, setTagInput] = useState("");
  const [tags, setTags] = useState(initialTags);
  const [notifs, setNotifs] = useState(notificationsOn);

  function addTag() {
    const t = tagInput.trim();
    if (t && !tags.includes(t)) {
      setTags([...tags, t]);
    }
    setTagInput("");
  }

  function removeTag(tag: string) {
    setTags(tags.filter((t) => t !== tag));
  }

  return (
    <div className="space-y-6">
      {/* Title */}
      <div>
        <label className="kicker block mb-2">Title</label>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="input"
        />
      </div>

      {/* Description */}
      <div>
        <label className="kicker block mb-2">Description</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Add description"
          rows={3}
          className="input"
          style={{ resize: "vertical" }}
        />
      </div>

      {/* Tags */}
      <div>
        <label className="kicker block mb-2">Tags</label>
        <div className="flex flex-wrap gap-2 mb-2">
          {tags.map((tag) => (
            <span
              key={tag}
              className="badge badge-version flex items-center gap-1"
            >
              <Tag size={10} />
              {tag}
              <button
                onClick={() => removeTag(tag)}
                className="ml-1 hover:text-[var(--red)]"
              >
                ×
              </button>
            </span>
          ))}
        </div>
        <input
          type="text"
          value={tagInput}
          onChange={(e) => setTagInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && addTag()}
          placeholder="Add tags"
          className="input"
        />
      </div>

      <button
        onClick={() => onSave({ title, description, tags })}
        className="btn btn-primary w-full"
      >
        <Save size={14} /> Save
      </button>

      {/* Notifications */}
      <div className="border-t border-[var(--border)] pt-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium">Comment notifications</p>
            <p className="text-xs text-[var(--muted)] mt-0.5">
              Receive email notifications for new comments
            </p>
          </div>
          <button
            className={`toggle ${notifs ? "on" : ""}`}
            onClick={() => setNotifs(!notifs)}
          />
        </div>
      </div>

      {/* Help links */}
      <div className="border-t border-[var(--border)] pt-4 space-y-2">
        <p className="kicker mb-2">Help & Support</p>
        <a href="#" className="flex items-center gap-2 text-sm text-[var(--blue)] hover:underline">
          <HelpCircle size={14} /> How to leave feedback
        </a>
        <a href="#" className="flex items-center gap-2 text-sm text-[var(--blue)] hover:underline">
          <FileText size={14} /> Keyboard shortcuts
        </a>
        <a href="#" className="flex items-center gap-2 text-sm text-[var(--blue)] hover:underline">
          <ExternalLink size={14} /> Support articles
        </a>
      </div>
    </div>
  );
}
