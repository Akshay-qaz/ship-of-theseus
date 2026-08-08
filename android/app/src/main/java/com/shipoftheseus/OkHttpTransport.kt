package com.shipoftheseus

import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.WebSocket
import okhttp3.WebSocketListener

class OkHttpTransport : SocketTransport {
    private val client = OkHttpClient()
    private var socket: WebSocket? = null

    override fun connect(
        url: String,
        listener: SocketTransport.Listener,
    ) {
        socket =
            client.newWebSocket(
                Request.Builder().url(url).build(),
                object : WebSocketListener() {
                    override fun onOpen(
                        webSocket: WebSocket,
                        response: okhttp3.Response,
                    ) = listener.onOpen()

                    override fun onMessage(
                        webSocket: WebSocket,
                        text: String,
                    ) = listener.onMessage(text)

                    override fun onFailure(
                        webSocket: WebSocket,
                        t: Throwable,
                        response: okhttp3.Response?,
                    ) = listener.onFailure()

                    override fun onClosed(
                        webSocket: WebSocket,
                        code: Int,
                        reason: String,
                    ) = listener.onClosed()
                },
            )
    }

    override fun send(message: String) {
        socket?.send(message)
    }

    override fun close() {
        socket?.close(1000, "client closed")
        socket = null
    }
}
