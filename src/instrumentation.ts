export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { startAutomationSweeper } = await import('@/lib/automations/sweeper')
    startAutomationSweeper()
  }
}
