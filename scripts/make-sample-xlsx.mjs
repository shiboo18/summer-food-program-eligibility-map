import ExcelJS from "exceljs";

const rows = [
  ["Doe, John", "4142 Old Hillsboro Rd", "Franklin", "TN", "37064"], // rural; area Not Eligible (0%)
  ["Smith, Ava", "2022 9th Ave N", "Nashville", "TN", "37208"], // not rural; In Area
  ["Nguyen, Kim", "24845 Natchez Trace Rd", "Wildersville", "TN", "38388"], // rural; In Area — Averaged (needs approval)
  ["Reyes, Mia", "100 Hickman Springs Rd", "Centerville", "TN", "37033"], // rural; In Area
  ["Brown, Sam", "104 Packinghouse Rd", "Statesboro", "GA", "30458"], // rural; In Area
  ["Lee, Pat", "185 Hayes Rd", "Eastanollee", "GA", "30538"], // low-confidence geocode: needs verification
  ["Ghost, Row", "123 Nowhere Fake Rd", "Nowheresville", "TN", "00000"], // undeliverable: Not located
];

const workbook = new ExcelJS.Workbook();
const sheet = workbook.addWorksheet("Enrollment");
sheet.addRow(["Student Name", "Street Address", "City", "State", "ZIP"]);
for (const row of rows) {
  sheet.addRow(row);
}

const outPath = new URL("./sample-addresses.xlsx", import.meta.url);
await workbook.xlsx.writeFile(outPath.pathname);
console.log(`Wrote ${rows.length} rows to ${outPath.pathname}`);
