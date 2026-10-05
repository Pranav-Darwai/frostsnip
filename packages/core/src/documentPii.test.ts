import { describe, expect, it } from "vitest";
import { detectPiiInText } from "../src/detectPii";

function kinds(text: string) {
  return detectPiiInText(text).map((h) => h.kind);
}

describe("document / passbook / invoice PII", () => {
  it("detects passbook-style fields", () => {
    const text = `
      Account Holder: Priya Sharma
      A/C No. 123456789012
      CIF: 9988776655
      IFSC: SBIN0001234
      MICR Code: 400002002
      Branch Code: 01234
      Passbook No: PB-77881
      Nominee Name: Ravi Sharma
      Closing Balance: Rs. 45,230.50
      Father's Name: Suresh Sharma
    `;
    const k = kinds(text);
    expect(k).toContain("labeled_name");
    expect(k).toContain("bank_account");
    expect(k).toContain("cif");
    expect(k).toContain("ifsc");
    expect(k).toContain("micr");
    expect(k).toContain("branch_code");
    expect(k).toContain("passbook_no");
    expect(k).toContain("nominee");
    expect(k).toContain("labeled_balance");
    expect(k).toContain("father_name");
  });

  it("detects invoice / payment fields", () => {
    const text = `
      Invoice No: INV-2024-00981
      Bill To: Acme Traders
      Billing Address: 12 MG Road Bangalore 560001
      GSTIN: 29ABCDE1234F1Z5
      Amount Due: INR 12,450.00
      UPI ID: priya@okaxis
      SWIFT Code: SBININBBXXX
      Routing Number: 021000021
      Tax ID: EIN 12-3456789
      PO Number: PO-44521
    `;
    const k = kinds(text);
    expect(k).toContain("invoice_id");
    expect(k).toContain("labeled_name");
    expect(k).toContain("labeled_address");
    expect(k).toContain("gstin");
    expect(k).toContain("labeled_amount");
    expect(k).toContain("upi_id");
    expect(k).toContain("swift_bic");
    expect(k).toContain("routing_number");
    expect(k).toContain("tax_id");
  });

  it("detects ID / HR / medical document fields", () => {
    const text = `
      Driving Licence: KA01 20190012345
      Voter ID: ABC1234567
      Policy Number: POL/HL/998877
      Employee ID: EMP-4421
      Patient ID: UHID-99821
      MRN: MRN99887766
      Customer ID: CUST-10021
      Folio No: 123456789012
      DP ID: IN300476
      Cheque No: 000456
      Sort Code: 20-00-00
    `;
    const k = kinds(text);
    expect(k).toContain("driver_license");
    expect(k).toContain("voter_id");
    expect(k).toContain("policy_number");
    expect(k).toContain("employee_id");
    expect(k).toContain("medical_id");
    expect(k).toContain("customer_id");
    expect(k).toContain("folio");
    expect(k).toContain("demat");
    expect(k).toContain("cheque");
    expect(k).toContain("sort_code");
  });
});
