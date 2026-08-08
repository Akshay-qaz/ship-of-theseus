@file:Suppress("ktlint:standard:function-naming")

package com.shipoftheseus

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import kotlinx.coroutines.delay

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent { ShipOfTheseusApp() }
    }
}

@Composable
fun ShipOfTheseusApp(viewModel: ClientViewModel = viewModel()) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()
    MaterialTheme {
        Surface(modifier = Modifier.fillMaxSize()) {
            val public = state.publicState
            val privateState = state.privateState
            when {
                state.session == null || public == null -> HomeScreen(state, viewModel)
                public.phase == "lobby" -> LobbyScreen(state, viewModel)
                public.phase == "results" -> ResultsScreen(public)
                privateState?.converted == true && !state.revealDismissed ->
                    PrivateRevealScreen(privateState, viewModel)
                public.phase == "storm" -> VoyageHudScreen(state)
                public.phase == "damageReport" -> DamageReportScreen(state)
                public.phase == "council" -> CouncilScreen(state, viewModel)
                public.phase == "vote" -> VoteScreen(state, viewModel)
                public.phase == "mutiny" -> MutinyScreen(state, viewModel)
                else -> VoyageHudScreen(state)
            }
        }
    }
}

@Composable
private fun ConnectionBanner(state: ClientUiState) {
    Text(
        "Connection: ${state.connection}",
        color =
            if (state.connection == ConnectionState.Connected) {
                MaterialTheme.colorScheme.primary
            } else {
                MaterialTheme.colorScheme.error
            },
    )
    state.error?.let { Text(it, color = MaterialTheme.colorScheme.error) }
}

@Composable
private fun HomeScreen(
    state: ClientUiState,
    viewModel: ClientViewModel,
) {
    var name by remember { mutableStateOf("") }
    var roomCode by remember { mutableStateOf("") }
    var serverUrl by remember { mutableStateOf("ws://10.0.2.2:8080") }
    Column(
        modifier = Modifier.fillMaxSize().padding(24.dp),
        verticalArrangement = Arrangement.Center,
    ) {
        Text("Ship of Theseus", style = MaterialTheme.typography.headlineMedium)
        Spacer(Modifier.height(16.dp))
        OutlinedTextField(name, { name = it }, label = { Text("Name") }, modifier = Modifier.fillMaxWidth())
        OutlinedTextField(
            roomCode,
            { roomCode = it.take(6).uppercase() },
            label = { Text("Room code (to join)") },
            modifier = Modifier.fillMaxWidth(),
        )
        OutlinedTextField(serverUrl, { serverUrl = it }, label = { Text("Server") }, modifier = Modifier.fillMaxWidth())
        Spacer(Modifier.height(12.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Button(enabled = name.isNotBlank(), onClick = { viewModel.create(serverUrl, name.trim()) }) {
                Text("Create room")
            }
            OutlinedButton(enabled = name.isNotBlank() && roomCode.length == 6, onClick = {
                viewModel.join(serverUrl, roomCode, name.trim())
            }) {
                Text("Join")
            }
        }
        ConnectionBanner(state)
    }
}

@Composable
private fun LobbyScreen(
    state: ClientUiState,
    viewModel: ClientViewModel,
) {
    val public = state.publicState ?: return
    val session = state.session ?: return
    val me = public.players.firstOrNull { it.id == session.playerId }
    Column(Modifier.fillMaxSize().padding(24.dp)) {
        Text("Room ${public.roomCode}", style = MaterialTheme.typography.headlineMedium)
        ConnectionBanner(state)
        Spacer(Modifier.height(12.dp))
        Text("${public.players.size}/10 players")
        LazyColumn(Modifier.weight(1f)) {
            items(public.players) { player ->
                Text("${player.name} · ${player.system} ${if (player.ready) "✓" else "not ready"}")
            }
        }
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Button(onClick = { viewModel.ready(!(me?.ready ?: false)) }) {
                Text(if (me?.ready == true) "Unready" else "Ready")
            }
            Button(
                enabled =
                    public.hostId == session.playerId && public.players.size >= 6 &&
                        public.players.all { it.ready },
                onClick = viewModel::start,
            ) { Text("Start voyage") }
        }
    }
}

@Composable
private fun VoyageHudScreen(state: ClientUiState) {
    val public = state.publicState ?: return
    val privateState = state.privateState ?: return
    val me = public.players.firstOrNull { it.id == privateState.playerId }
    Column(Modifier.fillMaxSize().padding(24.dp)) {
        ConnectionBanner(state)
        Text("Storm ${public.storm} / 8", style = MaterialTheme.typography.headlineMedium)
        Text("Identity: ${public.identityBand}")
        privateState.exactIdentity?.let { Text("Crow's Nest reading: $it") }
        Text("Morale: ${public.morale}")
        Spacer(Modifier.height(16.dp))
        Card(Modifier.fillMaxWidth()) {
            Column(Modifier.padding(16.dp)) {
                Text("Your system: ${me?.system ?: "Unknown"}")
                Text("Power: ${privateState.power}")
                Text(privateState.activatablePower?.let { "Power ready: $it" } ?: "Nothing to activate")
            }
        }
    }
}

@Composable
private fun DamageReportScreen(state: ClientUiState) {
    val public = state.publicState ?: return
    val privateState = state.privateState ?: return
    Column(Modifier.fillMaxSize().padding(24.dp)) {
        ConnectionBanner(state)
        Text("Damage report", style = MaterialTheme.typography.headlineMedium)
        Text("Storm ${public.storm} damaged: ${public.damagedSystems.joinToString()}")
        privateState.severity.forEach { (system, severity) ->
            Text("Your $system severity: $severity")
        }
    }
}

@Composable
private fun CouncilScreen(
    state: ClientUiState,
    viewModel: ClientViewModel,
) {
    val public = state.publicState ?: return
    val privateState = state.privateState ?: return
    var now by remember { mutableStateOf(System.currentTimeMillis()) }
    var chatText by remember { mutableStateOf("") }
    LaunchedEffect(public.deadline) {
        while (public.deadline != null) {
            now = System.currentTimeMillis()
            delay(500)
        }
    }
    val seconds = public.deadline?.let { ((it - now).coerceAtLeast(0L) + 999L) / 1000L } ?: 0L
    Column(Modifier.fillMaxSize().padding(24.dp)) {
        ConnectionBanner(state)
        Text("Council · ${seconds}s", style = MaterialTheme.typography.headlineMedium)
        LazyColumn(Modifier.weight(1f)) {
            items(public.chat) { message -> Text("${message.playerName}: ${message.text}") }
        }
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            OutlinedTextField(chatText, { chatText = it }, label = { Text("Message") }, modifier = Modifier.weight(1f))
            Button(enabled = chatText.isNotBlank(), onClick = {
                viewModel.chat(chatText)
                chatText = ""
            }) { Text("Send") }
        }
        Spacer(Modifier.height(8.dp))
        if (privateState.activatablePower != null) {
            Button(onClick = { viewModel.usePower() }) { Text("Activate ${privateState.activatablePower}") }
        } else {
            Text("Nothing to activate")
        }
    }
}

@Composable
private fun VoteScreen(
    state: ClientUiState,
    viewModel: ClientViewModel,
) {
    val public = state.publicState ?: return
    Column(Modifier.fillMaxSize().padding(24.dp)) {
        ConnectionBanner(state)
        Text("Vote", style = MaterialTheme.typography.headlineMedium)
        LazyColumn {
            items(public.players.map { it.system }.distinct()) { system ->
                Button(onClick = { viewModel.vote(system) }, modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp)) {
                    val tally = if (public.publicVote) " · ${public.voteTally[system] ?: 0}" else ""
                    Text("$system$tally")
                }
            }
        }
        Text(if (public.publicVote) "Votes are public" else "Votes are hidden")
    }
}

@Composable
private fun PrivateRevealScreen(
    privateState: PrivateGameState,
    viewModel: ClientViewModel,
) {
    Column(
        Modifier.fillMaxSize().padding(32.dp),
        verticalArrangement = Arrangement.Center,
    ) {
        Text("You are a Replacement", style = MaterialTheme.typography.headlineMedium)
        Text(privateState.reveal ?: "The ship no longer recognises you.")
        if (privateState.readingsUnreliable) {
            Text("Your readings can no longer be trusted. Bluff plausible reports.")
        }
        Spacer(Modifier.height(24.dp))
        Button(onClick = viewModel::dismissReveal) { Text("I understand") }
    }
}

@Composable
private fun MutinyScreen(
    state: ClientUiState,
    viewModel: ClientViewModel,
) {
    val public = state.publicState ?: return
    Column(Modifier.fillMaxSize().padding(24.dp)) {
        ConnectionBanner(state)
        Text("Final Mutiny", style = MaterialTheme.typography.headlineMedium)
        Text("Accuse one suspect.")
        LazyColumn {
            items(public.players) { player ->
                Button(onClick = { viewModel.accuse(player.id) }, modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp)) {
                    Text(player.name)
                }
            }
        }
    }
}

@Composable
private fun ResultsScreen(public: PublicGameState) {
    Column(Modifier.fillMaxSize().padding(24.dp)) {
        Text("Results", style = MaterialTheme.typography.headlineMedium)
        Text("Winner: ${public.winner ?: "Pending"}")
        public.replacementPlayerId?.let { Text("Replacement: $it") }
        Spacer(Modifier.height(12.dp))
        LazyColumn {
            itemsIndexed(public.timeline) { _, event ->
                val detail = event.system?.let { " · $it" } ?: ""
                Text("Storm ${event.storm}: ${event.kind}$detail (${event.playerId})")
            }
        }
    }
}
