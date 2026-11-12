/**
 * Text from FJS26's Session template that the Teacher replaces when filling a Session in. A
 * section with nothing but this text is "not filled in" and is never used as a Source.
 */
const TEMPLATE_TEXT: RegExp[] = [
  /läggs (in|upp) här/i,
  /^☝️ Skriv passets innehåll/,
  /^Punkt \d+$/,
  /^(Agenda|Dagens upplägg|Länk till Github-repo)$/,
  /^✏️ Självstudier: övningar och andra resurser$/,
  // The workshop template's default day plan.
  /^🕘 09\.00 – Intro & genomgång av uppgiften$/,
  /^🕥 09\.30 – Arbetspass 1$/,
  /^🕛 12\.00 – Lunch$/,
  /^🕐 13\.00 – Arbetspass 2$/,
  /^🕒 15\.15 – Gemensam genomgång & avslut$/,
];

/** True when every line is empty or template text, i.e. nothing has been filled in. */
export function onlyTemplateText(lines: string[]): boolean {
  return lines.every((line) => {
    const trimmed = line.replace(/^- /, "").trim();
    return !trimmed || TEMPLATE_TEXT.some((pattern) => pattern.test(trimmed));
  });
}
