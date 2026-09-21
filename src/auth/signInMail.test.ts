import { describe, expect, it } from "vitest";
import { signInMail } from "./signInMail";

const URL = "https://who-cares.example/api/auth/magic-link/verify?token=abc&callbackURL=%2F";

describe("signInMail (issue #157)", () => {
  it("link + code: carries both, the code alone on its own line", () => {
    const { subject, body } = signInMail({ url: URL, otp: "482913" });
    expect(subject).toBe("Sign in to WhoCares");
    expect(body).toContain(URL);
    expect(body.split("\n")).toContain("482913");
    expect(body).toContain("Home Screen");
    expect(body).toContain("5 minutes");
  });

  it("code only: no link, the code alone on its own line", () => {
    const { subject, body } = signInMail({ otp: "007321" });
    expect(subject).toBe("Sign in to WhoCares");
    expect(body).not.toContain("http");
    expect(body.split("\n")).toContain("007321");
    expect(body).toContain("5 minutes");
  });

  it("never wraps the code in spaces or punctuation (iOS autofill picks it out)", () => {
    for (const body of [
      signInMail({ url: URL, otp: "123456" }).body,
      signInMail({ otp: "123456" }).body,
    ]) {
      expect(body).toMatch(/\n123456\n/);
    }
  });
});
