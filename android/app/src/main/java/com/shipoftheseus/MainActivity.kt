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
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel

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
            if (state.session == null || state.publicState == null) {
                HomeScreen(state, viewModel)
            } else {
                LobbyScreen(state, viewModel)
            }
        }
    }
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
        OutlinedTextField(roomCode, {
            roomCode = it.take(6).uppercase()
        }, label = { Text("Room code (to join)") }, modifier = Modifier.fillMaxWidth())
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
        Text("Connection: ${state.connection}", modifier = Modifier.padding(top = 12.dp))
        state.error?.let { Text(it, color = MaterialTheme.colorScheme.error) }
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
        Text("Connection: ${state.connection}")
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
        state.privateState?.reveal?.let { Text(it, modifier = Modifier.padding(top = 8.dp)) }
    }
}
