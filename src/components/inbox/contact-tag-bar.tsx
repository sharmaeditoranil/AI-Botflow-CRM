"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { addContactTag, deleteContactTag } from "@/lib/contacts/tag-api";
import type { Tag } from "@/types";
import { Tag as TagIcon, Plus, X, Check, Loader2, Search } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const PRESET_TAG_COLORS = [
  "#6366f1", // Indigo
  "#10b981", // Emerald
  "#f59e0b", // Amber
  "#3b82f6", // Blue
  "#ec4899", // Pink
  "#8b5cf6", // Violet
  "#06b6d4", // Cyan
  "#f97316", // Orange
];

interface ContactTagBarProps {
  contactId: string;
  className?: string;
  onTagsUpdated?: () => void;
}

export function ContactTagBar({
  contactId,
  className,
  onTagsUpdated,
}: ContactTagBarProps) {
  const { user, accountId } = useAuth();
  const [assignedTags, setAssignedTags] = useState<Tag[]>([]);
  const [allTags, setAllTags] = useState<Tag[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [creating, setCreating] = useState(false);
  const [open, setOpen] = useState(false);

  const fetchTags = useCallback(async () => {
    if (!contactId) return;
    try {
      const supabase = createClient();
      const [assignedRes, allRes] = await Promise.all([
        supabase
          .from("contact_tags")
          .select("id, tag_id, tags(*)")
          .eq("contact_id", contactId),
        supabase.from("tags").select("*").order("name"),
      ]);

      if (assignedRes.data) {
        const mapped = assignedRes.data
          .filter((ct: Record<string, unknown>) => ct.tags)
          .map((ct: Record<string, unknown>) => ct.tags as Tag);
        setAssignedTags(mapped);
      }
      if (allRes.data) {
        setAllTags(allRes.data);
      }
    } catch (err) {
      console.error("Failed to fetch contact tags:", err);
    } finally {
      setLoading(false);
    }
  }, [contactId]);

  useEffect(() => {
    setLoading(true);
    fetchTags();
  }, [fetchTags]);

  const handleRemove = async (tagId: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    // Optimistic removal
    setAssignedTags((prev) => prev.filter((t) => t.id !== tagId));
    try {
      await deleteContactTag(contactId, tagId);
      onTagsUpdated?.();
    } catch (err) {
      console.error("Failed to remove tag:", err);
      toast.error("Failed to remove tag");
      fetchTags();
    }
  };

  const handleAdd = async (tag: Tag) => {
    // Optimistic add
    setAssignedTags((prev) => [...prev, tag]);
    try {
      await addContactTag(contactId, tag.id);
      onTagsUpdated?.();
    } catch (err) {
      console.error("Failed to add tag:", err);
      toast.error("Failed to add tag");
      fetchTags();
    }
  };

  const handleCreateAndAdd = async () => {
    const trimmed = search.trim();
    if (!trimmed || !user || !accountId) return;
    setCreating(true);

    try {
      const supabase = createClient();
      const randomColor =
        PRESET_TAG_COLORS[Math.floor(Math.random() * PRESET_TAG_COLORS.length)];

      const { data: newTag, error } = await supabase
        .from("tags")
        .insert({
          user_id: user.id,
          account_id: accountId,
          name: trimmed,
          color: randomColor,
        })
        .select()
        .single();

      if (error) throw error;
      if (newTag) {
        setAllTags((prev) => [...prev, newTag]);
        await handleAdd(newTag);
        setSearch("");
      }
    } catch (err) {
      console.error("Failed to create tag:", err);
      toast.error("Failed to create tag");
    } finally {
      setCreating(false);
    }
  };

  const filteredTags = useMemo(() => {
    const query = search.toLowerCase().trim();
    if (!query) return allTags;
    return allTags.filter((t) => t.name.toLowerCase().includes(query));
  }, [allTags, search]);

  const hasExactMatch = useMemo(() => {
    const query = search.toLowerCase().trim();
    return allTags.some((t) => t.name.toLowerCase() === query);
  }, [allTags, search]);

  return (
    <div
      className={cn(
        "flex items-center gap-1.5 flex-wrap min-w-0 transition-all",
        className
      )}
    >
      <TagIcon className="h-3 w-3 text-muted-foreground shrink-0" />

      {/* Assigned Tags List */}
      {assignedTags.map((tag) => (
        <span
          key={tag.id}
          className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium transition-all shadow-2xs group"
          style={{
            backgroundColor: `${tag.color}20`,
            color: tag.color,
            border: `1px solid ${tag.color}40`,
          }}
        >
          <span className="truncate max-w-[120px]">{tag.name}</span>
          <button
            type="button"
            onClick={(e) => handleRemove(tag.id, e)}
            className="rounded-full p-0.5 opacity-70 hover:opacity-100 hover:bg-black/10 dark:hover:bg-white/10 transition-colors cursor-pointer"
            title={`Remove ${tag.name}`}
          >
            <X className="h-2.5 w-2.5" />
          </button>
        </span>
      ))}

      {/* Add Tag Dropdown / Popover */}
      <DropdownMenu open={open} onOpenChange={setOpen}>
        <DropdownMenuTrigger
          className="inline-flex items-center gap-1 rounded-full border border-dashed border-border px-2 py-0.5 text-[11px] font-medium text-muted-foreground hover:border-primary/50 hover:text-foreground hover:bg-muted/40 transition-colors cursor-pointer"
          title="Add or remove tags"
        >
          <Plus className="h-2.5 w-2.5" />
          <span>Tag</span>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="start"
          className="w-52 p-1.5 border-border bg-popover shadow-lg"
        >
          {/* Search Box */}
          <div className="relative mb-1.5">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search or add tag..."
              className="w-full bg-muted pl-7 pr-2 py-1 text-xs rounded border border-border text-foreground placeholder:text-muted-foreground outline-none focus:border-primary/50"
              onClick={(e) => e.stopPropagation()}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !hasExactMatch && search.trim()) {
                  e.preventDefault();
                  handleCreateAndAdd();
                }
              }}
            />
          </div>

          {/* Tags List */}
          <div className="max-h-48 overflow-y-auto space-y-0.5">
            {filteredTags.map((tag) => {
              const isAssigned = assignedTags.some((t) => t.id === tag.id);
              return (
                <button
                  key={tag.id}
                  type="button"
                  onClick={() => {
                    if (isAssigned) {
                      handleRemove(tag.id);
                    } else {
                      handleAdd(tag);
                    }
                  }}
                  className={cn(
                    "w-full flex items-center justify-between px-2 py-1.5 rounded text-xs text-left transition-colors hover:bg-muted/70 cursor-pointer",
                    isAssigned && "bg-primary/5 font-medium"
                  )}
                >
                  <span className="flex items-center gap-2 truncate">
                    <span
                      className="h-2.5 w-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: tag.color }}
                    />
                    <span className="truncate text-foreground">{tag.name}</span>
                  </span>
                  {isAssigned && (
                    <Check className="h-3 w-3 text-primary shrink-0" />
                  )}
                </button>
              );
            })}

            {filteredTags.length === 0 && !search.trim() && (
              <p className="px-2 py-2 text-[11px] text-muted-foreground text-center">
                No tags created yet
              </p>
            )}

            {/* Create new tag option */}
            {search.trim() && !hasExactMatch && (
              <button
                type="button"
                onClick={handleCreateAndAdd}
                disabled={creating}
                className="w-full flex items-center gap-1.5 px-2 py-1.5 mt-1 border-t border-border/50 text-xs text-primary font-medium hover:bg-primary/10 rounded transition-colors cursor-pointer"
              >
                {creating ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Plus className="h-3 w-3" />
                )}
                <span className="truncate">Create &quot;{search.trim()}&quot;</span>
              </button>
            )}
          </div>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
