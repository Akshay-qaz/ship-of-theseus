package com.shipoftheseus

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

data class ClientUiState(
    val connection: ConnectionState = ConnectionState.Dropped,
    val session: JoinedSession? = null,
    val publicState: PublicGameState? = null,
    val privateState: PrivateGameState? = null,
    val error: String? = null,
    val revealDismissed: Boolean = false,
)

class ClientViewModel : ViewModel() {
    private val _uiState = MutableStateFlow(ClientUiState())
    val uiState: StateFlow<ClientUiState> = _uiState.asStateFlow()
    private val connection =
        ConnectionStateMachine(
            OkHttpTransport(),
            onMessage = ::handleMessage,
            onState = { state -> _uiState.value = _uiState.value.copy(connection = state) },
        )

    fun create(
        serverUrl: String,
        name: String,
    ) {
        connect(serverUrl)
        connection.send(WireProtocol.create(name))
    }

    fun join(
        serverUrl: String,
        roomCode: String,
        name: String,
        token: String? = null,
    ) {
        connect(serverUrl)
        connection.send(WireProtocol.join(roomCode.trim().uppercase(), name, token))
    }

    fun ready(ready: Boolean) = connection.send(WireProtocol.ready(ready))

    fun start() = connection.send(WireProtocol.start())
    fun vote(system: String) = connection.send(WireProtocol.vote(system))
    fun accuse(playerId: String) = connection.send(WireProtocol.accuse(playerId))
    fun chat(text: String) = connection.send(WireProtocol.chat(text))
    fun usePower(targetId: String? = null) = connection.send(WireProtocol.power(targetId))
    fun dismissReveal() { _uiState.value = _uiState.value.copy(revealDismissed = true) }

    private fun connect(url: String) {
        connection.connect(url)
    }

    private fun handleMessage(message: IncomingMessage) {
        viewModelScope.launch {
            when (message) {
                is IncomingMessage.Joined -> _uiState.value =
                    _uiState.value.copy(session = message.session, error = null, revealDismissed = false)
                is IncomingMessage.State ->
                    _uiState.value = _uiState.value.copy(
                        publicState = message.publicState,
                        privateState = message.privateState,
                        error = null,
                    )
                is IncomingMessage.Error -> _uiState.value = _uiState.value.copy(error = message.message)
                is IncomingMessage.Unknown -> Unit
            }
        }
    }

    override fun onCleared() {
        super.onCleared()
        // OkHttp owns the socket lifecycle; process death is a reconnect boundary.
    }
}
