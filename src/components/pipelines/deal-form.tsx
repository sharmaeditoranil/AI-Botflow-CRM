"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { CURRENCIES } from "@/lib/currency";
import type {
  Contact,
  Conversation,
  Deal,
  DealStatus,
  PipelineStage,
  Profile,
} from "@/types";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Check,
  X,
  Trash2,
  MessageSquare,
  DollarSign,
  Loader2,
  Bot,
  Send,
  Sparkles,
  History,
  Plus,
  FileText,
  ChevronDown,
  ChevronUp,
  Clock,
} from "lucide-react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { AssignAutomationWidget } from "@/components/automations/assign-automation-widget";

interface NoteEntry {
  id: string;
  type: "followup" | "ai" | "general";
  badge: string;
  date?: string;
  text: string;
}

function parseNotesTimeline(rawNotes: string): NoteEntry[] {
  if (!rawNotes || !rawNotes.trim()) return [];
  const lines = rawNotes.split(/\n(?=\[)/g);
  const entries: NoteEntry[] = [];

  lines.forEach((chunk, index) => {
    const trimmed = chunk.trim();
    if (!trimmed) return;

    // Pattern 1: [Follow-up #N - DD MMM YYYY]: Text
    const followupMatch = trimmed.match(/^\[Follow-up\s*(#\d+)?\s*-?\s*([^\]]*)\]:\s*([\s\S]*)$/i);
    if (followupMatch) {
      entries.push({
        id: `entry-${index}`,
        type: "followup",
        badge: followupMatch[1] ? `Follow-up ${followupMatch[1]}` : "Follow-up",
        date: followupMatch[2]?.trim(),
        text: followupMatch[3]?.trim(),
      });
      return;
    }

    // Pattern 2: [AI ...]: Text
    const aiMatch = trimmed.match(/^\[AI\s*([^\]]*)\]:\s*([\s\S]*)$/i);
    if (aiMatch) {
      entries.push({
        id: `entry-${index}`,
        type: "ai",
        badge: "✨ AI " + (aiMatch[1] ? aiMatch[1].trim() : "Note"),
        text: aiMatch[2]?.trim(),
      });
      return;
    }

    // Pattern 3: General note
    entries.push({
      id: `entry-${index}`,
      type: "general",
      badge: "Note",
      text: trimmed,
    });
  });

  return entries;
}

interface DealFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  deal?: Deal | null;
  pipelineId: string;
  stages: PipelineStage[];
  defaultStageId?: string;
  onSaved: () => void;
}

export function DealForm({
  open,
  onOpenChange,
  deal,
  pipelineId,
  stages,
  defaultStageId,
  onSaved,
}: DealFormProps) {
  const t = useTranslations("Pipelines.form");
  const supabase = createClient();
  const { accountId, defaultCurrency } = useAuth();

  const [title, setTitle] = useState("");
  const [value, setValue] = useState("");
  const [currency, setCurrency] = useState(defaultCurrency);
  const [contactId, setContactId] = useState("");
  const [stageId, setStageId] = useState("");
  const [assignedTo, setAssignedTo] = useState("");
  const [expectedCloseDate, setExpectedCloseDate] = useState("");
  const [notes, setNotes] = useState("");
  const [aiFollowupEnabled, setAiFollowupEnabled] = useState(true);
  const [followupInstructions, setFollowupInstructions] = useState("");
  const [sendingFollowup, setSendingFollowup] = useState(false);

  // Follow-up Timeline & AI Summarizer states
  const [newFollowupText, setNewFollowupText] = useState("");
  const [summarizingChat, setSummarizingChat] = useState(false);
  const [showRawNotes, setShowRawNotes] = useState(false);

  const [contacts, setContacts] = useState<Contact[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [linkedConversation, setLinkedConversation] =
    useState<Conversation | null>(null);

  const [saving, setSaving] = useState(false);
  const [statusAction, setStatusAction] = useState<DealStatus | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Reset the form fields every time the sheet opens or its input
  // props change. This is a legitimate prop-driven sync; the rule is
  // over-cautious here, hence the block-level disable.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!open) return;
    setConfirmDelete(false);
    if (deal) {
      setTitle(deal.title);
      setValue(deal.value !== null && deal.value !== undefined ? String(deal.value) : "");
      setCurrency(deal.currency || defaultCurrency);
      // contact_id is nullable when the contact has been deleted
      // (migration 004: ON DELETE SET NULL). "" means "no selection".
      setContactId(deal.contact_id ?? "");
      setStageId(deal.stage_id);
      setAssignedTo(deal.assigned_to ?? "");
      setExpectedCloseDate(deal.expected_close_date ?? "");
      setNotes(deal.notes ?? "");
      setAiFollowupEnabled((deal as any).ai_followup_enabled !== false);
      setFollowupInstructions((deal as any).followup_instructions ?? "");
    } else {
      setTitle("");
      setValue("");
      setCurrency(defaultCurrency);
      setContactId("");
      setStageId(defaultStageId || stages[0]?.id || "");
      setAssignedTo("");
      setExpectedCloseDate("");
      setNotes("");
      setAiFollowupEnabled(true);
      setFollowupInstructions("");
    }
  }, [open, deal, defaultStageId, stages, defaultCurrency]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // Load supporting data once the sheet is open
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      const [c, p] = await Promise.all([
        supabase.from("contacts").select("*").order("name"),
        supabase.from("profiles").select("*").order("full_name"),
      ]);
      if (cancelled) return;
      setContacts((c.data ?? []) as Contact[]);
      setProfiles((p.data ?? []) as Profile[]);
    })();
    return () => {
      cancelled = true;
    };
  }, [open, supabase]);

  // Fetch linked conversation for the selected contact (newest open one).
  // Clearing on no-selection is sync with prop state; the populated
  // case runs setLinkedConversation inside the async fetch callback.
  useEffect(() => {
    if (!open || !contactId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setLinkedConversation(null);
      return;
    }
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("conversations")
        .select("*")
        .eq("contact_id", contactId)
        .order("last_message_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (cancelled) return;
      setLinkedConversation((data as Conversation | null) ?? null);
    })();
    return () => {
      cancelled = true;
    };
  }, [open, contactId, supabase]);

  const timelineEntries = parseNotesTimeline(notes);
  const followUpCount = timelineEntries.filter((e) => e.type === "followup").length;
  const nextFollowUpNumber = followUpCount + 1;

  const handleAddFollowup = () => {
    if (!newFollowupText.trim()) {
      toast.error("Please enter a note before adding.");
      return;
    }
    const todayStr = new Date().toLocaleDateString("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
    const formatted = `[Follow-up #${nextFollowUpNumber} - ${todayStr}]: ${newFollowupText.trim()}`;
    const updated = notes.trim() ? `${notes.trim()}\n${formatted}` : formatted;
    setNotes(updated);
    setNewFollowupText("");
    toast.success(`Follow-up #${nextFollowUpNumber} added! Remember to save deal.`);
  };

  const handleAiSummarizeChat = async () => {
    const targetContactId = contactId || deal?.contact_id;
    if (!targetContactId) {
      toast.error("Select a contact first to summarize chat.");
      return;
    }
    setSummarizingChat(true);
    try {
      const res = await fetch("/api/crm/ai-summarize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contactId: targetContactId,
          conversationId: deal?.conversation_id,
          dealId: deal?.id,
        }),
      });
      const data = await res.json();
      if (res.ok && data.summary) {
        setNewFollowupText(data.summary);
        toast.success(`✨ Chat summarized (${data.messageCount ?? 0} messages analyzed)!`);
      } else {
        toast.error(data.error || "Failed to summarize chat.");
      }
    } catch (err: any) {
      toast.error(err.message || "Error connecting to AI summarizer.");
    } finally {
      setSummarizingChat(false);
    }
  };

  async function handleSave() {
    if (!title.trim() || !contactId || !stageId) {
      toast.error(t("toastRequired"));
      return;
    }
    setSaving(true);

    let finalNotes = notes.trim();
    if (newFollowupText.trim()) {
      const todayStr = new Date().toLocaleDateString("en-IN", {
        day: "numeric",
        month: "short",
        year: "numeric",
      });
      const formatted = `[Follow-up #${nextFollowUpNumber} - ${todayStr}]: ${newFollowupText.trim()}`;
      finalNotes = finalNotes ? `${finalNotes}\n${formatted}` : formatted;
      setNotes(finalNotes);
      setNewFollowupText("");
    }

    const payload = {
      title: title.trim(),
      value: value.trim() && !isNaN(parseFloat(value)) ? parseFloat(value) : null,
      currency,
      contact_id: contactId,
      pipeline_id: pipelineId,
      stage_id: stageId,
      assigned_to: assignedTo || null,
      notes: finalNotes || null,
      expected_close_date: expectedCloseDate || null,
      ai_followup_enabled: aiFollowupEnabled,
      followup_instructions: followupInstructions.trim() || null,
    };

    if (deal) {
      const { error } = await supabase
        .from("deals")
        .update(payload)
        .eq("id", deal.id);
      if (error) {
        toast.error(t("toastFailedSave"));
        setSaving(false);
        return;
      }
    } else {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const user = session?.user;
      if (!user) {
        toast.error(t("toastNotSignedIn"));
        setSaving(false);
        return;
      }
      if (!accountId) {
        toast.error(t("toastNotLinked"));
        setSaving(false);
        return;
      }
      const { error } = await supabase
        .from("deals")
        .insert({ ...payload, user_id: user.id, account_id: accountId, status: "open" });
      if (error) {
        toast.error(t("toastFailedCreate"));
        setSaving(false);
        return;
      }
    }

    // Bidirectional sync: append to contact_notes
    if (contactId && notes.trim() && accountId) {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        supabase.from("contact_notes").insert({
          contact_id: contactId,
          account_id: accountId,
          user_id: session.user.id,
          note_text: `[CRM Deal "${title.trim()}"]: ${notes.trim()}`,
        }).then();
      }
    }

    setSaving(false);
    toast.success(deal ? t("toastUpdated") : t("toastCreated"));
    onOpenChange(false);
    onSaved();
  }

  async function handleStatusChange(status: DealStatus) {
    if (!deal) return;
    setStatusAction(status);
    const { error } = await supabase
      .from("deals")
      .update({ status })
      .eq("id", deal.id);
    setStatusAction(null);
    if (error) {
      toast.error(t("toastFailedStatus"));
      return;
    }
    toast.success(
      status === "won" ? t("toastMarkedWon") : status === "lost" ? t("toastMarkedLost") : t("toastReopened"),
    );
    onOpenChange(false);
    onSaved();
  }

  async function handleDelete() {
    if (!deal) return;
    setDeleting(true);
    const { error } = await supabase.from("deals").delete().eq("id", deal.id);
    setDeleting(false);
    if (error) {
      toast.error(t("toastFailedDelete"));
      return;
    }
    toast.success(t("toastDeleted"));
    setConfirmDelete(false);
    onOpenChange(false);
    onSaved();
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="bg-popover border-border text-popover-foreground sm:max-w-lg w-full p-0"
      >
        <div className="flex h-full flex-col">
          <SheetHeader className="border-b border-border/50 p-4">
            <SheetTitle className="text-popover-foreground">
              {deal ? t("editDeal") : t("newDeal")}
            </SheetTitle>
          </SheetHeader>

          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            <div className="grid gap-2">
              <Label className="text-muted-foreground">{t("title")}</Label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={t("titlePlaceholder")}
                className="border-border bg-muted text-foreground"
              />
            </div>

            <div className="grid gap-2">
              <Label className="text-muted-foreground">{t("contact")}</Label>
              <select
                value={contactId}
                onChange={(e) => setContactId(e.target.value)}
                className="h-9 w-full rounded-lg border border-border bg-muted px-2.5 text-sm text-foreground outline-none focus:border-primary focus:ring-1 focus:ring-primary"
              >
                <option value="">{t("selectContact")}</option>
                {contacts.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name || c.phone}
                  </option>
                ))}
              </select>

              {linkedConversation && (
                <Link
                  href="/inbox"
                  className="mt-1 inline-flex items-center gap-1.5 self-start rounded-md bg-primary/10 px-2 py-1 text-xs text-primary hover:bg-primary/20"
                >
                  <MessageSquare className="h-3 w-3" />
                  {t("linkToConversation")}
                </Link>
              )}
            </div>

            <div className="grid grid-cols-[1fr_110px] gap-3">
              <div className="grid gap-2">
                <Label className="text-muted-foreground">{t("value")}</Label>
                <div className="relative">
                  <DollarSign className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    type="number"
                    value={value}
                    onChange={(e) => setValue(e.target.value)}
                    placeholder="Optional (e.g. 5000)"
                    className="border-border bg-muted pl-7 text-foreground"
                  />
                </div>
              </div>
              <div className="grid gap-2">
                <Label className="text-muted-foreground">{t("currency")}</Label>
                <select
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value)}
                  className="h-9 w-full rounded-lg border border-border bg-muted px-2.5 text-sm text-foreground outline-none focus:border-primary"
                >
                  {CURRENCIES.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.code}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid gap-2">
              <Label className="text-muted-foreground">{t("expectedCloseDate")}</Label>
              <Input
                type="date"
                value={expectedCloseDate}
                onChange={(e) => setExpectedCloseDate(e.target.value)}
                className="border-border bg-muted text-foreground"
              />
            </div>

            <div className="grid gap-2">
              <Label className="text-muted-foreground">{t("stage")}</Label>
              <select
                value={stageId}
                onChange={(e) => setStageId(e.target.value)}
                className="h-9 w-full rounded-lg border border-border bg-muted px-2.5 text-sm text-foreground outline-none focus:border-primary"
              >
                {stages.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid gap-2">
              <Label className="text-muted-foreground">{t("assignedTo")}</Label>
              <select
                value={assignedTo}
                onChange={(e) => setAssignedTo(e.target.value)}
                className="h-9 w-full rounded-lg border border-border bg-muted px-2.5 text-sm text-foreground outline-none focus:border-primary"
              >
                <option value="">{t("unassigned")}</option>
                {profiles.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.full_name || p.email}
                  </option>
                ))}
              </select>
            </div>

            {/* Structured Follow-ups & Notes History Timeline */}
            <div className="space-y-3 rounded-xl border border-border/80 bg-card/60 p-3.5 shadow-xs">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <History className="h-4 w-4 text-primary" />
                  <span className="text-xs font-semibold text-foreground">
                    Follow-ups & Notes History
                  </span>
                  {timelineEntries.length > 0 && (
                    <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
                      {timelineEntries.length} {timelineEntries.length === 1 ? "entry" : "entries"}
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => setShowRawNotes(!showRawNotes)}
                  className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                >
                  <FileText className="h-3 w-3" />
                  {showRawNotes ? "Hide Raw Notes" : "Edit Raw Notes"}
                  {showRawNotes ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                </button>
              </div>

              {/* Timeline Entries List */}
              {timelineEntries.length > 0 ? (
                <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                  {timelineEntries.map((entry) => (
                    <div
                      key={entry.id}
                      className="rounded-lg border border-border/60 bg-muted/40 p-2.5 text-xs space-y-1 transition-colors hover:bg-muted/70"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span
                          className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                            entry.type === "followup"
                              ? "bg-blue-500/15 text-blue-600 dark:text-blue-400"
                              : entry.type === "ai"
                              ? "bg-purple-500/15 text-purple-600 dark:text-purple-400"
                              : "bg-muted text-muted-foreground"
                          }`}
                        >
                          {entry.badge}
                        </span>
                        {entry.date && (
                          <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                            <Clock className="h-2.5 w-2.5" />
                            {entry.date}
                          </span>
                        )}
                      </div>
                      <p className="text-foreground leading-relaxed whitespace-pre-wrap text-[11.5px]">
                        {entry.text}
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rounded-lg border border-dashed border-border/70 p-3 text-center text-xs text-muted-foreground">
                  No notes or follow-ups logged yet. Add your first note below or let AI summarize the WhatsApp conversation.
                </div>
              )}

              {/* Add Next Follow-up Note Box */}
              <div className="pt-2 border-t border-border/60 space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-[11px] font-medium text-foreground flex items-center gap-1">
                    <Plus className="h-3 w-3 text-primary" />
                    Add Follow-up #{nextFollowUpNumber}
                  </Label>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={summarizingChat || (!contactId && !deal?.contact_id)}
                    onClick={handleAiSummarizeChat}
                    className="h-6 px-2 text-[10px] gap-1 border-purple-500/30 text-purple-600 dark:text-purple-400 hover:bg-purple-500/10 cursor-pointer"
                    title="Read recent WhatsApp messages and generate follow-up note using Master AI"
                  >
                    {summarizingChat ? (
                      <Loader2 className="h-2.5 w-2.5 animate-spin" />
                    ) : (
                      <Sparkles className="h-2.5 w-2.5" />
                    )}
                    ✨ AI Summarize Chat
                  </Button>
                </div>
                <Textarea
                  value={newFollowupText}
                  onChange={(e) => setNewFollowupText(e.target.value)}
                  placeholder={`Write details for Follow-up #${nextFollowUpNumber}, or click 'AI Summarize Chat'...`}
                  className="min-h-[70px] text-xs border-border bg-background text-foreground"
                />
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[10px] text-muted-foreground">
                    🔄 Notes automatically sync between CRM Pipeline & Inbox.
                  </p>
                  <Button
                    type="button"
                    size="sm"
                    disabled={!newFollowupText.trim()}
                    onClick={handleAddFollowup}
                    className="h-7 px-3 text-xs bg-primary text-primary-foreground hover:bg-primary/90 gap-1 font-medium shrink-0"
                  >
                    <Plus className="h-3 w-3" />
                    Add Note #{nextFollowUpNumber}
                  </Button>
                </div>
              </div>

              {/* Raw Notes Direct Editor (Collapsible) */}
              {showRawNotes && (
                <div className="pt-2 border-t border-border/60 space-y-1.5">
                  <Label className="text-[10px] uppercase font-semibold text-muted-foreground">
                    Full Raw Notes (Advanced Direct Edit)
                  </Label>
                  <Textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder={t("notesPlaceholder")}
                    className="min-h-[90px] text-xs border-border bg-muted/60 font-mono text-foreground"
                  />
                </div>
              )}
            </div>

            {/* Smart AI Follow-up Configuration */}
            <div className="rounded-xl border border-purple-500/30 bg-purple-500/5 p-3.5 space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Bot className="h-4 w-4 text-purple-500" />
                  <span className="text-xs font-semibold text-foreground">
                    Smart AI Follow-up Assistant
                  </span>
                </div>
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={aiFollowupEnabled}
                    onChange={(e) => setAiFollowupEnabled(e.target.checked)}
                    className="rounded border-border text-primary focus:ring-primary h-3.5 w-3.5"
                  />
                  <span className="text-xs text-foreground font-medium">Auto-send on Due Date</span>
                </label>
              </div>

              <div className="space-y-1">
                <Label className="text-[11px] text-muted-foreground">
                  Custom AI Instruction (Optional)
                </Label>
                <Input
                  value={followupInstructions}
                  onChange={(e) => setFollowupInstructions(e.target.value)}
                  placeholder="e.g. Offer 10% discount on web package or ask for demo timing"
                  className="h-8 border-border bg-background text-xs text-foreground"
                />
              </div>

              {deal && (
                <div className="pt-1 flex items-center justify-between">
                  <span className="text-[11px] text-muted-foreground">
                    Send immediate WhatsApp follow-up:
                  </span>
                  <Button
                    type="button"
                    size="sm"
                    disabled={sendingFollowup}
                    onClick={async () => {
                      setSendingFollowup(true);
                      try {
                        toast.info("AI is crafting and sending follow-up message on WhatsApp...");
                        const res = await fetch("/api/crm/ai-followup", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ dealId: deal.id }),
                        });
                        const data = await res.json();
                        if (res.ok && data.processed > 0) {
                          toast.success("AI Follow-up message sent on WhatsApp!");
                          onSaved();
                        } else {
                          toast.info("Follow-up checked.");
                        }
                      } catch (err: any) {
                        toast.error(err.message || "Failed to send follow-up");
                      } finally {
                        setSendingFollowup(false);
                      }
                    }}
                    className="h-7 px-2.5 text-xs bg-purple-600 hover:bg-purple-700 text-white gap-1 font-medium"
                  >
                    {sendingFollowup ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Send className="h-3 w-3" />
                    )}
                    Send AI Follow-up Now
                  </Button>
                </div>
              )}
            </div>

            {/* Manual Automation Assignment */}
            {(contactId || deal?.contact_id) && (
              <AssignAutomationWidget
                contactId={contactId || deal?.contact_id}
                conversationId={deal?.conversation_id}
              />
            )}

            {deal && (
              <div className="space-y-2 rounded-lg border border-border bg-muted/50 p-3">
                <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  {t("status")}
                </p>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    onClick={() => handleStatusChange("won")}
                    disabled={!!statusAction || deal.status === "won"}
                    className="flex-1 bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                  >
                    {statusAction === "won" ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <>
                        <Check className="mr-1 h-4 w-4" />
                        {t("markAsWon")}
                      </>
                    )}
                  </Button>
                  <Button
                    type="button"
                    onClick={() => handleStatusChange("lost")}
                    disabled={!!statusAction || deal.status === "lost"}
                    className="flex-1 bg-red-600 text-white hover:bg-red-700 disabled:opacity-50"
                  >
                    {statusAction === "lost" ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <>
                        <X className="mr-1 h-4 w-4" />
                        {t("markAsLost")}
                      </>
                    )}
                  </Button>
                </div>
                {deal.status && deal.status !== "open" && (
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => handleStatusChange("open")}
                    disabled={!!statusAction}
                    className="w-full text-muted-foreground hover:text-foreground"
                  >
                    {t("reopenDeal")}
                  </Button>
                )}
              </div>
            )}
          </div>

          <div className="border-t border-border/50 bg-popover/80 p-4">
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => onOpenChange(false)}
                className="flex-1 border-border bg-transparent text-muted-foreground hover:bg-muted"
              >
                {t("cancel")}
              </Button>
              <Button
                onClick={handleSave}
                disabled={saving || !title.trim() || !contactId || !stageId}
                className="flex-1 bg-primary text-primary-foreground hover:bg-primary/90"
              >
                {saving ? t("saving") : deal ? t("saveChanges") : t("createDeal")}
              </Button>
            </div>

            {deal &&
              (confirmDelete ? (
                <div className="mt-3 flex items-center justify-between gap-2 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs">
                  <span className="text-red-300">{t("deletePrompt")}</span>
                  <div className="flex gap-1">
                    <button
                      type="button"
                      onClick={() => setConfirmDelete(false)}
                      disabled={deleting}
                      className="rounded px-2 py-1 text-muted-foreground hover:bg-muted"
                    >
                      {t("cancel")}
                    </button>
                    <button
                      type="button"
                      onClick={handleDelete}
                      disabled={deleting}
                      className="rounded bg-red-600 px-2 py-1 font-medium text-white hover:bg-red-700 disabled:opacity-50"
                    >
                      {deleting ? t("deleting") : t("confirm")}
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmDelete(true)}
                  className="mt-3 flex w-full items-center justify-center gap-1 text-xs text-red-400 hover:text-red-300"
                >
                  <Trash2 className="h-3 w-3" />
                  {t("deleteDeal")}
                </button>
              ))}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
