# SarifPro Releases

This file tracks SarifPro APK releases and stability status.

## Release Rules

- Every change must be committed.
- Every APK must have a version number.
- Every APK must be saved in `releases/`.
- Every stable APK must be tagged.
- Never build over a production APK.
- Keep this changelog updated before publishing or distributing an APK.
- Do not attempt risky changes until version tracking is set up.

## Releases

| Version | APK filename | Date | Stability status | Notes | Known issues |
| --- | --- | --- | --- | --- | --- |
| 1.0.47 | `SarifPro-1.0.47.apk` | 2026-10-05 | Production release | Performance and stability release: faster continuous balance checks, reduced database/logging overhead, bounded log retention, safer automation lock identity. Built from commit `a5fce5a` (tag `v1.0.47`). versionCode 56. SHA-256 `0f28b328e8c2fcd721cb9c7b38c71781c271f9e70f5e4e44e811e2898665a6b3`. Published via GitHub Pages in commit `a1b1619`. | Continuous monitoring can become sparse when Android Doze/battery optimisation is active with the screen off. See 1.0.47 release notes. |
| 1.0.44 | `SarifPro-v1.0.44.apk` | 2026-06-23 | Production release | Adds lightweight automation watchdog recovery for stale balance cycles, automation locks, USSD session locks, background worker heartbeat, queue age, and active Accessibility health. Built from commit `b3dac7f`. | Physical validation found no crashes or silent stops, but repeated Android Telecom `onCreateConnectionFailed` entries should be monitored under customer network conditions. |
| 1.0.43 | `SarifPro-v1.0.43.apk` | 2026-06-15 | Production release | Adds integrated terminal USSD error recovery: invalid PIN, insufficient balance, invalid menu, invalid MMI, timeout, network, and expired-session screens now fail locally without waiting for 898 confirmation. | Monitor real customer USSD error screens after rollout. |
| 1.0.42 | `SarifPro-v1.0.42.apk` | 2026-06-15 | Production release | Promotes the tested startup/background stability improvements from internal build `6a5d412`; versionCode bumped to 43 for normal Android upgrades from 1.0.41. | Monitor real customer Direct Transfer and Dara-Salaam flows after rollout. |
| 1.0.41 | `SarifPro-v1.0.41-INTERNAL-6a5d412.apk` | 2026-06-15 | Internal pre-release test | Includes `788b4c8`, `35779c6`, `cbdd3dc`, and `6a5d412`. Built for physical-device stability testing only; not released to customers. | Real money movement tests require operator-confirmed safe amount/account before production approval. |
| 1.0.41 | `SarifPro-v1.0.41-USSD-SPEED.apk` | 2026-06-14 | V2 reliability test | Includes safe USSD session release optimization: clean terminal sessions skip the old 10 second pre/post clean-idle waits while unsafe sessions keep 30 second network settling. | V2 test build; validate on physical phones before production rollout. |
| 1.0.28 | `SarifPro-v1.0.28-STABLE.apk` | 2026-06-08 | Stable production | Best client-used APK. Source code unavailable. | Exact source snapshot unavailable; users on higher versionCode builds must uninstall before installing this APK. |

## 1.0.47 Release Notes

SarifPro 1.0.47 - Performance & Stability

- Package `com.sarifpro`, versionCode 56, signed with the same certificate as 1.0.46 (in-place upgrade).
- Release APK SHA-256: `0f28b328e8c2fcd721cb9c7b38c71781c271f9e70f5e4e44e811e2898665a6b3`.
- Source commit `a5fce5a` (tag `v1.0.47`); download site commit `a1b1619`.

Changes

- Significantly improved continuous balance-check responsiveness.
- Reduced database and logging overhead during long-running automation.
- Reduced delays between completed transfers and subsequent balance checks.
- Optimized log/balance queries for large production databases.
- Logs screen now refreshes only while actively viewed.
- Added incremental background log pruning.
- Log retention capped at the newest 50,000 rows to prevent database growth from degrading automation performance.
- Fixed automation lock identity handling for safer serialization.
- Added improved diagnostics for production troubleshooting.

Verified improvements (physical device, same phone and database, radio-log timestamps)

- Balance-check idle gap reduced from approximately 17.7-23.3 s to a median of about 1.6 s.
- Full continuous balance cycle reduced to approximately 6.3 s.
- Observed transfer-to-next-balance-check delay reduced from approximately 13.5 s to 3.5 s (single observed transfer).
- Database worker load reduced significantly during continuous operation.

Deferred / Known Issues

- Continuous monitoring can become sparse when Android Doze/battery optimisation is active with the screen off.
- Residual-balance chained transfers remain disabled.
- Residual-balance capture/shadow research remains experimental.
- 898/source-priority changes are not part of this release.

## Tags

| Tag | Meaning |
| --- | --- |
| `unstable-current` | Current source code checkpoint created after later unstable development work. |

## V2 Development

SarifPro V2 development starts from the `sarifpro-v2` branch.

V2 rules:

- Use the stable `v1.0.28` user experience as the baseline.
- Do not redesign UI.
- Rebuild automation reliability through `AutomationCoordinator`.
- No APK should be distributed from V2 until the phase checklist in `SARIFPRO_V2_STRATEGY.md` is satisfied.
