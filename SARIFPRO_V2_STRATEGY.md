# SarifPro V2 Development Strategy

## Purpose

SarifPro V2 is a reliability rebuild of the automation engine.

The goal is not to redesign the product. The goal is to make automation stable, maintainable, testable, and safer than the current unstable development line.

## Baseline

The production baseline is `SarifPro v1.0.28`, currently preserved as:

`releases/SarifPro-v1.0.28-STABLE.apk`

Important constraint:

- The stable `v1.0.28` APK exists.
- The exact `v1.0.28` source code is unavailable in this workspace.
- V2 must preserve the proven user workflows and familiar UI behavior from the stable production app.
- No visual redesign is allowed unless a separate explicit product decision is made later.

## UI Requirements

Reuse the proven UI and workflows from `v1.0.28` as the baseline:

- Dashboard
- History
- Settings
- Navigation
- Login
- Subscription screens

Rules:

- Do not redesign the dashboard.
- Do not create new navigation.
- Do not change user workflows.
- Do not introduce a new visual system.
- Do not add new UI features during automation-engine work.

If the exact stable UI source cannot be recovered, reconstruct only what is necessary to match the familiar production workflow. Reliability work must not become a design project.

## Primary Goal

Rebuild the automation engine cleanly with focus on:

- Stability
- Reliability
- Maintainability
- Testability
- Clear ownership of USSD sessions
- Predictable transaction state transitions

## Core Architecture

Create a single automation entry point:

`AutomationCoordinator`

All automation sources must pass through `AutomationCoordinator`.

Allowed sources:

- SMS Parser
- Balance Checker
- Manual Actions

Hard rule:

- No module may directly start USSD operations.
- No module may bypass `AutomationCoordinator`.
- No module may independently own USSD state.

## Single USSD Session Rule

Only one active USSD session may exist at a time.

`AutomationCoordinator` owns:

- USSD session lifecycle
- USSD lock
- Queue policy
- Duplicate prevention handoff
- Transfer state transitions
- Failure recovery

Other modules may request automation work, but they must not execute it directly.

## V2 Phases

### Alpha 1

Scope:

- Auth
- Subscription
- Settings
- Security PIN
- Old/familiar UI

Acceptance:

- User can log in.
- Subscription status is visible.
- Settings are secure.
- UI behavior matches stable production expectations.
- No automation changes beyond safe scaffolding.

### Alpha 2

Scope:

- SMS Parser

Acceptance:

- SMS parsing is pure and testable.
- No USSD operations are started directly from parser code.
- Parser outputs structured automation requests only.

### Alpha 3

Scope:

- Direct Transfer

Acceptance:

- Direct transfer can only run through `AutomationCoordinator`.
- One direct transfer runs at a time.
- Destination always comes from settings, never customer phone.
- Tests cover amount parsing, USSD building, and transaction state.

### Alpha 4

Scope:

- Dara-Salaam Bank Deposit

Acceptance:

- Dara flow runs only through `AutomationCoordinator`.
- Bank PIN stays local and secure.
- Flow states are explicit and testable.
- No shared state confusion with direct transfer.

### Alpha 5

Scope:

- Balance Checker

Acceptance:

- Balance checker submits requests to `AutomationCoordinator`.
- Balance check never starts while a transfer is active.
- Balance check does not wait for 898 confirmation unless it triggers an actual transfer.
- Continuous mode stays disabled by default until field proven.

### Beta 1

Scope:

- Duplicate Protection
- USSD Session Lock

Acceptance:

- Duplicate policy is pure and covered by tests.
- USSD lock is centralized in `AutomationCoordinator`.
- SMS, balance checker, and manual actions cannot race each other.

### Beta 2

Scope:

- Background Service

Acceptance:

- Background execution uses the same coordinator path.
- No separate background automation path exists.
- Background and foreground states cannot start parallel USSD sessions.

### Stable

Scope:

- Production release candidate.

Acceptance:

- More stable than `v1.0.28` in real device testing.
- No known duplicate transfer issue.
- No known USSD session conflict issue.
- No unresolved invalid menu / invalid MMI issue from automation overlap.
- Release APK saved in `releases/`.
- Stable tag created.
- `RELEASES.md` updated.

## Explicit Non-Goals

Do not:

- Add experimental features.
- Redesign UI.
- Build multiple automation paths.
- Add complex timing workarounds before core functionality is stable.
- Add direct USSD calls outside `AutomationCoordinator`.
- Change customer workflows without a separate product decision.

## Engineering Rules

- Every change must be committed.
- Every APK must have a version number.
- Every APK must be saved in `releases/`.
- Every stable APK must be tagged.
- Never build over a production APK.
- Keep `RELEASES.md` updated.
- Prefer small commits tied to one phase.
- Prefer pure policy modules with tests before native automation changes.
- Field-test on physical devices before promotion.

## Success Criteria

SarifPro V2 is releasable only when it is demonstrably more stable than `v1.0.28`.

Reliability is more important than new features.

