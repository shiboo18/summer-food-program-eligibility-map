import { describe, expect, test } from "vitest";

import { parseAddress } from "../address-shape.js";

const valid = {
  line1: "1600 Pennsylvania Ave NW",
  city: "Washington",
  state: "DC",
  postalCode: "20500",
};

describe("parseAddress", () => {
  test("reads a mapped row as a US address", () => {
    expect(parseAddress(valid)).toEqual({
      kind: "address",
      address: {
        line1: "1600 Pennsylvania Ave NW",
        city: "Washington",
        state: "DC",
        postalCode: "20500",
        countryCode: "US",
      },
    });
  });

  test("carries a second line only when the row has one", () => {
    expect(parseAddress({ ...valid, line2: "Apt 4B" })).toEqual({
      kind: "address",
      address: {
        line1: "1600 Pennsylvania Ave NW",
        line2: "Apt 4B",
        city: "Washington",
        state: "DC",
        postalCode: "20500",
        countryCode: "US",
      },
    });
  });

  test("trims the cell text, so padding in the sheet is not read as part of the address", () => {
    expect(parseAddress({ line1: " 12 Main St ", city: " Austin ", state: " tx ", postalCode: " 78701 " })).toEqual({
      kind: "address",
      address: {
        line1: "12 Main St",
        city: "Austin",
        state: "tx",
        postalCode: "78701",
        countryCode: "US",
      },
    });
  });

  test("reads a row with nothing in any mapped column as blank rather than broken", () => {
    expect(parseAddress({ line1: "", city: "  ", state: "", postalCode: "" })).toEqual({ kind: "blank" });
  });

  test("restores the leading zero Excel drops from a north-eastern ZIP code", () => {
    const parsed = parseAddress({ ...valid, city: "Boston", state: "MA", postalCode: "2108" });
    expect(parsed).toEqual({
      kind: "address",
      address: {
        line1: "1600 Pennsylvania Ave NW",
        city: "Boston",
        state: "MA",
        postalCode: "02108",
        countryCode: "US",
      },
    });
  });

  test("keeps a ZIP+4 as given", () => {
    const parsed = parseAddress({ ...valid, postalCode: "20500-0003" });
    expect(parsed).toEqual({
      kind: "address",
      address: { ...valid, postalCode: "20500-0003", countryCode: "US" },
    });
  });

  const spellings = [
    { name: "an abbreviated saint", city: "St. Louis", state: "MO" },
    { name: "an apostrophe", city: "O'Fallon", state: "IL" },
    { name: "a hyphen", city: "Winston-Salem", state: "NC" },
    { name: "a state spelled out", city: "Sacramento", state: "California" },
    { name: "a two-word city", city: "Kill Devil Hills", state: "NC" },
    { name: "a lower-case state code", city: "Austin", state: "tx" },
  ];
  for (const { name, city, state } of spellings) {
    test(`accepts ${name}`, () => {
      expect(parseAddress({ ...valid, city, state }).kind).toBe("address");
    });
  }

  const rejections = [
    {
      name: "a row missing its city",
      cells: { ...valid, city: "" },
      reason: "Missing street, city, state, or ZIP code.",
    },
    {
      name: "a row missing its street",
      cells: { ...valid, line1: "" },
      reason: "Missing street, city, state, or ZIP code.",
    },
    {
      name: "a number where the state should be",
      cells: { ...valid, state: "12" },
      reason: 'State "12" is not a state — use a two-letter code like CA, or the full name.',
    },
    {
      name: "a state with a digit in it",
      cells: { ...valid, state: "TX2" },
      reason: 'State "TX2" is not a state — use a two-letter code like CA, or the full name.',
    },
    {
      name: "a number where the city should be",
      cells: { ...valid, city: "90210" },
      reason: 'City "90210" is not a city name — check which column the city is in.',
    },
    {
      name: "a city with a house number in it",
      cells: { ...valid, city: "12 Austin" },
      reason: 'City "12 Austin" is not a city name — check which column the city is in.',
    },
    {
      name: "a street with no street name",
      cells: { ...valid, line1: "1600" },
      reason: 'Street "1600" has no street name — check which column the street is in.',
    },
    {
      name: "a ZIP code with letters in it",
      cells: { ...valid, postalCode: "SW1A 1AA" },
      reason: 'ZIP code "SW1A 1AA" is not a 5-digit US ZIP code.',
    },
    {
      name: "a ZIP code of the wrong length",
      cells: { ...valid, postalCode: "123456" },
      reason: 'ZIP code "123456" is not a 5-digit US ZIP code.',
    },
  ];
  for (const { name, cells, reason } of rejections) {
    test(`rejects ${name}`, () => {
      expect(parseAddress(cells)).toEqual({ kind: "invalid", reason });
    });
  }

  test("reports the missing column before the shape of what is there, so the first fix is the simplest", () => {
    expect(parseAddress({ line1: "1600", city: "90210", state: "12", postalCode: "" })).toEqual({
      kind: "invalid",
      reason: "Missing street, city, state, or ZIP code.",
    });
  });
});
