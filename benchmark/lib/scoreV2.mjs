// Schema-v2 scorer: one-to-one matching, strict and lenient, split owner metrics, deadline
// precision and recall, link and event scoring (detection and linking scored independently),
// end-state and condition-state accuracy. Independent of the legacy scorer (which the ratchet
// depends on and whose default CLI output must remain unchanged). The V2 scorer deliberately fixes
// strict-mode false-positive suppression and full-name owner identity in its own metrics.
import { analyzeConversations } from "../../src/lib/extraction/index.js";
import { dueOf, messageIndex } from "./score.mjs";
import { LINK_NONE, normalizeCondition, normalizeEvent, normalizePredEnd } from "./vocab.mjs";
import { bootstrapIntervals } from "./bootstrap.mjs";

const spanMessage = (chat, span) => {
  const pos = span?.startOffset;
  return chat.messages.find((m) => pos >= m.start && pos < m.end)?.index ?? -1;
};
const taskKey = (chat, g) => g.tid || `${chat.id}-${g.id}`;
const overlaps = (a, b) => Boolean(a && b && a.startOffset < b.endOffset && b.startOffset < a.endOffset);

// Unicode-aware whole-token matching. "Ann" is NOT supported by "planning".
const tokens = (text) => String(text ?? "").normalize("NFC").toLowerCase().match(/[\p{L}\p{M}\p{N}_]+/gu) || [];
const contentTokens = (text) => new Set(tokens(text).filter((t) => t.length > 2));
const similarity = (a, b) => {
  const A = contentTokens(a), B = contentTokens(b);
  if (!A.size || !B.size) return 0;
  const both = [...A].filter((t) => B.has(t)).length;
  return both / (A.size + B.size - both);
};
const DUPLICATE_SIMILARITY = 0.5;
const normalizeOwnerIdentity = (value) => String(value ?? "")
  .normalize("NFC")
  .toLowerCase()
  .replace(/^@/, "")
  .trim()
  .replace(/\s+/g, " ");

// Schema v2 compares the complete normalized display name. The legacy scorer's first-token
// shortcut is deliberately not reused here: "Mary Ann" and "Mary Zed" are different people.
const sameOwnerV2 = (predicted, gold) => Boolean(predicted && gold)
  && normalizeOwnerIdentity(predicted) === normalizeOwnerIdentity(gold);

const containsTokenSequence = (haystack, needle) => {
  if (!needle.length || needle.length > haystack.length) return false;
  for (let i = 0; i <= haystack.length - needle.length; i++) {
    if (needle.every((token, j) => haystack[i + j] === token)) return true;
  }
  return false;
};

const ownerSupportedBySource = (chat, owner) => {
  const need = tokens(String(owner ?? "").replace(/^@/, ""));
  if (!need.length) return false;
  return chat.messages.some((message) => {
    if (sameOwnerV2(owner, message.speaker)) return true;
    return containsTokenSequence(tokens(message.body), need);
  });
};

// Where a gold task sits in the raw chat text, when its annotation gives text="…".
function goldSpan(chat, g) {
  if (!g.text) return null;
  for (const index of g.msgs) {
    const m = chat.messages[index];
    const at = chat.text.indexOf(g.text, m.start);
    if (at >= 0 && at + g.text.length <= m.end) return { startOffset: at, endOffset: at + g.text.length };
  }
  return null;
}
// A prediction is compatible with a gold task when the gold gives no text (message-level match, the
// legacy behaviour), or the prediction's span overlaps the gold text, or their wording is similar.
function compatibility(chat, g, p) {
  if (!g.text) return { ok: true, sim: 0 };
  const sim = Math.max(similarity(p.a.text, g.text), similarity(chat.text.slice(p.a.sourceSpan?.startOffset ?? 0, p.a.sourceSpan?.endOffset ?? 0), g.text));
  return { ok: overlaps(p.a.sourceSpan, goldSpan(chat, g)) || sim >= DUPLICATE_SIMILARITY, sim };
}

/**
 * Maximum-cardinality, maximum-weight bipartite matching.
 *
 * Greedy matching can strand a constrained prediction when an earlier gold item takes the only
 * prediction that a later gold item can use. This successive-shortest-augmenting-path min-cost
 * flow keeps augmenting until no further match exists, then chooses the best preferences among
 * matchings of that maximum size. BigInt costs keep the lexicographic preference weights exact.
 *
 * makeScore(left, right, leftIndex, rightIndex) returns a non-negative BigInt score, or null when
 * the pair is incompatible. Ties are deterministic because nodes and edges are inserted in input
 * order and Bellman-Ford only replaces a path when it is strictly cheaper.
 */
function maximumWeightMatching(leftItems, rightItems, makeScore) {
  const leftCount = leftItems.length;
  const rightCount = rightItems.length;
  if (!leftCount || !rightCount) return [];

  const source = 0;
  const leftStart = 1;
  const rightStart = leftStart + leftCount;
  const sink = rightStart + rightCount;
  const graph = Array.from({ length: sink + 1 }, () => []);
  const tracked = [];

  const addEdge = (from, to, capacity, cost) => {
    const forward = { to, rev: graph[to].length, cap: capacity, cost };
    const reverse = { to: from, rev: graph[from].length, cap: 0, cost: -cost };
    graph[from].push(forward);
    graph[to].push(reverse);
    return forward;
  };

  for (let i = 0; i < leftCount; i++) addEdge(source, leftStart + i, 1, 0n);
  for (let j = 0; j < rightCount; j++) addEdge(rightStart + j, sink, 1, 0n);
  for (let i = 0; i < leftCount; i++) {
    for (let j = 0; j < rightCount; j++) {
      const score = makeScore(leftItems[i], rightItems[j], i, j);
      if (score === null || score === undefined) continue;
      const edge = addEdge(leftStart + i, rightStart + j, 1, -BigInt(score));
      tracked.push({ leftIndex: i, rightIndex: j, edge });
    }
  }

  // One unit of flow is one matched pair. Continue regardless of path cost so cardinality always
  // outranks every preference score.
  while (true) {
    const dist = Array(graph.length).fill(null);
    const previous = Array(graph.length).fill(null);
    dist[source] = 0n;

    for (let pass = 0; pass < graph.length - 1; pass++) {
      let changed = false;
      for (let from = 0; from < graph.length; from++) {
        if (dist[from] === null) continue;
        for (let edgeIndex = 0; edgeIndex < graph[from].length; edgeIndex++) {
          const edge = graph[from][edgeIndex];
          if (edge.cap <= 0) continue;
          const candidate = dist[from] + edge.cost;
          if (dist[edge.to] === null || candidate < dist[edge.to]) {
            dist[edge.to] = candidate;
            previous[edge.to] = { from, edgeIndex };
            changed = true;
          }
        }
      }
      if (!changed) break;
    }

    if (dist[sink] === null) break;
    let node = sink;
    while (node !== source) {
      const step = previous[node];
      if (!step) throw new Error("Internal matching error: augmenting path is incomplete");
      const edge = graph[step.from][step.edgeIndex];
      edge.cap -= 1;
      graph[node][edge.rev].cap += 1;
      node = step.from;
    }
  }

  return tracked
    .filter(({ edge }) => edge.cap === 0)
    .map(({ leftIndex, rightIndex }) => ({
      left: leftItems[leftIndex],
      right: rightItems[rightIndex],
      leftIndex,
      rightIndex,
    }))
    .sort((a, b) => a.leftIndex - b.leftIndex);
}

function taskPreferenceWeights(goldCount, predictionCount) {
  const pairs = BigInt(Math.max(1, Math.min(goldCount, predictionCount)));
  const tieBound = pairs * BigInt(predictionCount);
  const similarityUnit = tieBound + 1n;
  const maximumSimilarityAndTie = pairs * 10000n * similarityUnit + tieBound;
  const spanUnit = maximumSimilarityAndTie + 1n;
  const maximumLowerPriority = pairs * spanUnit + maximumSimilarityAndTie;
  const ownerUnit = maximumLowerPriority + 1n;
  return { ownerUnit, spanUnit, similarityUnit };
}

export function emptyV2() {
  return {
    gold: 0, tp: 0, fp: 0, dup: 0, unanchoredMultiTaskMessages: 0,
    ownerKnown: 0, ownerOk: 0, wrongOwner: 0, missedOwner: 0,
    ownerNotKnown: 0, fabricatedOwner: 0, correctAbstention: 0,
    unsupportedOwnerOnUnmatched: 0, ownerNotInSource: 0,
    classN: 0, classOk: 0, overconfident: 0, underconfident: 0,
    endN: 0, endOk: 0, condN: 0, condOk: 0,
    goldDue: 0, predDue: 0, dueCorrect: 0, dueN: 0, dueWrong: 0, dueSpurious: 0, dueOnUnmatched: 0,
    goldEvents: 0, eventDetected: 0, eventLinkedOk: 0, eventMissed: 0, eventDetectedWrongLink: 0,
    predEventsScored: 0, eventPredOk: 0, eventFp: 0,
    linkN: 0, linkOk: 0, linkWrong: 0, linkMissed: 0, linkAbstainN: 0, linkAbstainOk: 0, linkFabricated: 0,
    chats: 1, chatsWithFp: 0, negativeControl: 0, negativeControlFp: 0, chatsWithNegativeFp: 0,
  };
}

export function scoreChatV2(chat, mode, analyze = analyzeConversations) {
  const c = emptyV2();
  const result = analyze(chat.text);
  const preds = result.actions
    .map((a, order) => ({ a, order, msg: messageIndex(chat, a), outcome: a.outcome || "confirmed" }))
    .filter((p) => mode === "lenient" || p.outcome === "confirmed");
  const goldList = mode === "strict" ? chat.goldTasks.filter((g) => g.level !== "possible") : chat.goldTasks;
  c.gold = goldList.length;
  const goldMsgs = new Set(goldList.flatMap((g) => g.msgs));

  // Annotation health: a message holding two or more gold tasks needs text="…" on each, otherwise
  // the pairing inside that message can only be positional.
  const byMsg = new Map();
  for (const g of goldList) for (const m of g.msgs) byMsg.set(m, [...(byMsg.get(m) || []), g]);
  c.unanchoredMultiTaskMessages = [...byMsg.values()].filter((gs) => gs.length > 1 && gs.some((g) => !g.text)).length;

  // Build all compatible edges, then solve the whole assignment. The objective is lexicographic:
  // maximum number of matched tasks; then total exact-owner matches; then span overlaps; then
  // wording similarity; finally earlier predictions for deterministic tie-breaking.
  const weights = taskPreferenceWeights(goldList.length, preds.length);
  const taskMatches = maximumWeightMatching(goldList, preds, (g, p, _gi, pi) => {
    if (!g.msgs.includes(p.msg)) return null;
    const comp = compatibility(chat, g, p);
    if (!comp.ok) return null;
    const ownerMatch = g.ownerKind === "known" && g.owner && sameOwnerV2(p.a.owner, g.owner);
    const spanMatch = Boolean(g.text && overlaps(p.a.sourceSpan, goldSpan(chat, g)));
    const sim = BigInt(Math.round(comp.sim * 10000));
    const earlier = BigInt(preds.length - pi);
    return (ownerMatch ? weights.ownerUnit : 0n)
      + (spanMatch ? weights.spanUnit : 0n)
      + sim * weights.similarityUnit
      + earlier;
  });
  const used = new Map(); // pred -> gold
  for (const match of taskMatches) {
    const g = match.left;
    const pick = match.right;
    used.set(pick, g);
    c.tp++;

    if (g.ownerKind === "known" && g.owner) {
      c.ownerKnown++;
      if (!pick.a.owner) c.missedOwner++;
      else if (sameOwnerV2(pick.a.owner, g.owner)) c.ownerOk++;
      else c.wrongOwner++;
    } else {
      c.ownerNotKnown++;
      if (pick.a.owner) c.fabricatedOwner++; else c.correctAbstention++;
    }
    c.classN++;
    const predLevel = pick.outcome === "possible" ? "possible" : "confirmed";
    if (predLevel === g.level) c.classOk++;
    else if (predLevel === "confirmed") c.overconfident++;
    else c.underconfident++;
    // New files use end= (canonical, normalised). Legacy status= values (assigned, acknowledged,
    // reassigned ...) keep their legacy exact comparison so no existing label is silently dropped.
    if (g.end) { c.endN++; if (normalizePredEnd(pick.a.lifecycleStatus) === g.end) c.endOk++; }
    else if (g.status) { c.endN++; if ((pick.a.lifecycleStatus || "open") === g.status) c.endOk++; }
    if (g.cond) { c.condN++; if (normalizeCondition(pick.a.condition ? (pick.a.conditionStatus || "pending") : "none") === g.cond) c.condOk++; }
    if (g.due) { c.dueN++; if (dueOf(pick.a) === g.due) c.dueCorrect++; else if (dueOf(pick.a)) c.dueWrong++; }
    else if (dueOf(pick.a)) c.dueSpurious++;
  }
  c.goldDue = goldList.filter((g) => g.due).length;

  // Unmatched predictions: a duplicate only when it restates a prediction that WAS matched (same
  // span, or similar wording) on the same message. Anything else is a separate unmatched finding.
  const matched = [...used.keys()];
  let unmatchedFp = 0;
  for (const p of preds) {
    if (dueOf(p.a)) c.predDue++;
    if (!used.has(p) && dueOf(p.a)) c.dueOnUnmatched++;
    if (p.a.owner && !ownerSupportedBySource(chat, p.a.owner)) c.ownerNotInSource++;
    if (used.has(p)) continue;
    if (p.a.owner) c.unsupportedOwnerOnUnmatched++;
    const restates = matched.some((m) => m.msg === p.msg && (overlaps(m.a.sourceSpan, p.a.sourceSpan) || similarity(m.a.text, p.a.text) >= DUPLICATE_SIMILARITY));
    if (goldMsgs.has(p.msg) && restates) c.dup++; else { c.fp++; unmatchedFp++; }
  }
  const negative = chat.goldTasks.length === 0;
  if (unmatchedFp) c.chatsWithFp = 1;
  if (negative) { c.negativeControl = 1; c.negativeControlFp = unmatchedFp; if (unmatchedFp) c.chatsWithNegativeFp = 1; }

  // Events. Match individual predictions to individual gold events by event type and message.
  // A predicted event can satisfy at most one gold event. Link scoring is performed only on that
  // matched event, never by asking whether some other event on the same message happened to link
  // to the expected task.
  const predEvents = [];
  for (const p of preds) {
    for (const e of p.a.lifecycleEvents || []) {
      predEvents.push({
        type: normalizeEvent(e.type),
        msg: spanMessage(chat, e.sourceSpan),
        taskId: used.has(p) ? taskKey(chat, used.get(p)) : null,
      });
    }
  }
  const taskIdByLocal = new Map(chat.goldTasks.map((g) => [g.id, taskKey(chat, g)]));
  const eventMatches = maximumWeightMatching(chat.goldEvents, predEvents, (ge, pe) => {
    if (ge.msg !== pe.msg || ge.type !== pe.type) return null;
    const specific = !LINK_NONE.has(ge.link);
    const wantTask = specific ? taskIdByLocal.get(ge.link) : null;
    // This is only a tie-break among events already compatible by type and message. Detection
    // cardinality always wins; a correct task link (or abstention for an ambiguous gold link) is
    // preferred when duplicate same-type events occur in one message.
    if (specific) return pe.taskId === wantTask ? 2n : 0n;
    return pe.taskId === null ? 2n : 0n;
  });
  const predictedEventForGold = new Map(eventMatches.map((match) => [match.left, match.right]));
  for (const ge of chat.goldEvents) {
    c.goldEvents++;
    const det = predictedEventForGold.get(ge) || null;
    const specific = !LINK_NONE.has(ge.link);
    const wantTask = specific ? taskIdByLocal.get(ge.link) : null;

    if (det) c.eventDetected++;
    else c.eventMissed++;

    if (specific) {
      c.linkN++;
      if (!det || !det.taskId) c.linkMissed++;
      else if (det.taskId === wantTask) {
        c.linkOk++;
        c.eventLinkedOk++;
      } else {
        c.linkWrong++;
        c.eventDetectedWrongLink++;
      }
    } else if (det) {
      // Link abstention is meaningful only when the event itself was detected. A missing event is
      // already measured by event recall and must not be counted as a correct abstention.
      c.linkAbstainN++;
      if (det.taskId) c.linkFabricated++;
      else c.linkAbstainOk++;
    }
  }
  // Event precision only where the annotators declared the event list complete (@chat events=full).
  if (chat.eventsComplete) {
    c.predEventsScored = predEvents.length;
    c.eventFp = predEvents.length - eventMatches.length;
    c.eventPredOk = c.predEventsScored - c.eventFp;
  }
  return c;
}

const sumInto = (x, y) => { for (const k of Object.keys(x)) x[k] += y[k]; return x; };
const rate = (n, d) => ({ n, d, value: d ? n / d : null });

export function summarizeV2(c) {
  const findings = c.tp + c.fp + c.dup;
  return {
    // Precision is over ALL findings, so a duplicate lowers it. The duplicate-free figure is kept
    // only to compare with the legacy scorer.
    precision: rate(c.tp, findings), precisionExcludingDuplicates: rate(c.tp, c.tp + c.fp), recall: rate(c.tp, c.gold),
    falsePositives: c.fp, duplicates: c.dup, duplicateRate: rate(c.dup, findings),
    chats: c.chats,
    chatsWithFalsePositive: rate(c.chatsWithFp, c.chats),
    falsePositivesPerChat: rate(c.fp, c.chats),
    meanFalsePositivesPerChat: c.chats ? c.fp / c.chats : null,
    negativeControls: { chats: c.negativeControl, chatsWithFalsePositive: c.chatsWithNegativeFp, falsePositives: c.negativeControlFp },
    annotationHealth: { unanchoredMultiTaskMessages: c.unanchoredMultiTaskMessages },
    owner: {
      wrongOwnerAssignments: rate(c.wrongOwner, c.ownerKnown),
      fabricatedOwnerAssignments: rate(c.fabricatedOwner, c.ownerNotKnown),
      correctAbstention: rate(c.correctAbstention, c.ownerNotKnown),
      missedOwner: rate(c.missedOwner, c.ownerKnown),
      ownerAccuracy: rate(c.ownerOk, c.ownerKnown),
      unsupportedOwnerProposals: { onUnmatchedPredictions: c.unsupportedOwnerOnUnmatched, notInSource: c.ownerNotInSource },
    },
    classification: { accuracy: rate(c.classOk, c.classN), overconfident: c.overconfident, underconfident: c.underconfident },
    endStateAccuracy: rate(c.endOk, c.endN), conditionStateAccuracy: rate(c.condOk, c.condN),
    deadline: {
      precision: rate(c.dueCorrect, c.predDue), recall: rate(c.dueCorrect, c.goldDue), accuracyOnMatched: rate(c.dueCorrect, c.dueN),
      wrongDate: c.dueWrong, spurious: c.dueSpurious, onUnmatchedPredictions: c.dueOnUnmatched,
    },
    link: { accuracy: rate(c.linkOk, c.linkN), wrongLink: c.linkWrong, missedLink: c.linkMissed, correctAbstention: rate(c.linkAbstainOk, c.linkAbstainN), fabricatedLink: c.linkFabricated },
    events: {
      recall: rate(c.eventDetected, c.goldEvents), precision: rate(c.eventPredOk, c.predEventsScored),
      linkedRecall: rate(c.eventLinkedOk, c.goldEvents), missed: c.eventMissed, detectedWithWrongLink: c.eventDetectedWrongLink, unmatchedPredicted: c.eventFp,
    },
  };
}

// Every rate metric gets a conversation-level clustered-bootstrap interval.
export const BOOTSTRAP_METRICS = {
  precision: { n: "tp", d: ["tp", "fp", "dup"] },
  precisionExcludingDuplicates: { n: "tp", d: ["tp", "fp"] },
  recall: { n: "tp", d: "gold" },
  duplicateRate: { n: "dup", d: ["tp", "fp", "dup"] },
  falsePositivesPerChat: { n: "fp", d: "chats" },
  chatsWithFalsePositive: { n: "chatsWithFp", d: "chats" },
  ownerAccuracy: { n: "ownerOk", d: "ownerKnown" },
  wrongOwnerRate: { n: "wrongOwner", d: "ownerKnown" },
  missedOwnerRate: { n: "missedOwner", d: "ownerKnown" },
  fabricatedOwnerRate: { n: "fabricatedOwner", d: "ownerNotKnown" },
  correctAbstentionRate: { n: "correctAbstention", d: "ownerNotKnown" },
  classificationAccuracy: { n: "classOk", d: "classN" },
  deadlinePrecision: { n: "dueCorrect", d: "predDue" },
  deadlineRecall: { n: "dueCorrect", d: "goldDue" },
  endStateAccuracy: { n: "endOk", d: "endN" },
  conditionStateAccuracy: { n: "condOk", d: "condN" },
  linkAccuracy: { n: "linkOk", d: "linkN" },
  linkAbstentionRate: { n: "linkAbstainOk", d: "linkAbstainN" },
  eventRecall: { n: "eventDetected", d: "goldEvents" },
  eventPrecision: { n: "eventPredOk", d: "predEventsScored" },
  eventLinkedRecall: { n: "eventLinkedOk", d: "goldEvents" },
};

export function scoreSplitV2(chats, options = {}) {
  const analyze = options.analyze;
  const out = {};
  for (const mode of ["strict", "lenient"]) {
    const perChat = chats.map((chat) => scoreChatV2(chat, mode, analyze));
    const total = perChat.reduce((acc, row) => sumInto(acc, row), Object.fromEntries(Object.keys(emptyV2()).map((k) => [k, 0])));
    out[mode] = { summary: summarizeV2(total), counts: total, perChat };
    if (options.bootstrap !== false) out[mode].intervals = bootstrapIntervals(perChat, BOOTSTRAP_METRICS, options.bootstrapOptions);
  }
  return out;
}
