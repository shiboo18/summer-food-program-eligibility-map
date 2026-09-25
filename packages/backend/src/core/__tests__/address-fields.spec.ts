import { describe, expect, test } from "vitest";

import {
  addressFields,
  type AddressField,
  cachedColumnMapping,
  followingHeaders,
  preferredHeader,
} from "../address-fields.js";

describe("addressFields", () => {
  test("lists the five address fields in form order", () => {
    expect(addressFields.map((entry) => entry.field)).toEqual([
      "line1",
      "line2",
      "city",
      "state",
      "postalCode",
    ]);
  });

  test("marks only the second address line as optional", () => {
    const optional = addressFields.filter((entry) => entry.optional).map((entry) => entry.field);
    expect(optional).toEqual(["line2"]);
  });

  test("gives every field a label and guessing candidates", () => {
    for (const entry of addressFields) {
      expect(entry.label.trim()).not.toBe("");
      expect(entry.candidates.length).toBeGreaterThan(0);
      for (const candidate of entry.candidates) {
        expect(candidate).toBe(candidate.toLowerCase());
      }
    }
  });
});

describe("cachedColumnMapping", () => {
  const headers = ["Address Line#1", "Line#2", "City", "State", "ZipCode"];
  const mapping = {
    line1: "Address Line#1",
    line2: "Line#2",
    city: "City",
    state: "State",
    postalCode: "ZipCode",
  };

  test("stores each chosen column as its header cell, so the store keeps it", () => {
    expect(cachedColumnMapping(mapping, headers, 1)).toEqual({
      line1: "A1",
      line2: "B1",
      city: "C1",
      state: "D1",
      postalCode: "E1",
    });
  });

  test("stores the row the names were read from, so the cell matches the file", () => {
    expect(cachedColumnMapping(mapping, headers, 2)).toEqual({
      line1: "A2",
      line2: "B2",
      city: "C2",
      state: "D2",
      postalCode: "E2",
    });
  });

  test("omits a column the sheet does not have", () => {
    expect(cachedColumnMapping({ ...mapping, city: "Town" }, headers, 1)).toEqual({
      line1: "A1",
      line2: "B1",
      state: "D1",
      postalCode: "E1",
    });
  });

  test("stores nothing for a sheet with no headers", () => {
    expect(cachedColumnMapping(mapping, [], 1)).toEqual({});
  });

  test("stores no cell for a field left empty, even where the sheet leaves a column unnamed", () => {
    const withUnnamed = ["Address Line#1", "", "City", "State", "ZipCode"];

    expect(cachedColumnMapping({ ...mapping, line2: "" }, withUnnamed, 1)).toEqual({
      line1: "A1",
      city: "C1",
      state: "D1",
      postalCode: "E1",
    });
  });
});

describe("followingHeaders", () => {
  const headers = ["Name", "Street", "Apt", "City", "State", "Zip", "Phone"];

  /** The five selects as the screen holds them; an empty choice is "not used". */
  function chose(chosen: Partial<Record<AddressField, string>>): Record<AddressField, string> {
    return { line1: "", line2: "", city: "", state: "", postalCode: "", ...chosen };
  }

  const wholeAddress = chose({
    line1: "Street",
    line2: "Apt",
    city: "City",
    state: "State",
    postalCode: "Zip",
  });

  test("gives each field after the street the next column along", () => {
    expect(followingHeaders("line1", wholeAddress, headers)).toEqual({
      line2: "Apt",
      city: "City",
      state: "State",
      postalCode: "Zip",
    });
  });

  test("moves the fields after an unused second line up beside the street", () => {
    const withoutLine2 = chose({ ...wholeAddress, line2: "" });

    expect(followingHeaders("line2", withoutLine2, headers)).toEqual({
      city: "Apt",
      state: "City",
      postalCode: "State",
    });
  });

  test("moves them back down when the second line is given a column again", () => {
    const shifted = chose({
      line1: "Street",
      line2: "Apt",
      city: "Apt",
      state: "City",
      postalCode: "State",
    });

    expect(followingHeaders("line2", shifted, headers)).toEqual({
      city: "City",
      state: "State",
      postalCode: "Zip",
    });
  });

  test("keeps the second line unused when the street moves, closing the gap again", () => {
    const withoutLine2 = chose({ ...wholeAddress, line2: "" });

    expect(followingHeaders("line1", withoutLine2, headers)).toEqual({
      line2: "",
      city: "Apt",
      state: "City",
      postalCode: "State",
    });
  });

  test("leaves the fields before the change alone, naming only the ones after it", () => {
    const movedCity = chose({ ...wholeAddress, city: "Name" });

    expect(followingHeaders("city", movedCity, headers)).toEqual({
      state: "Street",
      postalCode: "Apt",
    });
  });

  test("names nothing when the last field is the one that changed", () => {
    expect(followingHeaders("postalCode", wholeAddress, headers)).toEqual({});
  });

  test("gives no column to a field that would fall past the last column", () => {
    const nearTheEnd = chose({ ...wholeAddress, line1: "City" });

    expect(followingHeaders("line1", nearTheEnd, headers)).toEqual({
      line2: "State",
      city: "Zip",
      state: "Phone",
      postalCode: "",
    });
  });

  test("gives no column where the sheet leaves one unnamed, keeping the rest in place", () => {
    expect(followingHeaders("line1", wholeAddress, ["Street", "Apt", "", "State", "Zip"])).toEqual({
      line2: "Apt",
      city: "",
      state: "State",
      postalCode: "Zip",
    });
  });

  test("gives no columns at all for a street column this sheet does not have", () => {
    const unknownStreet = chose({ ...wholeAddress, line1: "Site Address" });

    expect(followingHeaders("line1", unknownStreet, headers)).toEqual({
      line2: "",
      city: "",
      state: "",
      postalCode: "",
    });
  });

  test("gives no columns at all when nothing up to the change names a column", () => {
    const nothingChosen = chose({ city: "City", state: "State", postalCode: "Zip" });

    expect(followingHeaders("line2", nothingChosen, headers)).toEqual({
      city: "",
      state: "",
      postalCode: "",
    });
  });

  test("takes the first of two columns sharing the street's name, as the mapping does", () => {
    expect(followingHeaders("line1", wholeAddress, ["Street", "City", "Street", "State"])).toEqual({
      line2: "City",
      city: "Street",
      state: "State",
      postalCode: "",
    });
  });
});

describe("preferredHeader", () => {
  const headers = ["Site Address", "Line#2", "City", "State", "Mailing Zip"];

  test("offers the saved cell's column, beating a column the name would have guessed", () => {
    expect(preferredHeader("A1", headers, ["zip", "postal"])).toBe("Site Address");
  });

  test("offers the guess when the saved cell is past the last column of this file", () => {
    expect(preferredHeader("Z1", headers, ["zip", "postal"])).toBe("Mailing Zip");
  });

  test("offers the guess when nothing is saved for the field", () => {
    expect(preferredHeader(undefined, headers, ["city", "town"])).toBe("City");
  });

  test("prefers a column named exactly like a candidate over one that contains it", () => {
    expect(preferredHeader(undefined, ["Home State", "State"], ["state"])).toBe("State");
  });

  test("matches a later candidate when the first one names no column", () => {
    expect(preferredHeader(undefined, headers, ["postal", "zip"])).toBe("Mailing Zip");
  });

  test("offers nothing when no candidate matches any column", () => {
    expect(preferredHeader(undefined, headers, ["county"])).toBe("");
  });

  test("offers nothing for a file with no headers", () => {
    expect(preferredHeader("A1", [], ["address"])).toBe("");
  });

  test("offers the guess when the saved cell points at a column the file leaves unnamed", () => {
    expect(preferredHeader("B1", ["Site Address", "", "City"], ["city"])).toBe("City");
  });
});
