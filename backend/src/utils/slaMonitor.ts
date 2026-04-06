/**
 * SLA Monitor - Scheduled Task
 * Runs periodically to check SLA breaches and send notifications
 */

import { checkAndNotifySLABreaches } from '../controllers/incidentController';
import { get } from './db';
import logger from './logger';

// Run interval in milliseconds (30 minutes)
const DEFAULT_CHECK_INTERVAL = 30 * 60 * 1000;

let intervalId: NodeJS.Timeout | null = null;
let currentIntervalMs = DEFAULT_CHECK_INTERVAL;

async function resolveCheckIntervalMs(): Promise<number> {
  try {
    const row = await get('SELECT value FROM system_settings WHERE key = ? LIMIT 1', ['sla.check_interval_minutes']);
    const minutes = Number(row?.value);
    if (!Number.isFinite(minutes) || minutes <= 0) {
      return DEFAULT_CHECK_INTERVAL;
    }
    return Math.max(1, Math.floor(minutes)) * 60 * 1000;
  } catch {
    return DEFAULT_CHECK_INTERVAL;
  }
}

function scheduleMonitor(intervalMs: number) {
  if (intervalId) {
    clearInterval(intervalId);
  }

  currentIntervalMs = intervalMs;
  intervalId = setInterval(() => {
    runSLACheck();
  }, intervalMs);

  logger.info(`SLA monitor checking every ${intervalMs / 60000} minute(s)`);
}

/**
 * Start the SLA monitoring service
 */
export function startSLAMonitor() {
  if (intervalId) {
    logger.warn('SLA monitor already running');
    return;
  }

  logger.info('Starting SLA monitor');

  resolveCheckIntervalMs()
    .then((intervalMs) => {
      scheduleMonitor(intervalMs);
      // Run immediately on start after scheduling.
      runSLACheck();
    })
    .catch(() => {
      scheduleMonitor(DEFAULT_CHECK_INTERVAL);
      runSLACheck();
    });

  logger.info('SLA monitor started');
}

/**
 * Stop the SLA monitoring service
 */
export function stopSLAMonitor() {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
    logger.info('SLA monitor stopped');
  }
}

/**
 * Run a single SLA check
 */
async function runSLACheck() {
  const timestamp = new Date().toISOString();
  logger.debug(`Running SLA breach check at ${timestamp}`);

  try {
    const result = await checkAndNotifySLABreaches();
    
    logger.info(`SLA check completed: checked=${result.checked}, notifications=${result.notificationsSent}`);
    
    if (result.notificationsSent > 0) {
      logger.debug('SLA notification details follow');
      result.notifications.forEach((notif: any) => {
        logger.debug(`Incident ${notif.incidentId}: ${notif.type}`);
      });
    }

    const latestInterval = await resolveCheckIntervalMs();
    if (latestInterval !== currentIntervalMs) {
      logger.info(`SLA check interval updated to ${latestInterval / 60000} minute(s)`);
      scheduleMonitor(latestInterval);
    }
  } catch (error: any) {
    logger.error('SLA check failed', error?.message || error);
  }
}

/**
 * Manual trigger for SLA check (useful for testing)
 */
export async function triggerManualSLACheck() {
  logger.info('Manual SLA check triggered');
  await runSLACheck();
}
