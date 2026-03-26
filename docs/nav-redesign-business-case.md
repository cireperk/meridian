# Business Case: Navigation & Information Architecture Redesign

**Meridian App — Executive Presentation**
Prepared by: Product & UX
Date: March 25, 2026
Status: Proposal — Pending Executive Approval

---

## Executive Summary

Meridian's current navigation structure organizes the app around its four features — Chat, Calendar, Vault, and Coach. This is a common early-stage product pattern, but it creates friction for users who are stressed, time-pressed, and emotionally vulnerable.

This document makes the case for a navigation redesign that reorganizes the app around how users actually think and what they need moment to moment — moving from a **feature-first architecture** to a **user-first one**.

The proposed change is expected to drive meaningful improvements in daily active use, session depth, and retention.

---

## The Problem

**Users open the app with a job to do, not a feature to visit.**

When someone going through a divorce opens Meridian, they are thinking one of three things:

1. **What's happening today / this week with my kids?**
2. **I need to communicate something to my co-parent.**
3. **I need to look something up or find a document.**

The current four-tab structure — Chat, Calendar, Vault, Coach — does not map to any of these mental modes. Worse, it creates two specific problems:

### 1. Split AI experience
Chat and Coach are both AI-powered conversation interfaces. Separating them into two tabs forces users to make an upfront decision about which "mode" they need before they even know what they want to say. This is unnecessary cognitive load for users who are often in a heightened emotional state.

### 2. No home base
There is no "Today" view. Users land on a blank chat screen with a generic welcome message and a row of prompts that are partially cut off. There is no proactive surface showing them what matters right now — whose week it is, what's coming up, what the AI wants to flag.

The app waits to be asked instead of showing up for the user.

**This is the single biggest missed opportunity for daily habit formation.**

---

## The Opportunity

**Retention in emotional wellness and legal apps is driven by daily relevance, not feature breadth.**

Apps that create a daily reason to open — a check-in, a nudge, a "here's what's happening today" moment — dramatically outperform apps that are purely reactive tools. Think of how Headspace, Duolingo, and Apple Health create a pull to return every day.

Meridian has all the ingredients to do this: it knows the custody schedule, the key legal dates, the kids' names, and the co-parenting dynamics. It just isn't surfacing that intelligence proactively.

The navigation redesign is the structural prerequisite to making that possible.

---

## The Proposed Solution: 3-Tab Architecture

### Current (Feature-First)

| Tab | What it does |
|---|---|
| Chat | Free-form AI chat |
| Calendar | Manual event tracking |
| Vault | Document storage + decree summary |
| Coach | AI message drafting and coaching |

### Proposed (User-First)

| Tab | What it does |
|---|---|
| **Today** | Proactive home base — custody view, upcoming events, AI-generated daily nudge |
| **Communicate** | Unified AI — free-form chat, message drafting, and situation coaching in one place |
| **Vault** | Unchanged — documents, decree summary, secure storage |

### What changes

- Calendar becomes a **widget inside Today**, not a standalone destination. Tapping the widget expands into the full month calendar view as a drill-down within Today — no separate tab needed.
- Chat and Coach **merge into a single Communicate tab**, with coaching modes as quick-start entry points within the unified interface.
- A new **Today tab** is built as the default landing screen.

### What doesn't change

- Vault stays exactly as-is — name, structure, and security framing all retained.
- The AI capabilities are identical — this is a reorganization, not a rebuild.
- The core decree intelligence, message coaching, and document features are all preserved.

---

## Today Tab — What It Looks Like

The Today tab becomes the emotional and practical anchor of the app. On any given day, a user opens Meridian and immediately sees:

- **Custody status** — "This is Eric's week with Dawson" with a simple week-view strip showing the handoff schedule color-coded by parent
- **Upcoming events** — Next 2-3 items from the calendar (handoffs, appointments, court dates)
- **AI proactive nudge** — A contextual, personalized prompt generated from the decree and calendar, e.g.:
  - *"Dawson's spring break starts in 8 days. Want to review what your decree says about the schedule?"*
  - *"Jordan's Soberlink requirement ends in 45 days — here's what that means for you."*
- **Quick actions** — One-tap entry points to the most common tasks: Draft a message, Log an event, Ask a question

This is the "good morning" of the app. It should feel like a calm, informed companion who has already reviewed your situation before you woke up.

### Day 1: The Cold-Start Experience

The Today tab must be compelling even before the user has entered any data. A new user with no decree, no custody schedule, and no events should not see an empty screen — that would be worse than the current Chat landing, because it promises proactivity and delivers nothing.

**Day 1 Today tab:**

1. **Welcome card** — Warm, personal greeting. "Welcome to Meridian. Let's get you set up so we can start showing up for you."
2. **Setup checklist** — Three simple steps, each one unlocking more intelligence:
   - *Add your co-parent's name and your children* — unlocks personalized AI responses
   - *Set your custody schedule* — unlocks the custody strip, proactive nudges, and calendar
   - *Upload your decree* — unlocks decree-aware answers, holiday awareness, and legal context
3. **Quick action** — Even with zero data, "Talk to Meridian" is always available. The AI works from day one; the data just makes it smarter.

Each completed step visibly enriches the Today view in real time. Upload a decree and the custody strip appears. Add a schedule and the week view populates. This creates a satisfying setup loop where the user sees immediate value for each input.

**The principle:** Today is never empty. It's either showing you your life, or showing you how to teach it about your life.

---

## Communicate Tab — Unifying Chat and Coach

The current split between Chat and Coach creates an implicit message to users: *you need to know which kind of help you need before you ask.* That's backwards. World-class AI products meet users where they are and figure out the mode together.

### How it works

The unified Communicate tab would:

- Open to a clean conversation interface (identical to the current Chat home)
- Surface the same quick-start prompts currently split across both tabs (Draft a message, Navigate a situation, Understand my decree, Financial planning, Talk to kids about divorce)
- Retain conversation history from both current Chat and Coach sessions, merged into a single list with subtle type indicators (conversation vs. draft)

### Mode transitions: Explicit but lightweight

Rather than auto-detecting whether a user is chatting or coaching (which risks getting it wrong during vulnerable moments), the Communicate tab uses **explicit but lightweight mode entry**:

- User starts a conversation normally — this is free-form chat
- At any point, the user can tap a contextual action: **"Help me draft a response"** or **"Coach me through this"**
- This shifts the AI's system prompt and UI into coaching mode within the same conversation thread
- The user never leaves, never loses context, never has to start over in a different tab

This preserves the power of both modes while removing the upfront decision. Users who know they want to draft a message can tap it immediately from the quick-start prompts. Users who start venting and then realize they need to draft a reply can transition seamlessly.

### The key insight

Users should never have to think *"Is this a Chat question or a Coach question?"* It's always just Meridian.

---

## Conversation History Migration

Users currently have separate Chat and Coach session lists. The migration path:

- **Existing sessions are preserved** — all Chat conversations and Coach sessions remain accessible
- **Unified list** — both types appear in a single conversation history, sorted by recency
- **Visual indicator** — Coach-originated sessions show a subtle badge or icon so users can distinguish them if they want to
- **No data loss** — this is a presentation-layer change, not a data migration

---

## Expected Impact

| Metric | Current State | Expected Outcome |
|---|---|---|
| **Daily Active Use** | Users open app reactively when they have a specific need | Today tab creates a daily pull to open the app even without a specific task |
| **Session Depth** | Users visit one tab per session | Today tab surfaces cross-feature content, driving users into Communicate and Vault organically |
| **Feature Discovery** | Coach is a separate destination; many users may not find it | Unified Communicate tab ensures all AI capabilities are discovered in one place |
| **Retention** | No daily habit loop | Proactive Today nudges create a reason to return every day |
| **Emotional Experience** | App feels like 4 tools | App feels like 1 intelligent companion |

---

## What This Is Not

This proposal is **not a rebuild**. The AI models, decree analysis engine, coaching logic, document storage, and calendar functionality are all unchanged.

This is a reorganization of how those capabilities are surfaced to users. The engineering effort is primarily front-end:

- A new Today tab component
- A merged Communicate tab
- Calendar widget extraction from standalone tab to Today embed

The hardest work is the Today tab's proactive AI nudge logic, which requires connecting the decree intelligence and calendar data to generate a daily contextual prompt — but this is additive, not a replacement of anything existing.

---

## Risk Mitigation & Rollback Plan

| Risk | Mitigation |
|---|---|
| **Today tab feels empty for new users** | Day 1 setup checklist ensures the tab is never blank; quick actions available immediately |
| **Users miss the Calendar as a standalone tab** | Full calendar accessible as drill-down from Today; monitor for drop in calendar usage |
| **Chat/Coach merge confuses existing users** | Conversation history preserved; coaching accessible from same entry points; no capabilities removed |
| **Metrics don't improve** | Run 2-week A/B test before full rollout; 4-tab structure preserved in codebase for instant rollback |

**Rollback plan:** The current 4-tab architecture remains in the codebase behind a feature flag. If the A/B test shows degraded discoverability or retention, we revert to the 4-tab structure within one deploy cycle. No data migration is required in either direction.

---

## Timing

This redesign should ship **after Apple App Store approval** of the current build. The current review is pending and any structural navigation changes would require re-review. Once approved:

- **Week 1-2:** Design sprint and prototype
- **Week 3-4:** Build Today tab + Communicate merge behind feature flag
- **Week 5-6:** Internal testing and refinement
- **Week 7-8:** A/B test against current 4-tab structure

---

## Recommendation

Approve a design sprint to prototype the 3-tab architecture, with the **Today tab as the primary deliverable**. Run a 2-week A/B test against the current 4-tab structure measuring daily open rate, session length, and 30-day retention.

The hypothesis is strong, the risk is low, and the upside — making Meridian feel like the most thoughtful product in the space — is directly aligned with the company's positioning.

**Requested decision:** Green light for design sprint and prototype build.

---

> *"The goal is not to organize our features. The goal is to organize around our users' lives."*
