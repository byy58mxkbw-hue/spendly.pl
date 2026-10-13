import { describe, it, expect } from "vitest";
import { extractWzNumbers } from "./wz";

describe("extractWzNumbers — numery WZ z faktury KSeF", () => {
  it("pole <WZ> ze schematu FA (wiele wystąpień, z prefiksem przestrzeni nazw)", () => {
    const xml = `<tns:Faktura><tns:Fa><tns:WZ>WZ/101/10/2026</tns:WZ><tns:WZ>WZ/102/10/2026</tns:WZ></tns:Fa></tns:Faktura>`;
    expect(extractWzNumbers(xml)).toEqual(["WZ/101/10/2026", "WZ/102/10/2026"]);
  });

  it("lista po przecinku w jednym polu, bez duplikatów", () => {
    const xml = `<Fa><WZ>WZ 1/2026, WZ 2/2026; WZ 1/2026</WZ></Fa>`;
    expect(extractWzNumbers(xml)).toEqual(["WZ 1/2026", "WZ 2/2026"]);
  });

  it("DodatkowyOpis z kluczem WZ i numer WZ w opisie wolnym", () => {
    const xml = `<Fa>
      <DodatkowyOpis><Klucz>Dokumenty WZ</Klucz><Wartosc>WZ/55/26, WZ/56/26</Wartosc></DodatkowyOpis>
      <DodatkowyOpis><Klucz>Uwagi</Klucz><Wartosc>Dostawa do WZ: 77/10/26 rampa 2</Wartosc></DodatkowyOpis>
    </Fa>`;
    expect(extractWzNumbers(xml)).toEqual(["WZ/55/26", "WZ/56/26", "WZ 77/10/26"]);
  });

  it("faktura bez WZ → pusta lista", () => {
    expect(extractWzNumbers(`<Fa><P_1>2026-10-01</P_1></Fa>`)).toEqual([]);
    expect(extractWzNumbers("")).toEqual([]);
  });
});
