import { directAddressActions, extractBulletAssignments, extractHinglishAction, extractOverdueFollowup, extractRelayAction, extractSelfCommitment, hasActionDirective, inferAssignee, taskClassificationFor } from "./candidates.js";
import { conditionFor, extractBlockedPrecondition, resolveConditionAcrossConversation } from "./conditions.js";
import { ACTION_LABEL_REGEX } from "./constants.js";
import { resolveDeadlineDate } from "./dates.js";
import { applyTaskLifecycle } from "./lifecycle.js";
import { addSupportingDetail, findUniquePriorAction, matchesAcknowledgement, ownerMatchesSpeaker, relationScore } from "./matching.js";
import { conversationMessageRecords, parseChatRecord, recordMeta, resolveParseOptions } from "./records.js";
import { sourceSpan, uniqueBy, urgencyFor } from "./text.js";
import { dueDateStatusForAction, extractDueSignal } from "./timing.js";

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

    let candidates = extractBulletAssignments(body);
    if (!candidates.length) candidates = directAddressActions(body);

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
      const selfCommitment = extractSelfCommitment(body, speaker);
      if (selfCommitment) candidates = [selfCommitment];
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
        candidates = [{ text: fallbackText, owner: null, classification: request ? "unassigned_request" : "unassigned_action" }];
      }
    }

    const dueDate = extractDueSignal(body, { allowCommitmentTiming: true });
    const condition = conditionFor(body);

    candidates.forEach((candidate, index) => {
      const candidateText = candidate.text.trim();
      if (!candidateText) return;
      const messageMeta = record.meta ?? parseChatRecord(String(record.rawText ?? line).split(/\r?\n/u)[0], options);
      const action = {
        id: `task-${record.ordinal}-${index}-${candidateText.slice(0, 16)}`,
        text: candidateText,
        sourceText: record.rawText || line,
        messageTimestamp: messageMeta.timestamp?.raw || null,
        messageDate: messageMeta.timestamp?.date || null,
        owner: candidate.owner || null,
        classification: taskClassificationFor(body, candidate),
        dueDate,
        resolvedDueDate: dueDate ? resolveDeadlineDate(dueDate, messageMeta.timestamp?.date || null, options) : null,
        dueDateStatus: dueDate ? dueDateStatusForAction(candidateText, dueDate, body) : null,
        urgency: urgencyFor(body),
        condition,
        conditionStatus: condition ? "pending_verification" : null,
        supportingDetails: [],
        completed: false,
        sourceSpan: sourceSpan(record),
      };

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
      const previous = action.owner
        ? findUniquePriorAction(actions, action.owner, action.text, record, { minimumScore: 0.30 })
        : null;
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
      actions.push(action);
    });
  }

  // Link short acknowledgements that do not contain a repeated task phrase.
  for (const record of records) {
    const { speaker, body } = recordMeta(record, options);
    if (!speaker || !matchesAcknowledgement(body)) continue;
    let possibleMatches = actions.filter((action) =>
      action.sourceSpan.startOffset < record.startOffset && ownerMatchesSpeaker(action.owner, speaker)
    );
    if (possibleMatches.length === 0) {
      // A unique preceding unassigned request can acquire an owner when a
      // participant explicitly acknowledges it. Ambiguous cases stay unassigned.
      const unassigned = actions.filter((action) =>
        action.sourceSpan.startOffset < record.startOffset && !action.owner && !action.acknowledgedBy
      );
      if (unassigned.length === 1) {
        unassigned[0].owner = speaker;
        unassigned[0].classification = "assigned_task";
        unassigned[0].ownerSource = "unique_acknowledgement";
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
