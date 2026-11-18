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
    },
    {
      name: "a row missing its street",
      cells: { ...valid, line1: "" },
    },
    {
      name: "a number where the state should be",
      cells: { ...valid, state: "12" },
    },
    {
      name: "a state with a digit in it",
      cells: { ...valid, state: "TX2" },
    },
    {
      name: "a number where the city should be",
      cells: { ...valid, city: "90210" },
    },
    {
      name: "a city with a house number in it",
      cells: { ...valid, city: "12 Austin" },
    },
    {
      name: "a street with no street name",
      cells: { ...valid, line1: "1600" },
    },
    {
      name: "a ZIP code with letters in it",
      cells: { ...valid, postalCode: "SW1A 1AA" },
    },
    {
      name: "a ZIP code of the wrong length",
      cells: { ...valid, postalCode: "123456" },
    },
  ];
  for (const { name, cells } of rejections) {
    test(`rejects ${name}`, () => {
      expect(parseAddress(cells)).toEqual({ kind: "invalid" });
    });
  }
});
