package com.shipoftheseus

enum class ConnectionState { Connecting, Connected, Reconnecting, Dropped }

interface SocketTransport {
    fun connect(
        url: String,
        listener: Listener,
    )

    fun send(message: String)

    fun close()

    interface Listener {
        fun onOpen()

        fun onMessage(raw: String)

        fun onClosed()

        fun onFailure()
    }
}

class ConnectionStateMachine(
    private val transport: SocketTransport,
    private val onMessage: (IncomingMessage) -> Unit,
    private val onState: (ConnectionState) -> Unit,
) {
    private var url: String? = null
    private var reconnectPayload: String? = null
    private val pendingMessages = mutableListOf<String>()
    private var currentState = ConnectionState.Dropped

    fun connect(
        url: String,
        reconnectPayload: String? = null,
    ) {
        this.url = url
        this.reconnectPayload = reconnectPayload
        updateState(if (reconnectPayload == null) ConnectionState.Connecting else ConnectionState.Reconnecting)
        transport.connect(url, listener)
    }

    fun send(message: String) {
        if (currentState == ConnectionState.Connected) transport.send(message) else pendingMessages += message
    }

    fun reconnect() {
        val savedUrl = url ?: return
        connect(savedUrl, reconnectPayload)
    }

    fun saveReconnectPayload(payload: String) {
        reconnectPayload = payload
    }

    private val listener =
        object : SocketTransport.Listener {
            override fun onOpen() {
                updateState(ConnectionState.Connected)
                reconnectPayload?.let(transport::send)
                pendingMessages.forEach(transport::send)
                pendingMessages.clear()
            }

            override fun onMessage(raw: String) {
                val message = WireProtocol.parse(raw)
                if (message is IncomingMessage.Joined) {
                    saveReconnectPayload(WireProtocol.join(message.session.roomCode, "", message.session.playerToken))
                }
                onMessage(message)
            }

            override fun onClosed() {
                updateState(ConnectionState.Dropped)
            }

            override fun onFailure() {
                updateState(ConnectionState.Dropped)
            }
        }

    private fun updateState(state: ConnectionState) {
        currentState = state
        onState(state)
    }
}
