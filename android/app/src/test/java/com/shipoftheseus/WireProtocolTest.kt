package com.shipoftheseus

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class WireProtocolTest {
    @Test
    fun parsesStateAndIgnoresUnknownMessages() {
        val state =
            WireProtocol.parse(
                """
                {"type":"state","public":{"roomCode":"ABC123","hostId":"p0","players":[],"phase":"lobby","storm":0,"morale":5,"identityBand":"Weathered"},"private":{"playerId":"p0","alignment":"Original Crew","power":"Sail","converted":false,"readingsUnreliable":false}}
                """.trimIndent(),
            )
        assertTrue(state is IncomingMessage.State)
        assertEquals(IncomingMessage.Unknown("future"), WireProtocol.parse("""{"type":"future","value":1}"""))
    }

    @Test
    fun buildsReconnectJoinWithoutPrivateData() {
        val message = WireProtocol.join("abc123", "Ada", "token")
        assertTrue(message.contains("playerToken"))
        assertTrue(!message.contains("alignment"))
    }
}
