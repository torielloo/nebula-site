import React from "react";
import UserQuickCard from "@/components/users/UserQuickCard";
import { cn } from "@/lib/utils";

function escapeRegExp(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export default function MentionText({ text, mentions = [], className, mentionClassName }) {
  const value = String(text || "");
  if (!value) return null;

  const normalized = (mentions || [])
    .filter((item) => item?.id && item?.name)
    .map((item) => ({ id: item.id, name: String(item.name).trim() }))
    .filter((item) => item.name)
    .sort((a, b) => b.name.length - a.name.length);

  if (!normalized.length) {
    return <span className={className}>{value}</span>;
  }

  const pattern = normalized.map((item) => `@${escapeRegExp(item.name)}`).join("|");
  const regex = new RegExp(`(${pattern})`, "giu");
  const byToken = new Map(normalized.map((item) => [`@${item.name}`.toLocaleLowerCase("pt-BR"), item]));

  return (
    <span className={className}>
      {value.split(regex).map((part, index) => {
        const item = byToken.get(String(part).toLocaleLowerCase("pt-BR"));
        if (!item) return <React.Fragment key={index}>{part}</React.Fragment>;
        return (
          <UserQuickCard key={`${item.id}-${index}`} userId={item.id} align="start">
            <button
              type="button"
              className={cn("inline rounded-md px-1 font-bold underline-offset-2 hover:underline", mentionClassName)}
            >
              {part}
            </button>
          </UserQuickCard>
        );
      })}
    </span>
  );
}
