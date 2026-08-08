package com.shipoftheseus

import org.json.JSONObject

object WireProtocol {
    fun create(name: String): String = JSONObject().put("type", "create").put("name", name).toString()

    fun join(
        roomCode: String,
        name: String,
        token: String? = null,
    ): String =
        JSONObject().apply {
            put("type", "join")
            put("roomCode", roomCode)
            put("name", name)
            token?.let { put("playerToken", it) }
        }.toString()

    fun ready(ready: Boolean): String = JSONObject().put("type", "ready").put("ready", ready).toString()

    fun start(): String = JSONObject().put("type", "start").toString()

    fun parse(raw: String): IncomingMessage {
        val json = runCatching { JSONObject(raw) }.getOrNull() ?: return IncomingMessage.Unknown(null)
        return when (json.optString("type")) {
            "joined" ->
                IncomingMessage.Joined(
                    JoinedSession(json.optString("roomCode"), json.optString("playerId"), json.optString("playerToken")),
                )
            "state" -> parseState(json)
            "error" -> IncomingMessage.Error(json.optString("message", "Unknown server error"))
            else -> IncomingMessage.Unknown(json.optString("type").ifEmpty { null })
        }
    }

    private fun parseState(json: JSONObject): IncomingMessage {
        val publicJson = json.optJSONObject("public") ?: return IncomingMessage.Unknown("state")
        val privateJson = json.optJSONObject("private") ?: return IncomingMessage.Unknown("state")
        val players =
            buildList {
                val array = publicJson.optJSONArray("players") ?: return@buildList
                for (index in 0 until array.length()) {
                    val player = array.optJSONObject(index) ?: continue
                    add(
                        LobbyPlayer(
                            player.optString("id"),
                            player.optString("name"),
                            player.optString("system"),
                            player.optBoolean("ready"),
                            player.optBoolean("connected"),
                            player.optBoolean("replaced"),
                        ),
                    )
                }
            }
        return IncomingMessage.State(
            PublicGameState(
                publicJson.optString("roomCode"),
                publicJson.optString("hostId"),
                players,
                publicJson.optString("phase"),
                publicJson.optInt("storm"),
                publicJson.optInt("morale"),
                publicJson.optString("identityBand"),
            ),
            PrivateGameState(
                privateJson.optString("playerId"),
                privateJson.optString("alignment"),
                privateJson.optString("power"),
                privateJson.optBoolean("converted"),
                privateJson.optBoolean("readingsUnreliable"),
                privateJson.optString("reveal").ifEmpty { null },
            ),
        )
    }
}
