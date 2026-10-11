"use client";

import { useState } from "react";
import { X } from "lucide-react";

const MAX_TAGS = 50;

interface TagInputProps {
  value: string[];
  onChange: (value: string[]) => void;
  placeholder?: string;
  testId: string;
}

export default function TagInput({
  value,
  onChange,
  placeholder,
  testId,
}: TagInputProps) {
  const [draft, setDraft] = useState("");

  const addTag = (raw: string) => {
    const tag = raw.trim();
    if (!tag) return;
    if (value.length >= MAX_TAGS) return;
    if (value.some((existing) => existing.toLowerCase() === tag.toLowerCase())) {
      return;
    }
    onChange([...value, tag]);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter" || event.key === ",") {
      event.preventDefault();
      addTag(draft);
      setDraft("");
    } else if (event.key === "Backspace" && draft === "" && value.length > 0) {
      onChange(value.slice(0, -1));
    }
  };

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const next = event.target.value;
    if (next.includes(",")) {
      const parts = next.split(",");
      const rest = parts.pop() ?? "";
      let current = value;
      for (const part of parts) {
        const tag = part.trim();
        if (
          tag &&
          current.length < MAX_TAGS &&
          !current.some((t) => t.toLowerCase() === tag.toLowerCase())
        ) {
          current = [...current, tag];
        }
      }
      if (current !== value) onChange(current);
      setDraft(rest);
      return;
    }
    setDraft(next);
  };

  return (
    <div className="flex w-full flex-wrap items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-2.5 py-2 text-sm focus-within:ring-2 focus-within:ring-blue-500">
      {value.map((tag) => (
        <span
          key={tag}
          data-testid={`${testId}-tag`}
          className="inline-flex items-center gap-1 rounded-lg bg-blue-50 px-2 py-1 text-xs font-semibold text-blue-700"
        >
          {tag}
          <button
            type="button"
            aria-label={`Remove ${tag}`}
            onClick={() => onChange(value.filter((t) => t !== tag))}
            className="rounded p-0.5 text-blue-400 hover:bg-blue-100 hover:text-blue-700"
          >
            <X className="h-3 w-3" />
          </button>
        </span>
      ))}
      <input
        data-testid={testId}
        value={draft}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onBlur={() => {
          if (draft.trim()) {
            addTag(draft);
            setDraft("");
          }
        }}
        placeholder={value.length === 0 ? placeholder : undefined}
        className="min-w-[8rem] flex-1 bg-transparent py-1 outline-none"
      />
    </div>
  );
}
