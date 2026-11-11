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
      skipped: [5],
    }),
    annotateResults: vi.fn(async () => undefined),
  };
}

const validator: AddressValidator = {
  validate: async (addresses) =>
    addresses.map((_address, index) => {
      if (index === 0) {
        return { status: "verified", location: { lat: 30.27, lng: -97.74, score: 100, precision: "rooftop" } };
      }
      if (index === 1) {
        return {
          status: "corrected",
          normalizedAddress: correctedAddress,
          location: { lat: 30.28, lng: -97.75, score: 100, precision: "postal" },
        };
      }
      return { status: "unverified" };
    }),
};

describe("SpreadsheetValidationService", () => {
  test("counts verified, corrected and failed rows without writing to the partner's workbook", async () => {
    const spreadsheet = createSpreadsheet();
    const service = new SpreadsheetValidationService(spreadsheet, validator);

    const { report } = await service.validate({ filePath: "/tmp/a.xlsx", mapping });

    expect(spreadsheet.annotateResults).not.toHaveBeenCalled();
    /* Failed counts the unverified row and the row set aside while reading. */
    expect(report).toEqual({ verified: 1, corrected: 1, failed: 2 });
  });

  test("returns the parsed rows so the eligibility pass need not read the file again", async () => {
    const service = new SpreadsheetValidationService(createSpreadsheet(), validator);

    const { addressRows } = await service.validate({ filePath: "/tmp/a.xlsx", mapping });

    expect(addressRows.rows.map((row) => row.rowNumber)).toEqual([2, 3, 4]);
    expect(addressRows.skipped).toEqual([5]);
  });

  test("returns what each verified or corrected row needs for the location pass", async () => {
    const service = new SpreadsheetValidationService(createSpreadsheet(), validator);

    const { locations } = await service.validate({ filePath: "/tmp/a.xlsx", mapping });

    expect([...locations.keys()].sort((a, b) => a - b)).toEqual([2, 3]);
    expect(locations.get(2)?.geocode).toEqual({
      point: { lat: 30.27, lng: -97.74 },
      score: 100,
      precision: "rooftop",
    });
    expect(locations.get(3)?.geocode).toEqual({
      point: { lat: 30.28, lng: -97.75 },
      score: 100,
      precision: "postal",
    });
    /* So the geocoder looks up the corrected address, not what the partner typed. */
    expect(locations.get(3)?.standardizedAddress).toEqual(correctedAddress);
    expect(locations.has(4)).toBe(false);
  });

  test("returns each row's verification status, with the standardized address only when corrected", async () => {
    const service = new SpreadsheetValidationService(createSpreadsheet(), validator);

    const { verifications } = await service.validate({ filePath: "/tmp/a.xlsx", mapping });

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
      onProgress: (completed) => reported.push(completed),
    });

    /* Three rows went to Smarty and one was skipped while reading, so the phase
       ends on the sheet's four data rows rather than short of them. */
    expect(reported).toEqual([4]);
  });
});
