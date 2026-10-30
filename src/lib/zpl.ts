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
  labelLine3,
  labelLine4 = "",
  serialNumber,
}: {
  unitId: string;
  brandName: string;
  labelLine1: string;
  labelLine2: string;
  labelLine3: string;
  /** "Tested Amira · Checked Grace" — empty leaves the line off. */
  labelLine4?: string;
  serialNumber: string;
}): string {
  const brand = sanitizeZplText(brandName);
  const line1 = sanitizeZplText(labelLine1);
  const line2 = sanitizeZplText(labelLine2);
  const line3 = sanitizeZplText(labelLine3);
  const serial = sanitizeZplText(serialNumber);
  // The label font has no "·" — use a plain separator on paper.
  const line4 = sanitizeZplText(labelLine4).replace(/ · /g, " / ");

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
    `^FO160,8^A0N,26,26^FD${brand}^FS`,
    // Model name is the field most likely to run long — wrap it to 2 lines
    // instead of letting it run off the label edge.
    `^FO160,38^FB230,2,0,L,0^A0N,26,26^FD${line1}^FS`,
    // Colour and grade each get a fixed line below the (up to 2-line) model,
    // so a long model name can never push them off the label.
    `^FO160,96^A0N,26,26^FD${line2}^FS`,
    `^FO160,126^A0N,24,24^FD${line3}^FS`,
    // No serial number? Leave that line off rather than print "SN ".
    ...(serial ? [`^FO160,156^A0N,20,20^FDSN ${serial}^FS`] : []),
    // Who tested / checked it: one small line along the bottom, clipped to the
    // label width (^FB … 1 line) so a long name can't run off the edge.
    ...(line4 ? [`^FO160,180^FB240,1,0,L,0^A0N,17,17^FD${line4}^FS`] : []),
    "^XZ",
  ].join("\n");
}
