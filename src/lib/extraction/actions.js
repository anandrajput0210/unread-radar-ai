import { directAddressActions, extractBulletAssignments, extractConditionalImperative, extractHindiAssignment, extractHindiCommitment, extractHinglishAction, extractOverdueFollowup, extractRelayAction, extractSelfCommitment, hasActionDirective, inferAssignee, taskClassificationFor } from "./candidates.js";
import { conditionFor, extractBlockedPrecondition, resolveConditionAcrossConversation } from "./conditions.js";
import { ACTION_LABEL_REGEX, IMPERATIVE_REGEX, REQUEST_REGEX, TASK_VERB_SOURCE } from "./constants.js";
import { extractImpliedRequest } from "./implied.js";
import { extractCollective } from "./collective.js";
import { sameVerbFamily } from "./lifecycle.js";
import { DEADLINE_WORDS, PRONOUN_OBJECTS } from "./constants.js";
import { relationTokens } from "./matching.js";
import { resolveDeadlineDate } from "./dates.js";
import { applyTaskLifecycle } from "./lifecycle.js";
import { addSupportingDetail, findUniqueOwnedAction, findUniquePriorAction, matchesAcknowledgement, ownerMatchesSpeaker, relationScore } from "./matching.js";
import { conversationMessageRecords, parseChatRecord, recordMeta, resolveParseOptions } from "./records.js";
import { sourceSpan, uniqueBy, urgencyFor } from "./text.js";
import { dueDateStatusForAction, extractDueSignal } from "./timing.js";
import { CLAIM_CONTENT_THRESHOLD, isEligibleUnownedClaim } from "./claims.js";

export function extractNamedFollowupTarget(body) {
  const match = String(body ?? "").match(/\b(?:thanks|thank\s+you)\s+(@?\p{L}[\p{L}\p{M}'’'-]*)/iu);
  return match?.[1]?.trim() || null;
}

export function isUpdateDetail(body) {
  return /\b(?:include|add|mention|attach)\b[\s\S]*\b(?:your|the)\s+update\b/iu.test(body);
}

export function hasDecisionSignal(line) {
  return /(?:\bagreed\s+on\b|\bagreed\s+decision\s*:|\bdecision\s*:|\bdecided\s+that\b|\bdecided\s+to\b|\bwe\s+decided\b)/iu.test(String(line ?? ""));
}

export function extractActions(text, options = {}) {
  options = resolveParseOptions(text, options);
  const actions = [];
  const decisions = [];
  const decisionEvidence = [];
  const blockedPreconditions = [];
  const records = conversationMessageRecords(text, options).filter((record) => record.text);

  for (const record of records) {
    const line = record.text;
    const { speaker, body } = recordMeta(record, options);

    const blockedPrecondition = speaker ? extractBlockedPrecondition(body) : null;
    if (blockedPrecondition) {
      blockedPreconditions.push({ ...blockedPrecondition, speaker, body, record });
    }

    if (hasDecisionSignal(body)) {
      decisions.push(line);
      decisionEvidence.push({ text: line, sourceSpan: sourceSpan(record) });
      // An explicit decision statement is not a commitment/task merely because
      // it contains a future-tense verb (e.g. "Decision: we'll publish...").
      if (/^\s*(?:decision:|agreed\s+decision:)/iu.test(body)) continue;
    }

    // A follow-up such as "Thanks Raj. Please include endpoints in your update"
    // refines the uniquely identified prior task; it is not a second task.
    const followupTarget = extractNamedFollowupTarget(body);
    if (followupTarget && isUpdateDetail(body)) {
      const prior = actions.filter((action) => action.owner && ownerMatchesSpeaker(action.owner, followupTarget) && action.sourceSpan.startOffset < record.startOffset);
      if (prior.length === 1) {
        addSupportingDetail(prior[0], record, body, "update-detail");
        continue;
      }
    }

    // Collective statements ("we need to...", "let's...") are sorted into obligation,
    // proposal, or not-a-task before anything else can mistake them for a request.
    // A named addressee in the same message ("Mike, can you... We must finalize by Monday")
    // still wins: collective handling only applies when nobody was addressed.
    let candidates = extractBulletAssignments(body);
    if (!candidates.length) candidates = directAddressActions(body);
    if (!candidates.length) {
      const conditional = extractConditionalImperative(body);
      if (conditional) candidates = [conditional];
    }
    if (!candidates.length) {
      const collective = extractCollective(body);
      if (collective?.skip) continue;
      if (collective?.candidate) candidates = [collective.candidate];
    }

    if (!candidates.length) {
      const relay = extractRelayAction(body);
      if (relay) candidates = [relay];
    }

    if (!candidates.length) {
      const overdueFollowup = extractOverdueFollowup(body);
      if (overdueFollowup) candidates = [overdueFollowup];
    }

    if (!candidates.length) {
      const hinglishAction = extractHinglishAction(body);
      if (hinglishAction) candidates = [hinglishAction];
    }

    if (!candidates.length) {
      const hindiAssignment = extractHindiAssignment(body);
      if (hindiAssignment) candidates = [hindiAssignment];
    }

    if (!candidates.length) {
      const hindiCommitment = extractHindiCommitment(body, speaker);
      if (hindiCommitment) candidates = [hindiCommitment];
    }

    if (!candidates.length) {
      const selfCommitment = extractSelfCommitment(body, speaker);
      if (selfCommitment) candidates = [selfCommitment];
    }

    // "Sorry about that, resending now" is only linked when there is exactly
    // one recent, identifiable complaint from another participant. Without
    // that context, the fragment is not promoted into a task or owner claim.
    if (!candidates.length && speaker && isComplaintRepairResponse(body)) {
      const complaints = actions.filter((earlier) => earlier.origin === "implied_complaint"
        && isEligibleUnownedClaim(records, earlier, record, speaker, options));
      if (complaints.length === 1) {
        candidates = [{
          text: complaints[0].text,
          owner: speaker,
          classification: "self_commitment",
          origin: "self_commitment",
          complaintFollowup: true,
        }];
      }
    }

    if (!candidates.length) {
      const mentionOwner = inferAssignee(body);
      if (mentionOwner && hasActionDirective(body)) {
        candidates = [{
          text: body.replace(/^@?[\p{L}\p{N}_.-]+\s*/u, "").trim() || body,
          owner: mentionOwner,
          classification: "assigned_task",
        }];
      }
    }

    if (!candidates.length && hasActionDirective(body)) {
      const actionLabel = ACTION_LABEL_REGEX.exec(body);
      const fallbackText = actionLabel ? actionLabel[1].trim() : body;
      if (fallbackText) {
        const request = /\b(?:can|could|would)\s+(?:you|someone|anyone|somebody)\b/iu.test(body);
        // "We should call the vendor" is a suggestion, not a request: keep it for review.
        const strongCue = REQUEST_REGEX.test(body) || IMPERATIVE_REGEX.test(body) || ACTION_LABEL_REGEX.test(body) || /\b(?:must|have to|has to)\b/iu.test(body);
        candidates = [{
          text: fallbackText,
          owner: null,
          classification: request ? "unassigned_request" : "unassigned_action",
          ...(strongCue ? {} : { outcome: "possible", outcomeReason: "Suggestion (\"should\u2026\"), not a direct request" }),
        }];
      }
    }

    if (!candidates.length) {
      const implied = extractImpliedRequest(body, speaker);
      if (implied) candidates = [implied];
    }

    candidates = candidates.flatMap(splitCompoundRequest);

    const messageDue = extractDueSignal(body, { allowCommitmentTiming: true });

    candidates.forEach((candidate, index) => {
      const candidateText = candidate.text.trim();
      if (!candidateText) return;
      const condition = candidate.condition || conditionFor(body);
      // "Banner ka kaam ab Rohan karega" about work that already has a task is a
      // reassignment, which the lifecycle step handles; it is not a second task.
      if (candidate.origin === "hinglish_assignment" && actions.some((earlier) => relationScore(earlier.text, candidateText) >= 0.28)) return;
      // With several tasks in one message, a deadline belongs to the sentence it appears in.
      const dueDate = candidates.length > 1 ? dueWithinOwnSentence(body, candidateText, messageDue) : messageDue;
      const messageMeta = record.meta ?? parseChatRecord(String(record.rawText ?? line).split(/\r?\n/u)[0], options);
      const action = {
        id: `task-${record.ordinal}-${index}-${candidateText.slice(0, 16)}`,
        text: candidateText,
        sourceText: record.rawText || line,
        messageTimestamp: messageMeta.timestamp?.raw || null,
        messageDate: messageMeta.timestamp?.date || null,
        owner: candidate.owner || null,
        classification: taskClassificationFor(body, candidate),
        origin: candidate.origin || null,
        dueDate,
        resolvedDueDate: dueDate ? resolveDeadlineDate(dueDate, messageMeta.timestamp?.date || null, options) : null,
        dueDateStatus: dueDate ? dueDateStatusForAction(candidateText, dueDate, body) : null,
        urgency: urgencyFor(body),
        outcome: candidate.outcome || "confirmed",
        outcomeReason: candidate.outcomeReason || null,
        condition,
        conditionStatus: condition ? "pending_verification" : null,
        supportingDetails: [],
        completed: false,
        sourceSpan: sourceSpan(record),
      };

      if (condition) {
        const conditionResolution = resolveConditionAcrossConversation(records, { condition, record, body });
        action.conditionStatus = conditionResolution.status;
        for (const resolution of conditionResolution.evidence) {
          const isSuperseded = conditionResolution.status !== "ambiguous"
            && resolution.status !== conditionResolution.status;
          const evidenceKind = isSuperseded
            ? `condition-resolution:superseded:${resolution.status}`
            : `condition-resolution:${resolution.status}`;
          addSupportingDetail(action, resolution.record, resolution.body, evidenceKind);
        }
      }

      // Carry a previously blocked condition forward only when the same
      // speaker later commits to the same action and the relationship is unique.
      // The earlier negative statement is evidence/context, never a task itself.
      const preconditionMatches = blockedPreconditions
        .filter((item) => item.record.startOffset < record.startOffset && ownerMatchesSpeaker(item.speaker, action.owner))
        .map((item) => ({ item, score: relationScore(item.actionText, action.text) }))
        .filter((entry) => entry.score >= 0.5)
        .sort((left, right) => right.score - left.score);
      if (preconditionMatches.length && (preconditionMatches.length === 1 || preconditionMatches[0].score - preconditionMatches[1].score >= 0.12)) {
        const matchedPrecondition = preconditionMatches[0].item;
        action.condition ||= matchedPrecondition.condition;
        const conditionResolution = resolveConditionAcrossConversation(records, matchedPrecondition);
        action.conditionStatus = conditionResolution.status;
        addSupportingDetail(action, matchedPrecondition.record, matchedPrecondition.body, "precondition-context");
        for (const resolution of conditionResolution.evidence) {
          const isSuperseded = conditionResolution.status !== "ambiguous"
            && resolution.status !== conditionResolution.status;
          const evidenceKind = isSuperseded
            ? `condition-resolution:superseded:${resolution.status}`
            : `condition-resolution:${resolution.status}`;
          addSupportingDetail(action, resolution.record, resolution.body, evidenceKind);
        }
      }

      // A later first-person commitment that repeats an already assigned task
      // is an acknowledgement/refinement, not a duplicate task. Match only
      // with the same identified owner and a strong, unique content overlap.
      let previous = action.owner
        ? findUniquePriorAction(actions, action.owner, action.text, record, { minimumScore: 0.30 })
        : null;
      // "kar dunga" names no deliverable, so it can only refer to the speaker's single earlier task.
      if (!previous && candidate.bare && action.owner) previous = findUniqueOwnedAction(actions, action.owner, record);
      // "Sure, I'll send it" is an acknowledgement when the speaker already
      // owns exactly one open task with the same action verb. The pronoun-only
      // object contributes no relation tokens, so ordinary content matching
      // cannot connect it to (for example) "send the project report".
      if (!previous && candidate.origin === "self_commitment" && action.owner
        && relationTokens(action.text).size === 0) {
        const onlyOpenOwned = findUniqueOpenOwnedAction(actions, action.owner, record, records, options);
        const verb = action.text.trim().split(/\s+/u)[0];
        if (onlyOpenOwned && sameVerbFamily(verb, onlyOpenOwned.text)) previous = onlyOpenOwned;
      }
      // "Sure, I'll send it by Thursday" answering an unowned request claims it. Claim only when
      // exactly one unowned task qualifies (by content, or by "it" with a compatible verb) and
      // it was raised by someone else within the last few messages; otherwise stay unowned.
      // A contentless commitment, or one matching the speaker's own open task, stays ambiguous.
      if (!previous && candidate.origin === "self_commitment" && action.owner
        && !speakerHasConflictingOpenOwnedTask(actions, records, record, speaker, options, action.text)) {
        previous = findClaimableRequest(actions, action, record, records, speaker, options, { bare: Boolean(candidate.bare) });
        if (previous) { previous.owner = action.owner; previous.classification = "assigned_task"; previous.ownerSource = "claimed_by_commitment"; confirmByAcceptance(previous); }
      }
      if (previous) {
        const isAcknowledgement = /^(?:got\s+it|understood|yes|sure|okay|ok|noted|thanks|thank\s+you)\b/iu.test(body);
        if (isAcknowledgement || candidate.origin === "self_commitment") {
          if (!previous.dueDate && action.dueDate) {
            previous.dueDate = action.dueDate;
            previous.dueDateStatus = action.dueDateStatus;
          }
          if (!previous.condition && action.condition) previous.condition = action.condition;
          if (action.conditionStatus === "reported_satisfied") previous.conditionStatus = "reported_satisfied";
          else if (!previous.conditionStatus && action.conditionStatus) previous.conditionStatus = action.conditionStatus;
          addSupportingDetail(previous, record, body, isAcknowledgement ? "acknowledgement" : "refinement");
          if (isAcknowledgement) {
            previous.acknowledgedBy = speaker || action.owner;
            previous.acknowledgementText = body;
            previous.acknowledgementSpan = sourceSpan(record);
          }
          return;
        }
      }
      if (candidate.bare) {
        action.outcome = "possible";
        action.outcomeReason = "Promises to act but names no deliverable and matches no earlier task";
      }
      // The same work stated twice is one task. A collective statement ("we need to send
      // the proposal") followed by an explicit request for it ("can someone send the
      // proposal by Friday") keeps the explicit one and records the earlier line as context.
      action.collective = candidate.origin === "collective";
      const restated = actions.filter((earlier) => !earlier.owner && relationScore(earlier.text, action.text) >= 0.5);
      if (action.collective && restated.length) return;
      for (const earlier of restated.filter((item) => item.collective)) {
        actions.splice(actions.indexOf(earlier), 1);
        action.supportingDetails.push({ text: earlier.sourceText, sourceSpan: earlier.sourceSpan, kind: "restated-collective" });
      }
      actions.push(action);
    });
  }

  // A bare "Sure."/"Yes." is only a commitment when it can only be addressed to one other person.
  // (A bare "ok" stays a read-receipt, never an acceptance.)
  const BARE_AFFIRMATION = /^\s*(?:sure|yes|yep|yeah|absolutely|of\s+course|haan|ji)\s*[.!]*\s*$/iu;
  const twoPersonChat = new Set(records.map((r) => recordMeta(r, options).speaker).filter(Boolean).map((v) => v.toLocaleLowerCase())).size === 2;

  // Link short acknowledgements that do not contain a repeated task phrase.
  for (const record of records) {
    const { speaker, body } = recordMeta(record, options);
    if (!speaker || !(matchesAcknowledgement(body) || (twoPersonChat && BARE_AFFIRMATION.test(body)))) continue;
    // An acknowledgement that directly follows an unowned request from someone else answers THAT
    // request, even if the speaker already owns an older task.
    const justAsked = actions.filter((action) =>
      isEligibleUnownedClaim(records, action, record, speaker, options));
    let possibleMatches = justAsked.length === 1
      ? (Object.assign(justAsked[0], { owner: speaker, classification: "assigned_task", ownerSource: "unique_acknowledgement" }), confirmByAcceptance(justAsked[0]), justAsked)
      : actions.filter((action) =>
        action.sourceSpan.startOffset < record.startOffset && ownerMatchesSpeaker(action.owner, speaker)
      );
    if (possibleMatches.length === 0) {
      // A unique preceding unassigned request can acquire an owner when a
      // participant explicitly acknowledges it. Ambiguous cases stay unassigned.
      // Only RECENT requests (last 3 messages) from an identifiable, different person qualify:
      // an acknowledgement far from the request, or from an unknown requester, proves nothing.
      const unassigned = actions.filter((action) =>
        isEligibleUnownedClaim(records, action, record, speaker, options)
      );
      if (unassigned.length === 1) {
        unassigned[0].owner = speaker;
        unassigned[0].classification = "assigned_task";
        unassigned[0].ownerSource = "unique_acknowledgement";
        confirmByAcceptance(unassigned[0]);
        possibleMatches = unassigned;
      }
    }
    if (possibleMatches.length !== 1) continue;
    const [action] = possibleMatches;
    action.acknowledgedBy = speaker;
    action.acknowledgementText = body;
    action.acknowledgementSpan = sourceSpan(record);
  }

  const uniqueActions = uniqueBy(actions, (item) => `${item.text.toLowerCase()}|${(item.owner || "").toLowerCase()}`);
  applyTaskLifecycle(uniqueActions, records, options);
  return {
    actions: uniqueActions,
    decisions: uniqueBy(decisions, (item) => item.toLowerCase()),
    decisionEvidence: uniqueBy(decisionEvidence, (item) => item.text.toLowerCase()),
  };
}

function isComplaintRepairResponse(body) {
  return /^\s*(?:sorry(?:\s+about\s+that)?[,:;\s]+)?(?:i['’]?m\s+)?(?:re[- ]?sending|resending|sending\s+(?:it|them)\s+again)\s+(?:now|today)?[.!]*\s*$/iu.test(String(body ?? ""));
}

// "send the invoice and update the tracker by Friday" is two tasks. Split only when
// both halves have their own object, so "review and approve the doc" stays one task.
const COMPOUND = new RegExp(String.raw`^(?<first>(?:please\s+)?(?:${TASK_VERB_SOURCE})\s+\S+(?:\s+\S+)*?)\s+and\s+(?:also\s+)?(?<second>(?:${TASK_VERB_SOURCE})\s+\S+(?:\s+\S+)*)$`, "iu");
function splitCompoundRequest(candidate) {
  // Owned tasks keep their existing single-task behaviour; only unowned fallback requests are split.
  if (candidate.origin || candidate.owner || candidate.outcome === "possible") return [candidate];
  const m = COMPOUND.exec(candidate.text.trim());
  if (!m) return [candidate];
  return [{ ...candidate, text: m.groups.first.trim() }, { ...candidate, text: m.groups.second.trim() }];
}

function dueWithinOwnSentence(body, candidateText, messageDue) {
  const sentences = String(body).split(/(?<=[.!?;])\s+/u);
  if (sentences.length < 2) return messageDue;
  const key = candidateText.toLocaleLowerCase().split(/[;.!?]/u)[0].slice(0, 18);
  const own = sentences.find((sentence) => sentence.toLocaleLowerCase().includes(key));
  return own ? extractDueSignal(own, { allowCommitmentTiming: true }) : messageDue;
}

const NO_DELIVERABLE = new Set(["evening", "morning", "afternoon", "instead", "night", "ho", "jayega", "jaega", "bhej", "bhejna", "dunga", "dungi", "kar", "karna", "deta", "deti", "karunga", "karungi", "denge", "hu", "hoon", "with", "you", "ready", "done", "have", "ma'am", "sir"]);

function findClaimableRequest(actions, action, record, records, speaker, options, { bare = false } = {}) {
  const open = actions.filter((earlier) => isEligibleUnownedClaim(records, earlier, record, speaker, options));
  const byContent = open.filter((earlier) => relationScore(earlier.text, action.text) >= CLAIM_CONTENT_THRESHOLD);
  if (byContent.length === 1) return byContent[0];
  if (byContent.length > 1) return null;
  // The commitment names no deliverable of its own ("it", times of day, bare Hinglish verbs).
  const pronounOnly = [...relationTokens(action.text)].every((t) => PRONOUN_OBJECTS.has(t) || DEADLINE_WORDS.has(t) || NO_DELIVERABLE.has(t) || action.text.toLocaleLowerCase().split(/\s+/u)[0] === t);
  if ((!pronounOnly && !bare) || open.length !== 1) return null;
  if (bare) return open[0];
  const verb = action.text.trim().split(/\s+/u)[0];
  return /\b(?:need|chahiye)\b/iu.test(open[0].sourceText) || sameVerbFamily(verb, open[0].text) ? open[0] : null;
}
// The requester must be identifiable AND different from the respondent; unknown is not "different".
// A vague "we need X" becomes a confirmed task once someone explicitly accepts it.
function confirmByAcceptance(task) {
  if (task.outcome === "possible" && !task.model) { task.outcome = "confirmed"; task.outcomeReason = null; task.acceptedBy = task.owner; }
}

function findUniqueOpenOwnedAction(actions, owner, record, records, options) {
  const prior = actions.filter((earlier) => earlier.sourceSpan.startOffset < record.startOffset);
  if (!prior.length) return null;
  const snapshot = prior.map((earlier) => ({
    ...earlier,
    lifecycleEvents: [],
    supportingDetails: [...(earlier.supportingDetails || [])],
  }));
  const before = records.filter((r) => r.startOffset < record.startOffset);
  applyTaskLifecycle(snapshot, before, options);
  const ownedOpen = snapshot.filter((earlier) => ownerMatchesSpeaker(earlier.owner, owner)
    && !["completed", "cancelled"].includes(earlier.lifecycleStatus));
  if (ownedOpen.length !== 1) return null;
  return prior.find((earlier) => earlier.id === ownedOpen[0].id) || null;
}

// A speaker with an OPEN task of their own makes "I'll send it" ambiguous, so claims are skipped.
// A task they already finished or that was cancelled does not: the lifecycle state as of THIS
// message is computed on a throw-away copy, because the real lifecycle pass runs after extraction.
function speakerHasConflictingOpenOwnedTask(actions, records, record, speaker, options, candidateText = "") {
  // Replay ALL prior tasks, not only those initially owned by this speaker.
  // A task may have been reassigned to or away from them earlier in the chat.
  const prior = actions.filter((earlier) => earlier.sourceSpan.startOffset < record.startOffset);
  if (!prior.length) return false;
  const snapshot = prior.map((earlier) => ({
    ...earlier,
    lifecycleEvents: [],
    supportingDetails: [...(earlier.supportingDetails || [])],
  }));
  const before = records.filter((r) => r.startOffset < record.startOffset);
  applyTaskLifecycle(snapshot, before, options);
  const contentTokens = relationTokens(candidateText);
  return snapshot.some((earlier) => ownerMatchesSpeaker(earlier.owner, speaker)
    && !["completed", "cancelled"].includes(earlier.lifecycleStatus)
    // A contentless promise is ambiguous with any existing open owned task.
    // A contentful commitment is blocked only by an owned task for the same work.
    && (!contentTokens.size || relationScore(earlier.text, candidateText) >= CLAIM_CONTENT_THRESHOLD));
}
