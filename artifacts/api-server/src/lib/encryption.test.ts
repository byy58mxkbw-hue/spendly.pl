import { describe, it, expect } from "vitest";
import { encryptSecret, decryptSecret, maskToken } from "./encryption";

// Faza 2.3 — token KSeF nigdy nie może wyjść z bazy w plaintext.
// KSEF_ENCRYPTION_KEY dostarcza vitest.config (projekt api).
describe("encryption (AES-256-GCM)", () => {
  it("round-trip zachowuje wartość (w tym znaki PL)", () => {
    const secret = "tajny-token-KSeF-żółć-1234";
    expect(decryptSecret(encryptSecret(secret))).toBe(secret);
  });

  it("każde szyfrowanie ma inny IV → inny ciphertext", () => {
    const a = encryptSecret("ten-sam-tekst");
    const b = encryptSecret("ten-sam-tekst");
    expect(a).not.toBe(b);
    // ...ale oba odszyfrowują się poprawnie
    expect(decryptSecret(a)).toBe("ten-sam-tekst");
    expect(decryptSecret(b)).toBe("ten-sam-tekst");
  });

  it("odrzuca zmanipulowany ciphertext (GCM auth)", () => {
    const buf = Buffer.from(encryptSecret("abc"), "base64");
    buf[buf.length - 1] ^= 0xff; // przekręć ostatni bajt ciphertextu
    expect(() => decryptSecret(buf.toString("base64"))).toThrow();
  });

  it("odrzuca za krótki payload", () => {
    expect(() => decryptSecret(Buffer.from("krótkie").toString("base64"))).toThrow();
  });

  it("maskToken pokazuje tylko 4 ostatnie znaki", () => {
    expect(maskToken("abcd1234WXYZ")).toBe("••••••WXYZ");
    expect(maskToken("")).toBe("");
  });
});
