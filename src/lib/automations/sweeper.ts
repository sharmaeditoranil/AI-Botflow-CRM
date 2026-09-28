import { drainDuePendingExecutions } from './engine'

let sweeperStarted = false

/**
 * Starts the in-process background sweeper.
 * Runs every 30 seconds to drain any overdue wait steps in automations.
 * Safe to call multiple times (idempotent singleton).
 */
export function startAutomationSweeper() {
  if (sweeperStarted) return
  sweeperStarted = true

  // Initial immediate drain (after 2 seconds) to sweep anything overdue on start
  if (typeof setTimeout !== 'undefined') {
    setTimeout(() => {
      drainDuePendingExecutions().catch((err) => {
        console.error('[automations] Startup sweep error:', err)
      })
    }, 2000).unref?.()
  }

  // Periodic sweeper every 30 seconds
  if (typeof setInterval !== 'undefined') {
    const interval = setInterval(() => {
      drainDuePendingExecutions().catch((err) => {
        console.error('[automations] Periodic sweeper error:', err)
      })
    }, 30_000)

    interval.unref?.()
  }
}
