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
| 1.0.41 | `SarifPro-v1.0.41-USSD-SPEED.apk` | 2026-06-14 | V2 reliability test | Includes safe USSD session release optimization: clean terminal sessions skip the old 10 second pre/post clean-idle waits while unsafe sessions keep 30 second network settling. | V2 test build; validate on physical phones before production rollout. |
| 1.0.28 | `SarifPro-v1.0.28-STABLE.apk` | 2026-06-08 | Stable production | Best client-used APK. Source code unavailable. | Exact source snapshot unavailable; users on higher versionCode builds must uninstall before installing this APK. |

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
