export type PiiKind =
  | "email"
  | "phone"
  | "credit_card"
  | "api_key"
  | "ssn"
  | "aadhaar"
  | "pan"
  | "passport"
  | "iban"
  | "ifsc"
  | "gstin"
  | "bank_account"
  | "ipv4"
  | "ipv6"
  | "mac_address"
  | "dob"
  | "postal_code"
  | "jwt"
  | "aws_key"
  | "private_key"
  | "cvv"
  | "vehicle_reg"
  | "labeled_name"
  | "labeled_address"
  // Passbook / banking / invoice / ID documents
  | "upi_id"
  | "swift_bic"
  | "micr"
  | "routing_number"
  | "sort_code"
  | "customer_id"
  | "cif"
  | "folio"
  | "demat"
  | "cheque"
  | "invoice_id"
  | "tax_id"
  | "driver_license"
  | "voter_id"
  | "policy_number"
  | "employee_id"
  | "medical_id"
  | "labeled_amount"
  | "labeled_balance"
  | "nominee"
  | "father_name"
  | "branch_code"
  | "passbook_no";


export interface BBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface OcrWord {
  text: string;
  bbox: BBox;
  confidence?: number;
}

export interface PiiHit {
  id: string;
  kind: PiiKind;
  text: string;
  /** Full span covering the matched text (may span multiple OCR words). */
  bbox: BBox;
  /** Sub-regions to frost (partial email keeps ends visible). */
  blurRegions: BBox[];
  /** Human-readable preview with middle masked. */
  preview: string;
}

export type AnnotationTool =
  | "select"
  | "arrow"
  | "pen"
  | "rect"
  | "underline"
  | "text"
  | "frost"
  | "locate";

export type AnnotationColor =
  | "#FF3B30"
  | "#FF9500"
  | "#FFCC00"
  | "#34C759"
  | "#00C7BE"
  | "#007AFF"
  | "#FFFFFF"
  | "#1C1C1E";

export const ANNOTATION_COLORS: AnnotationColor[] = [
  "#FF3B30",
  "#FF9500",
  "#FFCC00",
  "#34C759",
  "#00C7BE",
  "#007AFF",
  "#FFFFFF",
  "#1C1C1E",
];

export interface BaseAnnotation {
  id: string;
  tool: AnnotationTool;
  color: AnnotationColor;
  strokeWidth: number;
}

export interface ArrowAnnotation extends BaseAnnotation {
  tool: "arrow";
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface PenAnnotation extends BaseAnnotation {
  tool: "pen";
  points: number[];
}

export interface RectAnnotation extends BaseAnnotation {
  tool: "rect";
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface UnderlineAnnotation extends BaseAnnotation {
  tool: "underline";
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface TextAnnotation extends BaseAnnotation {
  tool: "text";
  x: number;
  y: number;
  text: string;
  fontSize: number;
}

export interface FrostAnnotation extends BaseAnnotation {
  tool: "frost";
  x: number;
  y: number;
  width: number;
  height: number;
  /** Soft frost intensity 0-1 */
  intensity: number;
  /** Optional link back to a PII hit */
  piiId?: string;
}

export type Annotation =
  | ArrowAnnotation
  | PenAnnotation
  | RectAnnotation
  | UnderlineAnnotation
  | TextAnnotation
  | FrostAnnotation;

export interface EditorDocument {
  imageDataUrl: string;
  width: number;
  height: number;
  annotations: Annotation[];
}
