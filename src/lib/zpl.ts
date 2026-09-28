// ^ and ~ are ZPL's own command/control prefixes — a brand, model, or serial
// number containing either would otherwise be interpreted as ZPL commands
// instead of printed as text, so strip them before they ever reach the
// printer. Newlines are flattened for the same reason (each field is a
// single printed line).
function sanitizeZplText(value: string): string {
  return value.replace(/[\^~]/g, "").replace(/[\r\n]/g, " ");
}

export function buildLabelZpl({
  unitId,
  brandName,
  labelLine1,
  labelLine2,
  serialNumber,
}: {
  unitId: string;
  brandName: string;
  labelLine1: string;
  labelLine2: string;
  serialNumber: string;
}): string {
  const brand = sanitizeZplText(brandName);
  const line1 = sanitizeZplText(labelLine1);
  const line2 = sanitizeZplText(labelLine2);
  const serial = sanitizeZplText(serialNumber);

  // 2 x 1 in label at 203 dpi (Zebra GK420D's native resolution) = 406 x 203
  // dots. Matches the fixed 2x1in size the printable-label preview uses —
  // keep both in sync if the physical label stock ever changes.
  return [
    "^XA",
    "^PW406",
    "^LL203",
    // QR: model 2, magnification 4, error correction M, automatic data mode.
    "^FO16,16^BQN,2,4",
    `^FDMA,${unitId}^FS`,
    `^FO160,10^A0N,20,20^FD${brand}^FS`,
    // Model name is the field most likely to run long — wrap it to 2 lines
    // instead of letting it run off the label edge.
    `^FO160,34^FB230,2,0,L,0^A0N,20,20^FD${line1}^FS`,
    `^FO160,90^A0N,18,18^FD${line2}^FS`,
    `^FO160,114^A0N,16,16^FDSN ${serial}^FS`,
    "^XZ",
  ].join("\n");
}
