package com.shipoftheseus

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

private class FakeTransport : SocketTransport {
    var listener: SocketTransport.Listener? = null
    val sent = mutableListOf<String>()

    override fun connect(
        url: String,
        listener: SocketTransport.Listener,
    ) {
        this.listener = listener
    }

    override fun send(message: String) {
        sent += message
    }

    override fun close() = Unit
}

class ConnectionStateMachineTest {
    @Test
    fun reconnectsAndReplaysSavedJoin() {
        val transport = FakeTransport()
        val states = mutableListOf<ConnectionState>()
        val machine = ConnectionStateMachine(transport, {}, states::add)
        machine.connect("ws://example")
        assertEquals(ConnectionState.Connecting, states.last())
        transport.listener!!.onOpen()
        assertEquals(ConnectionState.Connected, states.last())
        transport.listener!!.onMessage("""{"type":"joined","roomCode":"ABC123","playerId":"p1","playerToken":"secret"}""")
        transport.listener!!.onClosed()
        assertEquals(ConnectionState.Dropped, states.last())
        machine.reconnect()
        assertEquals(ConnectionState.Reconnecting, states.last())
        transport.listener!!.onOpen()
        assertTrue(transport.sent.last().contains("ABC123"))
        assertTrue(transport.sent.last().contains("secret"))
    }
}
