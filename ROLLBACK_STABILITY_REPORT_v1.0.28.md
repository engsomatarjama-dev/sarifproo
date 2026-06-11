# SarifPro Rollback And Stability Report

Date: 2026-06-10

## Rollback Status

- Production download page has been rolled back to `SarifPro-1.0.28.apk`.
- Live page: `https://engsomatarjama-dev.github.io/sarifproo/`
- Stable APK: `https://engsomatarjama-dev.github.io/sarifproo/SarifPro-1.0.28.apk`
- APK metadata: `com.sarifpro`, `versionName=1.0.28`, `versionCode=29`.
- SHA-256: `B8885C0A65D1FC4097AA597689530B044990575981394ABC08FB23938CE3ABB8`
- GitHub Pages tag created and pushed: `stable-production-v1.0.28`
- Tagged commit: `4d8225b Publish SarifPro 1.0.28 security update`

## Source Restore Status

The React Native application source tree at `C:\code` is not a Git repository and no matching `v1.0.28` source archive was found in the workspace. Because of that, the source tree cannot be truthfully restored to `v1.0.28` from local history.

What was restored safely:

- The production/customer download artifact.
- The GitHub Pages release pointer.
- The stable production tag for the `1.0.28` release artifact.

What remains unresolved:

- Reconstructing exact `v1.0.28` TypeScript/Kotlin source requires a source snapshot, Git repo, or backup from the time `1.0.28` was built.

## Version Comparison

Stable baseline:

- `v1.0.28`: stable production release, currently used successfully by customers.

Current development before rollback:

- `v1.0.40`: latest experimental release with multiple USSD sequencing, confirmation, queue, and clean-idle changes.

## Features Added After v1.0.28

Known changes by published release history:

- `1.0.29`: Confirmation handling update.
- `1.0.30`: Balance confirmation correction; 898 confirmation should apply only after money transfer, not balance check alone.
- `1.0.31`: Zero-transfer prevention and simplified history screen.
- `1.0.32`: Automation queue changes.
- `1.0.33`: 898 confirmation matching fixes.
- `1.0.34`: Duplicate transfer guard.
- `1.0.35`: 898 confirmation race fix.
- `1.0.36`: Pending confirmation retry behavior.
- `1.0.37`: USSD success completion handling.
- `1.0.38`: Single active USSD session lock.
- `1.0.39`: USSD network settling state after waiting screen disappears.
- `1.0.40`: Clean USSD idle guard and stuck-dialog dismissal before next dial.

## Risk Analysis

### Duplicate Transfers

Likely introduced or exposed by:

- `1.0.32` automation queue changes.
- `1.0.33` to `1.0.36` confirmation matching/race/retry work.
- Any path where an SMS event, periodic balance check, and confirmation wait could overlap.

Most likely causes:

- Queue accepted a second transfer while first was running or awaiting confirmation.
- Duplicate guard was added after issues appeared, meaning earlier duplicate state boundaries were insufficient.
- Confirmation retries may have changed transaction status timing and allowed reprocessing.

### Invalid Menu Errors

Likely introduced or exposed by:

- `1.0.37` final USSD success completion changes.
- `1.0.38` single-session lock.
- `1.0.39` network settling.
- `1.0.40` clean idle guard.

Most likely causes:

- App sent menu input into an old or half-open USSD session.
- New dial started while carrier-side USSD was still pending.
- Accessibility state machine assumed the visible screen belonged to the current flow when it belonged to a previous flow.

### Invalid MMI Code / Connection Problem

Likely introduced or exposed by:

- `1.0.32` queue behavior.
- `1.0.38` through `1.0.40` session-lock/cooldown changes.

Most likely causes:

- Carrier network still had a pending USSD request after Android UI disappeared.
- Next dial started before Phone/Telecom returned to a clean state.
- Timer-based cooldown was not enough on slow networks.

### USSD Session Conflicts

Likely introduced or exposed by:

- Periodic balance checker running continuously.
- SMS-triggered transfer arriving while balance checker was active.
- Queue/session changes after `1.0.28`.

Most likely causes:

- Multiple producers can start USSD: SMS automation, periodic balance checker, direct transfer, Dara-Salaam bank deposit.
- Before the later locking work, there was no simple, proven single owner for USSD.
- Later locks were reactive and increasingly complex, which increased state-machine risk.

### Balance Checker Issues

Likely introduced or exposed by:

- `1.0.30` correction around 898 confirmation after balance checks.
- `1.0.31` zero-transfer prevention.
- `1.0.32` queue changes.
- Continuous mode behavior combined with USSD flows.

Most likely causes:

- Balance checker was treated like a transfer in some paths.
- It sometimes waited for 898 confirmation when no confirmation SMS should arrive.
- Continuous mode reduced time between USSD sessions and exposed carrier timing problems.

## Recommended Upgrade Path

The rule going forward: reintroduce only one feature at a time into `v1.0.28`, then field-test before adding the next.

1. Create a real source-controlled baseline.
   - Recover or reconstruct exact `v1.0.28` source.
   - Commit it as `stable-production-v1.0.28-source`.
   - Build APK and verify it matches the behavior of the stable production APK.

2. Add observability only.
   - Local-only logs.
   - No behavior changes.
   - Goal: understand timing and state transitions in the stable app.

3. Reintroduce zero-transfer prevention.
   - Low risk.
   - Prevents invalid `$0` bank transfer attempts.
   - Test balance `0`, decimal balances, below-threshold balances.

4. Reintroduce history UI simplification.
   - UI-only.
   - No automation logic.

5. Reintroduce 898 confirmation correction.
   - Ensure 898 wait starts only after actual transfer begins.
   - Never wait for 898 after balance check alone.
   - Test direct transfer and bank deposit separately.

6. Reintroduce duplicate detection.
   - Must be implemented as pure policy first with tests.
   - Do not combine with queue changes.
   - Test duplicate SMS, duplicate reference, duplicate balance transfer.

7. Reintroduce a minimal USSD mutex.
   - One lock only.
   - No network settling or clean-idle auto-dismiss yet.
   - Test SMS during balance check and balance check during transfer.

8. Reintroduce queueing.
   - Queue SMS only.
   - Skip balance checker while busy.
   - Do not queue balance checks.

9. Reintroduce final USSD result detection.
   - First classify only.
   - Then auto-dismiss.
   - Then update transaction state.
   - Avoid changing transfer start behavior in the same release.

10. Reintroduce network settling only if still needed.
    - Make it configurable.
    - Default to conservative interval.
    - Field-test on slow networks.

## Release Safety Rules

- No combined automation changes in a single release.
- Every release must have a rollback APK retained.
- Every release must include:
  - version bump
  - APK signature verification
  - package metadata verification
  - a short changelog
  - field test on one real device before production publishing
- Continuous balance checking should stay disabled by default until USSD stability is proven.

