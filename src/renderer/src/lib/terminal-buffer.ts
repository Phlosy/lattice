const MAX_TERMINAL_BUFFER = 512_000;
const buffers = new Map<string, string>();

export function appendTerminalData(id: string, data: string): void {
  const next = (buffers.get(id) ?? "") + data;
  buffers.set(id, next.length > MAX_TERMINAL_BUFFER ? next.slice(-MAX_TERMINAL_BUFFER) : next);
}

export function getTerminalBuffer(id: string): string {
  return buffers.get(id) ?? "";
}

export function clearTerminalBuffer(id: string): void {
  buffers.delete(id);
}
