"use client"

import type { ReactNode } from "react"
import { useTranslations } from "next-intl"
import { CalendarClock, AlertTriangle } from "lucide-react"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import {
  DEFAULT_TIMEZONE,
  cronToSimple,
  nextRun,
  readSchedule,
  scheduleProblem,
  type ScheduleRepeat,
  type SimpleSchedule,
} from "@/lib/automations/schedule"

/**
 * Plain-language schedule for time-based automations: once on a date,
 * every day, chosen weekdays, or chosen dates of the month — at a time,
 * in a timezone — plus who it runs for. Shows the next run so anyone can
 * check it at a glance. Writes the simple form (see
 * lib/automations/schedule); older cron schedules are shown in it when
 * they map onto one.
 */

const TIMEZONES = [
  { value: "Asia/Kolkata", label: "India (IST)" },
  { value: "Asia/Dubai", label: "UAE (GST)" },
  { value: "Asia/Kathmandu", label: "Nepal" },
  { value: "Asia/Dhaka", label: "Bangladesh" },
  { value: "Asia/Singapore", label: "Singapore" },
  { value: "Europe/London", label: "UK" },
  { value: "America/New_York", label: "US Eastern" },
  { value: "UTC", label: "UTC" },
]

/** A sensible starting schedule: every week on today's weekday, 09:00 IST. */
export function defaultSchedule(): Record<string, unknown> {
  return {
    repeat: "weekly",
    weekdays: [new Date().getDay()],
    time: "09:00",
    timezone: DEFAULT_TIMEZONE,
    audience: "all",
  }
}

function toView(config: Record<string, unknown>): SimpleSchedule | null {
  const parsed = readSchedule(config)
  if (parsed?.kind === "simple") return parsed.schedule
  if (typeof config.repeat === "string") {
    // Incomplete simple schedule (e.g. no day picked yet) — show as-is.
    return {
      repeat: config.repeat as ScheduleRepeat,
      time: typeof config.time === "string" ? config.time : "",
      timezone: typeof config.timezone === "string" ? config.timezone : DEFAULT_TIMEZONE,
      date: typeof config.date === "string" ? config.date : undefined,
      weekdays: Array.isArray(config.weekdays) ? (config.weekdays as number[]) : [],
      month_days: Array.isArray(config.month_days) ? (config.month_days as number[]) : [],
    }
  }
  if (typeof config.schedule === "string") {
    return cronToSimple(config.schedule, typeof config.timezone === "string" ? config.timezone : DEFAULT_TIMEZONE)
  }
  return null
}

export function SchedulePicker({
  config,
  onChange,
  renderTagSelect,
}: {
  config: Record<string, unknown>
  onChange: (c: Record<string, unknown>) => void
  renderTagSelect: (value: string, onChange: (v: string) => void) => ReactNode
}) {
  const t = useTranslations("Automations.builder.schedulePicker")
  const view = toView(config)
  const legacyCron =
    !view && typeof config.schedule === "string" && config.schedule.trim() ? config.schedule.trim() : null
  const s: SimpleSchedule = view ?? (defaultSchedule() as unknown as SimpleSchedule)

  const audience = config.audience === "tag" ? "tag" : "all"
  const audienceTagId = typeof config.audience_tag_id === "string" ? config.audience_tag_id : ""

  function write(next: Partial<SimpleSchedule>) {
    const merged = { ...s, ...next }
    // Drop the legacy cron once the simple form is in use.
    const rest = { ...config }
    delete rest.schedule
    onChange({
      ...rest,
      repeat: merged.repeat,
      time: merged.time,
      timezone: merged.timezone,
      date: merged.repeat === "once" ? merged.date : undefined,
      weekdays: merged.repeat === "weekly" ? merged.weekdays ?? [] : undefined,
      month_days: merged.repeat === "monthly" ? merged.month_days ?? [] : undefined,
    })
  }

  const toggle = (list: number[] | undefined, v: number) =>
    (list ?? []).includes(v) ? (list ?? []).filter((x) => x !== v) : [...(list ?? []), v].sort((a, b) => a - b)

  const problem = view ? scheduleProblem(view) : null
  const next = !problem && view ? nextRun({ ...config, ...view }) : null
  const nextLabel = next
    ? new Intl.DateTimeFormat("en-IN", {
        timeZone: s.timezone,
        weekday: "short",
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
      }).format(next)
    : null

  const REPEATS: { value: ScheduleRepeat; label: string }[] = [
    { value: "once", label: t("once") },
    { value: "daily", label: t("daily") },
    { value: "weekly", label: t("weekly") },
    { value: "monthly", label: t("monthly") },
  ]
  const WEEKDAYS = [t("sun"), t("mon"), t("tue"), t("wed"), t("thu"), t("fri"), t("sat")]
  const chip = (active: boolean) =>
    cn(
      "rounded-md border text-xs font-medium transition-colors",
      active
        ? "border-primary bg-primary text-primary-foreground"
        : "border-border bg-muted text-muted-foreground hover:border-primary/40 hover:text-foreground",
    )
  const label = "mb-1 block text-xs font-medium text-muted-foreground"

  return (
    <div className="space-y-3">
      {legacyCron && (
        <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-2 text-[11px] text-amber-700 dark:text-amber-300">
          {t("legacyCron", { expr: legacyCron })}
        </div>
      )}

      <div>
        <span className={label}>{t("howOften")}</span>
        <div className="grid grid-cols-4 gap-1">
          {REPEATS.map((r) => (
            <button
              key={r.value}
              type="button"
              className={cn(chip(view?.repeat === r.value), "px-1 py-1.5")}
              onClick={() =>
                write({
                  repeat: r.value,
                  weekdays: r.value === "weekly" && !(s.weekdays ?? []).length ? [new Date().getDay()] : s.weekdays,
                  month_days: r.value === "monthly" && !(s.month_days ?? []).length ? [1] : s.month_days,
                  date: r.value === "once" && !s.date ? new Date().toISOString().slice(0, 10) : s.date,
                })
              }
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {view?.repeat === "once" && (
        <div>
          <span className={label}>{t("onDate")}</span>
          <Input
            type="date"
            value={s.date ?? ""}
            onChange={(e) => write({ date: e.target.value })}
            className="bg-muted text-foreground"
          />
        </div>
      )}

      {view?.repeat === "weekly" && (
        <div>
          <span className={label}>{t("onDays")}</span>
          <div className="grid grid-cols-7 gap-1">
            {WEEKDAYS.map((d, i) => (
              <button
                key={i}
                type="button"
                className={cn(chip((s.weekdays ?? []).includes(i)), "py-1.5")}
                onClick={() => write({ weekdays: toggle(s.weekdays, i) })}
              >
                {d}
              </button>
            ))}
          </div>
        </div>
      )}

      {view?.repeat === "monthly" && (
        <div>
          <span className={label}>{t("onDates")}</span>
          <div className="grid grid-cols-7 gap-1">
            {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
              <button
                key={d}
                type="button"
                className={cn(chip((s.month_days ?? []).includes(d)), "py-1")}
                onClick={() => write({ month_days: toggle(s.month_days, d) })}
              >
                {d}
              </button>
            ))}
            <button
              type="button"
              className={cn(chip((s.month_days ?? []).includes(-1)), "col-span-4 py-1")}
              onClick={() => write({ month_days: toggle(s.month_days, -1) })}
            >
              {t("lastDay")}
            </button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2">
        <div>
          <span className={label}>{t("atTime")}</span>
          <Input
            type="time"
            value={s.time}
            onChange={(e) => write({ time: e.target.value })}
            className="bg-muted text-foreground"
          />
        </div>
        <div>
          <span className={label}>{t("timezone")}</span>
          <select
            value={s.timezone}
            onChange={(e) => write({ timezone: e.target.value })}
            className="h-8 w-full rounded-lg border border-input bg-muted px-2 text-sm text-foreground"
          >
            {[...TIMEZONES, ...(TIMEZONES.some((z) => z.value === s.timezone) ? [] : [{ value: s.timezone, label: s.timezone }])].map(
              (z) => (
                <option key={z.value} value={z.value}>
                  {z.label}
                </option>
              ),
            )}
          </select>
        </div>
      </div>

      <div>
        <span className={label}>{t("sendTo")}</span>
        <div className="grid grid-cols-2 gap-1">
          <button
            type="button"
            className={cn(chip(audience === "all"), "py-1.5")}
            onClick={() => onChange({ ...config, audience: "all", audience_tag_id: undefined })}
          >
            {t("allContacts")}
          </button>
          <button
            type="button"
            className={cn(chip(audience === "tag"), "py-1.5")}
            onClick={() => onChange({ ...config, audience: "tag" })}
          >
            {t("contactsWithTag")}
          </button>
        </div>
        {audience === "tag" && (
          <div className="mt-2">
            {renderTagSelect(audienceTagId, (v) => onChange({ ...config, audience: "tag", audience_tag_id: v }))}
          </div>
        )}
      </div>

      <div
        className={cn(
          "flex items-start gap-2 rounded-md border px-2.5 py-2 text-xs",
          problem || !next
            ? "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300"
            : "border-primary/25 bg-primary/5 text-foreground",
        )}
      >
        {problem || !next ? (
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
        ) : (
          <CalendarClock className="mt-0.5 size-3.5 shrink-0 text-primary" />
        )}
        <span>
          {problem
            ? t("needs", { problem })
            : next
              ? t("nextRun", { when: nextLabel ?? "" })
              : t("noNextRun")}
        </span>
      </div>
    </div>
  )
}
