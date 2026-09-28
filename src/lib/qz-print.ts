// Talks to the QZ Tray desktop app (must be installed and running locally —
// see https://qz.io/download/) over its local websocket, bypassing the
// browser's print dialog entirely and sending raw ZPL straight to the
// printer. Every export here is client-only: qz-tray touches window/WebSocket
// at import time, so callers must dynamic-import this module from inside an
// event handler, never at module top level.

export async function connectQz(): Promise<void> {
  const { default: qz } = await import("qz-tray");
  if (qz.websocket.isActive()) return;
  await qz.websocket.connect();
}

export async function findPrinters(): Promise<string[]> {
  const { default: qz } = await import("qz-tray");
  const result = await qz.printers.find();
  return Array.isArray(result) ? result : [result];
}

export async function printZpl(printerName: string, zpl: string): Promise<void> {
  const { default: qz } = await import("qz-tray");
  const config = qz.configs.create(printerName);
  await qz.print(config, [zpl]);
}
