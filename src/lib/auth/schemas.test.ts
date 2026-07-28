import { describe, expect, it } from "vitest";

import {
  loginSchema,
  passwordSchema,
  recoverySchema,
  updatePasswordSchema,
} from "@/lib/auth/schemas";

describe("passwordSchema (spec A2: >=8 chars, letters+numbers)", () => {
  it("accepts a compliant password", () => {
    expect(passwordSchema.safeParse("abcd1234").success).toBe(true);
  });

  it("rejects a password shorter than 8 characters", () => {
    expect(passwordSchema.safeParse("abc123").success).toBe(false);
  });

  it("rejects a password with only letters", () => {
    expect(passwordSchema.safeParse("abcdefgh").success).toBe(false);
  });

  it("rejects a password with only numbers", () => {
    expect(passwordSchema.safeParse("12345678").success).toBe(false);
  });
});

describe("updatePasswordSchema", () => {
  it("accepts matching, compliant passwords", () => {
    const result = updatePasswordSchema.safeParse({
      password: "abcd1234",
      confirmPassword: "abcd1234",
    });
    expect(result.success).toBe(true);
  });

  it("rejects mismatched confirmation", () => {
    const result = updatePasswordSchema.safeParse({
      password: "abcd1234",
      confirmPassword: "abcd1235",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a non-compliant password even if confirmation matches", () => {
    const result = updatePasswordSchema.safeParse({
      password: "abcdefgh",
      confirmPassword: "abcdefgh",
    });
    expect(result.success).toBe(false);
  });
});

describe("loginSchema", () => {
  it("accepts a valid email and non-empty password", () => {
    expect(
      loginSchema.safeParse({ email: "a@b.com", password: "x" }).success,
    ).toBe(true);
  });

  it("rejects an invalid email", () => {
    expect(
      loginSchema.safeParse({ email: "not-an-email", password: "x" }).success,
    ).toBe(false);
  });

  it("rejects an empty password", () => {
    expect(
      loginSchema.safeParse({ email: "a@b.com", password: "" }).success,
    ).toBe(false);
  });
});

describe("recoverySchema", () => {
  it("rejects an invalid email", () => {
    expect(recoverySchema.safeParse({ email: "bad" }).success).toBe(false);
  });

  it("accepts a valid email", () => {
    expect(recoverySchema.safeParse({ email: "a@b.com" }).success).toBe(true);
  });
});
