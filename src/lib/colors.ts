// The camera colours people can choose from, in the order they're listed in the
// picker, each with the pill colours used wherever the colour is shown.
export type CameraColor = { name: string; bg: string; fg: string; outline?: boolean };

export const CAMERA_COLORS: CameraColor[] = [
  { name: "Black", bg: "#000000", fg: "#f6d77a" },
  { name: "Silver", bg: "#cfcfcf", fg: "#4b4b4b" },
  { name: "Red", bg: "#b30000", fg: "#ffd6d6" },
  { name: "White", bg: "#ffffff", fg: "#1f2937", outline: true },
  { name: "Purple", bg: "#5b2c83", fg: "#e9d8fb" },
  { name: "Pink", bg: "#ffd0cc", fg: "#c70000" },
  { name: "Brown", bg: "#7a3b00", fg: "#ffd9a8" },
  { name: "Blue", bg: "#0b4fa8", fg: "#ffffff" },
  { name: "Orange", bg: "#ff7a00", fg: "#1a1100" },
  { name: "Camouflage", bg: "#bfe0fa", fg: "#0b66c3" },
  { name: "Yellow", bg: "#fde68a", fg: "#6b4e00" },
  { name: "Gold", bg: "#ffc9a0", fg: "#7a3b00" },
  { name: "Plum", bg: "#5d3a8f", fg: "#ecdfff" },
  { name: "Green", bg: "#1f7a4d", fg: "#ffffff" },
  { name: "Bronze", bg: "#e4e4e4", fg: "#5a5a5a" },
  { name: "Flower", bg: "#cbbfd0", fg: "#3a2a40" },
  { name: "Chocolate", bg: "#4a3418", fg: "#f5d9a0" },
  { name: "MIXED", bg: "#e6e9ee", fg: "#444b57" },
  { name: "Grey", bg: "#6b6b6b", fg: "#ffffff" },
];

const BY_NAME = new Map(CAMERA_COLORS.map((c) => [c.name.toLowerCase(), c]));

/** The preset for a colour name (case-insensitive), or undefined for a custom/legacy colour. */
export function findColor(name: string): CameraColor | undefined {
  return BY_NAME.get(name.trim().toLowerCase());
}

/** Presets are saved with their canonical spelling ("purple" → "Purple"); anything else is kept as typed. */
export function canonicalColor(name: string): string {
  const trimmed = name.trim();
  return findColor(trimmed)?.name ?? trimmed;
}
