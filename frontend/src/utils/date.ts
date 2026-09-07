export function formatGermanDate(value: unknown): string {
  const text = String(value ?? "").trim();
  if (!text) return "-";
  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})(?:$|[T ])/);
  if (iso) return `${iso[3]}.${iso[2]}.${iso[1]}`;
  const german = text.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (german) return `${german[1]!.padStart(2, "0")}.${german[2]!.padStart(2, "0")}.${german[3]}`;
  return text;
}
