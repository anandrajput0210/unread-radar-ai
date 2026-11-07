import { extractSelfCommitment } from "./candidates.js";
import { DEADLINE_WORDS, DELAY_CUE, TASK_VERB_SOURCE, PRONOUN_OBJECTS, RESERVED_SPEAKERS, escapeRegex } from "./constants.js";
import { resolveDeadlineDate } from "./dates.js";
import { addSupportingDetail, matchesAcknowledgement, ownerMatchesSpeaker, relationScore, relationTokens } from "./matching.js";
import { recordMeta } from "./records.js";
import { CLAIM_CONTENT_THRESHOLD, isEligibleUnownedClaim } from "./claims.js";
import { isNegatedAt, sourceSpan } from "./text.js";

// Words that never name a deliverable ("will send it on Thursday instead").
const FILLER_TOKENS = new Set(["instead", "again", "now", "then", "also", "just", "still", "later", "soon", "sometime", "once", "ahead"]);
// send/share/mail/... are the same act for matching a status update to its task.
const VERB_FAMILIES = [["send", "share", "mail", "email", "forward", "submit", "deliver", "have", "bhej", "bhejna"], ["prepare", "draft", "write", "create", "make", "build", "finalize", "finalise", "complete", "finish"]];
export function sameVerbFamily(verb, text) {
  const v = String(verb).toLocaleLowerCase();
  const family = VERB_FAMILIES.find((group) => group.includes(v)) || [v];
  return family.some((member) => new RegExp(`\\b${escapeRegex(member)}\\b`, "iu").test(text));
}

export function lifecycleEventType(body) {
  const value = String(body ?? "").trim();
  if (!value || isNegatedAt(value, Math.max(0, value.search(/\b(?:done|completed|cancel|sent|submitted|finished|fixed)\b/iu)))) return null;

  if (/\b(?:reassign(?:ed|ment)?|transfer(?:red)?|hand(?:ing)?\s+over|take\s+over|taking\s+over|instead\s+of)\b/iu.test(value)
    || /\b(?:will|can|is\s+now\s+going\s+to)\s+(?:handle|own)\b/iu.test(value)) return "reassigned";
  if (/\b(?:cancel(?:led|ed)?|scrap(?:ped)?|drop\s+this|no\s+longer\s+needed|not\s+needed\s+anymore|cancel\s+kar\s+do|mat\s+(?:bhejo|karo)|scratch\s+that|ignore\s+that|never\s*mind\s+(?:that|it)|forget\s+(?:that|it))\b/iu.test(value)
    || /\b(?:we(?:'re|\s+are)?|i(?:'m|\s+am)?)\s+not\s+(?:doing|booking|sending|needing|going\s+to)\b[^.!?]*\banymore\b|\bno\s+need\s+(?:for|to)\b[^.!?]*\banymore\b|\bdon['’]t\s+need\b[^.!?]*\banymore\b/iu.test(value)) return "cancelled";
  if (/\b(?:hold\s+(?:pe|par|on)|on\s+hold|put\s+(?:this\s+)?on\s+hold|paused?|rok\s+(?:do|dena|ke\s+rakho)|abhi\s+mat\s+(?:karo|bhejo|bhejna))\b/iu.test(value)) return "blocked";
  if (/\b(?:approval\s+(?:de\s+diya|mil\s+gaya|mil\s+gayi|aa\s+gaya)|approved\s+by\s+(?:the\s+)?client|off\s+hold|resume|unblock(?:ed)?|ab\s+kar\s+sakte\s+ho)\b/iu.test(value)) return "unblocked";
  if (/\bab\s+@?[\p{L}][\p{L}\p{M}'’.-]*\s+(?:karega|karegi|karenge|sambhalega|sambhalegi|dekhega|dekhegi)\b/iu.test(value)) return "reassigned";
  if (/\b(?:not\s+yet\s+done|not\s+done|isn't\s+done|isn’t\s+done|still\s+pending|not\s+completed)\b/iu.test(value)) return null;
  if (/^(?:done|completed|complete|finished|sent|shared|submitted|uploaded|fixed|resolved|booked|delivered|mailed|closed|approved)(?:\b|[.!✅✔])/iu.test(value)
    || /\b(?:has\s+been|have\s+been|is|was)\s+(?:sent|shared|submitted|uploaded|fixed|resolved|booked|delivered|completed|finished|approved)\b/iu.test(value)
    || /\b(?:i|we)\s+(?:have\s+)?(?:sent|shared|submitted|uploaded|fixed|resolved|booked|delivered|completed|finished|approved)\b/iu.test(value)
    || /\b[\p{L}\p{N}][\p{L}\p{N}'’_-]{1,}\s+(?:sent|shared|submitted|uploaded|fixed|resolved|booked|delivered|completed|finished|approved)\b/iu.test(value)
    || /\b(?:ho\s+gaya|bhej\s+diya|send\s+kar\s+diya|share\s+kar\s+diya|submit\s+kar\s+diya|complete\s+kar\s+diya|kar\s+diya)\b/iu.test(value)) return "completed";
  if (/\b(?:delay(?:ed)?|postpon(?:e|ed)|pushing\s+(?:it\s+)?to|moving\s+(?:it\s+)?to|running\s+late|need\s+until|need\s+more\s+time|not\s+ready|can't\s+make\s+it|cannot\s+make\s+it|kal\s+tak\s+possible\s+nahi)\b/iu.test(value)) return "delayed";
  if (/\b(?:working\s+on|(?:deploying|fixing|updating|sending|uploading|reviewing|checking|preparing|drafting|finali[sz]ing|processing)(?:\s+(?:it|this|that))?\s+now|started\s+(?:working\s+on|it)|in\s+progress|currently\s+handling|taking\s+care\s+of|looking\s+into|kaam\s+kar\s+raha|kaam\s+chal\s+raha)\b/iu.test(value)) return "in-progress";
  return null;
}

export function extractReassignmentOwner(body) {
  const value = String(body ?? "");
  const patterns = [
    /\b(?:reassign(?:ed|ing)?|transfer(?:red|ring)?|assign(?:ed|ing)?)\b[\s\S]{0,64}?\bto\s+(@?[\p{L}][\p{L}\p{M}'’.-]*(?:\s+[\p{L}][\p{L}\p{M}'’.-]*)?)/iu,
    /\b(@?[\p{L}][\p{L}\p{M}'’.-]*(?:\s+[\p{L}][\p{L}\p{M}'’.-]*)?)\s+(?:will|can|is\s+now\s+going\s+to)\s+(?:take\s+over|handle|own)\b/iu,
    /\b(@?[\p{L}][\p{L}\p{M}'’.-]*(?:\s+[\p{L}][\p{L}\p{M}'’.-]*)?)\s*,?\s+(?:please\s+)?take\s+over\b/iu,
    /\b(?:actually,?\s+|now\s+)?(@?[\p{L}][\p{L}\p{M}'’.-]*)\s+(?:will|should|can)\s+[^.!?]*?\binstead\b/iu,
    /\bab\s+(@?[\p{L}][\p{L}\p{M}'’.-]*)\s+(?:karega|karegi|karenge|sambhalega|sambhalegi|dekhega|dekhegi)\b/iu,
  ];
  for (const pattern of patterns) {
    const match = value.match(pattern);
    if (match?.[1]) {
      const owner = match[1].trim().replace(/[.,;:]+$/u, "");
      // "I can own it" / "we will handle" name a pronoun, not a person to reassign to.
      if (!RESERVED_SPEAKERS.has(owner.toLocaleLowerCase()) && !/^(?:i|me|we|us|you|he|she|they|it|who|someone|somebody|anyone)$/iu.test(owner)) return owner;
    }
  }
  return null;
}

export function extractLifecycleDuePhrase(body) {
  const value = String(body ?? "");
  const explicit = value.match(/\b(?:until|till|by|before|on|move(?:d)?\s+to|shift(?:ed)?\s+to|push(?:ed)?\s+to)\s+((?:day\s+after\s+tomorrow|tomorrow|today|kal\s+tak|aaj|next\s+)?(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)?(?:\s*,?\s*\d{1,2}(?::\d{2})?\s*(?:am|pm))?)\b/iu);
  if (explicit?.[1]?.trim()) return explicit[1].trim();
  const relative = value.match(/\b(day\s+after\s+tomorrow|tomorrow|kal\s+tak|next\s+(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday))\b/iu);
  return relative?.[1] || null;
}

export function chooseLifecycleTarget(actions, record, body, speaker, eventType, options, records = []) {
  const available = actions.filter((action) => action.sourceSpan.startOffset < record.startOffset
    && !["completed", "cancelled"].includes(action.lifecycleStatus));
  const scored = available.map((action) => ({ action, score: relationScore(action.text, body) }))
    .filter((item) => item.score >= (options.lifecycleMatchThreshold ?? 0.5))
    .sort((left, right) => right.score - left.score);
  if (scored.length) {
    if (scored.length > 1 && scored[0].score - scored[1].score < 0.12) return null;
    return scored[0].action;
  }

  // A progress verb can identify a request even when the update omits its object:
  // "deploy it" -> "Deploying now". This remains a claim, so require a recent,
  // identifiable requester who is different from the responder and one verb match.
  if (eventType === "in-progress" && speaker) {
    const claimable = actions.filter((action) => !action.collective
      && isEligibleUnownedClaim(records, action, record, speaker, options)
      && sharesWordStem(action.text, body));
    if (claimable.length === 1) return claimable[0];
    if (claimable.length > 1) return null;
  }

  // A bare acknowledgement/completion is safe only when one open task belongs
  // to this speaker. Never attach a context-free status to an arbitrary task.
  if (matchesAcknowledgement(body) || /^(?:done|completed|finished|sent|submitted|on\s+it|i['’]?m\s+on\s+it|i\s+am\s+on\s+it|will\s+do)[.!\s✅✔]*$/iu.test(body)) {
    const owned = available.filter((action) => action.owner && ownerMatchesSpeaker(action.owner, speaker));
    return owned.length === 1 ? owned[0] : null;
  }

  // The speaker's own status report with a weaker content match: accept only
  // when they own exactly one open task AND share at least one content word
  // ("Invoice bhej diya hai" -> their one open invoice task).
  if (["completed", "in-progress", "delayed"].includes(eventType) && speaker) {
    const owned = available.filter((action) => action.owner && ownerMatchesSpeaker(action.owner, speaker));
    if (owned.length === 1 && (relationScore(owned[0].text, body) > 0 || sharesWordStem(owned[0].text, body))) return owned[0];
  }
  return null;
}

// "Deploying now" vs "deploy the hotfix": same word once -ing/-ed/-e/-s are removed (min. 4 letters).
const wordStem = (w) => w.toLocaleLowerCase().replace(/(?:ing|ed|es|e|s)$/u, "");
function sharesWordStem(a, b) {
  const stems = (t) => new Set(String(t).match(/\p{L}{4,}/gu)?.map(wordStem).filter((w) => w.length >= 4) ?? []);
  const right = stems(b);
  return [...stems(a)].some((w) => right.has(w));
}

export function statusForEvent(type, action) {
  // Unblocking returns the task to active work; it is not a status of its own.
  if (type === "unblocked") return action.owner ? "assigned" : "open";
  return type;
}

export function applyTaskLifecycle(actions, records, options = {}) {
  for (const action of actions) {
    action.lifecycleStatus = action.owner ? "assigned" : "open";
    action.lifecycleEvents = [];
    action.completed = false;
    action.cancelled = false;
  }

  const appendEvent = (action, event) => {
    action.lifecycleEvents.push(event);
    addSupportingDetail(action, { startOffset: event.sourceSpan.startOffset, endOffset: event.sourceSpan.endOffset }, event.text, `lifecycle:${event.type}`);
  };

  for (const record of records) {
    const { speaker, body, timestamp } = recordMeta(record, options);
    if (!body) continue;

    // The acknowledgement association was already resolved conservatively by
    // extractActions. Convert that exact evidence into a lifecycle event.
    const acknowledged = actions.find((action) => action.acknowledgementSpan?.startOffset === record.startOffset);
    if (acknowledged) {
      const event = {
        type: "acknowledged", actor: speaker || acknowledged.acknowledgedBy || null,
        text: body, sourceSpan: sourceSpan(record), messageTimestamp: timestamp?.raw || null,
        messageDate: timestamp?.date || null,
      };
      appendEvent(acknowledged, event);
      if (!["completed", "cancelled"].includes(acknowledged.lifecycleStatus)) acknowledged.lifecycleStatus = "acknowledged";
      continue;
    }

    // Reassignment may change the owner after the first acknowledgement pass.
    // Resolve later acknowledgements against the current owner state here.
    if (speaker && matchesAcknowledgement(body)) {
      const currentOwnerTasks = actions.filter((action) => action.sourceSpan.startOffset < record.startOffset
        && ownerMatchesSpeaker(action.owner, speaker)
        && !["completed", "cancelled"].includes(action.lifecycleStatus));
      if (currentOwnerTasks.length === 1) {
        const [action] = currentOwnerTasks;
        const event = {
          type: "acknowledged", actor: speaker, text: body,
          sourceSpan: sourceSpan(record), messageTimestamp: timestamp?.raw || null,
          messageDate: timestamp?.date || null,
        };
        appendEvent(action, event);
        action.acknowledgedBy = speaker;
        action.acknowledgementText = body;
        action.acknowledgementSpan = sourceSpan(record);
        action.lifecycleStatus = "acknowledged";
        continue;
      }
    }

    // Delay-with-new-date update: "Client details are missing. I'll send it
    // tomorrow." re-commits the SAME work instead of creating a new task. Merge
    // only when the speaker owns exactly one open task whose verb matches;
    // otherwise leave everything as-is rather than guess.
    if (speaker && DELAY_CUE.test(body)) {
      // "Running late, will send it on Thursday" has no "I", but is still the speaker's own commitment.
      const bareWill = body.match(new RegExp(String.raw`\bwill\s+((?:${TASK_VERB_SOURCE})\b[^.!?]*)`, "iu"));
      const commitment = extractSelfCommitment(body, speaker) || (bareWill ? { owner: speaker, text: bareWill[1].trim() } : null);
      // The extractor may or may not have emitted a separate task for this
      // message (it often folds it into the original), so the merge works from
      // the message itself and treats the orphan as optional cleanup.
      const orphan = actions.find((action) => action.classification === "self_commitment"
        && ownerMatchesSpeaker(action.owner, speaker)
        && action.sourceSpan.startOffset >= record.startOffset
        && action.sourceSpan.endOffset <= record.endOffset) || null;
      const duePhrase = commitment?.owner ? extractLifecycleDuePhrase(body) : null;
      if (duePhrase) {
        const verb = commitment.text.trim().split(/\s+/u)[0]?.toLocaleLowerCase();
        const deliverable = [...relationTokens(commitment.text)].filter((token) => !DEADLINE_WORDS.has(token) && !PRONOUN_OBJECTS.has(token) && !FILLER_TOKENS.has(token));
        const ownedOpen = actions.filter((action) => action !== orphan
          && action.sourceSpan.startOffset < record.startOffset
          && ownerMatchesSpeaker(action.owner, speaker)
          && !["completed", "cancelled"].includes(action.lifecycleStatus));
        // Identity = deliverable, not verb. "send the quotation" must never
        // attach to "send the invoice". With only a pronoun ("send it"), the
        // speaker must have exactly one open task at all.
        const candidates = deliverable.length
          ? ownedOpen.filter((action) => {
              const tokens = relationTokens(action.text);
              return deliverable.some((token) => tokens.has(token));
            })
          : (ownedOpen.length === 1 && verb && sameVerbFamily(verb, ownedOpen[0].text) ? ownedOpen : []);
        if (candidates.length === 1) {
          const [target] = candidates;
          const event = {
            type: "delayed", actor: speaker, text: body, sourceSpan: sourceSpan(record),
            messageTimestamp: timestamp?.raw || null, messageDate: timestamp?.date || null,
            previousDueDate: target.dueDate || null, dueDate: duePhrase,
            resolvedDueDate: resolveDeadlineDate(duePhrase, timestamp?.date || null, options),
          };
          target.originalDueDate = target.originalDueDate ?? (target.dueDate || null);
          target.originalResolvedDueDate = target.originalResolvedDueDate ?? (target.resolvedDueDate || null);
          target.dueDate = duePhrase;
          target.resolvedDueDate = event.resolvedDueDate;
          target.dueDateStatus = "contextual";
          target.lifecycleStatus = "delayed";
          appendEvent(target, event);
          if (orphan) actions.splice(actions.indexOf(orphan), 1);
          continue;
        }
      }
    }

    const eventType = lifecycleEventType(body);
    if (!eventType) continue;
    let target = chooseLifecycleTarget(actions, record, body, speaker, eventType, options, records);
    if (!target && eventType === "reassigned") {
      // "Banner ka kaam ab Rohan karega, Neha ko ye nahi karna": the previous
      // owner is named, so use them to find the task, but only if it is unique
      // and shares at least one content word with the message.
      const previous = body.match(/(\p{Lu}[\p{L}\p{M}'’.-]*)\s+ko\s+(?:ye|yeh|ise|isse)\s+nahi\s+karna\b/u)?.[1];
      if (previous) {
        const owned = actions.filter((action) => action.sourceSpan.startOffset < record.startOffset
          && !["completed", "cancelled"].includes(action.lifecycleStatus)
          && ownerMatchesSpeaker(action.owner, previous)
          && relationScore(action.text, body) > 0);
        if (owned.length === 1) target = owned[0];
      }
    }
    if (!target) continue;
    if (eventType === "unblocked" && target.lifecycleStatus !== "blocked") continue;
    // A first-person progress/completion report from someone other than the
    // owner must not close the owner's task, unless the message names the owner
    // ("Priya sent the invoice"). Leaving it untouched is safer than guessing.
    if (["completed", "in-progress"].includes(eventType) && target.owner && speaker
      && !ownerMatchesSpeaker(target.owner, speaker)
      && !new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegex(String(target.owner).replace(/^@/u, ""))}(?![\\p{L}\\p{N}])`, "iu").test(body)) continue;

    const event = {
      type: eventType,
      actor: speaker || null,
      text: body,
      sourceSpan: sourceSpan(record),
      messageTimestamp: timestamp?.raw || null,
      messageDate: timestamp?.date || null,
    };

    if (eventType === "reassigned") {
      const nextOwner = extractReassignmentOwner(body);
      if (!nextOwner || ownerMatchesSpeaker(target.owner, nextOwner)) continue;
      event.previousOwner = target.owner || null;
      event.newOwner = nextOwner;
      target.owner = nextOwner;
      target.classification = "assigned_task";
      target.ownerSource = "conversation_reassignment";
      target.lifecycleStatus = "reassigned";
    } else if (eventType === "delayed") {
      const duePhrase = extractLifecycleDuePhrase(body);
      if (duePhrase) {
        event.dueDate = duePhrase;
        event.resolvedDueDate = resolveDeadlineDate(duePhrase, timestamp?.date || null, options);
        target.dueDate = duePhrase;
        target.resolvedDueDate = event.resolvedDueDate;
        target.dueDateStatus = "contextual";
      }
      target.lifecycleStatus = "delayed";
    } else {
      // "Working on the numbers now" answering an unowned request: whoever is doing it owns it.
      if (eventType === "in-progress" && !target.owner && speaker && !target.collective) {
        // A progress message is also an ownership claim. Apply the same guard as
        // acknowledgements and commitments: recent request, identifiable other
        // requester, and exactly one content-matching eligible request.
        const claimCandidates = actions.filter((action) => !action.collective
          && isEligibleUnownedClaim(records, action, record, speaker, options)
          && (relationScore(action.text, body) >= CLAIM_CONTENT_THRESHOLD || sharesWordStem(action.text, body)));
        if (claimCandidates.length === 1 && claimCandidates[0] === target) {
          target.owner = speaker;
          target.classification = "assigned_task";
          target.ownerSource = "claimed_by_progress";
          if (target.outcome === "possible" && !target.model) {
            target.outcome = "confirmed";
            target.outcomeReason = null;
          }
        }
      }
      target.lifecycleStatus = statusForEvent(eventType, target);
      if (eventType === "completed") target.completed = true;
      if (eventType === "cancelled") {
        target.cancelled = true;
        // "Cancel the logo request" is a control message, not a new task.
        for (const other of [...actions]) {
          if (other !== target && other.sourceSpan.startOffset >= record.startOffset && other.sourceSpan.endOffset <= record.endOffset
            && /^(?:please\s+)?(?:cancel|scrap|drop)\b/iu.test(other.text)) {
            actions.splice(actions.indexOf(other), 1);
          }
        }
      }
    }
    appendEvent(target, event);
  }

  for (const action of actions) {
    action.lifecycleEvents.sort((left, right) => left.sourceSpan.startOffset - right.sourceSpan.startOffset);
    const latest = action.lifecycleEvents.at(-1);
    if (latest && !["completed", "cancelled"].includes(action.lifecycleStatus)) {
      action.lifecycleStatus = statusForEvent(latest.type, action);
    }
  }
  return actions;
}
