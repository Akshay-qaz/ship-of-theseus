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

    fun vote(system: String): String = JSONObject().put("type", "vote").put("system", system).toString()

    fun accuse(playerId: String): String = JSONObject().put("type", "accuse").put("suspectId", playerId).toString()

    fun chat(text: String): String = JSONObject().put("type", "chat").put("text", text).toString()

    fun power(targetId: String? = null): String =
        JSONObject().apply {
            put("type", "power")
            targetId?.let { put("targetId", it) }
        }.toString()

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
                publicJson.optInt("replacements"),
                publicJson.optStringList("damagedSystems"),
                publicJson.optIntMap("voteTally"),
                publicJson.optChatList("chat"),
                publicJson.optBoolean("publicVote"),
                publicJson.optString("winner").ifEmpty { null },
                publicJson.optString("message").ifEmpty { null },
                publicJson.optLong("deadline").takeIf { publicJson.has("deadline") && !publicJson.isNull("deadline") },
                publicJson.optTimeline("timeline"),
                publicJson.optString("replacementPlayerId").ifEmpty { null },
            ),
            PrivateGameState(
                privateJson.optString("playerId"),
                privateJson.optString("alignment"),
                privateJson.optString("power"),
                privateJson.optBoolean("converted"),
                privateJson.optBoolean("readingsUnreliable"),
                privateJson.optString("reveal").ifEmpty { null },
                privateJson.optIntMap("severity"),
                privateJson.optNullableInt("exactIdentity"),
                privateJson.optStringList("forecast"),
                privateJson.optNullableInt("targetCount"),
                privateJson.optString("activatablePower").ifEmpty { null },
            ),
        )
    }

    private fun JSONObject.optStringList(key: String): List<String> {
        val array = optJSONArray(key) ?: return emptyList()
        return buildList { for (index in 0 until array.length()) add(array.optString(index)) }
    }

    private fun JSONObject.optIntMap(key: String): Map<String, Int> {
        val objectValue = optJSONObject(key) ?: return emptyMap()
        return objectValue.keys().asSequence().associateWith { objectValue.optInt(it) }
    }

    private fun JSONObject.optNullableInt(key: String): Int? = if (has(key) && !isNull(key)) optInt(key) else null

    private fun JSONObject.optChatList(key: String): List<ChatMessage> {
        val array = optJSONArray(key) ?: return emptyList()
        return buildList {
            for (index in 0 until array.length()) {
                val item = array.optJSONObject(index) ?: continue
                add(ChatMessage(item.optString("playerName"), item.optString("text"), item.optInt("storm"), item.optString("phase")))
            }
        }
    }

    private fun JSONObject.optTimeline(key: String): List<TimelineEvent> {
        val array = optJSONArray(key) ?: return emptyList()
        return buildList {
            for (index in 0 until array.length()) {
                val item = array.optJSONObject(index) ?: continue
                add(
                    TimelineEvent(
                        item.optString("kind"),
                        item.optInt("storm"),
                        item.optString("system").ifEmpty { null },
                        item.optString("playerId"),
                    ),
                )
            }
        }
    }
}
