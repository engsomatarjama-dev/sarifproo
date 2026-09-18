package com.sarifpro.accessibility

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Plain JUnit coverage for the pure decision logic behind Sprint 4's narrow
 * MMI/network-error recovery path. This does NOT and cannot exercise the
 * real AccessibilityNodeInfo/AccessibilityWindowInfo root and button
 * matching (SarifAccessibilityService.tryHandleOwnedTerminalMmiError) --
 * that has no automated coverage in this project and remains something
 * only a real device (or a Robolectric/instrumentation harness this project
 * does not currently have) can validate. What is covered here is real,
 * deterministic logic that previously had zero test coverage at all.
 */
class MmiRecoveryPolicyTest {

    // ---- isWithinOwnershipWindow ------------------------------------------------

    @Test
    fun `blank automation mode is never within the ownership window`() {
        assertFalse(MmiRecoveryPolicy.isWithinOwnershipWindow("", armedUntil = 1000L, nowMs = 2000L))
        assertFalse(MmiRecoveryPolicy.isWithinOwnershipWindow("   ", armedUntil = 1000L, nowMs = 2000L))
    }

    @Test
    fun `armedUntil of zero (never armed) is never within the ownership window`() {
        assertFalse(MmiRecoveryPolicy.isWithinOwnershipWindow("PERIODIC_BALANCE_CHECKER", armedUntil = 0L, nowMs = 100_000L))
    }

    @Test
    fun `still-armed (armedUntil in the future) is not within the recovery window`() {
        // isAutomationArmed() being true means the normal, arming-gated
        // handlers already own this screen; the narrow recovery path is
        // only ever consulted once isAutomationArmed() is false, but this
        // guards the function's own contract independently of that caller.
        val now = 100_000L
        assertFalse(MmiRecoveryPolicy.isWithinOwnershipWindow("PERIODIC_BALANCE_CHECKER", armedUntil = now + 5_000L, nowMs = now))
    }

    @Test
    fun `just past armedUntil expiry is within the ownership window`() {
        val now = 100_000L
        assertTrue(MmiRecoveryPolicy.isWithinOwnershipWindow("PERIODIC_BALANCE_CHECKER", armedUntil = now - 1L, nowMs = now))
    }

    @Test
    fun `exactly at the window boundary is still within the ownership window`() {
        val now = 500_000L
        val windowMs = 60_000L
        assertTrue(MmiRecoveryPolicy.isWithinOwnershipWindow("DIRECT_TRANSFER", armedUntil = now - windowMs, nowMs = now, windowMs = windowMs))
    }

    @Test
    fun `just past the window boundary is no longer within the ownership window`() {
        val now = 500_000L
        val windowMs = 60_000L
        assertFalse(MmiRecoveryPolicy.isWithinOwnershipWindow("DIRECT_TRANSFER", armedUntil = now - windowMs - 1L, nowMs = now, windowMs = windowMs))
    }

    @Test
    fun `a session armed hours ago and never disarmed is not treated as still owned`() {
        // Defends against a crashed/abandoned session (or, in non-continuous
        // balance-check mode, the idle gap between scheduled cycles) being
        // mistaken for an active one and used to justify clicking an
        // unrelated dialog that happens to appear much later.
        val now = System.currentTimeMillis()
        val threeHoursAgo = now - (3 * 60 * 60 * 1000L)
        assertFalse(MmiRecoveryPolicy.isWithinOwnershipWindow("PERIODIC_BALANCE_CHECKER", armedUntil = threeHoursAgo, nowMs = now))
    }

    // ---- looksLikeOwnedMmiNetworkError -------------------------------------------

    @Test
    fun `matches the exact confirmed physical dialog text`() {
        assertTrue(MmiRecoveryPolicy.looksLikeOwnedMmiNetworkError("connection problem or invalid mmi code."))
    }

    @Test
    fun `matches the individual reused existing error classes`() {
        assertTrue(MmiRecoveryPolicy.looksLikeOwnedMmiNetworkError("invalid mmi code"))
        assertTrue(MmiRecoveryPolicy.looksLikeOwnedMmiNetworkError("invalid mmi"))
        assertTrue(MmiRecoveryPolicy.looksLikeOwnedMmiNetworkError("mmi code"))
        assertTrue(MmiRecoveryPolicy.looksLikeOwnedMmiNetworkError("connection problem"))
        assertTrue(MmiRecoveryPolicy.looksLikeOwnedMmiNetworkError("network error"))
    }

    @Test
    fun `does not match unrelated existing error classes (stays narrow on purpose)`() {
        assertFalse(MmiRecoveryPolicy.looksLikeOwnedMmiNetworkError("invalid pin"))
        assertFalse(MmiRecoveryPolicy.looksLikeOwnedMmiNetworkError("session expired"))
        assertFalse(MmiRecoveryPolicy.looksLikeOwnedMmiNetworkError("hadhaagaagu kuguma filna"))
        assertFalse(MmiRecoveryPolicy.looksLikeOwnedMmiNetworkError("insufficient balance"))
        assertFalse(MmiRecoveryPolicy.looksLikeOwnedMmiNetworkError("transfer failed"))
        assertFalse(MmiRecoveryPolicy.looksLikeOwnedMmiNetworkError("request timed out"))
    }

    @Test
    fun `does not match generic vague text that could appear in an unrelated dialog`() {
        assertFalse(MmiRecoveryPolicy.looksLikeOwnedMmiNetworkError("failed"))
        assertFalse(MmiRecoveryPolicy.looksLikeOwnedMmiNetworkError("error"))
        assertFalse(MmiRecoveryPolicy.looksLikeOwnedMmiNetworkError("battery low, turn on power saving"))
        assertFalse(MmiRecoveryPolicy.looksLikeOwnedMmiNetworkError(""))
    }
}
