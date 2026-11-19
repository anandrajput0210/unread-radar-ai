// Deterministic synthetic chats for timing only. No real conversations.
const NAMES = ["Meera", "Arjun", "Neha", "Rahul", "Priya"];
const FILLER = [
  "Good morning everyone", "Did anyone see the match last night?", "Lunch at 1?", "Running a few minutes late",
  "Thanks, that helps", "Can you share the link again?", "I will check and revert", "Sounds good",
  "Noted", "The client call went fine", "Please review the draft when free", "Sent the invoice to accounts",
];
function pad(n) { return String(n).padStart(2, "0"); }
function line(i, speaker, text) {
  const minutes = 540 + i * 3;
  return `12/11/2026, ${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)} - ${speaker}: ${text}`;
}
export function buildChat(messageCount) {
  const rows = [];
  for (let i = 0; i < messageCount; i += 1) {
    const speaker = NAMES[i % NAMES.length];
    let text = FILLER[i % FILLER.length];
    if (i % 7 === 2) text = `${NAMES[(i + 1) % NAMES.length]}, please send the report by Friday`;
    if (i % 7 === 3) text = "Sure, I will send it";
    rows.push(line(i, speaker, text));
  }
  return rows.join("\n");
}
export const INPUTS = { small: buildChat(3), medium: buildChat(50) };
