import { describe, it, expect } from "vitest";
import { parseFA3Xml, KsefParseError } from "@workspace/ksef-client";

// Faza 2.5 — parser KSeF musi odrzucać XML z DOCTYPE/ENTITY (ochrona przed XXE / billion-laughs).
describe("XXE guard w parseFA3Xml", () => {
  it("odrzuca <!DOCTYPE>", () => {
    const xml = `<?xml version="1.0"?><!DOCTYPE foo [<!ENTITY x "y">]><Faktura></Faktura>`;
    expect(() => parseFA3Xml(xml)).toThrow(KsefParseError);
  });

  it("odrzuca samo <!ENTITY>", () => {
    const xml = `<?xml version="1.0"?><Faktura><!ENTITY evil SYSTEM "file:///etc/passwd"></Faktura>`;
    expect(() => parseFA3Xml(xml)).toThrow(KsefParseError);
  });

  it("guard jest case-insensitive (<!doctype>)", () => {
    const xml = `<?xml version="1.0"?><!doctype html><Faktura></Faktura>`;
    expect(() => parseFA3Xml(xml)).toThrow(KsefParseError);
  });
});
