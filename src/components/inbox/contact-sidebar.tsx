"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";
import type { Contact, Deal, ContactNote, Tag } from "@/types";
import { findAndMergeOrCreateDeal } from "@/lib/pipelines/deal-merger";
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
  Trash2,
  CheckCircle,
  XCircle,
  X,
  Loader2,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { format } from "date-fns";
import { useTranslations } from "next-intl";
import { contactHandle } from "@/lib/whatsapp/wa-identity";
import { ContactTagBar } from "./contact-tag-bar";
import { AssignAutomationWidget } from "@/components/automations/assign-automation-widget";
import { toast } from "sonner";

interface ContactSidebarProps {
  contact: Contact | null;
  conversationId?: string;
  className?: string;
  onClose?: () => void;
}

export function ContactSidebar({
  contact,
  conversationId,
  className,
  onClose,
}: ContactSidebarProps) {
  const tSidebar = useTranslations("Inbox.sidebar");
  const tThread = useTranslations("Inbox.messageThread");

  const { accountId } = useAuth();
  const [copied, setCopied] = useState(false);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [availableStages, setAvailableStages] = useState<{ id: string; name: string; color: string }[]>([]);
  const [notes, setNotes] = useState<ContactNote[]>([]);
  const [tags, setTags] = useState<(Tag & { contact_tag_id: string })[]>([]);
  const [newNote, setNewNote] = useState("");
  const [addingNote, setAddingNote] = useState(false);
  const [liveContact, setLiveContact] = useState<Partial<Contact> | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deletingContact, setDeletingContact] = useState(false);

  const handleDeleteContact = async () => {
    if (!contact?.id) return;
    setDeletingContact(true);
    try {
      const supabase = createClient();
      const { error } = await supabase
        .from("contacts")
        .delete()
        .eq("id", contact.id);

      if (error) {
        toast.error("Failed to delete subscriber");
      } else {
        toast.success("Subscriber deleted successfully");
        setDeleteConfirmOpen(false);
        onClose?.();
      }
    } catch {
      toast.error("Failed to delete subscriber");
    } finally {
      setDeletingContact(false);
    }
  };

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

    // Fetch pipeline stages for default pipeline
    const { data: stagesData } = await supabase
      .from("pipeline_stages")
      .select("id, name, color, position")
      .order("position", { ascending: true });
    if (stagesData) setAvailableStages(stagesData);
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

      let { data: pipeline } = await supabase
        .from("pipelines")
        .select("id, stages:pipeline_stages(id, position)")
        .eq("account_id", accountId)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();

      if (!pipeline) {
        const { data: fallbackPipe } = await supabase
          .from("pipelines")
          .select("id, stages:pipeline_stages(id, position)")
          .order("created_at", { ascending: true })
          .limit(1)
          .maybeSingle();
        pipeline = fallbackPipe;
      }

      if (!pipeline || !pipeline.stages || (pipeline.stages as any[]).length === 0) {
        toast.error("Please configure a pipeline first under Pipelines.");
        return;
      }

      const firstStage = (pipeline.stages as any[]).sort((a, b) => a.position - b.position)[0];
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 2);

      let initialNotes = "Created from Inbox chat.";
      if (notes && notes.length > 0) {
        const existingNotesCompiled = notes
          .map((n) => `[Note ${new Date(n.created_at).toLocaleDateString()}]: ${n.note_text}`)
          .join("\n");
        initialNotes = `${existingNotesCompiled}\n[Note ${new Date().toLocaleDateString()}]: Created from Inbox chat.`;
      }

      const result = await findAndMergeOrCreateDeal(supabase, {
        user_id: user.id,
        account_id: accountId,
        pipeline_id: pipeline.id,
        stage_id: firstStage.id,
        contact_id: contact.id,
        conversation_id: conversationId || null,
        title: `Deal: ${contact.name || contact.phone || "Customer"}`,
        value: null,
        currency: "INR",
        status: "open",
        expected_close_date: tomorrow.toISOString().split("T")[0],
        notes: initialNotes,
        ai_followup_enabled: true,
      });

      toast.success(
        result.merged
          ? "Existing customer deal found! Merged notes and follow-ups."
          : "New deal created in Pipeline!"
      );
      fetchContactData();
    } catch (err: any) {
      toast.error(err.message || "Error creating deal");
    }
  };

  const handleUpdateDealStage = async (dealId: string, stageId: string) => {
    try {
      const supabase = createClient();
      const { error } = await supabase
        .from('deals')
        .update({ stage_id: stageId, updated_at: new Date().toISOString() })
        .eq('id', dealId);
      if (!error) {
        toast.success('Deal stage updated in CRM Pipeline!');
        fetchContactData();
      } else {
        toast.error(error.message);
      }
    } catch (err: any) {
      toast.error(err.message || 'Failed to update stage');
    }
  };

  const handleUpdateDealDate = async (dealId: string, newDate: string) => {
    try {
      const supabase = createClient();
      const { error } = await supabase
        .from('deals')
        .update({ expected_close_date: newDate, updated_at: new Date().toISOString() })
        .eq('id', dealId);
      if (!error) {
        toast.success('Follow-up date scheduled! AI Assistant will follow up.');
        fetchContactData();
      } else {
        toast.error(error.message);
      }
    } catch (err: any) {
      toast.error(err.message || 'Failed to update date');
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

  const handleUpdateDealStatus = async (dealId: string, status: 'won' | 'lost' | 'open') => {
    try {
      const supabase = createClient();
      const { error } = await supabase
        .from('deals')
        .update({ status, updated_at: new Date().toISOString() })
        .eq('id', dealId);
      if (!error) {
        toast.success(`Deal marked as ${status.toUpperCase()}`);
        fetchContactData();
      } else {
        toast.error(error.message);
      }
    } catch (err: any) {
      toast.error(err.message || 'Failed to update deal');
    }
  };

  const handleRemoveDeal = async (dealId: string) => {
    try {
      const supabase = createClient();
      const { error } = await supabase.from('deals').delete().eq('id', dealId);
      if (!error) {
        toast.success('Deal removed from pipeline');
        fetchContactData();
      } else {
        toast.error(error.message);
      }
    } catch (err: any) {
      toast.error(err.message || 'Failed to remove deal');
    }
  };

  const handleTagsUpdated = useCallback(async () => {
    fetchContactData();
    if (deals.length > 0) {
      const activeDeal = deals[0];
      const supabase = createClient();
      const updatedNote =
        ((activeDeal as any).notes || '') +
        `\n[Tags Synced]: ${new Date().toLocaleDateString('en-IN')} ${new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}`;
      await supabase.from('deals').update({ notes: updatedNote }).eq('id', activeDeal.id);
    }
  }, [fetchContactData, deals]);

  if (!contact) {
    return (
      <div className={cn("flex h-full w-70 items-center justify-center border-l border-border bg-card", className)}>
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
    <div className={cn("flex h-full w-72 flex-col overflow-hidden border-l border-border bg-card", className)}>
      {onClose && (
        <div className="flex items-center justify-between border-b border-border px-4 py-3 bg-muted/40 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <User className="h-4 w-4 text-primary shrink-0" />
            <h3 className="text-sm font-semibold text-foreground truncate">
              {displayName}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}
      <ScrollArea className="h-full min-h-0 flex-1">
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
                onTagsUpdated={handleTagsUpdated}
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
                    className="rounded-lg bg-muted px-3 py-2.5 space-y-2 border border-border/60 shadow-xs"
                  >
                    <div className="flex items-start justify-between gap-1">
                      <p className="text-xs font-bold text-foreground truncate">
                        {deal.title}
                      </p>
                      {typeof deal.value === "number" && deal.value > 0 ? (
                        <span className="text-xs font-bold text-primary shrink-0">
                          {deal.currency ?? "₹"}
                          {deal.value.toLocaleString("en-IN")}
                        </span>
                      ) : (
                        <span className="text-[10px] text-muted-foreground/80 italic shrink-0">
                          No value set
                        </span>
                      )}
                    </div>

                    {/* Stage Selector Dropdown */}
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] text-muted-foreground shrink-0 font-medium">Stage:</span>
                      <select
                        value={deal.stage_id}
                        onChange={(e) => handleUpdateDealStage(deal.id, e.target.value)}
                        className="h-6 flex-1 rounded border border-border/80 bg-background px-1.5 text-[10px] font-semibold text-foreground outline-none focus:border-primary"
                      >
                        {availableStages.map((st) => (
                          <option key={st.id} value={st.id}>
                            {st.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Follow-up Date Input */}
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] text-muted-foreground shrink-0 font-medium flex items-center gap-0.5">
                        <Calendar className="h-2.5 w-2.5 text-primary" /> Follow-up:
                      </span>
                      <input
                        type="date"
                        value={deal.expected_close_date || ""}
                        onChange={(e) => handleUpdateDealDate(deal.id, e.target.value)}
                        className="h-6 flex-1 rounded border border-border/80 bg-background px-1.5 text-[10px] text-foreground outline-none focus:border-primary"
                      />
                    </div>

                    {/* Deal Actions & 2-way sync controls */}
                    <div className="pt-2 border-t border-border/50 flex items-center justify-between gap-1">
                      <div className="flex items-center gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleUpdateDealStatus(deal.id, 'won')}
                          className="h-5 px-1.5 text-[9px] text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/10 gap-0.5 font-medium"
                          title="Mark deal won"
                        >
                          <CheckCircle className="h-2.5 w-2.5" />
                          Won
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleUpdateDealStatus(deal.id, 'lost')}
                          className="h-5 px-1.5 text-[9px] text-rose-500 hover:bg-rose-500/10 gap-0.5 font-medium"
                          title="Mark deal lost"
                        >
                          <XCircle className="h-2.5 w-2.5" />
                          Lost
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleRemoveDeal(deal.id)}
                          className="h-5 px-1.5 text-[9px] text-muted-foreground hover:text-rose-500 hover:bg-rose-500/10 gap-0.5"
                          title="Remove deal from pipeline"
                        >
                          <Trash2 className="h-2.5 w-2.5" />
                        </Button>
                      </div>

                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleTriggerAiFollowup(deal.id)}
                        className="h-5 px-1.5 text-[9px] bg-purple-500/10 text-purple-600 dark:text-purple-400 hover:bg-purple-500/20 gap-1 font-semibold"
                        title="Send AI personalized follow-up message to this customer now"
                      >
                        <Bot className="h-2.5 w-2.5" />
                        AI Follow-up
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Divider */}
          <div className="my-4 border-t border-border" />

          {/* Manual Automation Assignment */}
          <AssignAutomationWidget
            contactId={contact.id}
            conversationId={conversationId}
          />

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

          {/* Divider */}
          <div className="my-4 border-t border-border" />

          {/* Delete subscriber option */}
          <div className="pt-1">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setDeleteConfirmOpen(true)}
              className="w-full text-destructive border-destructive/20 hover:bg-destructive/10 hover:border-destructive/40 text-xs font-medium"
            >
              <Trash2 className="h-3.5 w-3.5 mr-1.5" />
              Delete Subscriber / Number
            </Button>
          </div>
        </div>
      </ScrollArea>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <DialogContent className="bg-popover border-border text-popover-foreground sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-popover-foreground">
              Delete Subscriber / Number
            </DialogTitle>
            <DialogDescription className="text-muted-foreground">
              Are you sure you want to delete {displayName}? This will permanently remove this subscriber number from your contacts along with their notes and tags.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="bg-popover border-border">
            <Button
              variant="outline"
              onClick={() => setDeleteConfirmOpen(false)}
              className="border-border text-muted-foreground hover:bg-muted"
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteContact}
              disabled={deletingContact}
            >
              {deletingContact && <Loader2 className="size-4 animate-spin mr-1.5" />}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
