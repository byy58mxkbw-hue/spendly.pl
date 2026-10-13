import { describe, it, expect } from "vitest";
import { extractWzNumbers, extractWzDetails, wzKey } from "./wz";

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

  it("Stelma: pole <WZ> + te same WZ w opisie z datami i kwotami → tylko 6 numerów z pola", () => {
    const xml = `<Fa>
      <WZ>WZ/983/2026</WZ><WZ>WZ/991/2026</WZ><WZ>WZ/1007/2026</WZ><WZ>WZ/1015/2026</WZ><WZ>WZ/1038/2026</WZ><WZ>WZ/1187/2026</WZ>
      <DodatkowyOpis><Klucz>Opis faktury</Klucz><Wartosc>Do dokumentów WZ:
05.10 WZ983 519,12
06.10 WZ991 405,43
07.10 WZ1007 669,43
08.10 WZ1015 690,71
09.10 WZ1038 220,41
10.10 WZ1187 1694,81</Wartosc></DodatkowyOpis>
    </Fa>`;
    expect(extractWzNumbers(xml)).toEqual(["WZ/983/2026", "WZ/991/2026", "WZ/1007/2026", "WZ/1015/2026", "WZ/1038/2026", "WZ/1187/2026"]);
  });

  it("data i kwota każdej WZ z opisu „05.10 WZ983 519,12”", () => {
    const xml = `<Fa><WZ>WZ/983/2026</WZ><DodatkowyOpis><Klucz>Opis faktury</Klucz><Wartosc>Do dokumentów WZ:
05.10 WZ983 519,12
10.10 WZ1187 1694,81</Wartosc></DodatkowyOpis></Fa>`;
    const d = extractWzDetails(xml);
    expect(d.get(wzKey("WZ/983/2026"))).toEqual({ date: "05.10", amount: 519.12 });
    expect(d.get(wzKey("WZ/1187/2026"))).toEqual({ date: "10.10", amount: 1694.81 });
  });

  it("ten sam opis BEZ pola <WZ> → numery z opisu, bez dat", () => {
    const xml = `<Fa><DodatkowyOpis><Klucz>Opis faktury</Klucz><Wartosc>Do dokumentów WZ:
05.10 WZ983 519,12
06.10 WZ991 405,43</Wartosc></DodatkowyOpis></Fa>`;
    expect(extractWzNumbers(xml)).toEqual(["WZ 983", "WZ 991"]);
  });

  it("faktura bez WZ → pusta lista", () => {
    expect(extractWzNumbers(`<Fa><P_1>2026-10-01</P_1></Fa>`)).toEqual([]);
    expect(extractWzNumbers("")).toEqual([]);
  });
});
