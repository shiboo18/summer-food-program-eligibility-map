import { describe, expect, test, vi } from "vitest";

import type { AddressValidator, SpreadsheetReader, SpreadsheetWriter } from "../../contracts.js";
import type { Address } from "../../types/address.js";
import { SpreadsheetValidationService } from "../spreadsheet-validation-service.js";

const mapping = { line1: "Street", city: "City", state: "State", postalCode: "Zip" };

function address(line1: string): Address {
  return { line1, city: "Austin", state: "TX", postalCode: "78701", countryCode: "US" };
}

const correctedAddress: Address = {
  line1: "2 CORRECTED ST",
  city: "AUSTIN",
  state: "TX",
  postalCode: "78701-1234",
  countryCode: "US",
};

function createSpreadsheet(): SpreadsheetReader & SpreadsheetWriter {
  return {
    readSummary: async () => ({
      filePath: "/tmp/a.xlsx",
      fileName: "a.xlsx",
      headers: [],
      headerRowNumber: 1,
      rowCount: 3,
    }),
    readAddressRows: async () => ({
      rows: [
        { rowNumber: 2, address: address("1 Verified St") },
        { rowNumber: 3, address: address("2 Corrected St") },
        { rowNumber: 4, address: address("3 Failed St") },
      ],
      skipped: [{ rowNumber: 5, reason: "Missing street, city, state, or ZIP code." }],
    }),
    annotateResults: vi.fn(async () => undefined),
  };
}

const validator: AddressValidator = {
  validate: async (addresses) =>
    addresses.map((inputAddress, index) => {
      if (index === 0) {
        return { status: "verified", inputAddress, messages: [], location: { lat: 30.27, lng: -97.74, score: 100, precision: "rooftop" } };
      }
      if (index === 1) {
        return {
          status: "corrected",
          inputAddress,
          normalizedAddress: correctedAddress,
          messages: [],
          location: { lat: 30.28, lng: -97.75, score: 100, precision: "postal" },
        };
      }
      return { status: "unverified", inputAddress, messages: ["Smarty could not verify this address."] };
    }),
};

describe("SpreadsheetValidationService", () => {
  test("counts the corrected rows without writing to the partner's workbook", async () => {
    const spreadsheet = createSpreadsheet();
    const service = new SpreadsheetValidationService(spreadsheet, validator);

    const { report } = await service.validate({ filePath: "/tmp/a.xlsx", mapping, fileName: "a.xlsx" });

    expect(spreadsheet.annotateResults).not.toHaveBeenCalled();
    expect(report).toMatchObject({
      fileName: "a.xlsx",
      total: 4,
      verified: 1,
      corrected: 1,
    });
  });

  test("returns the parsed rows so the eligibility pass need not read the file again", async () => {
    const service = new SpreadsheetValidationService(createSpreadsheet(), validator);

    const { addressRows } = await service.validate({ filePath: "/tmp/a.xlsx", mapping, fileName: "a.xlsx" });

    expect(addressRows.rows.map((row) => row.rowNumber)).toEqual([2, 3, 4]);
    expect(addressRows.skipped).toEqual([{ rowNumber: 5, reason: "Missing street, city, state, or ZIP code." }]);
  });

  test("reports failures with row numbers in order", async () => {
    const service = new SpreadsheetValidationService(createSpreadsheet(), validator);

    const { report } = await service.validate({ filePath: "/tmp/a.xlsx", mapping, fileName: "a.xlsx" });

    expect(report.failures).toEqual([
      {
        rowNumber: 4,
        address: "3 Failed St, Austin, TX 78701",
        reason: "Smarty could not verify this address.",
      },
      { rowNumber: 5, address: "", reason: "Missing street, city, state, or ZIP code." },
    ]);
  });

  test("returns what each verified or corrected row needs for the location pass", async () => {
    const service = new SpreadsheetValidationService(createSpreadsheet(), validator);

    const { locations } = await service.validate({ filePath: "/tmp/a.xlsx", mapping, fileName: "a.xlsx" });

    expect([...locations.keys()].sort((a, b) => a - b)).toEqual([2, 3]);
    expect(locations.get(2)?.geocode).toEqual({
      point: { lat: 30.27, lng: -97.74 },
      score: 100,
      precision: "rooftop",
      matchedAddress: "1 Verified St, Austin, TX 78701",
    });
    // The corrected row is keyed off Smarty's normalized address, not the input.
    expect(locations.get(3)?.geocode).toEqual({
      point: { lat: 30.28, lng: -97.75 },
      score: 100,
      precision: "postal",
      matchedAddress: "2 CORRECTED ST, AUSTIN, TX 78701-1234",
    });
    /* Carried so the geocoder can look up the corrected address rather than what
       the partner typed. */
    expect(locations.get(3)?.standardizedAddress).toEqual(correctedAddress);
    expect(locations.has(4)).toBe(false);
  });

  test("returns each row's verification status, with the standardized address only when corrected", async () => {
    const service = new SpreadsheetValidationService(createSpreadsheet(), validator);

    const { verifications } = await service.validate({ filePath: "/tmp/a.xlsx", mapping, fileName: "a.xlsx" });

    expect(verifications.get(2)).toEqual({ status: "verified" });
    expect(verifications.get(3)).toEqual({
      status: "corrected",
      standardizedAddress: "2 CORRECTED ST, AUSTIN, TX 78701-1234",
    });
    expect(verifications.get(4)).toEqual({ status: "unverified" });
  });

  test("reports the rows skipped while reading as already behind the validator's count", async () => {
    const reporting: AddressValidator = {
      validate: async (addresses, onProgress) => {
        onProgress?.(addresses.length);
        return validator.validate(addresses);
      },
    };
    const service = new SpreadsheetValidationService(createSpreadsheet(), reporting);
    const reported: number[] = [];

    await service.validate({
      filePath: "/tmp/a.xlsx",
      mapping,
      fileName: "a.xlsx",
      onProgress: (completed) => reported.push(completed),
    });

    /* Three rows went to Smarty and one was skipped while reading, so the phase
       ends on the sheet's four data rows rather than short of them. */
    expect(reported).toEqual([4]);
  });
});
