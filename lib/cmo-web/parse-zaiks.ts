/** Parse ZAiKS wanted-creators list from Firecrawl markdown (Vaadin grid → flat text). */

export function parseZaiksMarkdownNames(markdown: string): string[] {
  const names: string[] = [];
  const lines = markdown.split("\n").map((l) => l.trim()).filter(Boolean);

  for (const line of lines) {
    if (line.startsWith("|") || line.startsWith("---")) continue;
    if (/^(Szukaj|Nazwa|Twórcy|polski|english|Lista|Wyszukiwanie|cookie|Zaloguj)/i.test(line)) continue;
    if (/twórców|poszukiwanych|reCAPTCHA|arrow-down/i.test(line)) continue;
    if (line.length < 2 || line.length > 120) continue;
    if (/^!\[/.test(line)) continue;
    names.push(line.replace(/\s+/g, " "));
  }

  return [...new Set(names)];
}
