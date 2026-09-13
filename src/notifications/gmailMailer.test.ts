/**
 * `createGmailMailer` (issue #112) — the Gmail SMTP adapter. `nodemailer` is
 * mocked; the seam under test is config gating and the check-error/throw
 * contract the previous Resend adapter had (a send failure must surface as a
 * thrown error, never be swallowed here — `./services.ts` decides whether to
 * swallow it).
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const sendMail = vi.fn();
const createTransport = vi.fn((..._args: unknown[]) => ({ sendMail }));
vi.mock("nodemailer", () => ({
  createTransport: (...args: unknown[]) => createTransport(...args),
}));

const { createGmailMailer } = await import("./gmailMailer");

const CONFIG = { user: "parent@gmail.com", appPassword: "app-password" };

beforeEach(() => {
  sendMail.mockReset();
  createTransport.mockClear();
});

describe("createGmailMailer", () => {
  it("returns null without Gmail config", () => {
    expect(createGmailMailer(null)).toBeNull();
  });

  it("authenticates the transport with the Gmail service + App Password", () => {
    createGmailMailer(CONFIG);
    expect(createTransport).toHaveBeenCalledWith({
      service: "gmail",
      auth: { user: "parent@gmail.com", pass: "app-password" },
    });
  });

  it("sends the message from the configured Gmail address", async () => {
    sendMail.mockResolvedValue(undefined);
    const mailer = createGmailMailer(CONFIG);

    await mailer?.send({ to: "other@example.com", subject: "Hi", body: "Body text" });

    expect(sendMail).toHaveBeenCalledWith({
      from: "parent@gmail.com",
      to: "other@example.com",
      subject: "Hi",
      text: "Body text",
    });
  });

  it("throws when the send fails, carrying the underlying reason", async () => {
    sendMail.mockRejectedValue(new Error("Invalid login: 535-5.7.8"));
    const mailer = createGmailMailer(CONFIG);

    await expect(
      mailer?.send({ to: "other@example.com", subject: "Hi", body: "Body text" }),
    ).rejects.toThrow(/Gmail SMTP send failed: Invalid login: 535-5\.7\.8/);
  });
});
