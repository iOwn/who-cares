import { describe, expect, it, vi } from 'vitest';

import type { Mailer, Notifier, PushSender } from '../ports';
import { fixedClock, noopMailer, noopNotifier, noopPushSender, systemClock } from './noop';

describe('systemClock', () => {
  it('returns the current time as a Date', () => {
    const before = Date.now();
    const now = systemClock.now();
    expect(now).toBeInstanceOf(Date);
    expect(now.getTime()).toBeGreaterThanOrEqual(before);
  });
});

describe('fixedClock', () => {
  it('always returns the same instant, defensively copied', () => {
    const instant = new Date('2025-01-06T08:00:00.000Z');
    const clock = fixedClock(instant);

    const a = clock.now();
    a.setFullYear(1999);

    expect(clock.now().toISOString()).toBe('2025-01-06T08:00:00.000Z');
  });
});

describe('no-op service adapters', () => {
  it('resolve without throwing and forward to the optional logger', async () => {
    const log = vi.fn();
    const mailer: Mailer = noopMailer(log);
    const push: PushSender = noopPushSender(log);
    const notifier: Notifier = noopNotifier(log);

    await expect(
      mailer.send({ to: 'a@example.com', subject: 's', body: 'b' }),
    ).resolves.toBeUndefined();
    await expect(
      push.send({ memberId: 'm1', title: 't', body: 'b' }),
    ).resolves.toBeUndefined();
    await expect(
      notifier.notify({ recipientId: 'm1', event: 'e', title: 't', body: 'b' }),
    ).resolves.toBeUndefined();

    expect(log).toHaveBeenCalledTimes(3);
  });

  it('are silent by default', async () => {
    await expect(
      noopMailer().send({ to: 'a@example.com', subject: 's', body: 'b' }),
    ).resolves.toBeUndefined();
  });
});
