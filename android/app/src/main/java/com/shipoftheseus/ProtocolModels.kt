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
    val replacements: Int,
    val damagedSystems: List<String>,
    val voteTally: Map<String, Int>,
    val chat: List<ChatMessage>,
    val publicVote: Boolean,
    val winner: String?,
    val message: String?,
    val timeline: List<TimelineEvent>,
    val replacementPlayerId: String?,
)

data class ChatMessage(val playerName: String, val text: String, val storm: Int, val phase: String)

data class TimelineEvent(val kind: String, val storm: Int, val system: String?, val playerId: String)

data class PrivateGameState(
    val playerId: String,
    val alignment: String,
    val power: String,
    val converted: Boolean,
    val readingsUnreliable: Boolean,
    val reveal: String?,
    val severity: Map<String, Int>,
    val exactIdentity: Int?,
    val forecast: List<String>,
    val targetCount: Int?,
    val activatablePower: String?,
)

data class JoinedSession(val roomCode: String, val playerId: String, val playerToken: String)

sealed interface IncomingMessage {
    data class Joined(val session: JoinedSession) : IncomingMessage

    data class State(val publicState: PublicGameState, val privateState: PrivateGameState) : IncomingMessage

    data class Error(val message: String) : IncomingMessage

    data class Unknown(val type: String?) : IncomingMessage
}
