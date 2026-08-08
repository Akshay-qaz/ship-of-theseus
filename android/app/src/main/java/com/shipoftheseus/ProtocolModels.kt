package com.shipoftheseus

data class LobbyPlayer(
    val id: String,
    val name: String,
    val system: String,
    val ready: Boolean,
    val connected: Boolean,
    val replaced: Boolean,
)

data class PublicGameState(
    val roomCode: String,
    val hostId: String,
    val players: List<LobbyPlayer>,
    val phase: String,
    val storm: Int,
    val morale: Int,
    val identityBand: String,
)

data class PrivateGameState(
    val playerId: String,
    val alignment: String,
    val power: String,
    val converted: Boolean,
    val readingsUnreliable: Boolean,
    val reveal: String?,
)

data class JoinedSession(val roomCode: String, val playerId: String, val playerToken: String)

sealed interface IncomingMessage {
    data class Joined(val session: JoinedSession) : IncomingMessage

    data class State(val publicState: PublicGameState, val privateState: PrivateGameState) : IncomingMessage

    data class Error(val message: String) : IncomingMessage

    data class Unknown(val type: String?) : IncomingMessage
}
