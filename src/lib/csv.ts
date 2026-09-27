export function toCsv(headers: string[], rows: (string | number)[][]): string {
  const escape = (value: string | number) => {
    let str = String(value);
    // Free-text fields (note, serial_number) are user-entered — a value
    // starting with =, +, -, @, a tab, or a carriage return gets executed
    // as a formula when Excel/Sheets opens the file. Prefix with a literal
    // quote to force it to be read as text instead.
    if (typeof value === "string" && /^[=+\-@\t\r]/.test(str)) str = `'${str}`;
    if (/[",\r\n]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
    return str;
  };
  const lines = [headers.map(escape).join(","), ...rows.map((row) => row.map(escape).join(","))];
  return lines.join("\n");
}
