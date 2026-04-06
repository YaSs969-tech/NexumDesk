import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  checkAndNotifySLABreaches: vi.fn(),
  get: vi.fn(),
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('../controllers/incidentController', () => ({
  checkAndNotifySLABreaches: mocks.checkAndNotifySLABreaches,
}));

vi.mock('./db', () => ({
  get: mocks.get,
}));

vi.mock('./logger', () => ({
  default: mocks.logger,
}));

import { startSLAMonitor, stopSLAMonitor, triggerManualSLACheck } from './slaMonitor';

describe('slaMonitor', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    stopSLAMonitor();

    mocks.get.mockResolvedValue({ value: '30' });
    mocks.checkAndNotifySLABreaches.mockResolvedValue({
      checked: 2,
      notificationsSent: 1,
      notifications: [{ incidentId: 'inc-1', type: 'warning' }],
    });
  });

  it('starts once and warns when called multiple times', async () => {
    startSLAMonitor();
    await vi.runOnlyPendingTimersAsync();

    startSLAMonitor();
    expect(mocks.logger.warn).toHaveBeenCalledWith('SLA monitor already running');

    stopSLAMonitor();
  });

  it('runs manual SLA check successfully', async () => {
    await triggerManualSLACheck();

    expect(mocks.checkAndNotifySLABreaches).toHaveBeenCalledTimes(1);
    expect(mocks.logger.info).toHaveBeenCalledWith(
      'SLA check completed: checked=2, notifications=1'
    );
  });

  it('logs SLA check failure when check throws', async () => {
    mocks.checkAndNotifySLABreaches.mockRejectedValueOnce(new Error('boom'));

    await triggerManualSLACheck();

    expect(mocks.logger.error).toHaveBeenCalled();
  });

  it('reschedules interval when setting changes', async () => {
    mocks.get
      .mockResolvedValueOnce({ value: '30' })
      .mockResolvedValueOnce({ value: '15' });

    startSLAMonitor();
    await vi.runOnlyPendingTimersAsync();

    expect(mocks.logger.info).toHaveBeenCalledWith('SLA check interval updated to 15 minute(s)');
    stopSLAMonitor();
  });
});
