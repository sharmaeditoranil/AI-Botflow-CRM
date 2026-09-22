"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";
import type { Contact, Deal, ContactNote, Tag } from "@/types";
import {
  Phone,
  Mail,
  Copy,
  Check,
  User,
  Tag as TagIcon,
  DollarSign,
  StickyNote,
  Plus,
  Brain,
  ShieldAlert,
  Flame,
  Zap,
  Target,
  ThumbsUp,
  Star,
  Bot,
  Calendar,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { format } from "date-fns";
import { useTranslations } from "next-intl";
import { contactHandle } from "@/lib/whatsapp/wa-identity";
import { ContactTagBar } from "./contact-tag-bar";
import { toast } from "sonner";

interface ContactSidebarProps {
  contact: Contact | null;
}

export function ContactSidebar({ contact }: ContactSidebarProps) {
  const tSidebar = useTranslations("Inbox.sidebar");
  const tThread = useTranslations("Inbox.messageThread");

  const { accountId } = useAuth();
  const [copied, setCopied] = useState(false);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [notes, setNotes] = useState<ContactNote[]>([]);
  const [tags, setTags] = useState<(Tag & { contact_tag_id: string })[]>([]);
  const [newNote, setNewNote] = useState("");
  const [addingNote, setAddingNote] = useState(false);
  const [liveContact, setLiveContact] = useState<Partial<Contact> | null>(null);

  const fetchContactData = useCallback(async () => {
    if (!contact) return;

    const supabase = createClient();

    // Fetch contact details (status, memory), deals, notes, and tags in parallel
    const [contactRes, dealsRes, notesRes, tagsRes] = await Promise.all([
      supabase
        .from("contacts")
        .select("is_opted_out, lead_status, lead_score, ai_memory")
        .eq("id", contact.id)
        .maybeSingle(),
      supabase
        .from("deals")
        .select("*, stage:pipeline_stages(*)")
        .eq("contact_id", contact.id)
        .order("created_at", { ascending: false }),
      supabase
        .from("contact_notes")
        .select("*")
        .eq("contact_id", contact.id)
        .order("created_at", { ascending: false }),
      supabase
        .from("contact_tags")
        .select("id, tag_id, tags(*)")
        .eq("contact_id", contact.id),
    ]);

    if (contactRes.data) setLiveContact(contactRes.data);
    if (dealsRes.data) setDeals(dealsRes.data);
    if (notesRes.data) setNotes(notesRes.data);
    if (tagsRes.data) {
      const mapped = tagsRes.data
        .filter((ct: Record<string, unknown>) => ct.tags)
        .map((ct: Record<string, unknown>) => ({
          ...(ct.tags as Tag),
          contact_tag_id: ct.id as string,
        }));
      setTags(mapped);
    }
  }, [contact]);

  // Load on contact change. setContactData/setTags run inside async
  // Supabase callbacks, not synchronously in the effect body.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchContactData();
  }, [fetchContactData]);

  const handleCopyPhone = useCallback(async () => {
    // Copies whatever the row displays — a BSUID-only contact has no
    // phone number to copy, but its @username still identifies them.
    const handle = contact ? contactHandle(contact) : '';
    if (!handle) return;
    await navigator.clipboard.writeText(handle);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    // Dep is the whole `contact` object (not `contact?.phone`) so the
    // React Compiler's inference agrees with the manual dep list —
    // fixes the `preserve-manual-memoization` lint error.
  }, [contact]);

  const handleAddNote = useCallback(async () => {
    if (!contact || !newNote.trim()) return;
    if (!accountId) return;
    setAddingNote(true);

    const supabase = createClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const user = session?.user;

    const { data, error } = await supabase
      .from("contact_notes")
      .insert({
        contact_id: contact.id,
        account_id: accountId,
        user_id: user?.id,
        note_text: newNote.trim(),
      })
      .select()
      .single();

    if (!error && data) {
      setNotes((prev) => [data, ...prev]);
      const addedText = newNote.trim();
      setNewNote("");

      // 2-Way Sync: Append note to active CRM Pipeline Deal
      if (deals.length > 0) {
        const activeDeal = deals[0];
        const updatedDealNotes = ((activeDeal as any).notes || "") + `\n[Note ${new Date().toLocaleDateString()}]: ${addedText}`;
        supabase
          .from("deals")
          .update({ notes: updatedDealNotes })
          .eq("id", activeDeal.id)
          .then();
      }
    }
    setAddingNote(false);
  }, [contact, newNote, accountId, deals]);

  const handleSendCsat = async () => {
    if (!contact) return;
    try {
      toast.info("Sending CSAT Survey to customer...");
      const res = await fetch("/api/csat/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contactId: contact.id }),
      });
      if (res.ok) {
        toast.success("1-5 Star CSAT Survey sent to WhatsApp!");
      } else {
        toast.error("Failed to send survey.");
      }
    } catch (e: any) {
      toast.error(e.message || "Error sending CSAT");
    }
  };

  const handleCreateDeal = async () => {
    if (!contact || !accountId) return;
    const supabase = createClient();
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const user = session?.user;
      if (!user) return;

      const { data: pipeline } = await supabase
        .from("pipelines")
        .select("id, stages:pipeline_stages(id, position)")
        .eq("user_id", user.id)
        .limit(1)
        .maybeSingle();

      if (!pipeline || !pipeline.stages || (pipeline.stages as any[]).length === 0) {
        toast.error("Please configure a pipeline first under Pipelines.");
        return;
      }

      const firstStage = (pipeline.stages as any[]).sort((a, b) => a.position - b.position)[0];
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);

      const { error } = await supabase.from("deals").insert({
        user_id: user.id,
        pipeline_id: pipeline.id,
        stage_id: firstStage.id,
        contact_id: contact.id,
        title: `Deal: ${contact.name || contact.phone || "Customer"}`,
        value: 5000,
        currency: "INR",
        status: "active",
        expected_close_date: tomorrow.toISOString().split("T")[0],
        notes: "Created from Inbox chat.",
        ai_followup_enabled: true,
      });

      if (!error) {
        toast.success("New deal created in Pipeline!");
        fetchContactData();
      } else {
        toast.error(error.message);
      }
    } catch (err: any) {
      toast.error(err.message || "Error creating deal");
    }
  };

  const handleTriggerAiFollowup = async (dealId: string) => {
    try {
      toast.info("AI is crafting and sending follow-up message...");
      const res = await fetch("/api/crm/ai-followup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dealId }),
      });
      const data = await res.json();
      if (res.ok && data.processed > 0) {
        toast.success("AI Follow-up message sent on WhatsApp!");
        fetchContactData();
      } else {
        toast.info("Follow-up checked.");
      }
    } catch (e: any) {
      toast.error(e.message || "Error triggering AI follow-up");
    }
  };

  if (!contact) {
    return (
      <div className="flex h-full w-70 items-center justify-center border-l border-border bg-card">
        <p className="text-sm text-muted-foreground">{tThread("selectConversation")}</p>
      </div>
    );
  }

  const displayName = contact.name || contactHandle(contact);
  const initials = displayName.charAt(0).toUpperCase();

  const isOptedOut = liveContact?.is_opted_out ?? contact.is_opted_out;
  const leadStatus = liveContact?.lead_status ?? contact.lead_status ?? 'new';
  const leadScore = liveContact?.lead_score ?? contact.lead_score ?? 0;
  const aiMemory = liveContact?.ai_memory ?? contact.ai_memory;

  return (
    <div className="flex h-full w-70 flex-col border-l border-border bg-card">
      <ScrollArea className="flex-1">
        <div className="p-4">
          {/* Contact Info */}
          <div className="flex flex-col items-center text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted text-lg font-semibold text-foreground">
              {contact.avatar_url ? (
                <img
                  src={contact.avatar_url}
                  alt={displayName}
                  className="h-16 w-16 rounded-full object-cover"
                />
              ) : (
                initials
              )}
            </div>
            <h3 className="mt-3 text-sm font-semibold text-foreground">
              {displayName}
            </h3>
            {contact.company && (
              <p className="text-xs text-muted-foreground">{contact.company}</p>
            )}

            {/* Lead Status / Opt-Out Badge */}
            {isOptedOut ? (
              <div className="mt-2 inline-flex items-center gap-1 rounded-full bg-red-500/10 px-2.5 py-0.5 text-[11px] font-semibold text-destructive dark:text-red-400 border border-red-200 dark:border-red-900/50">
                <ShieldAlert className="h-3 w-3" />
                Opted Out
              </div>
            ) : leadStatus === 'qualified' ? (
              <div className="mt-2 inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-900/50">
                <Target className="h-3 w-3" />
                Qualified ({leadScore})
              </div>
            ) : leadStatus === 'hot' ? (
              <div className="mt-2 inline-flex items-center gap-1 rounded-full bg-orange-500/10 px-2.5 py-0.5 text-[11px] font-semibold text-orange-600 dark:text-orange-400 border border-orange-200 dark:border-orange-900/50">
                <Flame className="h-3 w-3" />
                Hot Lead ({leadScore})
              </div>
            ) : leadStatus === 'warm' ? (
              <div className="mt-2 inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2.5 py-0.5 text-[11px] font-semibold text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-900/50">
                <Zap className="h-3 w-3" />
                Warm Lead ({leadScore})
              </div>
            ) : leadStatus === 'interested' ? (
              <div className="mt-2 inline-flex items-center gap-1 rounded-full bg-blue-500/10 px-2.5 py-0.5 text-[11px] font-semibold text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-900/50">
                <ThumbsUp className="h-3 w-3" />
                Interested ({leadScore})
              </div>
            ) : null}
          </div>

          {/* Phone */}
          <div className="mt-4 space-y-2">
            <button
              onClick={handleCopyPhone}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted"
            >
              <Phone className="h-4 w-4 text-muted-foreground" />
              <span className="flex-1 text-left">
                {contactHandle(contact)}
              </span>
              {copied ? (
                <Check className="h-3 w-3 text-primary" />
              ) : (
                <Copy className="h-3 w-3 text-muted-foreground" />
              )}
            </button>

            {contact.email && (
              <div className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-muted-foreground">
                <Mail className="h-4 w-4 text-muted-foreground" />
                <span className="truncate">{contact.email}</span>
              </div>
            )}
          </div>

          {/* Divider */}
          <div className="my-4 border-t border-border" />

          {/* AI Memory & Context */}
          {aiMemory && (
            <>
              <div>
                <div className="flex items-center gap-2 px-1 text-xs font-medium uppercase tracking-wider text-purple-600 dark:text-purple-400">
                  <Brain className="h-3.5 w-3.5" />
                  AI Memory & Context
                </div>
                <div className="mt-2 rounded-lg border border-purple-200/70 bg-purple-500/5 p-2.5 dark:border-purple-900/50">
                  <p className="text-xs text-foreground/90 leading-relaxed whitespace-pre-wrap">
                    {aiMemory}
                  </p>
                </div>
              </div>
              <div className="my-4 border-t border-border" />
            </>
          )}

          {/* Tags */}
          <div>
            <div className="flex items-center gap-2 px-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">
              <TagIcon className="h-3 w-3" />
              {tSidebar("tags")}
            </div>
            <div className="mt-2">
              <ContactTagBar
                contactId={contact.id}
                onTagsUpdated={fetchContactData}
              />
            </div>
          </div>

          {/* Divider */}
          <div className="my-4 border-t border-border" />

          {/* Quick CSAT Survey Trigger */}
          <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                <Star className="h-3.5 w-3.5 text-amber-500 fill-amber-500" />
                Customer Satisfaction
              </span>
              <span className="text-[10px] text-muted-foreground">Google Review</span>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={handleSendCsat}
              className="w-full h-8 text-xs gap-1.5 border-amber-500/30 text-amber-600 dark:text-amber-400 hover:bg-amber-500/10"
            >
              <Star className="h-3 w-3 fill-amber-500" />
              Send 1-5 ⭐ CSAT Survey
            </Button>
          </div>

          {/* Divider */}
          <div className="my-4 border-t border-border" />

          {/* Active Deals / CRM Pipeline Sync */}
          <div>
            <div className="flex items-center justify-between px-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">
              <span className="flex items-center gap-2">
                <DollarSign className="h-3 w-3" />
                {tSidebar("deals")}
              </span>
              <button
                type="button"
                onClick={handleCreateDeal}
                className="text-[11px] text-primary hover:underline flex items-center gap-1 lowercase font-normal"
              >
                <Plus className="h-3 w-3" /> Add Deal
              </button>
            </div>
            <div className="mt-2 space-y-2">
              {deals.length === 0 ? (
                <div className="rounded-lg border border-dashed border-border p-3 text-center space-y-2">
                  <p className="text-xs text-muted-foreground">{tSidebar("noDeals")}</p>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleCreateDeal}
                    className="text-xs h-7 gap-1 border-primary/30 text-primary hover:bg-primary/10"
                  >
                    <Plus className="h-3 w-3" />
                    + Add to Pipeline
                  </Button>
                </div>
              ) : (
                deals.map((deal) => (
                  <div
                    key={deal.id}
                    className="rounded-lg bg-muted px-3 py-2 space-y-1.5 border border-border/60"
                  >
                    <div className="flex items-start justify-between gap-1">
                      <p className="text-xs font-bold text-foreground truncate">
                        {deal.title}
                      </p>
                      {deal.stage && (
                        <span
                          className="rounded-full px-1.5 py-0.5 text-[10px] font-semibold shrink-0"
                          style={{
                            backgroundColor: `${deal.stage.color}20`,
                            color: deal.stage.color,
                          }}
                        >
                          {deal.stage.name}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span className="font-semibold text-foreground">
                        {deal.currency ?? "₹"}
                        {deal.value.toLocaleString('en-IN')}
                      </span>
                      {deal.expected_close_date && (
                        <span className="text-[10px] flex items-center gap-1 text-muted-foreground">
                          <Calendar className="h-3 w-3 text-primary" />
                          Follow-up: {new Date(deal.expected_close_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}
                        </span>
                      )}
                    </div>

                    {/* AI Follow-up action */}
                    <div className="pt-1 border-t border-border/50 flex justify-end">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleTriggerAiFollowup(deal.id)}
                        className="h-6 px-2 text-[10px] text-purple-500 hover:text-purple-400 hover:bg-purple-500/10 gap-1"
                        title="Send AI personalized follow-up message to this customer now"
                      >
                        <Bot className="h-3 w-3" />
                        Send AI Follow-up Now
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Divider */}
          <div className="my-4 border-t border-border" />

          {/* Notes */}
          <div>
            <div className="flex items-center gap-2 px-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">
              <StickyNote className="h-3 w-3" />
              {tSidebar("notes")}
            </div>
            <div className="mt-2">
              <div className="flex gap-2">
                <textarea
                  value={newNote}
                  onChange={(e) => setNewNote(e.target.value)}
                  placeholder={tSidebar("addNotePlaceholder")}
                  rows={2}
                  className="flex-1 resize-none rounded-lg border border-border bg-muted px-3 py-2 text-xs text-foreground placeholder-muted-foreground outline-none focus:border-primary/50"
                />
                <Button
                  size="sm"
                  className="h-auto bg-primary px-2 hover:bg-primary/90"
                  onClick={handleAddNote}
                  disabled={!newNote.trim() || addingNote}
                >
                  <Plus className="h-3 w-3" />
                </Button>
              </div>

              <div className="mt-2 space-y-2">
                {notes.map((note) => (
                  <div
                    key={note.id}
                    className="rounded-lg bg-muted px-3 py-2"
                  >
                    <p className="whitespace-pre-wrap text-xs text-muted-foreground">
                      {note.note_text}
                    </p>
                    <p className="mt-1 text-[10px] text-muted-foreground">
                      {format(new Date(note.created_at), "MMM d, yyyy HH:mm")}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </ScrollArea>
    </div>
  );
}
