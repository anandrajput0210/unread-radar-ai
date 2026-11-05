export function parseCalendarDate(value, { dateOrder = "dmy" } = {}) {
  const input = String(value ?? "").trim();
  if (!input) return null;

  let year; let month; let day;
  let match = input.match(/^(\d{4})[/.\-](\d{1,2})[/.\-](\d{1,2})$/u);
  if (match) {
    year = Number(match[1]); month = Number(match[2]); day = Number(match[3]);
  } else {
    match = input.match(/^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{2,4})$/u);
    if (match) {
      const first = Number(match[1]); const second = Number(match[2]);
      year = Number(match[3]);
      if (year < 100) year += year >= 70 ? 1900 : 2000;
      if (first > 12) { day = first; month = second; }
      else if (second > 12) { month = first; day = second; }
      else if (dateOrder === "mdy") { month = first; day = second; }
      else { day = first; month = second; }
    } else {
      match = input.match(/^([A-Za-z]{3,9})\s+(\d{1,2})(?:st|nd|rd|th)?[,]?\s+(\d{4})$/iu)
        || input.match(/^(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]{3,9})[,]?\s+(\d{4})$/iu);
      if (!match) return null;
      const monthNames = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
      const monthTextFirst = /^[A-Za-z]/u.test(input);
      const monthText = (monthTextFirst ? match[1] : match[2]).slice(0, 3).toLowerCase();
      month = monthNames.indexOf(monthText) + 1;
      day = Number(monthTextFirst ? match[2] : match[1]);
      year = Number(match[3]);
    }
  }

  const check = new Date(Date.UTC(year, month - 1, day));
  if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) return null;
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function parseWhatsAppTimestamp(value, options = {}) {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const dateMatch = raw.match(/\b\d{4}[/.\-]\d{1,2}[/.\-]\d{1,2}\b|\b\d{1,2}[/.\-]\d{1,2}[/.\-]\d{2,4}\b/u)
    || raw.match(/\b[A-Za-z]{3,9}\s+\d{1,2}(?:st|nd|rd|th)?[,]?\s+\d{4}\b/iu);
  if (!dateMatch) return null;
  const date = parseCalendarDate(dateMatch[0], options);
  if (!date) return null;
  const timeMatch = raw.match(/\b(\d{1,2}):(\d{2})(?::\d{2})?\s*(am|pm)?\b/iu);
  let time = null;
  if (timeMatch) {
    let hour = Number(timeMatch[1]);
    const minute = Number(timeMatch[2]);
    const meridiem = timeMatch[3]?.toLowerCase();
    if (meridiem) {
      if (hour < 1 || hour > 12 || minute > 59) return null;
      if (meridiem === "am" && hour === 12) hour = 0;
      if (meridiem === "pm" && hour !== 12) hour += 12;
    } else if (hour > 23 || minute > 59) return null;
    time = `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
  }
  return { raw, date, time };
}

export function addCalendarDays(dateText, amount) {
  if (!dateText) return null;
  const [year, month, day] = dateText.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + amount));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

export function weekdayIndex(dateText) {
  const [year, month, day] = dateText.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

export function resolveDeadlineDate(duePhrase, messageDate = null, { timeZone, dateOrder = "dmy", requireMessageDate = false } = {}) {
  const phrase = normalizeDevanagariDay(String(duePhrase ?? "").trim().toLocaleLowerCase());
  if (!phrase) return null;
  let baseDate = messageDate;
  if (baseDate && /^\d{4}-\d{2}-\d{2}$/u.test(baseDate) === false) baseDate = parseCalendarDate(baseDate);
  if (!baseDate && requireMessageDate) {
    // No trustworthy message date: only an explicit calendar date can resolve.
    // Relative phrases (tomorrow, kal tak, Monday...) must never be measured
    // from "today", because that silently produces a confident wrong date.
    const explicit = phrase.match(/\b(?:\d{4}[/.\-]\d{1,2}[/.\-]\d{1,2}|\d{1,2}[/.\-]\d{1,2}[/.\-]\d{2,4}|[a-z]{3,9}\s+\d{1,2}(?:st|nd|rd|th)?[,]?\s+\d{4})\b/iu);
    return explicit ? parseCalendarDate(explicit[0], { dateOrder }) : null;
  }
  if (!baseDate) {
    const zone = timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
    const parts = new Intl.DateTimeFormat("en-CA", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
    const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    baseDate = `${values.year}-${values.month}-${values.day}`;
  }

  if (/\bday\s+after\s+tomorrow\b|\bparso\s+tak\b|परसों\s+तक/u.test(phrase)) return addCalendarDays(baseDate, 2);
  if (/\b(?:kal\s+(?:(?:subah|shaam|sham|raat|dopahar)\s+)?tak|tomorrow)\b|कल\s+तक/u.test(phrase)) return addCalendarDays(baseDate, 1);
  if (/\b(?:eod|end\s+of\s+(?:the\s+)?day|cob)\b|आज/u.test(phrase)) return baseDate;
  if (/\b(?:yesterday)\b/u.test(phrase)) return addCalendarDays(baseDate, -1);
  if (/\b(?:aaj|today|tonight)\b/u.test(phrase)) return baseDate;

  const absoluteDate = phrase.match(/\b(?:\d{4}[/.\-]\d{1,2}[/.\-]\d{1,2}|\d{1,2}[/.\-]\d{1,2}[/.\-]\d{2,4}|[a-z]{3,9}\s+\d{1,2}(?:st|nd|rd|th)?[,]?\s+\d{4})\b/iu);
  if (absoluteDate) return parseCalendarDate(absoluteDate[0], { dateOrder });

  const weekdayNames = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
  const weekdayMatch = phrase.match(/\b(next\s+)?(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/u);
  if (weekdayMatch) {
    const target = weekdayNames.indexOf(weekdayMatch[2]);
    const current = weekdayIndex(baseDate);
    let offset = (target - current + 7) % 7;
    if (weekdayMatch[1]) {
      // "next <weekday>": the first such day strictly after today, pushed into the
      // following Monday-Sunday week when it would still fall in the current one.
      if (offset === 0) offset = 7;
      const daysSinceMonday = (current + 6) % 7;
      if (daysSinceMonday + offset < 7) offset += 7;
    }
    return addCalendarDays(baseDate, offset);
  }
  // Bare "kal" and "parso" are deliberately unresolved: in Hindi they can
  // refer to either a past or future day without surrounding context.
  return null;
}

const DEVANAGARI_DAYS = [
  ["सोमवार", "monday"], ["मंगलवार", "tuesday"], ["बुधवार", "wednesday"], ["गुरुवार", "thursday"],
  ["शुक्रवार", "friday"], ["शनिवार", "saturday"], ["रविवार", "sunday"],
];
// "शुक्रवार तक" -> "friday", "आज शाम तक" -> "today", "कल तक" -> "tomorrow", "परसों तक" -> "day after tomorrow"
function normalizeDevanagariDay(phrase) {
  if (!/[\u0900-\u097F]/u.test(phrase)) return phrase;
  for (const [hi, en] of DEVANAGARI_DAYS) if (phrase.includes(hi)) return en;
  if (phrase.includes("परसों")) return "day after tomorrow";
  if (/कल/u.test(phrase)) return "tomorrow";
  if (/आज/u.test(phrase)) return "today";
  return phrase;
}
